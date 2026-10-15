'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../../Code.js'),'utf8');
const start=code.indexOf('function finishForceRecall(e){'),end=code.indexOf('function forceRecallStatus(e){',start);
assert(start>=0&&end>start,'production function not found');
const source=code.slice(start,end);
function harness({exchanges=[],batchFail=false,propertyFail=false,ownerId='HQ',nodesReady=true}={}){
 let writes=0,batches=0,property=null,released=0;
 const node=['E1','NODE-001',null,null,null,null,null,null,null,nodesReady?'DEINSTALLED':'INSTALLED'];
 const cores=Array.from({length:200},(_,i)=>{const row=Array(18).fill('');row[0]='NC'+String(i+1).padStart(3,'0');row[4]='RESERVE';row[14]='NODIV_RESERVE';row[15]=ownerId;return row});
 const sheet={getLastRow:()=>2,getRange:()=>({getValues:()=>[node]})};
 const ctx={Date,JSON,String,Error,Set,FORCE_RECALL_PROPERTY:'FR',CORE_COL:{UPDATED_AT:18,ID:1,OWNER_TYPE:15,OWNER_ID:16,STATUS:5},
 LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{released++}})},
 resolvePlayerSession:()=>({ok:true,player:{role:'FOUNDER',identity:'F1'}}),forceRecallRecord:()=>({status:'EMERGENCY_SHUTDOWN',eventId:'E1'}),
 reconcileForceRecallCompletion:()=>null,readCurrentEvent:()=>({eventId:'E1',state:'FIELD_ACTIVE',plannedNodes:1,activeNodes:0,row:2}),
 getEventNodeCodeSheet:()=>sheet,getNodeGameplayStatus:()=>nodesReady?'AVAILABLE':'ACTIVE',
 getRegisterSheet:()=>({getRange:()=>({getValues:()=>cores})}),readInstallationOrders:()=>[],installationOrderIsLive:()=>true,
 liveRestores:()=>[],liveExchanges:()=>exchanges,liveReSupplies:()=>[],evacuationStarted:()=>false,
 getEventRegisterSheet:()=>sheet,stageEventRegisterCompletion:(sh,row,now,req)=>req.push('EVENT'),
 appendTransactionLog:(data,req)=>req.push('AUDIT'),SpreadsheetApp:{flush:()=>{},getActiveSpreadsheet:()=>({getId:()=> 'SHEET'})},
 Sheets:{Spreadsheets:{batchUpdate:(payload)=>{batches++;if(batchFail)throw Error('BATCH_FAILED');assert.deepEqual(Array.from(payload.requests),['EVENT','AUDIT']);}}},
 PropertiesService:{getScriptProperties:()=>({setProperty:(k,v)=>{writes++;if(propertyFail)throw Error('PROPERTY_FAILED');property=JSON.parse(v)}})}};
 vm.runInNewContext(source,ctx);
 return {run:()=>ctx.finishForceRecall({parameter:{token:'T',event:'E1',confirm:'FINISH_RECALL:E1'}}),get writes(){return writes},get batches(){return batches},get property(){return property},get released(){return released}};
}
test('open exchange blocks completion before any write',()=>{const h=harness({exchanges:[{eventId:'E1',id:'EX-1'}]});const r=h.run();assert.equal(r.ok,false);assert.equal(r.blockers.includes('OPEN_EXCHANGE:EX-1'),true);assert.equal(h.batches,0);assert.equal(h.writes,0);assert.equal(h.released,1)});
test('foreign-event exchange does not block',()=>{const h=harness({exchanges:[{eventId:'E2',id:'EX-2'}]});assert.equal(h.run().ok,true);assert.equal(h.batches,1);assert.equal(h.property.status,'COMPLETED')});
test('batch failure prevents status completion',()=>{const h=harness({batchFail:true});assert.throws(()=>h.run(),/BATCH_FAILED/);assert.equal(h.writes,0);assert.equal(h.batches,1);assert.equal(h.released,1)});
test('property failure after batch leaves recovery-required state',()=>{const h=harness({propertyFail:true});assert.throws(()=>h.run(),/PROPERTY_FAILED/);assert.equal(h.batches,1);assert.equal(h.writes,1);assert.equal(h.property,null);assert.equal(h.released,1)});
test('wrong HQ owner ID blocks completion',()=>{const h=harness({ownerId:'P001'});const r=h.run();assert.equal(r.ok,false);assert.equal(r.blockers.filter(x=>x.startsWith('CORE_NOT_AT_HQ:')).length,200);assert.equal(h.batches,0)});
test('uninstalled node blocks completion',()=>{const h=harness({nodesReady:false});const r=h.run();assert.equal(r.ok,false);assert.equal(r.blockers.some(x=>x.includes('DEINSTALLATION_NOT_CONFIRMED')),true);assert.equal(h.batches,0)});
test('happy path batches event and audit before property',()=>{const h=harness();const r=h.run();assert.equal(r.ok,true);assert.equal(h.batches,1);assert.equal(h.writes,1);assert.equal(h.property.status,'COMPLETED')});
