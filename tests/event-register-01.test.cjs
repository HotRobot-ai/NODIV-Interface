'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','Code.js'),'utf8');
function extract(name,next){
 const start=source.indexOf('function '+name+'('),end=source.indexOf('function '+next+'(',start+1);
 assert.ok(start>=0&&end>start,'missing function '+name);
 return source.slice(start,end);
}
const schema=extract('getEventRegisterSheet','getEventNodeCodeSheet');
const reader=extract('readCurrentEvent','listProvisionedNodeIds');
function mockSheet(headers,values=[]){
 const data=[['','','','','','','','','','',...headers],...values.map(row=>row.slice())];
 const writes=[];
 const sheet={
  getLastRow:()=>data.length,
  getRange(row,col,numRows=1,numCols=1){
   return {
    getDisplayValues:()=>Array.from({length:numRows},(_,i)=>Array.from({length:numCols},(_,j)=>String(data[row-1+i]?.[col-1+j]??''))),
    getValues:()=>Array.from({length:numRows},(_,i)=>Array.from({length:numCols},(_,j)=>data[row-1+i]?.[col-1+j]??'')),
    setValue(value){data[row-1]??=[];data[row-1][col-1]=value;writes.push([row,col,value]);},
    setValues(rows){rows.forEach((values,i)=>values.forEach((value,j)=>{data[row-1+i]??=[];data[row-1+i][col-1+j]=value;writes.push([row+i,col+j,value]);}));}
   };
  },
  setFrozenRows(){},
  getSheetId:()=>1
 };
 return {sheet,data,writes};
}
function execute(name,sourceCode,env){const context=vm.createContext({...env,EVENT_SHEET_NAME:'Event Register'});vm.runInContext(sourceCode,context);return context[name]();}
test('existing K completion timestamp remains intact; L header is added',()=>{
 const row=['EVT-1','COMPLETED','','','','',10,0,'','',new Date('2026-10-04T00:00:00Z'),''];
 const m=mockSheet(['COMPLETED AT',''],[row]);
 const ss={getSheetByName:()=>m.sheet};
 execute('getEventRegisterSheet',schema,{SpreadsheetApp:{getActiveSpreadsheet:()=>ss}});
 assert.equal(m.data[1][10],row[10]);assert.equal(m.data[0][11],'HQ UPLOAD POINTS');
 assert.deepEqual(m.writes,[[1,12,'HQ UPLOAD POINTS']]);
});
test('legacy K upload point counts migrate to L without losing row values',()=>{
 const row=['EVT-2','INITIALIZED','','','','',10,0,'','',3,''];
 const m=mockSheet(['HQ UPLOAD POINTS',''],[row]);
 execute('getEventRegisterSheet',schema,{SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>m.sheet})}});
 assert.equal(m.data[1][10],3);assert.equal(m.data[1][11],3);
 assert.equal(m.data[0][10],'COMPLETED AT');assert.equal(m.data[0][11],'HQ UPLOAD POINTS');
});
test('conflicting L column is rejected without mutation',()=>{
 const m=mockSheet(['COMPLETED AT','SOMETHING ELSE']);
 assert.throws(()=>execute('getEventRegisterSheet',schema,{SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>m.sheet})}}),/EVENT_REGISTER_COLUMN_L_CONFLICT/);
 assert.equal(m.writes.length,0);
});
test('invalid legacy values are rejected without mutation',()=>{
 const row=['EVT-3','INITIALIZED','','','','',10,0,'','',new Date('2026-10-04T00:00:00Z'),''];
 const m=mockSheet(['HQ UPLOAD POINTS',''],[row]);
 assert.throws(()=>execute('getEventRegisterSheet',schema,{SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>m.sheet})}}),/EVENT_REGISTER_LEGACY_DATA_CONFLICT/);
 assert.equal(m.writes.length,0);
});
test('current event reads L, not K',()=>{
 const row=['EVT-4','FIELD_ACTIVE','','','','',10,2,'','',new Date('2026-10-04T00:00:00Z'),3];
 const m=mockSheet(['COMPLETED AT','HQ UPLOAD POINTS'],[row]);
 const current=execute('readCurrentEvent',reader,{getEventRegisterSheet:()=>m.sheet});
 assert.equal(current.uploadPoints,3);assert.equal(current.eventId,'EVT-4');
});
test('event initialization appends a 12-column row with empty K',()=>{
 const start=source.indexOf('function initializeEvent(e)'),end=source.indexOf('function ',start+25);
 const snippet=source.slice(start,end>start?end:undefined);
 assert.match(snippet,/10,0,'INITIALIZED_BASELINE',now,'',uploadPoints/);
});
