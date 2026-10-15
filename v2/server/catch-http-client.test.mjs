import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatchHttpClient} from './catch-http-client.mjs';
test('browser adapter calls preview then confirm with fresh proof',async()=>{
 const calls=[],old=globalThis.fetch;
 globalThis.fetch=async(url,opts)=>{
  const path=new URL(url).pathname,body=JSON.parse(opts.body);
  calls.push({path,body,authorization:opts.headers.authorization});
  return {ok:true,json:async()=>({ok:true,result:path.endsWith('preview')?{previewId:'P1'}:{status:'CATCH_COMPLETE'}})};
 };
 try{
  const run=createCatchHttpClient({baseUrl:'http://127.0.0.1:8000/',eventId:'E',getSessionToken:async()=> 'session',acquireFreshNfcProof:async({previewId})=>({id:'grant-'+previewId,targetId:'P'})});
  assert.equal((await run('P')).status,'CATCH_COMPLETE');
  assert.deepEqual(calls.map(c=>c.path),['/v2/catch/preview','/v2/catch/confirm']);
  assert.equal(calls[1].body.proof.id,'grant-P1');
  assert.equal(calls[0].authorization,'Bearer session');
 }finally{globalThis.fetch=old}
});
test('stale preview triggers new proof and second HTTP confirmation',async()=>{
 const calls=[],old=globalThis.fetch;let n=0;
 globalThis.fetch=async(url,opts)=>{
  const path=new URL(url).pathname,body=JSON.parse(opts.body);calls.push({path,body});
  if(path.endsWith('preview'))return {ok:true,json:async()=>({ok:true,result:{previewId:'P'+ ++n}})};
  if(body.previewId==='P1')return {ok:false,status:400,json:async()=>({ok:false,error:'CATCH_SNAPSHOT_CHANGED'})};
  return {ok:true,json:async()=>({ok:true,result:{status:'CATCH_COMPLETE'}})};
 };
 try{
  const run=createCatchHttpClient({baseUrl:'http://127.0.0.1:8000',eventId:'E',getSessionToken:async()=> 'session',acquireFreshNfcProof:async({previewId})=>({id:'grant-'+previewId,targetId:'P'})});
  await run('P');
  assert.deepEqual(calls.filter(c=>c.path.endsWith('confirm')).map(c=>c.body.proof.id),['grant-P1','grant-P2']);
 }finally{globalThis.fetch=old}
});
test('missing session rejects before network access',async()=>{
 const old=globalThis.fetch;let count=0;globalThis.fetch=async()=>{count++;throw Error('UNEXPECTED')};
 try{
  const run=createCatchHttpClient({baseUrl:'http://127.0.0.1:8000',eventId:'E',getSessionToken:async()=>'',acquireFreshNfcProof:async()=>({})});
  await assert.rejects(run('P'),/CATCH_SESSION_REQUIRED/);assert.equal(count,0);
 }finally{globalThis.fetch=old}
});
