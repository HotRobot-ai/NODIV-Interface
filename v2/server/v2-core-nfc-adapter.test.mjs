import test from 'node:test';
import assert from 'node:assert/strict';
import {SqliteGameCore} from './sqlite-core.mjs';
import {installNfcGrantSchema,issueNfcGrant} from './nfc-grants.mjs';
import {runCoreWithNfcGrant} from './v2-core-nfc-adapter.mjs';
const move=(id,fromType,fromId,toType,toId)=>({id,fromType,fromId,toType,toId});
function setup(){
 const core=new SqliteGameCore();installNfcGrantSchema(core.db);
 core.seedEvent('E');core.seedActor('E','P','PIONEER',1);core.seedNode('E','N','INSTALLED');
 for(const id of ['A','B','C'])core.seedCore('E',{id,uid:'U'+id,energy:200,ownerType:'NODE',ownerId:'N'});
 core.seedCore('E',{id:'D',uid:'UD',energy:200,ownerType:'PIONEER',ownerId:'P'});
 const operation={eventId:'E',actorId:'P',operationId:'X1',kind:'EXCHANGE',moves:[move('D','PIONEER','P','NODE','N'),move('A','NODE','N','PIONEER','P')]};
 const grantScope={eventId:'E',actorId:'P',command:'exchange.confirm',targetType:'NODE',targetId:'N',operationId:'X1'};
 const issued=issueNfcGrant(core.db,{...grantScope,ttlMs:30000});
 return {core,operation,scope:{...grantScope,id:issued.id}};
}
test('real SqliteGameCore exchange + NFC consumption commit in one transaction; idempotent replay',()=>{
 const f=setup();try{
  assert.equal(runCoreWithNfcGrant(f.core,f.operation,f.scope).replayed,false);
  assert.equal(f.core.core('E','A').owner_type,'PIONEER');
  assert.equal(f.core.core('E','D').owner_type,'NODE');
  assert.equal(f.core.db.prepare("SELECT COUNT(*) n FROM cores WHERE owner_type='NODE'").get().n,3);
  assert.equal(runCoreWithNfcGrant(f.core,f.operation,f.scope).replayed,true);
  assert.equal(f.core.db.prepare('SELECT COUNT(*) n FROM operations').get().n,1);
 }finally{f.core.close();}
});
test('invalid grant rolls back valid core exchange',()=>{
 const f=setup();try{
  assert.throws(()=>runCoreWithNfcGrant(f.core,f.operation,{...f.scope,id:'wrong'}),/NFC_GRANT_INVALID_OR_CONSUMED/);
  assert.equal(f.core.core('E','A').owner_type,'NODE');
  assert.equal(f.core.db.prepare('SELECT COUNT(*) n FROM operations').get().n,0);
 }finally{f.core.close();}
});
test('invalid domain move does not consume NFC grant',()=>{
 const f=setup();try{
  assert.throws(()=>runCoreWithNfcGrant(f.core,{...f.operation,moves:[move('D','PIONEER','P','NODE','N')]},f.scope),/EXCHANGE_INVALID_SHAPE/);
  assert.equal(f.core.db.prepare('SELECT consumed_at FROM v2_nfc_grants').get().consumed_at,null);
  assert.equal(runCoreWithNfcGrant(f.core,f.operation,f.scope).ok,true);
 }finally{f.core.close();}
});
test('replay with another NFC grant is rejected',()=>{
 const f=setup();try{
  runCoreWithNfcGrant(f.core,f.operation,f.scope);
  assert.throws(()=>runCoreWithNfcGrant(f.core,f.operation,{...f.scope,id:'other'}),/NFC_REPLAY_SCOPE_DENIED/);
 }finally{f.core.close();}
});
