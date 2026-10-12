const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const code=fs.readFileSync('Code.js','utf8');

test('Event Register canonical schema is 12 columns with K completed and L upload points',()=>{
  assert.match(code,/getRange\(1,1,1,12\)\.setValues\(\[\['EVENT ID','STATE','CREATED AT','INITIALIZED AT','ACTIVATED AT','FOUNDER','PLANNED NODES','ACTIVE NODES','READINESS','UPDATED AT','COMPLETED AT','HQ UPLOAD POINTS'\]\]\)/);
});

test('existing Event Register schema migrates without overwriting historical completion timestamps',()=>{
  assert.match(code,/function migrateEventRegisterSchema\(sheet\)/);
  assert.match(code,/Number\.isInteger\(numeric\)&&numeric>=1&&numeric<=4/);
  assert.match(code,/sheetCellsRequest\(sheet,index\+2,12,\[\[numeric\]\]\)/);
  assert.match(code,/sheetCellsRequest\(sheet,index\+2,11,\[\[''\]\]\)/);
  assert.doesNotMatch(code,/sheetCellsRequest\(sheet,index\+2,11,\[\[legacy\]\]\)/);
});

test('migration is idempotent once K and L headers are canonical',()=>{
  assert.match(code,/if\(completedHeader!=='COMPLETED AT'\|\|uploadHeader!=='HQ UPLOAD POINTS'\)requests\.push/);
  assert.match(code,/if\(requests\.length\)Sheets\.Spreadsheets\.batchUpdate/);
});

test('conflicting Event Register columns fail closed',()=>{
  assert.match(code,/EVENT_REGISTER_COLUMN_L_CONFLICT/);
  assert.match(code,/EVENT_REGISTER_COLUMN_K_CONFLICT/);
  assert.match(code,/EVENT_REGISTER_UPLOAD_POINT_CONFLICT/);
});

test('current Event reader takes upload point count from L',()=>{
  assert.match(code,/getRange\(2,1,sheet\.getLastRow\(\)-1,12\)\.getValues\(\)/);
  assert.match(code,/uploadPoints:Math\.max\(1,Math\.min\(4,Number\(rows\[i\]\[11\]\|\|1\)\)\)/);
});

test('new Event rows reserve K for completion and write upload points to L',()=>{
  assert.match(code,/\[eventId,'INITIALIZED',now,now,'',actor\.identity,10,0,'INITIALIZED_BASELINE',now,'',uploadPoints\]/);
});

test('technical shutdown writes completion time to K without changing L',()=>{
  const start=code.indexOf('function shutdownFieldEvent');
  const end=code.indexOf('// Used by the existing transaction/ownership helpers',start);
  const block=code.slice(start,end);
  assert.match(block,/sheetCellsRequest\(eventSheet,event\.row,10,\[\[now,now\]\]\)/);
  assert.doesNotMatch(block,/EVENT_COMPLETION_COLUMN_CONFLICT/);
  assert.doesNotMatch(block,/sheetCellsRequest\(eventSheet,1,11/);
});

test('EVAC completion writes K completion time and leaves L intact',()=>{
  const start=code.indexOf('function stageEvacuationCompletion');
  const end=code.indexOf('function evacuationFinalAction',start);
  const block=code.slice(start,end);
  assert.match(block,/sheetCellsRequest\(sheet,event\.row,10,\[\[now,now\]\]\)/);
  assert.doesNotMatch(block,/EVENT_COMPLETION_COLUMN_CONFLICT/);
  assert.doesNotMatch(block,/sheetCellsRequest\(sheet,1,11/);
});

test('EVAC completed-event reader uses the 12-column Event Register',()=>{
  const start=code.indexOf('function evacuationReadEvent');
  const end=code.indexOf('function evacuationFinalReceipt',start);
  assert.match(code.slice(start,end),/getRange\(2,1,Math\.max\(0,sheet\.getLastRow\(\)-1\),12\)/);
});

test('reset and pre-evacuation projections include the full Event Register schema',()=>{
  assert.match(code,/events=read\(EVENT_SHEET_NAME,12\)/);
  assert.match(code,/columns=\[CORE_COL\.UPDATED_AT,6,12,13,11,16\]/);
});
