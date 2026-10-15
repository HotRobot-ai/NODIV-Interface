import test from 'node:test';
import assert from 'node:assert/strict';
import {SqliteGameCore} from './sqlite-core.mjs';
import {CatchTransaction} from './catch-transaction.mjs';
test('Exchange cannot invalidate an active Catch preview, expiry releases it',()=>{
 let now=1000;const c=new SqliteGameCore(':memory:',()=>now);new CatchTransaction(c);
 try{
  c.seedEvent('E');c.seedActor('E','P','PIONEER',1);c.seedActor('E','L','LOCAL',1);c.seedNode('E','N','INSTALLED');
  c.seedCore('E',{id:'P1',uid:'p1',energy:300,ownerType:'PIONEER',ownerId:'P'});
  for(let i=1;i<=3;i++)c.seedCore('E',{id:'N'+i,uid:'n'+i,energy:200+i,ownerType:'NODE',ownerId:'N'});
  const catchService=new CatchTransaction(c);catchService.preview({eventId:'E',catcherId:'L',targetId:'P'});
  const exchange={eventId:'E',operationId:'EX1',actorId:'P',kind:'EXCHANGE',moves:[{id:'P1',fromType:'PIONEER',fromId:'P',toType:'NODE',toId:'N'},{id:'N1',fromType:'NODE',fromId:'N',toType:'PIONEER',toId:'P'}]};
  assert.throws(()=>c.run(exchange),/CATCH_PREVIEW_CONFLICT/);
  assert.equal(c.core('E','P1').owner_id,'P');
  now=1301;assert.equal(c.run(exchange).kind,'EXCHANGE');
 }finally{c.close()}
});

test('RESTORE cannot invalidate a Catch preview, but an unrelated Pioneer is not blocked',()=>{
 let now=1000;const c=new SqliteGameCore(':memory:',()=>now);const catchService=new CatchTransaction(c);
 try{
  c.seedEvent('E');c.seedActor('E','P','PIONEER',1);c.seedActor('E','Q','PIONEER',1);c.seedActor('E','L','LOCAL',1);
  c.seedCore('E',{id:'P1',uid:'p1',energy:300,ownerType:'PIONEER',ownerId:'P'});
  catchService.preview({eventId:'E',catcherId:'L',targetId:'P'});
  const restore={eventId:'E',operationId:'R1',actorId:'P',kind:'RESTORE_1',moves:[],capacityChange:1};
  assert.throws(()=>c.run(restore),/CATCH_PREVIEW_CONFLICT/);
  assert.throws(()=>c.run({...restore,actorId:'Q',operationId:'R2'}),/RESTORE_1_INVALID_SHAPE/);
  now=1301;
  assert.throws(()=>c.run(restore),/RESTORE_1_INVALID_SHAPE/);
 }finally{c.close()}
});
