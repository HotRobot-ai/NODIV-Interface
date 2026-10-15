import test from 'node:test';
import assert from 'node:assert/strict';
import {SqliteGameCore} from './sqlite-core.mjs';
import {CatchTransaction} from './catch-transaction.mjs';
import {createCatchApi} from './catch-api.mjs';
import {listenCatchHttpLoopback} from './catch-http-lab.mjs';
import {issueSession} from './auth.mjs';
import {installNfcGrantSchema,issueNfcGrant} from './nfc-grants.mjs';
const secret='test-secret-with-at-least-thirty-two-bytes';
test('real loopback HTTP: authorization, NFC confirmation, idempotent replay and validation',async()=>{
 const now=Date.now(),core=new SqliteGameCore(':memory:',()=>Math.floor(now/1000));
 installNfcGrantSchema(core.db);core.seedEvent('E');core.seedActor('E','L','LOCAL',1);core.seedActor('E','P','PIONEER',1);
 core.seedCore('E',{id:'NC1',uid:'U1',energy:410,ownerType:'PIONEER',ownerId:'P'});
 const server=await listenCatchHttpLoopback(createCatchApi({catchService:new CatchTransaction(core),secret,now:()=>now}));
 const url='http://127.0.0.1:'+server.address().port;
 const token=(id,role)=>issueSession({eventId:'E',actorId:id,role,secret,now});
 const post=async(path,body,t=token('L','LOCAL'),type='application/json')=>{const r=await fetch(url+path,{method:'POST',headers:{'content-type':type,...(t?{authorization:'Bearer '+t}:{})},body:typeof body==='string'?body:JSON.stringify(body)});return {status:r.status,body:await r.json()}};
 try{
  assert.equal((await post('/v2/catch/preview',{eventId:'E',targetId:'P'},null)).status,401);
  assert.equal((await post('/v2/catch/preview',{eventId:'E',targetId:'P'},token('P','PIONEER'))).status,403);
  assert.equal((await post('/v2/catch/preview',{eventId:'E',targetId:'P'},undefined,'text/plain')).status,415);
  assert.equal((await post('/v2/catch/preview','{broken')).status,400);
  assert.equal((await post('/v2/catch/preview',{eventId:'E',targetId:'P',junk:'a'.repeat(9000)})).status,413);
  const p=await post('/v2/catch/preview',{eventId:'E',targetId:'P'});assert.equal(p.status,200);
  const previewId=p.body.result.previewId;
  assert.equal((await post('/v2/catch/confirm',{eventId:'E',previewId})).status,400);
  assert.equal(core.core('E','NC1').owner_id,'P');
  const grant=issueNfcGrant(core.db,{eventId:'E',actorId:'L',command:'catch.confirm',targetType:'PIONEER',targetId:'P',operationId:previewId,now});
  const confirm={eventId:'E',previewId,proof:{id:grant.id,targetId:'P'}};
  const first=await post('/v2/catch/confirm',confirm);assert.equal(first.status,200,JSON.stringify(first));assert.equal(first.body.result.core.id,'NC1');
  assert.equal(core.core('E','NC1').owner_id,'L');
  const second=await post('/v2/catch/confirm',confirm);assert.equal(second.status,200);assert.equal(second.body.result.replayed,true);
  assert.equal(core.db.prepare("SELECT COUNT(*) n FROM audit WHERE event_id='E' AND operation_id=?").get(previewId).n,1);
 }finally{await new Promise(resolve=>server.close(resolve));core.close()}
});
