const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
// Reuse the existing isolated ownership/Sheets fixture, without registering its tests.
const fixtureSource=fs.readFileSync('tests/node-installation.test.cjs','utf8').split("test('PRIMARY order")[0];
const harness={require,console};vm.createContext(harness);vm.runInContext(fixtureSource+';this.makeFixture=fixture;',harness);
const headers=['EVENT ID','STATE','CREATED AT','INITIALIZED AT','ACTIVATED AT','FOUNDER','PLANNED NODES','ACTIVE NODES','READINESS','UPDATED AT','COMPLETED AT','HQ UPLOAD POINTS'];
test('all historical register readers support a physical eleven-column grid without writes',()=>{
 const f=setup(),sheet=f.sheets['Event Register'];sheet.rows[0]=headers.slice(0,11);sheet.rows[1][1]='COMPLETED';sheet.getMaxColumns=()=>11;
 const original=sheet.getRange.bind(sheet);sheet.getRange=(row,col,n=1,m=1)=>{if(col+m-1>11)throw Error('OUT_OF_GRID');return original(row,col,n,m)};
 const receipt=[];receipt[2]='EVACUATION_COMPLETED';receipt[14]='SUCCESS';receipt[15]=JSON.stringify({eventId:'EVT-1'});f.ctx.exchangeLogRows=()=>[receipt];
 const before=snapshot(f);assert.equal(f.ctx.readCurrentEvent(),null);assert.doesNotThrow(()=>f.ctx.preEventResetPlan());assert.equal(f.ctx.preEvacuationProjection()['Event Register'].rows[0].length,12);assert.equal(f.ctx.evacuationReadEvent().eventId,'EVT-1');assert.equal(snapshot(f),before);
 sheet.rows=[headers.slice(0,11)];assert.equal(f.ctx.evacuationReadEvent(),null);
});
function setup(){
 const f=harness.makeFixture({state:'FIELD_ACTIVE'}),sheet=f.sheets['Event Register'];
 sheet.getMaxColumns=()=>26;
 const original=sheet.getRange.bind(sheet);sheet.getRange=(...args)=>{const range=original(...args);range.getFormulas=()=>range.getValues().map(row=>row.map(()=>''));return range};
 f.ctx.Utilities.computeDigest=(_algorithm,value)=>[...crypto.createHash('sha256').update(value).digest()];
 f.ctx.Utilities.DigestAlgorithm={SHA_256:'SHA_256'};f.ctx.Utilities.Charset={UTF_8:'UTF_8'};
 f.ctx.resolvePlayerSession=()=>({ok:true,player:{identity:'ROOT',role:'FOUNDER'}});
 return f;
}
function migration(f){const plan=f.ctx.previewEventRegisterMigration();return f.ctx.migrateEventRegisterSchema({expectedHash:plan.hash,backupVerified:true,backupReference:'isolated-backup'});}
function snapshot(f){return JSON.stringify(Object.values(f.sheets).map(sheet=>sheet.rows));}
test('new Event Register creates exactly twelve canonical headers',()=>{
 const f=setup(),ss=f.ctx.SpreadsheetApp.getActiveSpreadsheet();delete f.sheets['Event Register'];
 ss.insertSheet=name=>{const sheet=f.sheets['Event Register']=new f.sheets['Node Register'].constructor(3,[]);sheet.setFrozenRows=()=>{};return sheet};
 f.ctx.getEventRegisterSheet();assert.deepEqual(Array.from(f.sheets['Event Register'].rows[0]),headers);
});
test('eleven-column completion migration preserves all historical states and timestamps and is repeatable',()=>{
 const f=setup(),sheet=f.sheets['Event Register'];sheet.rows=[headers.slice(0,11),...['COMPLETED','ABORTED','INITIALIZED','FIELD_ACTIVE'].map((state,i)=>['EVT-'+i,state,'created','initialized','activated','ROOT',10,0,'baseline','updated',state==='COMPLETED'?'2026-10-04T08:42:11.331Z':''])];
 const original=JSON.stringify(sheet.rows.slice(1));assert.equal(migration(f).status,'MIGRATED');assert.equal(JSON.stringify(sheet.rows.slice(1)),original);
 const before=snapshot(f);assert.equal(migration(f).status,'UNCHANGED');assert.equal(snapshot(f),before);assert.equal(f.sheets['Transaction Log'].rows.length,2);
 assert.equal(f.ctx.readCurrentEvent().uploadPoints,null);assert.equal(f.ctx.readCurrentEvent().activeNodes,0);
});
test('legacy upload values move to L without changing A-J; dates under upload header abort',()=>{
 const f=setup(),sheet=f.sheets['Event Register'];sheet.rows[0]=headers.slice(0,10).concat('HQ UPLOAD POINTS');sheet.rows[1][10]=3;
 const before=JSON.stringify(sheet.rows[1].slice(0,10));migration(f);assert.equal(sheet.rows[1][10],'');assert.equal(sheet.rows[1][11],3);assert.equal(JSON.stringify(sheet.rows[1].slice(0,10)),before);
 const g=setup();g.sheets['Event Register'].rows[0]=headers.slice(0,10).concat('HQ UPLOAD POINTS');g.sheets['Event Register'].rows[1][10]='2026-10-04T08:42:11.331Z';const saved=snapshot(g);assert.throws(()=>migration(g),/UPLOAD_POINTS_INVALID/);assert.equal(snapshot(g),saved);
});
test('migration requires backup, rejects stale snapshot, and failed batch leaves no schema/data/audit mutation',()=>{
 const f=setup();f.sheets['Event Register'].rows[0]=headers.slice(0,11);const plan=f.ctx.previewEventRegisterMigration();
 assert.throws(()=>f.ctx.migrateEventRegisterSchema({}),/BACKUP_REQUIRED/);
 f.sheets['Event Register'].rows[1][7]=1;assert.throws(()=>f.ctx.migrateEventRegisterSchema({expectedHash:plan.hash,backupVerified:true,backupReference:'backup'}),/STALE/);
 const before=snapshot(f);f.fail();assert.throws(()=>migration(f),/BATCH_FAILED/);assert.equal(snapshot(f),before);
});
test('unknown headers, numeric completion, invalid L and missing register fail without writes',()=>{
 for(const mutate of [s=>s.rows[0][10]='WRONG',s=>s.rows[1][10]=2,s=>s.rows[1][11]='3',s=>s.rows[1][11]='2026-10-04T00:00:00Z']){
  const f=setup();mutate(f.sheets['Event Register']);const before=snapshot(f);assert.throws(()=>f.ctx.previewEventRegisterMigration(),/INVALID/);assert.equal(snapshot(f),before);
 }
 const f=setup();delete f.sheets['Event Register'];assert.throws(()=>f.ctx.previewEventRegisterMigration(),/MISSING/);
});
for(const points of [2,3,4])test('initialization stores '+points+' upload points only in L',()=>{
 const f=setup();f.sheets['Event Register'].rows=[headers.slice()];f.sheets['Event Node Codes'].rows=[[]];
 f.ctx.getEventReadiness=()=>({ok:true,authenticated:true,ready:true});
 f.ctx.listProvisionedNodeIds=()=>Array.from({length:10},(_,i)=>'NODE-'+String(i+1).padStart(3,'0'));
 f.ctx.activeHqUploadPointList=()=>Array.from({length:4},(_,i)=>({id:'HQ-'+i,uid:'hq'+i}));
 f.properties.set('NODIV_EVENT_UPLOAD_POINTS_DRAFT',String(points));let n=0;f.ctx.generateMechanicalCode=()=>String(++n).padStart(4,'0');
 const result=f.ctx.initializeEvent(f.e);assert.equal(result.status,'EVENT_INITIALIZED');const row=f.sheets['Event Register'].rows[1];assert.equal(row.length,12);assert.equal(row[10],'');assert.equal(row[11],points);assert.equal(f.ctx.readCurrentEvent().uploadPoints,points);
});
test('role, readiness and active historic event still block initialization without mutation',()=>{
 const f=setup();let before=snapshot(f);f.ctx.resolvePlayerSession=()=>({ok:true,player:{identity:'F',role:'FOP'}});assert.equal(f.ctx.initializeEvent(f.e).status,'ROLE_DENIED');assert.equal(snapshot(f),before);
 f.ctx.resolvePlayerSession=()=>({ok:true,player:{identity:'ROOT',role:'FOUNDER'}});f.ctx.getEventReadiness=()=>({ok:true,authenticated:true,ready:false});assert.equal(f.ctx.initializeEvent(f.e).status,'EVENT_NOT_READY');assert.equal(snapshot(f),before);
 f.ctx.getEventReadiness=()=>({ok:true,authenticated:true,ready:true});assert.equal(f.ctx.initializeEvent(f.e).status,'EVENT_ALREADY_INITIALIZED');assert.equal(snapshot(f),before);
});
test('technical shutdown writes B/H/J/K and keeps L; repeated close creates no second success log',()=>{
 const f=setup(),row=f.sheets['Event Register'].rows[1];row[11]=4;f.e.parameter.event='EVT-1';const code=f.sheets['Event Node Codes'].rows[1];code[7]='';code[8]='';code[9]='DEINSTALLED';
 const result=f.ctx.shutdownFieldEvent(f.e);assert.equal(result.status,'FIELD_EVENT_COMPLETED');assert.equal(row[1],'COMPLETED');assert.equal(row[7],0);assert.equal(row[9],row[10]);assert.equal(row[11],4);assert.equal(f.sheets['Transaction Log'].rows.at(-1)[2],'FIELD_EVENT_SHUTDOWN');
 const before=snapshot(f);assert.equal(f.ctx.shutdownFieldEvent(f.e).status,'EVENT_NOT_FIELD_ACTIVE');assert.equal(snapshot(f),before);
});
test('EVAC completion stages the same columns and audit atomically, preserves L, completed replay is empty',()=>{
 const f=setup(),row=f.sheets['Event Register'].rows[1];row[11]=3;f.ctx.evacuationFinalCompletion=()=>[];f.ctx.evacuationRecords=()=>[];
 const requests=[],event=f.ctx.readCurrentEvent();f.ctx.stageEvacuationCompletion(event,{identity:'P',role:'PIONEER'},requests);assert.equal(row[1],'FIELD_ACTIVE');
 f.ctx.Sheets.Spreadsheets.batchUpdate({requests},'spreadsheet');assert.equal(row[1],'COMPLETED');assert.equal(row[9],row[10]);assert.equal(row[11],3);assert.equal(f.sheets['Transaction Log'].rows.at(-1)[2],'EVACUATION_COMPLETED');
 const replay=[];f.ctx.stageEvacuationCompletion({...event,state:'COMPLETED'},{identity:'P',role:'PIONEER'},replay);assert.equal(replay.length,0);
});
test('invalid stored upload value is not clamped; missing historical configuration stays null',()=>{
 const f=setup(),row=f.sheets['Event Register'].rows[1];assert.equal(f.ctx.readCurrentEvent().uploadPoints,null);
 for(const value of ['2',5,-1,NaN,'2026-10-04']){row[11]=value;assert.throws(()=>f.ctx.readCurrentEvent(),/UPLOAD_POINTS_INVALID/)}
});
test('physical eleven-column sheet is readable before migration and grows to twelve in the migration batch',()=>{
 const f=setup(),sheet=f.sheets['Event Register'];sheet.rows[0]=headers.slice(0,11);let columns=11;sheet.getMaxColumns=()=>columns;
 const range=sheet.getRange.bind(sheet);sheet.getRange=(row,col,n=1,m=1)=>{if(col+m-1>columns)throw Error('OUT_OF_GRID');return range(row,col,n,m)};
 assert.equal(f.ctx.readCurrentEvent().uploadPoints,null);
 const batch=f.ctx.Sheets.Spreadsheets.batchUpdate;let dimension;
 // Atomic mock applies grid expansion in the same staged batch.
 f.ctx.Sheets.Spreadsheets.batchUpdate=(body,id)=>{dimension=body.requests.find(request=>request.appendDimension);const previous=columns;columns+=dimension?.appendDimension.length||0;try{batch({requests:body.requests.filter(request=>!request.appendDimension)},id)}catch(error){columns=previous;throw error}};
 assert.equal(migration(f).status,'MIGRATED');assert.equal(columns,12);assert.equal(dimension.appendDimension.length,1);assert.equal(sheet.rows[0][11],'HQ UPLOAD POINTS');assert.equal(f.ctx.readCurrentEvent().uploadPoints,null);
});
test('legacy upload schema blocks initialization and completion until explicit migration',()=>{
 const f=setup(),sheet=f.sheets['Event Register'];sheet.rows[0]=headers.slice(0,10).concat('HQ UPLOAD POINTS');sheet.rows[1][10]=3;
 assert.throws(()=>f.ctx.stageEventRegisterCompletion(sheet,2,new Date(),[]),/MIGRATION_REQUIRED/);
 sheet.rows= [sheet.rows[0]];f.ctx.getEventReadiness=()=>({ok:true,authenticated:true,ready:true});f.ctx.listProvisionedNodeIds=()=>Array.from({length:10},(_,i)=>'NODE-'+String(i+1).padStart(3,'0'));let n=0;f.ctx.generateMechanicalCode=()=>String(++n).padStart(4,'0');const before=snapshot(f);
 assert.throws(()=>f.ctx.initializeEvent(f.e),/MIGRATION_REQUIRED/);assert.equal(snapshot(f),before);
});
test('blocked EVAC completion stages no register writes; failed final batch stages no timestamp or success log',()=>{
 const f=setup(),event=f.ctx.readCurrentEvent();f.ctx.evacuationFinalCompletion=()=>['OPEN_TEAM'];const requests=[];assert.deepEqual(Array.from(f.ctx.stageEvacuationCompletion(event,{identity:'P',role:'PIONEER'},requests)),['OPEN_TEAM']);assert.equal(requests.length,0);
 f.ctx.evacuationFinalCompletion=()=>[];f.ctx.evacuationRecords=()=>[];f.ctx.stageEvacuationCompletion(event,{identity:'P',role:'PIONEER'},requests);const before=snapshot(f);f.fail();assert.throws(()=>f.ctx.Sheets.Spreadsheets.batchUpdate({requests},'spreadsheet'),/BATCH_FAILED/);assert.equal(snapshot(f),before);
});
