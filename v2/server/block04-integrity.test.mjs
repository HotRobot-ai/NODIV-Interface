import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Worker} from 'node:worker_threads';
import {SqliteGameCore} from './sqlite-core.mjs';
import {createV2GameplayRuntime} from './gameplay-runtime.mjs';

function seedNode(core,eventId,nodeId,energies=[100,200,300]){
 core.seedNode(eventId,nodeId,'INSTALLED');
 energies.forEach((energy,i)=>core.seedCore(eventId,{id:nodeId+'C'+(i+1),uid:nodeId+'U'+(i+1),energy,ownerType:'NODE',ownerId:nodeId,status:'DEPLOYED'}));
}
function seedPioneerWorld(runtime,{eventId='E',pioneerId='P1',capacity=1,nodes=['N1']}={}){
 const c=runtime.core;c.seedEvent(eventId);c.seedActor(eventId,pioneerId,'PIONEER',capacity);
 nodes.forEach(n=>seedNode(c,eventId,n));
 c.seedCore(eventId,{id:'P0',uid:'UP0',energy:250,ownerType:'PIONEER',ownerId:pioneerId,status:'FIELD'});
 return c;
}

test('BLOCK04: 8-minute Exchange cooldown and idempotent replay survive DB restart',()=>{
 let now=1000;const dir=mkdtempSync(join(tmpdir(),'nodiv-b04-'));const db=join(dir,'game.sqlite');
 let r=createV2GameplayRuntime(db,{clock:()=>now});
 try{
  seedPioneerWorld(r);
  const first={eventId:'E',operationId:'X1',pioneerId:'P1',nodeId:'N1',gives:['P0'],takes:['N1C1']};
  assert.equal(r.exchange(first).replayed,false);r.close();
  r=createV2GameplayRuntime(db,{clock:()=>now});
  assert.equal(r.exchange(first).replayed,true);
  assert.throws(()=>r.exchange({eventId:'E',operationId:'X2',pioneerId:'P1',nodeId:'N1',gives:['N1C1'],takes:['N1C2']}),/NODE_EXCHANGE_COOLDOWN/);
  now=1480;
  assert.equal(r.exchange({eventId:'E',operationId:'X2',pioneerId:'P1',nodeId:'N1',gives:['N1C1'],takes:['N1C2']}).replayed,false);
  assert.equal(r.core.db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id='E' AND owner_type='NODE' AND owner_id='N1'").get().n,3);
 }finally{try{r.close()}catch{}rmSync(dir,{recursive:true,force:true})}
});

test('BLOCK04: RESTORE #1 requires mission plus prior Exchange and creates durable one-hour target lock',()=>{
 let now=1000;const r=createV2GameplayRuntime(':memory:',{clock:()=>now});
 try{
  const c=seedPioneerWorld(r);
  r.exchange({eventId:'E',operationId:'X1',pioneerId:'P1',nodeId:'N1',gives:['P0'],takes:['N1C2']});
  c.seedCore('E',{id:'R1',uid:'UR1',energy:400,ownerType:'TRANSIT',ownerId:'P1',status:'IN_TRANSIT'});
  assert.throws(()=>r.restore({eventId:'E',operationId:'NO-M',pioneerId:'P1',nodeId:'N1',cargoCoreId:'R1',outCoreId:'N1C1',phase:1,missionId:'MISSING'}),/RESTORE_MISSION_DENIED/);
  c.seedMission('E',{id:'M-R1',actorId:'P1',kind:'RESTORE_1',nodeId:'N1',coreId:'R1',expiresAt:2000});
  const done=r.restore({eventId:'E',operationId:'R-1',pioneerId:'P1',nodeId:'N1',cargoCoreId:'R1',outCoreId:'N1C1',phase:1,missionId:'M-R1'});
  assert.equal(done.nodeLockUntil,4600);
  assert.equal(c.db.prepare("SELECT state FROM missions WHERE mission_id='M-R1'").get().state,'COMPLETED');
  assert.equal(c.db.prepare("SELECT capacity FROM actors WHERE actor_id='P1'").get().capacity,2);
  now=1301;
  assert.throws(()=>r.exchange({eventId:'E',operationId:'X-LOCK',pioneerId:'P1',nodeId:'N1',gives:['N1C1'],takes:['P0']}),/RESTORE_TARGET_LOCKED/);
  now=4600;
  assert.equal(r.exchange({eventId:'E',operationId:'X-UNLOCK',pioneerId:'P1',nodeId:'N1',gives:['N1C1'],takes:['P0']}).replayed,false);
 }finally{r.close()}
});

test('BLOCK04: RESTORE #2 is denied until a real 2-core Exchange occurs after RESTORE #1',()=>{
 let now=1000;const r=createV2GameplayRuntime(':memory:',{clock:()=>now});
 try{
  const c=seedPioneerWorld(r,{nodes:['N1','N2']});
  r.exchange({eventId:'E',operationId:'X1',pioneerId:'P1',nodeId:'N1',gives:['P0'],takes:['N1C2']});
  c.seedCore('E',{id:'R1',uid:'UR1',energy:400,ownerType:'TRANSIT',ownerId:'P1',status:'IN_TRANSIT'});
  c.seedMission('E',{id:'M1',actorId:'P1',kind:'RESTORE_1',nodeId:'N1',coreId:'R1',expiresAt:3000});
  r.restore({eventId:'E',operationId:'R1OP',pioneerId:'P1',nodeId:'N1',cargoCoreId:'R1',outCoreId:'N1C1',phase:1,missionId:'M1'});
  c.seedCore('E',{id:'R2',uid:'UR2',energy:450,ownerType:'TRANSIT',ownerId:'P1',status:'IN_TRANSIT'});
  c.seedMission('E',{id:'M2BAD',actorId:'P1',kind:'RESTORE_2',nodeId:'N2',coreId:'R2',expiresAt:3000});
  assert.throws(()=>r.restore({eventId:'E',operationId:'R2BAD',pioneerId:'P1',nodeId:'N2',cargoCoreId:'R2',outCoreId:'N2C1',phase:2,missionId:'M2BAD'}),/RESTORE_2_NOT_QUALIFIED/);
  c.db.prepare("UPDATE missions SET state='CANCELLED' WHERE mission_id='M2BAD'").run();
  r.exchange({eventId:'E',operationId:'X2',pioneerId:'P1',nodeId:'N2',gives:['N1C1','N1C2'],takes:['N2C1','N2C2']});
  c.seedMission('E',{id:'M2',actorId:'P1',kind:'RESTORE_2',nodeId:'N2',coreId:'R2',expiresAt:3000});
  assert.equal(r.restore({eventId:'E',operationId:'R2OP',pioneerId:'P1',nodeId:'N2',cargoCoreId:'R2',outCoreId:'N1C1',phase:2,missionId:'M2'}).replayed,false);
  assert.equal(c.db.prepare("SELECT capacity FROM actors WHERE actor_id='P1'").get().capacity,3);
 }finally{r.close()}
});

test('BLOCK04: active cross-action reservation blocks node mutation; expiry releases it',()=>{
 let now=1000;const r=createV2GameplayRuntime(':memory:',{clock:()=>now});
 try{
  const c=seedPioneerWorld(r);
  c.db.prepare("INSERT INTO reservations VALUES (?,?,?,?,?,?)").run('E','RSV','RESTORE','OTHER',1100,JSON.stringify({nodeId:'N1',coreId:'N1C1'}));
  assert.throws(()=>r.exchange({eventId:'E',operationId:'X1',pioneerId:'P1',nodeId:'N1',gives:['P0'],takes:['N1C1']}),/OPERATION_RESERVED/);
  assert.equal(c.core('E','P0').owner_id,'P1');
  now=1100;
  assert.equal(r.exchange({eventId:'E',operationId:'X1',pioneerId:'P1',nodeId:'N1',gives:['P0'],takes:['N1C1']}).replayed,false);
 }finally{r.close()}
});

test('BLOCK04: Catch cannot confirm or start while EVAC is STARTED',()=>{
 const r=createV2GameplayRuntime();
 try{
  const c=r.core;c.seedEvent('E');c.seedActor('E','P','PIONEER',3);c.seedActor('E','L','LOCAL',1);
  c.seedCore('E',{id:'A',uid:'UA',energy:100,ownerType:'PIONEER',ownerId:'P',status:'FIELD'});
  c.seedCore('E',{id:'B',uid:'UB',energy:300,ownerType:'PIONEER',ownerId:'P',status:'FIELD'});
  const p=r.catch.preview({eventId:'E',catcherId:'L',targetId:'P'});
  c.db.prepare("INSERT INTO evac_control(event_id,state) VALUES ('E','STARTED')").run();
  assert.throws(()=>r.catch.confirm({eventId:'E',previewId:p.previewId,catcherId:'L'}),/EVAC_NORMAL_ACTION_FROZEN/);
  assert.equal(c.core('E','B').owner_id,'P');
  assert.throws(()=>r.catch.preview({eventId:'E',catcherId:'L',targetId:'P'}),/EVAC_NORMAL_ACTION_FROZEN/);
 }finally{r.close()}
});

test('BLOCK04: expired mission transit is recovered to HQ exactly once on restart',()=>{
 const dir=mkdtempSync(join(tmpdir(),'nodiv-b04-exp-'));const db=join(dir,'game.sqlite');
 let c=new SqliteGameCore(db,()=>2000);
 try{
  c.seedEvent('E');c.seedActor('E','P1','PIONEER',1);
  c.seedCore('E',{id:'T',uid:'UT',energy:220,ownerType:'TRANSIT',ownerId:'P1',status:'IN_TRANSIT'});
  c.seedMission('E',{id:'MX',actorId:'P1',kind:'RESUPPLY',nodeId:'N-X',coreId:'T',expiresAt:1999});
  c.close();
  let r=createV2GameplayRuntime(db,{clock:()=>2000});
  assert.equal(r.core.core('E','T').owner_type,'HQ');
  assert.equal(r.core.core('E','T').status,'RESERVE');
  assert.equal(r.core.db.prepare("SELECT state FROM missions WHERE mission_id='MX'").get().state,'CANCELLED');
  assert.equal(r.core.db.prepare("SELECT COUNT(*) n FROM operations WHERE kind='MISSION_EXPIRE'").get().n,1);
  r.close();
  r=createV2GameplayRuntime(db,{clock:()=>2000});
  assert.equal(r.core.db.prepare("SELECT COUNT(*) n FROM operations WHERE kind='MISSION_EXPIRE'").get().n,1);
  r.close();
 }finally{try{c.close()}catch{}rmSync(dir,{recursive:true,force:true})}
});

test('BLOCK04: integrity checker rejects orphan ownership instead of normalizing it silently',()=>{
 const c=new SqliteGameCore();
 try{
  c.seedEvent('E');c.seedCore('E',{id:'ORPHAN',uid:'UO',energy:100,ownerType:'PIONEER',ownerId:'MISSING',status:'FIELD'});
  assert.throws(()=>c.assertIntegrity('E'),/EVENT_INTEGRITY_VIOLATION/);
 }finally{c.close()}
});


test('BLOCK04: simultaneous SQLite writers serialize; exactly one conflicting Exchange commits',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'nodiv-b04-race-'));const db=join(dir,'game.sqlite');
 let core=new SqliteGameCore(db,()=>1000);
 try{
  core.seedEvent('E');core.seedActor('E','P1','PIONEER',1);core.seedActor('E','P2','PIONEER',1);seedNode(core,'E','N');
  core.seedCore('E',{id:'A',uid:'UA',energy:250,ownerType:'PIONEER',ownerId:'P1',status:'FIELD'});
  core.seedCore('E',{id:'B',uid:'UB',energy:260,ownerType:'PIONEER',ownerId:'P2',status:'FIELD'});
  core.close();core=null;
  const gate=new SharedArrayBuffer(4),view=new Int32Array(gate);
  const operation=(actorId,operationId,give,take)=>({eventId:'E',operationId,actorId,kind:'EXCHANGE',moves:[
   {id:give,fromType:'PIONEER',fromId:actorId,toType:'NODE',toId:'N',status:'DEPLOYED'},
   {id:take,fromType:'NODE',fromId:'N',toType:'PIONEER',toId:actorId,status:'FIELD'}
  ]});
  const workers=[
   new Worker(new URL('./block04-concurrency-worker.mjs',import.meta.url),{workerData:{path:db,gate,operation:operation('P1','RACE-1','A','NC1')}}),
   new Worker(new URL('./block04-concurrency-worker.mjs',import.meta.url),{workerData:{path:db,gate,operation:operation('P2','RACE-2','B','NC2')}})
  ];
  const ready=w=>new Promise((resolve,reject)=>{const on=m=>{if(m?.ready){w.off('message',on);resolve()}};w.on('message',on);w.once('error',reject)});
  await Promise.all(workers.map(ready));
  const result=w=>new Promise((resolve,reject)=>{w.once('message',resolve);w.once('error',reject)});
  const results=workers.map(result);Atomics.store(view,0,1);Atomics.notify(view,0,2);
  const done=await Promise.all(results);
  assert.equal(done.filter(x=>x.ok).length,1,JSON.stringify(done));
  assert.deepEqual(done.filter(x=>!x.ok).map(x=>x.error),['NODE_EXCHANGE_COOLDOWN']);
  core=new SqliteGameCore(db,()=>1000);assert.equal(core.db.prepare("SELECT COUNT(*) n FROM operations WHERE kind='EXCHANGE'").get().n,1);
  assert.equal(core.db.prepare("SELECT COUNT(*) n FROM cores WHERE owner_type='NODE' AND owner_id='N'").get().n,3);
  assert.equal(core.assertIntegrity('E').ok,true);
 }finally{try{core?.close()}catch{}rmSync(dir,{recursive:true,force:true})}
});

