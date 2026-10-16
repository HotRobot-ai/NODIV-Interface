import test from 'node:test';
import assert from 'node:assert/strict';
import {SqliteGameCore} from './sqlite-core.mjs';
import {CatchTransaction} from './catch-transaction.mjs';
test('completed Exchange takes priority; Catch refreshes highest current Core',()=>{
 const c=new SqliteGameCore(':memory:',()=>1000);
 try{
  c.seedEvent('E');c.seedActor('E','P','PIONEER',1);c.seedActor('E','L','LOCAL',1);c.seedNode('E','N','INSTALLED');
  c.seedCore('E',{id:'OLD',uid:'old',energy:450,ownerType:'PIONEER',ownerId:'P'});
  for(let i=1;i<=3;i++)c.seedCore('E',{id:'N'+i,uid:'n'+i,energy:200+i,ownerType:'NODE',ownerId:'N'});
  const catchService=new CatchTransaction(c);
  const pending=catchService.preview({eventId:'E',catcherId:'L',targetId:'P'});
  const move=(id,fromType,fromId,toType,toId)=>({id,fromType,fromId,toType,toId,status:toType==='NODE'?'DEPLOYED':toType==='PIONEER'?'FIELD':toType==='HQ'?'RESERVE':undefined});
  const exchange=c.run({eventId:'E',operationId:'EX1',actorId:'P',kind:'EXCHANGE',moves:[move('OLD','PIONEER','P','NODE','N'),move('N1','NODE','N','PIONEER','P')]});
  assert.equal(exchange.ok,true);
  assert.throws(()=>catchService.confirm({eventId:'E',previewId:pending.previewId,catcherId:'L'}),/CATCH_SNAPSHOT_CHANGED/);
  assert.equal(c.db.prepare('SELECT COUNT(*) n FROM catch_ghost').get().n,0);
  const fresh=catchService.preview({eventId:'E',catcherId:'L',targetId:'P'});
  const receipt=catchService.confirm({eventId:'E',previewId:fresh.previewId,catcherId:'L'});
  assert.equal(receipt.core.id,'N1');
  assert.equal(c.core('E','N1').owner_id,'L');
  assert.equal(c.core('E','OLD').owner_id,'N');
 }finally{c.close()}
});
