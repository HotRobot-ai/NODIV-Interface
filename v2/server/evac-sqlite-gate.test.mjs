import test from 'node:test';
import assert from 'node:assert/strict';
import {SqliteGameCore} from './sqlite-core.mjs';
import {checkEvacCompletionFromSqlite} from './evac-sqlite-gate.mjs';
test('real V2 SQLite core fails closed until EVAC tables exist',()=>{
 const core=new SqliteGameCore();
 try{
  core.seedEvent('E1');
  const result=checkEvacCompletionFromSqlite(core.db,'E1');
  assert.equal(result.eligible,false);
  assert.ok(result.missing.includes('evac_teams'));
 }finally{core.close();}
});
test('invalid context fails closed',()=>assert.throws(()=>checkEvacCompletionFromSqlite(null,'E1'),/EVAC_DB_CONTEXT_REQUIRED/));
