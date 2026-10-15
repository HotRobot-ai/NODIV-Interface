import test from 'node:test';
import assert from 'node:assert/strict';
import {SqliteGameCore} from './sqlite-core.mjs';

function fixture(status='EVAC_CARGO') {
 const g=new SqliteGameCore();
 g.seedEvent('E'); g.seedActor('E','P','PIONEER',3);
 g.seedCore('E',{id:'C',uid:'UC',energy:100,ownerType:'PIONEER',ownerId:'P',status});
 return g;
}
const upload=()=>({eventId:'E',operationId:'U',actorId:'P',kind:'HQ_UPLOAD',moves:[{id:'C',fromType:'PIONEER',fromId:'P',toType:'HQ',toId:'HQ'}],energyCredit:100});
test('EVAC cargo cannot be uploaded normally',()=>{
 const g=fixture(); try {
  assert.throws(()=>g.run(upload()),/EVAC_CARGO_PROTECTED/);
  assert.equal(g.core('E','C').owner_type,'PIONEER');
  assert.equal(g.balance('E','P'),0);
 } finally {g.close();}
});
test('EVAC STARTED freezes normal commands',()=>{
 const g=fixture(); try {
  g.db.exec("CREATE TABLE evac_control(event_id TEXT PRIMARY KEY,state TEXT); INSERT INTO evac_control VALUES ('E','STARTED')");
  assert.throws(()=>g.run(upload()),/EVAC_NORMAL_ACTION_FROZEN/);
 } finally {g.close();}
});
test('PRE_EVAC_READY does not bypass cargo guard',()=>{
 const g=fixture(); try {
  g.db.exec("CREATE TABLE evac_control(event_id TEXT PRIMARY KEY,state TEXT); INSERT INTO evac_control VALUES ('E','PRE_EVAC_READY')");
  assert.throws(()=>g.run(upload()),/EVAC_CARGO_PROTECTED/);
 } finally {g.close();}
});
test('regular upload still works without EVAC',()=>{
 const g=fixture('FIELD'); try {
  assert.equal(g.run(upload()).ok,true);
  assert.equal(g.balance('E','P'),100);
 } finally {g.close();}
});
