import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {installNfcGrantSchema,issueNfcGrant,runWithNfcGrant} from './nfc-grants.mjs';
function fixture(){
 const db=new DatabaseSync(':memory:');installNfcGrantSchema(db);
 db.exec("CREATE TABLE cores (id TEXT PRIMARY KEY, owner TEXT NOT NULL); INSERT INTO cores VALUES ('NC001','NODE')");
 const scope={eventId:'TEST',actorId:'P003',command:'exchange.confirm',targetType:'NODE',targetId:'NODE-001',operationId:'OP-001'};
 const {id}=issueNfcGrant(db,{...scope,now:1000,ttlMs:1000});
 return {db,scope:{...scope,id},move:db=>db.prepare('UPDATE cores SET owner=? WHERE id=?').run('P003','NC001')};
}
test('single-use grant and Core mutation commit together',()=>{
 const {db,scope,move}=fixture();runWithNfcGrant(db,scope,move,{now:1500});
 assert.equal(db.prepare('SELECT owner FROM cores').get().owner,'P003');
 assert.throws(()=>runWithNfcGrant(db,scope,move,{now:1600}),/NFC_GRANT_INVALID_OR_CONSUMED/);
});
test('failed mutation rolls back grant consumption and ownership',()=>{
 const {db,scope,move}=fixture();
 assert.throws(()=>runWithNfcGrant(db,scope,d=>{move(d);throw Error('SIMULATED_FAILURE')},{now:1500}),/SIMULATED_FAILURE/);
 assert.equal(db.prepare('SELECT owner FROM cores').get().owner,'NODE');
 assert.equal(db.prepare('SELECT consumed_at FROM v2_nfc_grants').get().consumed_at,null);
 runWithNfcGrant(db,scope,move,{now:1500});
});
test('wrong actor, operation, node and expired grants rejected',()=>{
 for(const [field,value] of [['actorId','P004'],['operationId','OP-002'],['targetId','NODE-002']]){
  const {db,scope,move}=fixture();
  assert.throws(()=>runWithNfcGrant(db,{...scope,[field]:value},move,{now:1500}),/NFC_GRANT_INVALID_OR_CONSUMED/);
 }
 const {db,scope,move}=fixture();
 assert.throws(()=>runWithNfcGrant(db,scope,move,{now:2001}),/NFC_GRANT_INVALID_OR_CONSUMED/);
});
test('async callbacks cannot escape transaction',()=>{
 const {db,scope}=fixture();
 assert.throws(()=>runWithNfcGrant(db,scope,()=>Promise.resolve(),{now:1500}),/ASYNC_MUTATION_FORBIDDEN/);
 assert.equal(db.prepare('SELECT consumed_at FROM v2_nfc_grants').get().consumed_at,null);
});
