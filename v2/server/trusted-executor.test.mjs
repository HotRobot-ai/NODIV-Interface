import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {installNfcGrantSchema,issueNfcGrant} from './nfc-grants.mjs';
import {createTrustedV2Executor} from './trusted-executor.mjs';
const session={active:true,actorId:'P003',eventId:'EVT-TEST',role:'PIONEER'};
function fixture(){
 const db=new DatabaseSync(':memory:');installNfcGrantSchema(db);
 db.exec("CREATE TABLE cores (id TEXT PRIMARY KEY, owner TEXT); INSERT INTO cores VALUES ('NC001','NODE')");
 const base={eventId:session.eventId,actorId:session.actorId,command:'exchange.confirm',targetType:'NODE',targetId:'NODE-001',operationId:'OP-001'};
 const grant=issueNfcGrant(db,{...base,now:Date.now(),ttlMs:30000});
 const scope={...base,id:grant.id};
 const execute=createTrustedV2Executor({db,resolveScope:async()=>scope,handlers:{'exchange.confirm':({db})=>db.prepare("UPDATE cores SET owner='P003' WHERE id='NC001'").run()}});
 return {db,execute,scope};
}
test('trusted executor commits grant and ownership',async()=>{
 const f=fixture();await f.execute({session,command:'exchange.confirm'});
 assert.equal(f.db.prepare('SELECT owner FROM cores').get().owner,'P003');
 await assert.rejects(f.execute({session,command:'exchange.confirm'}),/NFC_GRANT_INVALID_OR_CONSUMED/);
});
test('rejects spoofed actor, missing event, unknown command and missing handler',async()=>{
 const f=fixture();
 await assert.rejects(f.execute({session:{...session,actorId:'P004'},command:'exchange.confirm'}),{code:'AUTHORITATIVE_ORDER_REQUIRED'});
 await assert.rejects(f.execute({session:{...session,eventId:'EVT-OTHER'},command:'exchange.confirm'}),{code:'AUTHORITATIVE_ORDER_REQUIRED'});
 await assert.rejects(f.execute({session,command:'sqlite.run'}),{code:'TRUSTED_CONTEXT_INVALID'});
 await assert.rejects(f.execute({session,command:'evac.final'}),{code:'COMMAND_NOT_IMPLEMENTED'});
});
test('read-only handler does not consume grant',async()=>{
 const f=fixture();
 const execute=createTrustedV2Executor({db:f.db,resolveScope:async()=>{throw Error('UNEXPECTED');},handlers:{'player.state':()=>({ready:true})}});
 assert.deepEqual(await execute({session,command:'player.state'}),{ready:true});
 assert.equal(f.db.prepare('SELECT consumed_at FROM v2_nfc_grants').get().consumed_at,null);
});

test('failed domain command rolls back both ownership and NFC consumption',async()=>{
 const f=fixture();
 const execute=createTrustedV2Executor({db:f.db,resolveScope:async()=>f.scope,handlers:{
  'exchange.confirm':({db})=>{
   db.prepare("UPDATE cores SET owner='P003' WHERE id='NC001'").run();
   throw Error('CORE_GUARD_REJECTED');
  }
 }});
 await assert.rejects(execute({session,command:'exchange.confirm'}),/CORE_GUARD_REJECTED/);
 assert.equal(f.db.prepare('SELECT owner FROM cores').get().owner,'NODE');
 assert.equal(f.db.prepare('SELECT consumed_at FROM v2_nfc_grants').get().consumed_at,null);
 await f.execute({session,command:'exchange.confirm'});
 assert.equal(f.db.prepare('SELECT owner FROM cores').get().owner,'P003');
});
test('missing server-side order and unsupported handler fail closed',async()=>{
 const f=fixture();
 const execute=createTrustedV2Executor({db:f.db,resolveScope:async()=>null,handlers:{'exchange.confirm':()=>true}});
 await assert.rejects(execute({session,command:'exchange.confirm'}),{code:'AUTHORITATIVE_ORDER_REQUIRED'});
 assert.equal(f.db.prepare('SELECT consumed_at FROM v2_nfc_grants').get().consumed_at,null);
});
