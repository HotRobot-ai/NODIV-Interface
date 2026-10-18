import test from 'node:test';
import assert from 'node:assert/strict';
import {createV2GameplayRuntime} from '../../server/gameplay-runtime.mjs';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

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

test('legacy FOP custody primary key migrates while retaining existing history',()=>{
 const dir=mkdtempSync(join(tmpdir(),'nodiv-custody-'));
 const dbPath=join(dir,'game.sqlite');
 try {
   const initial=createV2GameplayRuntime(dbPath);
   try {
     const c=initial.core,e='MIGRATION-TEST';
     c.seedEvent(e);c.seedActor(e,'U1','UNBOUND',2);c.seedActor(e,'F1','FOP');
     c.seedCore(e,{id:'NC1',uid:'MIG-NC1',energy:170,ownerType:'PIONEER',ownerId:'U1',status:'FIELD'});
     initial.unboundHandover({eventId:e,operationId:'LEGACY-HAND',unboundId:'U1',fopId:'F1'});
     c.db.exec("DROP INDEX fop_custody_one_active_core; DROP INDEX fop_custody_open; ALTER TABLE fop_core_custody RENAME TO fop_core_custody_previous;");
     c.db.exec(`CREATE TABLE fop_core_custody (
       event_id TEXT NOT NULL,core_id TEXT NOT NULL,fop_id TEXT NOT NULL,unbound_id TEXT NOT NULL,
       received_operation_id TEXT NOT NULL,returned_operation_id TEXT,received_at TEXT NOT NULL,
       returned_at TEXT,PRIMARY KEY(event_id,core_id),
       FOREIGN KEY(event_id,core_id) REFERENCES cores(event_id,core_id),
       FOREIGN KEY(event_id,fop_id) REFERENCES actors(event_id,actor_id),
       FOREIGN KEY(event_id,unbound_id) REFERENCES actors(event_id,actor_id)
     ); INSERT INTO fop_core_custody SELECT * FROM fop_core_custody_previous;
     DROP TABLE fop_core_custody_previous;`);
   } finally { initial.close(); }
   const upgraded=createV2GameplayRuntime(dbPath);
   try {
     const c=upgraded.core,e='MIGRATION-TEST';
     assert.equal(c.db.prepare("SELECT received_operation_id FROM fop_core_custody WHERE event_id=?").get(e).received_operation_id,'LEGACY-HAND');
     upgraded.fopHqReturn({eventId:e,operationId:'MIG-RETURN',fopId:'F1',coreIds:['NC1']});
     c.db.prepare("UPDATE cores SET owner_type='PIONEER',owner_id='U1',status='FIELD' WHERE event_id=? AND core_id='NC1'").run(e);
     upgraded.unboundHandover({eventId:e,operationId:'MIG-HAND-2',unboundId:'U1',fopId:'F1'});
     assert.equal(c.db.prepare("SELECT COUNT(*) n FROM fop_core_custody WHERE event_id=?").get(e).n,2);
   } finally { upgraded.close(); }
 } finally { rmSync(dir,{recursive:true,force:true}); }
});
