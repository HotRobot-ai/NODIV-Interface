import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createLabApp} from '../server/server.mjs';import {DEFAULT_UIDS} from '../server/seed.mjs';
const dir=mkdtempSync(join(tmpdir(),'nodiv-api-')),dbPath=join(dir,'test.sqlite');const app=createLabApp({host:'127.0.0.1',port:0,dbPath,eventId:'TEST-V2',tlsKey:'',tlsCert:'',sessionTtl:3600,grantTtl:90,exchangeTtl:300});await new Promise((r,j)=>app.server.once('error',j).listen(0,'127.0.0.1',r));const port=app.server.address().port,base=`http://127.0.0.1:${port}`;
async function call(path,{token,data,method='POST'}={}){const t=performance.now();const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:data?JSON.stringify(data):undefined});const j=await r.json().catch(()=>({ok:false,error:'BAD_JSON'}));return{r,j,ms:performance.now()-t}}
async function prepare(token){const grant=(await call('/api/scan',{token,data:{uid:DEFAULT_UIDS.node}})).j;const prep=(await call('/api/exchange/prepare',{token,data:{grantId:grant.grantId,count:1}})).j;await call('/api/scan',{token,data:{uid:DEFAULT_UIDS.pioneerCore,exchangeId:prep.exchangeId}});await call('/api/scan',{token,data:{uid:DEFAULT_UIDS.node1,exchangeId:prep.exchangeId}});return prep}
try{
 const h=await call('/health',{method:'GET'});if(!h.j.ok)throw Error('health failed');
 const s1=(await call('/api/session/start',{data:{uid:DEFAULT_UIDS.access}})).j;const s2=(await call('/api/session/start',{data:{uid:DEFAULT_UIDS.access}})).j;
 const seq=[];for(let i=0;i<20;i++)seq.push((await call('/api/state',{token:s1.token,method:'GET'})).ms);
 const par=await Promise.all(Array.from({length:10},()=>call('/api/state',{token:s1.token,method:'GET'})));
 const p1=await prepare(s1.token),p2=await prepare(s2.token);
 const concurrent=await Promise.all([call('/api/exchange/confirm',{token:s1.token,data:{exchangeId:p1.exchangeId,accessCode:p1.accessCode}}),call('/api/exchange/confirm',{token:s2.token,data:{exchangeId:p2.exchangeId,accessCode:p2.accessCode}})]);
 const successes=concurrent.filter(x=>x.r.ok&&x.j.ok),fails=concurrent.filter(x=>!x.r.ok);
 if(successes.length!==1||fails.length!==1||!['OWNERSHIP_CHANGED'].includes(fails[0].j.error))throw Error('concurrent double-spend guard failed '+JSON.stringify(concurrent.map(x=>({status:x.r.status,j:x.j}))));
 const winner=concurrent[0].r.ok?{token:s1.token,prep:p1,first:concurrent[0]}:{token:s2.token,prep:p2,first:concurrent[1]};
 const replay=await call('/api/exchange/confirm',{token:winner.token,data:{exchangeId:winner.prep.exchangeId,accessCode:winner.prep.accessCode}});if(!replay.j.replayed)throw Error('exchange replay failed');
 const state=(await call('/api/state',{token:s1.token,method:'GET'})).j;if(state.nodes[0].cores.length!==3||state.personal.length!==1)throw Error('invariant failed');
 console.log(JSON.stringify({ok:true,sequential:{count:seq.length,maxMs:+Math.max(...seq).toFixed(2),avgMs:+(seq.reduce((a,b)=>a+b,0)/seq.length).toFixed(2)},parallelReads:{count:par.length,maxMs:+Math.max(...par.map(x=>x.ms)).toFixed(2)},concurrentConfirms:{successes:successes.length,rejected:fails.length,rejectCode:fails[0].j.error,maxMs:+Math.max(...concurrent.map(x=>x.ms)).toFixed(2)},replay:{ms:+replay.ms.toFixed(2),replayed:replay.j.replayed},operationCount:state.recent.length},null,2));
}finally{await app.close();rmSync(dir,{recursive:true,force:true})}