test('BLOCK04: interrupted file-backed transaction rolls back cleanly and can be retried after restart',()=>{
 const dir=mkdtempSync(join(tmpdir(),'nodiv-b04-interrupt-'));const db=join(dir,'game.sqlite');
 let core=new SqliteGameCore(db,()=>1000);
 const op={eventId:'E',operationId:'INT-X',actorId:'P1',kind:'EXCHANGE',moves:[
  {id:'A',fromType:'PIONEER',fromId:'P1',toType:'NODE',toId:'N',status:'DEPLOYED'},
  {id:'NC1',fromType:'NODE',fromId:'N',toType:'PIONEER',toId:'P1',status:'FIELD'}
 ]};
 try{
  core.seedEvent('E');core.seedActor('E','P1','PIONEER',1);seedNode(core,'E','N');core.seedCore('E',{id:'A',uid:'UA',energy:250,ownerType:'PIONEER',ownerId:'P1',status:'FIELD'});
  assert.throws(()=>core.run(op,()=>{throw Error('SIMULATED_INTERRUPTION')}),/SIMULATED_INTERRUPTION/);
  core.close();core=new SqliteGameCore(db,()=>1000);
  assert.equal(core.core('E','A').owner_id,'P1');assert.equal(core.core('E','NC1').owner_id,'N');
  assert.equal(core.db.prepare("SELECT COUNT(*) n FROM operations WHERE operation_id='INT-X'").get().n,0);
  assert.equal(core.run(op).replayed,false);assert.equal(core.assertIntegrity('E').ok,true);
 }finally{try{core?.close()}catch{}rmSync(dir,{recursive:true,force:true})}
});
