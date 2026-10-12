const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('app/js/identity.js','utf8');
const start=source.indexOf('const nodivStatusInFlight=new Map();');
const end=source.indexOf("window.addEventListener('nodiv-pioneer-live',async()=>{",start);
assert.ok(start>=0&&end>start,'read-only single-flight helper exists');
const helper=source.slice(start,end);

function harness(){
 const calls=[];
 const context={apiRequest:args=>new Promise((resolve,reject)=>calls.push({args,resolve,reject})),Promise,Map};
 vm.createContext(context);
 vm.runInContext(helper+';globalThis.status=nodivSingleFlightStatus;',context);
 return {calls,status:context.status};
}

test('identical overlapping status requests use one network request',async()=>{
 const {calls,status}=harness();
 const a=status('playerstate','TOKEN_A'),b=status('playerstate','TOKEN_A');
 await Promise.resolve();
 assert.equal(calls.length,1);
 calls[0].resolve({ok:true});
 assert.equal((await a).ok,true);
 assert.equal((await b).ok,true);
});

test('different tokens and actions never share a status request',async()=>{
 const {calls,status}=harness();
 const pending=[status('playerstate','A'),status('playerstate','B'),status('uploadterminalstate','A')];
 await Promise.resolve();
 assert.equal(calls.length,3);
 calls.forEach(c=>c.resolve({ok:true}));
 await Promise.all(pending);
});

test('settled status responses are not cached',async()=>{
 const {calls,status}=harness();
 const first=status('playerstate','A');await Promise.resolve();calls[0].resolve({version:1});await first;
 const second=status('playerstate','A');await Promise.resolve();
 assert.equal(calls.length,2);
 calls[1].resolve({version:2});assert.equal((await second).version,2);
});

test('failed status requests release the slot for retry',async()=>{
 const {calls,status}=harness();
 const first=status('playerstate','A');await Promise.resolve();calls[0].reject(new Error('offline'));
 await assert.rejects(first,/offline/);
 const second=status('playerstate','A');await Promise.resolve();assert.equal(calls.length,2);
 calls[1].resolve({ok:true});await second;
});
