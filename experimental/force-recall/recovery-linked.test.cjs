'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../../Code.js'),'utf8');
const start=code.indexOf('function reconcileForceRecallCompletion('),end=code.indexOf('function finishForceRecall(e){',start);
assert(start>=0&&end>start,'production recovery function not found');
const source=code.slice(start,end);
function harness({state='COMPLETED',audit=true,throwWrite=false,rows=1}={}){
 let stored=null,writeCount=0;
 const eventRows=Array.from({length:rows},()=>['E1',state,null,null,null,null,null,null,null,null,new Date('2026-10-15T05:00:00Z')]);
 const auditRows=audit?[['TX',null,'FORCE_RECALL_COMPLETED','FOUNDER',null,null,null,null,null,null,null,null,null,null,'SUCCESS','E1 // RECOVERY VERIFIED']]:[['TX',null,'OTHER','FOUNDER']];
 const context={Date,JSON,Error,String,FORCE_RECALL_PROPERTY:'FORCE_RECALL',TRANSACTION_LOG_SHEET_NAME:'Transaction Log',
  getEventRegisterSheet:()=>({getLastRow:()=>eventRows.length+1}),eventRegisterRangeValues:()=>eventRows,
  SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>({getLastRow:()=>auditRows.length+1,getRange:()=>({getValues:()=>auditRows})})})},
  PropertiesService:{getScriptProperties:()=>({setProperty:(k,v)=>{writeCount++;if(throwWrite)throw Error('WRITE_FAILED');stored=JSON.parse(v);}})}};
 vm.runInNewContext(source,context);
 return {run:()=>context.reconcileForceRecallCompletion({eventId:'E1',status:'EMERGENCY_SHUTDOWN'},'FOUNDER'),get stored(){return stored},get writes(){return writeCount}};
}
test('active event: no recovery or property write',()=>{const h=harness({state:'FIELD_ACTIVE'});assert.equal(h.run(),null);assert.equal(h.writes,0)});
test('completed without audit: fail closed',()=>{const h=harness({audit:false});assert.throws(()=>h.run(),/AUDIT_MISSING/);assert.equal(h.writes,0)});
test('completed with audit: recover and persist',()=>{const h=harness();const v=h.run();assert.equal(v.recovered,true);assert.equal(h.stored.status,'COMPLETED');assert.equal(h.writes,1)});
test('property write interruption: error and no false success',()=>{const h=harness({throwWrite:true});assert.throws(()=>h.run(),/WRITE_FAILED/);assert.equal(h.stored,null)});
test('duplicate event records: fail closed',()=>{const h=harness({rows:2});assert.equal(h.run(),null);assert.equal(h.writes,0)});
test('repeat recovery: stable completed state',()=>{const h=harness();h.run();h.run();assert.equal(h.stored.status,'COMPLETED');assert.equal(h.writes,2)});
