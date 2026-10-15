import test from 'node:test';
import assert from 'node:assert/strict';
import {SqliteGameCore} from './sqlite-core.mjs';
import {CatchTransaction} from './catch-transaction.mjs';
import {createCatchApi} from './catch-api.mjs';
import {issueSession} from './auth.mjs';
import {installNfcGrantSchema,issueNfcGrant} from './nfc-grants.mjs';
const secret='v2-catch-api-test-secret-32-bytes-minimum';
const now=Date.now();
function setup(){
 const core=new SqliteGameCore(':memory:',()=>Math.floor(now/1000));
 installNfcGrantSchema(core.db);core.seedEvent('E');
 core.seedActor('E','L','LOCAL',1);core.seedActor('E','P','PIONEER',1);
 core.seedCore('E',{id:'NC1',uid:'U1',energy:410,ownerType:'PIONEER',ownerId:'P'});
 const service=new CatchTransaction(core);
 const api=createCatchApi({catchService:service,secret,now:()=>now});
 const token=(actorId,role)=>issueSession({eventId:'E',actorId,role,secret,now});
 return {core,api,token};
}
test('authenticated Catch preview binds identity to token',()=>{
 const f=setup();try{const p=f.api.preview({token:f.token('L','LOCAL'),eventId:'E',targetId:'P'});assert.equal(p.targetId,'P')}finally{f.core.close()}
});
test('Pioneer cannot initiate Catch preview',()=>{
 const f=setup();try{assert.throws(()=>f.api.preview({token:f.token('P','PIONEER'),eventId:'E',targetId:'P'}),/CATCH_ACCESS_DENIED/)}finally{f.core.close()}
});
test('Catch confirm requires valid NFC grant and commits once',()=>{
 const f=setup();try{
  const token=f.token('L','LOCAL');const p=f.api.preview({token,eventId:'E',targetId:'P'});
  const grant=issueNfcGrant(f.core.db,{eventId:'E',actorId:'L',command:'catch.confirm',targetType:'PIONEER',targetId:'P',operationId:p.previewId,ttlMs:30000,now});
  const proof={id:grant.id,targetId:'P'};
  const receipt=f.api.confirm({token,eventId:'E',previewId:p.previewId,proof});
  assert.equal(receipt.core.id,'NC1');assert.equal(f.core.core('E','NC1').owner_id,'L');
  assert.equal(f.api.confirm({token,eventId:'E',previewId:p.previewId,proof}).replayed,true);
 }finally{f.core.close()}
});
test('missing proof never mutates ownership',()=>{
 const f=setup();try{const token=f.token('L','LOCAL');const p=f.api.preview({token,eventId:'E',targetId:'P'});assert.throws(()=>f.api.confirm({token,eventId:'E',previewId:p.previewId}),/NFC_PROOF_REQUIRED/);assert.equal(f.core.core('E','NC1').owner_id,'P')}finally{f.core.close()}
});
