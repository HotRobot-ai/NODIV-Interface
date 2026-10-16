import test from 'node:test';
import assert from 'node:assert/strict';
import {SqliteGameCore} from './sqlite-core.mjs';
import {createEvacEventCompletion} from './evac-event-completion.mjs';

test('fails closed on incomplete evidence and rolls back without receipt',()=>{
 const core=new SqliteGameCore();try{
  core.seedEvent('E');core.seedActor('E','F','FOUNDER');
  const service=createEvacEventCompletion(core);
  assert.throws(()=>service.complete({eventId:'E',founderId:'F',operationId:'X'}),/EVAC_COMPLETION_BLOCKED/);
  assert.equal(core.db.prepare("SELECT state FROM events WHERE event_id='E'").get().state,'FIELD_ACTIVE');
  assert.equal(core.db.prepare('SELECT count(*) n FROM evac_completion_receipts').get().n,0);
 }finally{core.close()}
});
test('rejects non-founder and inactive founder',()=>{
 const core=new SqliteGameCore();try{
  core.seedEvent('E');core.seedActor('E','P','PIONEER');core.seedActor('E','F','FOUNDER');
  const service=createEvacEventCompletion(core);
  assert.throws(()=>service.complete({eventId:'E',founderId:'P',operationId:'X'}),/EVAC_FOUNDER_REQUIRED/);
  core.db.prepare("UPDATE actors SET active=0 WHERE actor_id='F'").run();
  assert.throws(()=>service.complete({eventId:'E',founderId:'F',operationId:'X'}),/EVAC_FOUNDER_REQUIRED/);
 }finally{core.close()}
});
test('rejects missing identifiers',()=>{
 const core=new SqliteGameCore();try{
  const service=createEvacEventCompletion(core);
  assert.throws(()=>service.complete({eventId:'E',founderId:'F',operationId:''}),/EVAC_COMPLETION_CONTEXT_REQUIRED/);
 }finally{core.close()}
});
