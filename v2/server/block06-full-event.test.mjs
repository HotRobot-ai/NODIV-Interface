import test from 'node:test';
import assert from 'node:assert/strict';
import {createV2GameplayRuntime} from './gameplay-runtime.mjs';
import {issueNfcGrant} from './nfc-grants.mjs';

function seedNode(core,eventId,nodeId,energies){
  core.seedNode(eventId,nodeId,'INSTALLED');
  energies.forEach((energy,i)=>core.seedCore(eventId,{
    id:`${nodeId}C${i+1}`,uid:`U-${nodeId}-${i+1}`,energy,
    ownerType:'NODE',ownerId:nodeId,status:'DEPLOYED'
  }));
}

test('BLOCK06: one event crosses all five roles and completes without ownership dead ends',()=>{
  let now=1000;
  const runtime=createV2GameplayRuntime(':memory:',{
    clock:()=>now,
    verifyRecoveryNfcProof:()=>true,
    verifyUploadNfcProof:()=>true
  });
  const core=runtime.core,eventId='BLOCK06-EVENT';
  const tick=seconds=>{now+=seconds};

  try{
    core.seedEvent(eventId,'FIELD_ACTIVE');
    core.seedActor(eventId,'FO','FOUNDER',0);
    for(let i=1;i<=5;i++) core.seedActor(eventId,`F${i}`,'FOP',0);
    for(let i=1;i<=10;i++) core.seedActor(eventId,`P${i}`,'PIONEER',i===1?1:i===2?2:3);
    core.seedActor(eventId,'L1','LOCAL',1);
    core.seedActor(eventId,'U1','UNBOUND',1);

    // Nine nodes are already installed; F1 performs the tenth installation in the event setup.
    for(let i=1;i<=9;i++) seedNode(core,eventId,`N${i}`,[90+i*10,290+i*10,390+i*10]);
    core.seedNode(eventId,'N10','AVAILABLE');
    for(let i=1;i<=3;i++) core.seedCore(eventId,{
      id:`F-IN-${i}`,uid:`UF-IN-${i}`,energy:220+i*10,
      ownerType:'TRANSIT',ownerId:'F1',status:'IN_TRANSIT'
    });
    runtime.fop.install({eventId,operationId:'FOP-INSTALL-10',fopId:'F1',nodeId:'N10',coreIds:['F-IN-1','F-IN-2','F-IN-3']});
    assert.equal(core.db.prepare("SELECT COUNT(*) n FROM nodes WHERE event_id=? AND state='INSTALLED'").get(eventId).n,10);
    assert.equal(core.db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id=? AND owner_type='NODE' AND owner_id='N10'").get(eventId).n,3);
    assert.equal(runtime.roles.view({eventId,actorId:'F1'}).evacVisible,false);

    // Pioneer P1 progresses through the real 1/3 -> 2/3 -> 3/3 sequence.
    core.seedCore(eventId,{id:'P1-START',uid:'UP1-START',energy:341,ownerType:'PIONEER',ownerId:'P1',status:'FIELD'});
    runtime.exchange({eventId,operationId:'P1-X1',pioneerId:'P1',nodeId:'N1',gives:['P1-START'],takes:['N1C2']});
    assert.throws(()=>runtime.exchange({eventId,operationId:'P1-X1-BLOCKED',pioneerId:'P1',nodeId:'N1',gives:['N1C2'],takes:['N1C3']}),/NODE_EXCHANGE_COOLDOWN/);

    core.seedCore(eventId,{id:'R1-CARGO',uid:'UR1-CARGO',energy:500,ownerType:'TRANSIT',ownerId:'P1',status:'IN_TRANSIT'});
    core.seedMission(eventId,{id:'M-R1',actorId:'P1',kind:'RESTORE_1',nodeId:'N1',coreId:'R1-CARGO',expiresAt:now+900});
    runtime.restore({eventId,operationId:'P1-R1',pioneerId:'P1',nodeId:'N1',cargoCoreId:'R1-CARGO',outCoreId:'N1C1',phase:1,missionId:'M-R1'});
    assert.equal(runtime.roles.view({eventId,actorId:'P1'}).inventory.used,2);

    runtime.exchange({eventId,operationId:'P1-X2',pioneerId:'P1',nodeId:'N2',gives:['N1C1','N1C2'],takes:['N2C1','N2C2']});
    core.seedCore(eventId,{id:'R2-CARGO',uid:'UR2-CARGO',energy:520,ownerType:'TRANSIT',ownerId:'P1',status:'IN_TRANSIT'});
    core.seedMission(eventId,{id:'M-R2',actorId:'P1',kind:'RESTORE_2',nodeId:'N3',coreId:'R2-CARGO',expiresAt:now+900});
    runtime.restore({eventId,operationId:'P1-R2',pioneerId:'P1',nodeId:'N3',cargoCoreId:'R2-CARGO',outCoreId:'N3C1',phase:2,missionId:'M-R2'});
    const p1AfterRestore2=runtime.roles.view({eventId,actorId:'P1'});
    assert.equal(p1AfterRestore2.actor.capacity,3);
    assert.equal(p1AfterRestore2.inventory.used,3,'RESTORE #2 must leave the Pioneer physically at 3/3, not only capacity 3');
    assert.throws(()=>runtime.exchange({eventId,operationId:'P1-LOCKED-N3',pioneerId:'P1',nodeId:'N3',gives:['N3C1'],takes:['N3C2']}),/RESTORE_TARGET_LOCKED/);

    // A second Pioneer demonstrates a normal partial HQ upload and funds Secure Approach.
    core.seedCore(eventId,{id:'P2-A',uid:'UP2-A',energy:250,ownerType:'PIONEER',ownerId:'P2',status:'FIELD'});
    core.seedCore(eventId,{id:'P2-B',uid:'UP2-B',energy:260,ownerType:'PIONEER',ownerId:'P2',status:'FIELD'});
    runtime.hq.seedBay(eventId,{id:'HQ-01',uid:'U-HQ-01'});
    const partialClaim=runtime.hq.claim({eventId,pioneerId:'P2',bayId:'HQ-01',operationId:'P2-CLAIM-PART'});
    runtime.hq.authorize({eventId,pioneerId:'P2',orderId:partialClaim.orderId,coreIds:['P2-A']});
    const partial=runtime.hq.confirm({eventId,pioneerId:'P2',orderId:partialClaim.orderId,operationId:'P2-UP-PART'});
    assert.equal(partial.energyCredit,250);
    assert.equal(runtime.roles.view({eventId,actorId:'P2'}).inventory.used,1);

    const secure=runtime.hq.activateSecureApproach({eventId,pioneerId:'P2',requestId:'P2-SECURE-REQ'});
    assert.equal(secure.cost,150);
    assert.equal(runtime.hq.terminalState({eventId,pioneerId:'P2'}).state,'YELLOW');
    assert.throws(()=>runtime.catch.preview({eventId,catcherId:'L1',targetId:'P2'}),/TARGET_PROTECTED/);

    // Local and Unbound use only the common Catch/access rules; no Unbound special mechanic is invented.
    core.seedCore(eventId,{id:'P3-CATCH',uid:'UP3-CATCH',energy:333,ownerType:'PIONEER',ownerId:'P3',status:'FIELD'});
    core.seedCore(eventId,{id:'P4-CATCH',uid:'UP4-CATCH',energy:334,ownerType:'PIONEER',ownerId:'P4',status:'FIELD'});
    const lp=runtime.catch.preview({eventId,catcherId:'L1',targetId:'P3'});
    runtime.catch.confirm({eventId,previewId:lp.previewId,catcherId:'L1'});
    assert.equal(core.core(eventId,'P3-CATCH').owner_id,'L1');
    const up=runtime.catch.preview({eventId,catcherId:'U1',targetId:'P4'});
    runtime.catch.confirm({eventId,previewId:up.previewId,catcherId:'U1'});
    assert.equal(core.core(eventId,'P4-CATCH').owner_id,'U1');
    for(const actorId of ['L1','U1']){
      const v=runtime.roles.view({eventId,actorId});
      assert.equal('nodes' in v,false);
      assert.equal('hq' in v,false);
      assert.equal(v.nextAction.code,'CATCH');
    }

    // Secure Approach expires server-side; no browser state is needed to release it.
    tick(301);
    assert.equal(runtime.hq.terminalState({eventId,pioneerId:'P1'}).state,'GREEN');

    // P1 can now execute a real 3/3 full upload; mandatory RE-SUPPLY is committed atomically.
    core.seedCore(eventId,{id:'HQ-RS',uid:'U-HQ-RS',energy:180,ownerType:'HQ',ownerId:'HQ',status:'RESERVE'});
    const p1CoreIds=runtime.roles.view({eventId,actorId:'P1'}).inventory.cores.filter(c=>c.status==='FIELD').map(c=>c.id);
    assert.equal(p1CoreIds.length,3);
    const fullClaim=runtime.hq.claim({eventId,pioneerId:'P1',bayId:'HQ-01',operationId:'P1-CLAIM-FULL'});
    runtime.hq.authorize({eventId,pioneerId:'P1',orderId:fullClaim.orderId,coreIds:p1CoreIds});
    const full=runtime.hq.confirm({eventId,pioneerId:'P1',orderId:fullClaim.orderId,operationId:'P1-UP-FULL'});
    assert.ok(full.mandatoryResupply);
    assert.equal(runtime.roles.view({eventId,actorId:'P1'}).inventory.used,0);
    const mission=core.db.prepare('SELECT * FROM missions WHERE event_id=? AND mission_id=?').get(eventId,full.mandatoryResupply.id);
    assert.equal(mission.state,'ASSIGNED');
    const out=core.db.prepare("SELECT core_id FROM cores WHERE event_id=? AND owner_type='NODE' AND owner_id=? ORDER BY visible_energy,core_id LIMIT 1").get(eventId,mission.node_id);
    runtime.resupply({eventId,operationId:'P1-RS',pioneerId:'P1',missionId:mission.mission_id,outCoreId:out.core_id});
    assert.equal(runtime.roles.view({eventId,actorId:'P1'}).inventory.used,1);
    assert.equal(core.db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id=? AND owner_type='NODE' AND owner_id=?").get(eventId,mission.node_id).n,3);
    assert.equal(core.assertIntegrity(eventId).ok,true);

    // Founder sees real readiness only after the authoritative ten-node manifest exists.
    for(let i=1;i<=10;i++) core.db.prepare('INSERT INTO evac_original_nodes(event_id,node_id) VALUES (?,?)').run(eventId,`N${i}`);
    core.db.prepare("INSERT INTO evac_control(event_id,state) VALUES (?,'PRE_EVAC_READY')").run(eventId);
    const founderReady=runtime.roles.view({eventId,actorId:'FO'});
    assert.deepEqual(founderReady.allowedActions,['EVAC_START']);
    runtime.evac.start.start({eventId,founderId:'FO',operationId:'EVAC-START'});

    // EVAC is now the only ownership-changing field mode.
    assert.equal(runtime.roles.view({eventId,actorId:'F1'}).evacVisible,true);
    assert.throws(()=>runtime.catch.preview({eventId,catcherId:'L1',targetId:'P2'}),/EVAC_NORMAL_ACTION_FROZEN/);
    assert.throws(()=>runtime.exchange({eventId,operationId:'AFTER-EVAC-X',pioneerId:'P1',nodeId:'N4',gives:[runtime.roles.view({eventId,actorId:'P1'}).inventory.cores[0].id],takes:['N4C1']}),/EVAC_NORMAL_ACTION_FROZEN/);

    // Five FOP teams withdraw all ten original nodes. Every recovery/final upload consumes a single-use V2 NFC grant.
    let recoveryCount=0,uploadCount=0;
    for(let teamIndex=0;teamIndex<5;teamIndex++){
      const fopId=`F${teamIndex+1}`,pioneerA=`P${teamIndex*2+1}`,pioneerB=`P${teamIndex*2+2}`;
      const nodeA=`N${teamIndex*2+1}`,nodeB=`N${teamIndex*2+2}`,teamId=`T${teamIndex+1}`;
      const team=runtime.evac.teams.reserve({eventId,teamId,fopId,pioneerA,pioneerB,nodeIds:[nodeA,nodeB]});
      assert.equal(team.assignments.length,2);

      for(const assignment of team.assignments){
        const opRec=`REC-${assignment.nodeId}`;
        const uids=core.db.prepare("SELECT uid FROM cores WHERE event_id=? AND owner_type='NODE' AND owner_id=? ORDER BY core_id").all(eventId,assignment.nodeId).map(x=>x.uid);
        const recGrant=issueNfcGrant(core.db,{eventId,actorId:fopId,command:'EVAC_NODE_RECOVERY',targetType:'NODE',targetId:assignment.nodeId,operationId:opRec});
        const recovered=runtime.evac.flow.recover({
          eventId,teamId,nodeId:assignment.nodeId,fopId,scannedNodeId:assignment.nodeId,
          scannedCoreUids:uids,operationId:opRec,nfcProof:'SERVER_VERIFIED',nfcGrantId:recGrant.id
        });
        recoveryCount++;
        assert.equal(core.db.prepare('SELECT consumed_at FROM v2_nfc_grants WHERE id=?').get(recGrant.id).consumed_at!==null,true);

        const opUp=`UP-${assignment.nodeId}`;
        const upGrant=issueNfcGrant(core.db,{eventId,actorId:assignment.carrierId,command:'EVAC_FINAL_UPLOAD',targetType:'HQ',targetId:'HQ',operationId:opUp});
        const uploaded=runtime.evac.flow.upload({
          eventId,teamId,carrierId:assignment.carrierId,operationId:opUp,coreIds:recovered.coreIds,
          selectedCoreId:recovered.coreIds[0],nfcProof:'SERVER_VERIFIED',nfcGrantId:upGrant.id
        });
        uploadCount++;
        assert.ok(uploaded.energy>0);
        assert.equal(core.db.prepare('SELECT consumed_at FROM v2_nfc_grants WHERE id=?').get(upGrant.id).consumed_at!==null,true);
      }
      const receipts=runtime.evac.flow.reconcileTeam(eventId,teamId);
      assert.deepEqual(receipts,{teamComplete:true,withdrawal:true});
    }
    assert.equal(recoveryCount,10);
    assert.equal(uploadCount,10);
    assert.equal(core.db.prepare("SELECT COUNT(*) n FROM nodes WHERE event_id=? AND state='DEINSTALLED'").get(eventId).n,10);
    assert.equal(core.db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id=? AND (owner_type='NODE' OR status='EVAC_CARGO')").get(eventId).n,0);

    const founderComplete=runtime.roles.view({eventId,actorId:'FO'});
    assert.deepEqual(founderComplete.allowedActions,['EVAC_COMPLETE']);
    assert.equal(founderComplete.nextAction.code,'EVAC_COMPLETE');

    const completed=runtime.evac.completion.complete({eventId,founderId:'FO',operationId:'EVAC-COMPLETE'});
    assert.equal(completed.completed,true);
    assert.equal(completed.replayed,false);
    assert.equal(runtime.evac.completion.complete({eventId,founderId:'FO',operationId:'EVAC-COMPLETE'}).replayed,true);
    assert.equal(core.db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId).state,'COMPLETED');
    assert.equal(core.db.prepare('SELECT COUNT(*) n FROM evac_recoveries WHERE event_id=?').get(eventId).n,10);
    assert.equal(core.db.prepare('SELECT COUNT(*) n FROM evac_final_uploads WHERE event_id=?').get(eventId).n,10);
    assert.equal(core.db.prepare('SELECT COUNT(*) n FROM evac_receipts WHERE event_id=?').get(eventId).n,10);
    assert.equal(core.assertIntegrity(eventId).ok,true);
  }finally{
    runtime.close();
  }
});
