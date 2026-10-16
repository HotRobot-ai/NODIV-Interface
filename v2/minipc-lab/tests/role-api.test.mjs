import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLabApp} from '../server/server.mjs';
import {DEFAULT_UIDS} from '../server/seed.mjs';

async function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'nodiv-v2-role-api-'));
  const app=createLabApp({dbPath:join(dir,'lab.sqlite'),eventId:'TEST-V2',host:'127.0.0.1',port:0,sessionTtl:3600,grantTtl:90,exchangeTtl:300,tlsKey:null,tlsCert:null});
  await new Promise((resolve,reject)=>app.server.once('error',reject).listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  async function call(path,{method='GET',data,token}={}){
    const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:data?JSON.stringify(data):undefined});
    const j=await r.json();if(!r.ok)throw Error(j.error||'HTTP_'+r.status);return j;
  }
  async function login(uid){return call('/api/session/start',{method:'POST',data:{uid}})}
  return {dir,app,base,call,login,async close(){await app.close();rmSync(dir,{recursive:true,force:true})}};
}

test('BLOCK05 API: all five roles receive only their server-derived role state',async()=>{
  const f=await fixture();
  try{
    for(const [uid,role] of [[DEFAULT_UIDS.founderAccess,'FOUNDER'],[DEFAULT_UIDS.fopAccess,'FOP'],[DEFAULT_UIDS.pioneerAccess,'PIONEER'],[DEFAULT_UIDS.localAccess,'LOCAL'],[DEFAULT_UIDS.unboundAccess,'UNBOUND']]){
      const s=await f.login(uid),v=await f.call('/api/role/state',{token:s.token});
      assert.equal(s.role,role);assert.equal(v.actor.role,role);assert.ok(v.nextAction?.code);
      if(role==='LOCAL'||role==='UNBOUND'){assert.equal('nodes'in v,false);assert.equal('hq'in v,false);}
    }
  }finally{await f.close()}
});

test('BLOCK05 API: Local Catch, Pioneer Secure Approach and FOP install all use shared SQLite state',async()=>{
  const f=await fixture();
  try{
    const local=await f.login(DEFAULT_UIDS.localAccess);
    const preview=await f.call('/api/catch/preview',{method:'POST',token:local.token,data:{uid:DEFAULT_UIDS.pioneerAccess}});
    const caught=await f.call('/api/catch/confirm',{method:'POST',token:local.token,data:{previewId:preview.previewId}});
    assert.equal(caught.core.energy,341);

    // Put the caught core back only to isolate the following HQ assertion.
    f.app.core.db.prepare("UPDATE cores SET owner_id='P9003' WHERE event_id='TEST-V2' AND core_id='NC-P-001'").run();
    f.app.core.db.prepare("UPDATE balances SET secured_energy=200 WHERE event_id='TEST-V2' AND actor_id='P9003'").run();
    f.app.core.db.prepare("DELETE FROM catch_ghost WHERE event_id='TEST-V2' AND actor_id='P9003'").run();
    const pioneer=await f.login(DEFAULT_UIDS.pioneerAccess);
    const secure=await f.call('/api/hq/secure',{method:'POST',token:pioneer.token,data:{requestId:'REQ-API-12345678'}});
    assert.equal(secure.securedEnergy,50);
    const hq=await f.call('/api/hq/state',{token:pioneer.token});assert.equal(hq.state,'YELLOW');

    const fop=await f.login(DEFAULT_UIDS.fopAccess);
    const node=await f.call('/api/fop/scan',{method:'POST',token:fop.token,data:{uid:DEFAULT_UIDS.node2}});
    assert.equal(node.action,'INSTALL');
    for(const uid of [DEFAULT_UIDS.fop1,DEFAULT_UIDS.fop2,DEFAULT_UIDS.fop3]){
      const checked=await f.call('/api/fop/core/check',{method:'POST',token:fop.token,data:{uid}});assert.ok(checked.energy>0);
    }
    const installed=await f.call('/api/fop/install',{method:'POST',token:fop.token,data:{nodeId:'NODE-002',coreUids:[DEFAULT_UIDS.fop1,DEFAULT_UIDS.fop2,DEFAULT_UIDS.fop3],operationId:'API-FOP-IN'}});
    assert.equal(installed.kind,'INSTALL');
    assert.equal(f.app.core.db.prepare("SELECT state FROM nodes WHERE event_id='TEST-V2' AND node_id='NODE-002'").get().state,'INSTALLED');
  }finally{await f.close()}
});

