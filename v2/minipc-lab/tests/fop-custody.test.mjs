import test from 'node:test';
import assert from 'node:assert/strict';
import {createV2GameplayRuntime} from '../../server/gameplay-runtime.mjs';

test('Unbound handover, idempotent replay, FOP HQ return and second custody cycle',()=>{
 const runtime=createV2GameplayRuntime();
 try{
  const c=runtime.core, eventId='CUSTODY-TEST';
  c.seedEvent(eventId);
  c.seedActor(eventId,'U1','UNBOUND',2);
  c.seedActor(eventId,'F1','FOP',0);
  c.seedCore(eventId,{id:'NC1',uid:'UID1',energy:180,ownerType:'PIONEER',ownerId:'U1',status:'FIELD'});
  c.seedCore(eventId,{id:'NC2',uid:'UID2',energy:220,ownerType:'PIONEER',ownerId:'U1',status:'FIELD'});
  const args={eventId,operationId:'HAND-1',unboundId:'U1',fopId:'F1'};
  const first=runtime.unboundHandover(args);
  assert.equal(first.energyCredit,400);
  assert.equal(c.balance(eventId,'U1'),400);
  assert.equal(runtime.unboundHandover(args).replayed,true);
  assert.equal(c.balance(eventId,'U1'),400);
  assert.equal(c.core(eventId,'NC1').status,'FOP_CUSTODY');
  assert.equal(c.db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id=? AND owner_type='HQ'").get(eventId).n,0);
  const ret={eventId,operationId:'RETURN-1',fopId:'F1',coreIds:['NC1','NC2']};
  assert.equal(runtime.fopHqReturn(ret).ok,true);
  assert.equal(runtime.fopHqReturn(ret).replayed,true);
  assert.equal(c.core(eventId,'NC1').status,'RESERVE');
  c.db.prepare("UPDATE cores SET owner_type='PIONEER',owner_id='U1',status='FIELD' WHERE event_id=? AND core_id='NC1'").run(eventId);
  assert.equal(runtime.unboundHandover({eventId,operationId:'HAND-2',unboundId:'U1',fopId:'F1'}).energyCredit,180);
  assert.equal(c.balance(eventId,'U1'),580);
  assert.equal(c.db.prepare("SELECT COUNT(*) n FROM fop_core_custody WHERE event_id=? AND core_id='NC1'").get(eventId).n,2);
 }finally{runtime.close()}
});

test('Local HQ upload credits once and cannot upload someone else core',()=>{
 const runtime=createV2GameplayRuntime();
 try{
  const c=runtime.core,eventId='LOCAL-TEST';
  c.seedEvent(eventId);c.seedActor(eventId,'L1','LOCAL',1);c.seedActor(eventId,'L2','LOCAL',1);
  c.seedCore(eventId,{id:'NC3',uid:'UID3',energy:90,ownerType:'PIONEER',ownerId:'L1',status:'FIELD'});
  assert.throws(()=>runtime.localHqUpload({eventId,operationId:'BAD',localId:'L2',coreId:'NC3'}));
  assert.equal(runtime.localHqUpload({eventId,operationId:'GOOD',localId:'L1',coreId:'NC3'}).energyCredit,90);
  assert.equal(c.balance(eventId,'L1'),90);
  assert.equal(c.core(eventId,'NC3').owner_type,'HQ');
  assert.equal(runtime.localHqUpload({eventId,operationId:'GOOD',localId:'L1',coreId:'NC3'}).replayed,true);
  assert.equal(c.balance(eventId,'L1'),90);
  assert.throws(()=>runtime.localHqUpload({eventId,operationId:'GOOD',localId:'L1',coreId:'WRONG'}),e=>e.code==='IDEMPOTENCY_CONFLICT');
 }finally{runtime.close()}
});
