const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('Code.js','utf8');
const from=source.indexOf('function transactionHistoryRows(){');
const to=source.indexOf('function exchangeCompleted(',from);
assert.ok(from>=0&&to>from,'transaction history helper block exists');
const code=source.slice(from,to);
function fixture(rows){
 let reads=0;
 const sheet={getLastRow:()=>rows.length+1,getRange:()=>({getValues:()=>{reads++;return rows;}})};
 const context={SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>sheet})},TRANSACTION_LOG_SHEET_NAME:'History'};
 vm.createContext(context);vm.runInContext(code,context);
 return {context,reads:()=>reads};
}
function entry(id,type,result='SUCCESS'){const row=Array(16).fill('');row[0]=id;row[2]=type;row[14]=result;return row;}

test('one explicit snapshot serves epoch and exchange rows with one sheet read',()=>{
 const f=fixture([entry('a','NORMAL_EXCHANGE'),entry('reset','PRE_EVENT_RESET_COMPLETE'),entry('b','NORMAL_EXCHANGE')]);
 const snap=f.context.transactionHistorySnapshot();
 assert.equal(f.context.readPreEventResetEpoch(snap),'reset');
 assert.equal(f.context.exchangeLogRows(snap).length,1);
 assert.equal(f.reads(),1);
});

test('failed reset audit does not change epoch',()=>{
 const f=fixture([entry('old','PRE_EVENT_RESET_COMPLETE'),entry('bad','PRE_EVENT_RESET_COMPLETE','FAILED'),entry('next','CATCH_COMPLETE')]);
 const snap=f.context.transactionHistorySnapshot();
 assert.equal(f.context.readPreEventResetEpoch(snap),'old');
 assert.equal(f.context.exchangeLogRows(snap).length,2);
});

test('independent reads see new history; no cross-request cache',()=>{
 const rows=[entry('a','NORMAL_EXCHANGE')];const f=fixture(rows);
 assert.equal(f.context.exchangeLogRows().length,1);
 rows.push(entry('reset','PRE_EVENT_RESET_COMPLETE'));
 assert.equal(f.context.exchangeLogRows().length,0);
 assert.equal(f.reads(),2);
});
