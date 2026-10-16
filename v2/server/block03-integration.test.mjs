import test from 'node:test';
import assert from 'node:assert/strict';
import {createV2GameplayRuntime} from './gameplay-runtime.mjs';

function seed(){
 let now=1000;const r=createV2GameplayRuntime(':memory:',{clock:()=>now});r.tick=(seconds)=>{now+=seconds};const c=r.core;
 c.seedEvent('E');c.seedActor('E','P1','PIONEER',1);c.seedActor('E','L1','LOCAL',1);c.seedActor('E','F1','FOP',0);c.seedActor('E','FO','FOUNDER',0);
 c.seedNode('E','N1','INSTALLED');c.seedNode('E','N2','AVAILABLE');
 c.seedCore('E',{id:'P0',uid:'UP0',energy:341,actualEnergy:341,ownerType:'PIONEER',ownerId:'P1',status:'FIELD'});
 c.seedCore('E',{id:'N1A',uid:'UN1A',energy:100,actualEnergy:100,ownerType:'NODE',ownerId:'N1',status:'DEPLOYED'});
 c.seedCore('E',{id:'N1B',uid:'UN1B',energy:300,actualEnergy:300,ownerType:'NODE',ownerId:'N1',status:'DEPLOYED'});
 c.seedCore('E',{id:'N1C',uid:'UN1C',energy:400,actualEnergy:400,ownerType:'NODE',ownerId:'N1',status:'DEPLOYED'});
 c.seedCore('E',{id:'R1',uid:'UR1',energy:450,actualEnergy:450,ownerType:'TRANSIT',ownerId:'P1',status:'IN_TRANSIT'});
 return r;
}

test('BLOCK03: Exchange -> Restore -> Upload -> RE-SUPPLY -> Catch share one authoritative SQLite truth',()=>{
 const r=seed(),c=r.core;
 try{
  r.exchange({eventId:'E',operationId:'X',pioneerId:'P1',nodeId:'N1',gives:['P0'],takes:['N1B']});
  assert.equal(c.core('E','P0').owner_id,'N1');assert.equal(c.core('E','N1B').owner_id,'P1');

  c.seedMission('E',{id:'MR1',actorId:'P1',kind:'RESTORE_1',nodeId:'N1',coreId:'R1',expiresAt:c.clock()+600});
  r.restore({eventId:'E',operationId:'R',pioneerId:'P1',nodeId:'N1',cargoCoreId:'R1',outCoreId:'N1A',phase:1,missionId:'MR1'});
  assert.equal(c.db.prepare("SELECT capacity FROM actors WHERE event_id='E' AND actor_id='P1'").get().capacity,2);
  assert.equal(c.db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id='E' AND owner_type='NODE' AND owner_id='N1'").get().n,3);

  r.upload({eventId:'E',operationId:'U',pioneerId:'P1',coreIds:['N1A','N1B']});
  assert.equal(c.balance('E','P1'),400);assert.equal(c.db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id='E' AND owner_type='PIONEER' AND owner_id='P1'").get().n,0);

  r.tick(3600); // V1 rule: executing Pioneer cannot use the RESTORE target for one hour.
  c.seedCore('E',{id:'RS',uid:'URS',energy:250,actualEnergy:250,ownerType:'TRANSIT',ownerId:'P1',status:'IN_TRANSIT'});
  c.seedMission('E',{id:'M',actorId:'P1',kind:'RESUPPLY',nodeId:'N1',coreId:'RS',expiresAt:c.clock()+600});
  const low=c.db.prepare("SELECT core_id FROM cores WHERE event_id='E' AND owner_type='NODE' AND owner_id='N1' ORDER BY visible_energy,core_id LIMIT 1").get().core_id;
  r.resupply({eventId:'E',operationId:'S',pioneerId:'P1',missionId:'M',outCoreId:low});
  assert.equal(c.core('E','RS').owner_id,'N1');assert.equal(c.core('E',low).owner_id,'P1');

  const preview=r.catch.preview({eventId:'E',catcherId:'L1',targetId:'P1'});r.catch.confirm({eventId:'E',previewId:preview.previewId,catcherId:'L1'});
  assert.equal(c.core('E',low).owner_id,'L1');
  const operations=c.db.prepare('SELECT kind FROM operations ORDER BY created_at,operation_id').all().map(x=>x.kind);
  assert.ok(operations.includes('EXCHANGE'));assert.ok(operations.includes('RESTORE_1'));assert.ok(operations.includes('HQ_UPLOAD'));assert.ok(operations.includes('RESUPPLY'));assert.ok(operations.includes('CATCH'));
 }finally{r.close()}
});

test('BLOCK03: normal FOP install/deinstall uses same transaction ledger',()=>{
 const r=seed(),c=r.core;
 try{
  for(let i=1;i<=3;i++)c.seedCore('E',{id:'F'+i,uid:'UF'+i,energy:200+i,ownerType:'TRANSIT',ownerId:'F1',status:'IN_TRANSIT'});
  r.fop.install({eventId:'E',operationId:'FI',fopId:'F1',nodeId:'N2',coreIds:['F1','F2','F3']});
  assert.equal(c.db.prepare("SELECT state FROM nodes WHERE event_id='E' AND node_id='N2'").get().state,'INSTALLED');
  assert.equal(c.db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id='E' AND owner_type='NODE' AND owner_id='N2'").get().n,3);
  r.fop.deinstall({eventId:'E',operationId:'FD',fopId:'F1',nodeId:'N2'});
  assert.equal(c.db.prepare("SELECT state FROM nodes WHERE event_id='E' AND node_id='N2'").get().state,'DEINSTALLED');
  assert.equal(c.db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id='E' AND owner_type='HQ' AND owner_id='HQ' AND core_id IN ('F1','F2','F3')").get().n,3);
  assert.equal(c.db.prepare("SELECT COUNT(*) n FROM audit WHERE event_id='E' AND operation_id IN ('FI','FD')").get().n,6);
 }finally{r.close()}
});

test('BLOCK03: EVAC state in same DB freezes normal ownership actions',()=>{
 const r=seed(),c=r.core;
 try{
  c.db.prepare("INSERT INTO evac_control(event_id,state) VALUES ('E','STARTED')").run();
  assert.throws(()=>r.exchange({eventId:'E',operationId:'FROZEN',pioneerId:'P1',nodeId:'N1',gives:['P0'],takes:['N1A']}),/EVAC_NORMAL_ACTION_FROZEN/);
  assert.equal(c.core('E','P0').owner_id,'P1');assert.equal(c.core('E','N1A').owner_id,'N1');
 }finally{r.close()}
});