test('BLOCK05 API: EVAC appears only after STARTED and Lab scans still consume V2 single-use grants',async()=>{
  const f=await fixture();
  try{
    const c=f.app.core,r=f.app.runtime,eventId='TEST-V2';
    // Make the test event a valid 10-node EVAC manifest.
    r.fop.install({eventId,operationId:'EVAC-PREP-N2',fopId:'FOP-TEST',nodeId:'NODE-002',coreIds:['NC-F-001','NC-F-002','NC-F-003']});
    for(let n=3;n<=10;n++){
      const nodeId='NODE-'+String(n).padStart(3,'0');c.seedNode(eventId,nodeId,'INSTALLED');
      f.app.store.seedNodeTag(eventId,'EVACNODE'+n,nodeId);
      for(let k=1;k<=3;k++)c.seedCore(eventId,{id:`E${n}C${k}`,uid:`UE${n}C${k}`,energy:100+n*10+k,ownerType:'NODE',ownerId:nodeId,status:'DEPLOYED'});
    }
    c.seedActor(eventId,'P2','PIONEER',3);f.app.store.seedAccessCard(eventId,'P2CARD','P2');
    for(const id of c.db.prepare("SELECT node_id FROM nodes WHERE event_id=? AND state='INSTALLED' ORDER BY node_id").all(eventId).map(x=>x.node_id))
      c.db.prepare('INSERT INTO evac_original_nodes(event_id,node_id) VALUES (?,?)').run(eventId,id);
    c.db.prepare("INSERT INTO evac_control(event_id,state) VALUES (?,'PRE_EVAC_READY')").run(eventId);

    const founder=await f.login(DEFAULT_UIDS.founderAccess);
    const fv=await f.call('/api/role/state',{token:founder.token});assert.ok(fv.allowedActions.includes('EVAC_START'));
    await f.call('/api/founder/evac/start',{method:'POST',token:founder.token,data:{operationId:'EVAC-START-API'}});

    const fop=await f.login(DEFAULT_UIDS.fopAccess);
    const fopView=await f.call('/api/role/state',{token:fop.token});assert.equal(fopView.evacVisible,true);
    const team=await f.call('/api/evac/team',{method:'POST',token:fop.token,data:{pioneerAUid:DEFAULT_UIDS.pioneerAccess,pioneerBUid:'P2CARD'}});
    assert.equal(team.assignments.length,2);assert.equal(team.assignments[0].carrierId,'P9003');

    const op='EVAC-REC-API';
    const check=await f.call('/api/evac/recovery/check',{method:'POST',token:fop.token,data:{teamId:team.teamId,nodeUid:DEFAULT_UIDS.node,coreUids:[DEFAULT_UIDS.node1,DEFAULT_UIDS.node2,DEFAULT_UIDS.node3],operationId:op}});
    const recovered=await f.call('/api/evac/recovery/confirm',{method:'POST',token:fop.token,data:{teamId:team.teamId,nodeId:check.nodeId,operationId:check.operationId,scannedCoreUids:check.scannedCoreUids,proofId:check.proofId,nfcGrantId:check.nfcGrantId}});
    assert.equal(recovered.carrierId,'P9003');
    const grant=c.db.prepare('SELECT consumed_at FROM v2_nfc_grants WHERE id=?').get(check.nfcGrantId);assert.ok(grant.consumed_at!==null);

    const pioneer=await f.login(DEFAULT_UIDS.pioneerAccess);
    const state=await f.call('/api/evac/state',{token:pioneer.token});assert.equal(state.recovered,true);assert.equal(state.cargo.length,3);
    const finalOp='EVAC-UP-API';
    const finalCheck=await f.call('/api/evac/final/check',{method:'POST',token:pioneer.token,data:{teamId:team.teamId,selectedCoreUid:DEFAULT_UIDS.node1,operationId:finalOp}});
    const uploaded=await f.call('/api/evac/final/confirm',{method:'POST',token:pioneer.token,data:{teamId:team.teamId,operationId:finalCheck.operationId,coreIds:finalCheck.coreIds,selectedCoreId:finalCheck.selectedCoreId,proofId:finalCheck.proofId,nfcGrantId:finalCheck.nfcGrantId}});
    assert.equal(uploaded.energy,105);
    assert.equal(c.db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id=? AND owner_type='HQ' AND status='SECURED' AND core_id IN ('NC-N-001','NC-N-002','NC-N-003')").get(eventId).n,3);
    await assert.rejects(
      ()=>f.call('/api/founder/evac/complete',{method:'POST',token:founder.token,data:{operationId:'EVAC-COMPLETE-TOO-EARLY'}}),
      /EVAC_COMPLETION_BLOCKED/
    );
  }finally{await f.close()}
});
