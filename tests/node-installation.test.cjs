const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('Code.js','utf8');
function fixture({legacy=false,state='INITIALIZED',count=0}={}){
 let uuid=0,batches=0,failBatch=false;
 const cache=new Map();
 class Sheet{
  constructor(id,rows){this.id=id;this.rows=rows}
  getSheetId(){return this.id}
  getLastRow(){return this.rows.length}
  getRange(row,col,n=1,m=1){const sheet=this;return {
   getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>sheet.rows[row+i-1]?.[col+j-1]??'')),
   getDisplayValues(){return this.getValues().map(r=>r.map(String))},getDisplayValue(){return this.getDisplayValues()[0][0]},
   setValues(values){values.forEach((r,i)=>r.forEach((v,j)=>{sheet.rows[row+i-1]??=[];sheet.rows[row+i-1][col+j-1]=v}));return this},
   setValue(value){return this.setValues([[value]])}
  }}
  appendRow(row){this.rows.push(row)}
 }
 const cores=Array.from({length:200},(_,i)=>[String('NC-'+String(i+1).padStart(3,'0')),100+i,'uid'+(i+1),'ERFASST','RESERVE','','','','','','','',0,100+i,i<count?'NODE':'NODIV_RESERVE',i<count?'NODE-001':'HQ','','']);
 const sheets={
  'N-Core Register':new Sheet(1,[[],...cores]),
  'Node Register':new Sheet(2,[[],['NODE-001','nodeuid',legacy?'INSTALLED':'AVAILABLE']]),
  'Event Register':new Sheet(3,[[],['EVT-1',state,'','','','ROOT',1,legacy?1:0]]),
  'Event Node Codes':new Sheet(4,[[],['EVT-1','NODE-001','0123','1111','2222','3333','4444',legacy?'PRIMARY':'',legacy?'':'PRIMARY',legacy?'ACTIVE':'ASSIGNED_FOR_INSTALL','F001']]),
  'Transaction Log':new Sheet(5,[[]]),'Deployment Register':new Sheet(6,[[]]),
  'Access Card Register':new Sheet(7,[[],['CARD-001','F001','FOP','fopuid','ACTIVE','',0,true]]),
  'Upload Terminal Register':new Sheet(8,[[]])
 };
 const ss={getSheetByName:name=>sheets[name],getId:()=> 'spreadsheet'};
 const ctx={console,SpreadsheetApp:{getActiveSpreadsheet:()=>ss,flush(){}},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  CacheService:{getScriptCache:()=>({get:key=>cache.get(key),put:(key,value)=>cache.set(key,value),remove:key=>cache.delete(key)})},
  Utilities:{getUuid:()=>String(++uuid).padStart(36,'0'),formatDate:()=> '20261004-100000'},Session:{getScriptTimeZone:()=> 'Europe/Berlin'},
  Sheets:{Spreadsheets:{batchUpdate({requests},id){assert.equal(id,'spreadsheet');if(failBatch)throw Error('BATCH_FAILED');batches++;
   for(const request of requests){const r=request.updateCells||request.appendCells;const sheet=Object.values(sheets).find(s=>s.id===(r.sheetId??r.start.sheetId));const values=r.rows.map(row=>row.values.map(cell=>Object.values(cell.userEnteredValue)[0]));if(request.appendCells)values.forEach(row=>sheet.appendRow(row));else sheet.getRange(r.start.rowIndex+1,r.start.columnIndex+1,values.length,values[0].length).setValues(values)}
  }}}
 };
 vm.createContext(ctx);vm.runInContext(source,ctx);
 const token='a'.repeat(72);
 cache.set('NODIV_SESSION_'+token,JSON.stringify({identity:'F001',role:'FOP',cardId:'CARD-001'}));
 const e={parameter:{token,node:'NODE-001'}};
 function order(){const result=ctx.getNodeInstallOrder(e);e.parameter.installation=result.installation;return result}
 function scan(n){e.parameter.uid='uid'+n;return ctx.scanNodeInstallationCore(e)}
 return {ctx,sheets,cache,e,order,scan,batches:()=>batches,fail:()=>failBatch=true};
}
test('PRIMARY order, sequential 1/3..3/3, no ownership writes before one atomic confirmation',()=>{
 const f=fixture();assert.equal(f.order().node.code,'0123');
 for(let i=1;i<=3;i++){const r=f.scan(i);assert.equal(r.count,i);assert.equal(r.cores[i-1].id,'NC-00'+i);assert.equal(r.cores[i-1].energy,99+i);assert.equal(r.canConfirm,i===3)}
 assert.equal(f.sheets['N-Core Register'].rows[1][14],'NODIV_RESERVE');
 assert.equal(f.sheets['Transaction Log'].rows.length,1);
 assert.equal(f.ctx.confirmNodeInstallation(f.e).status,'NODE_INSTALLED');assert.equal(f.batches(),1);
 for(let i=1;i<=3;i++){assert.equal(f.sheets['N-Core Register'].rows[i][14],'NODE');assert.equal(f.sheets['N-Core Register'].rows[i][15],'NODE-001');assert.equal(f.sheets['N-Core Register'].rows[i][4],'DEPLOYED');assert.match(f.sheets['N-Core Register'].rows[i][16],/^TX-/)}
 assert.equal(f.sheets['Transaction Log'].rows.length,5);assert.equal(f.sheets['Event Node Codes'].rows[1][9],'ACTIVE');
 assert.throws(()=>f.ctx.confirmNodeInstallation(f.e),/EXPIRED/);
});
test('incomplete confirmations, duplicates, unknown UID and fourth Core rejected',()=>{
 const f=fixture();f.order();for(let n=0;n<3;n++){assert.throws(()=>f.ctx.confirmNodeInstallation(f.e),/EXACTLY_3/);f.scan(n+1)}
 assert.throws(()=>f.scan(1),/DUPLICATE/);assert.throws(()=>f.scan(4),/LIMIT/);
 f.e.parameter.uid='unknown';assert.throws(()=>f.ctx.scanNodeInstallationCore(f.e),/NOT_FOUND/);assert.equal(f.batches(),0);
});
test('reserve ownership, status and deployment checked during scan and confirmation',()=>{
 for(const mutation of [row=>row[14]='PIONEER',row=>row[15]='OTHER',row=>row[4]='IN_TRANSIT']){
  const f=fixture();f.order();mutation(f.sheets['N-Core Register'].rows[1]);assert.throws(()=>f.scan(1),/NOT_RESERVE/);
 }
 const f=fixture();f.order();f.sheets['Deployment Register'].rows.push(['DEP-1','NC-001','','','','','ASSIGNED']);assert.throws(()=>f.scan(1),/ALREADY_ASSIGNED/);
 const g=fixture();g.order();[1,2,3].forEach(g.scan);g.sheets['N-Core Register'].rows[3][15]='OTHER';assert.throws(()=>g.ctx.confirmNodeInstallation(g.e),/NOT_RESERVE/);assert.equal(g.batches(),0);assert.equal(g.sheets['N-Core Register'].rows[1][14],'NODIV_RESERVE');
});
test('wrong Node, changed event, expired login/order, invalid/replaced order and assigned FOP rejected',()=>{
 const f=fixture();f.order();f.e.parameter.node='NODE-002';assert.throws(()=>f.scan(1),/MISMATCH/);f.e.parameter.node='NODE-001';
 f.sheets['Event Register'].rows[1][1]='FIELD_ACTIVE';assert.throws(()=>f.scan(1),/INSTALL_ORDER_REQUIRED/);
 const g=fixture();g.order();const old=g.e.parameter.installation;g.order();g.e.parameter.installation=old;assert.throws(()=>g.scan(1),/MISMATCH/);
 g.cache.delete('NODIV_SESSION_'+g.e.parameter.token);assert.equal(g.scan(1).authenticated,false);
 const h=fixture();h.order();const key='NODIV_INSTALL_'+h.e.parameter.token,stored=JSON.parse(h.cache.get(key));stored.expiresAt=0;h.cache.set(key,JSON.stringify(stored));assert.throws(()=>h.scan(1),/EXPIRED/);
 const j=fixture();j.sheets['Event Node Codes'].rows[1][10]='F002';assert.throws(j.order,/OTHER_FOP/);
});
test('FIELD_ACTIVE legacy empty Node explicitly completed; order never rewrites legacy data',()=>{
 const f=fixture({legacy:true,state:'FIELD_ACTIVE'}),before=JSON.stringify(f.sheets['Event Node Codes'].rows);
 assert.equal(f.ctx.getNodeAccessAuthorization({nodeAccess:true},'NODE-001','INSTALLED').allowed,false);
 assert.equal(f.order().legacy,true);assert.equal(JSON.stringify(f.sheets['Event Node Codes'].rows),before);
 [1,2,3].forEach(f.scan);assert.equal(f.ctx.confirmNodeInstallation(f.e).count,3);
 assert.equal(f.sheets['Event Register'].rows[1][1],'FIELD_ACTIVE');assert.equal(f.sheets['Event Node Codes'].rows[1][2],'0123');
 assert.equal(f.ctx.getNodeAccessAuthorization({nodeAccess:true},'NODE-001','INSTALLED').allowed,true);
});
test('1, 2, or >3 owned Cores block installation and gameplay; existing complete Nodes are preserved',()=>{
 for(const count of [1,2,3,4]){const f=fixture({legacy:true,state:'FIELD_ACTIVE',count});assert.throws(f.order,count===3?/ALREADY_INSTALLED/:/COUNT_INVALID/);assert.equal(f.ctx.getNodeAccessAuthorization({nodeAccess:true},'NODE-001','INSTALLED').allowed,count===3)}
 const f=fixture({state:'FIELD_ACTIVE'});assert.throws(f.order,/INSTALL_ORDER_REQUIRED/);
});
test('failed batch leaves ownership, log and mechanical state unchanged and allows retry',()=>{
 const f=fixture();f.order();[1,2,3].forEach(f.scan);const before=JSON.stringify(Object.values(f.sheets).map(s=>s.rows));f.fail();assert.throws(()=>f.ctx.confirmNodeInstallation(f.e),/BATCH_FAILED/);assert.equal(JSON.stringify(Object.values(f.sheets).map(s=>s.rows)),before);
});
test('event activation rejects a legacy ACTIVE Node without three cores',()=>{
 const f=fixture({legacy:true});f.ctx.resolvePlayerSession=()=>({ok:true,player:{identity:'ROOT',role:'FOUNDER'}});
 assert.equal(f.ctx.activateEvent(f.e).status,'NODES_NOT_INSTALLED');assert.equal(f.sheets['Event Register'].rows[1][1],'INITIALIZED');
});
test('standard ownership transfer still uses the original immediate log and write path',()=>{
 const f=fixture();const result=f.ctx.transferCoreOwnership({coreId:'NC-001',expectedFromType:'NODIV_RESERVE',expectedFromId:'HQ',toType:'FOP',toId:'F001',newStatus:'FIELD'});
 assert.equal(result.core.ownerType,'FOP');assert.equal(result.core.ownerId,'F001');assert.equal(result.core.status,'FIELD');assert.equal(f.batches(),0);assert.equal(f.sheets['Transaction Log'].rows.length,2);
});
test('role, event membership, inactive event and UID replacement rejected',()=>{
 const f=fixture();f.sheets['Access Card Register'].rows[1][2]='PIONEER';f.cache.set('NODIV_SESSION_'+f.e.parameter.token,JSON.stringify({identity:'F001',role:'PIONEER',cardId:'CARD-001'}));assert.throws(f.order,/ROLE_DENIED/);
 const g=fixture({state:'STANDBY'});assert.throws(g.order,/EVENT_NOT_INITIALIZED/);
 const h=fixture();h.sheets['Event Node Codes'].rows[1][0]='OTHER-EVENT';assert.throws(h.order,/NODE_NOT_IN_EVENT/);
 const j=fixture();j.order();[1,2,3].forEach(j.scan);j.sheets['N-Core Register'].rows[2][2]='replaced';assert.throws(()=>j.ctx.confirmNodeInstallation(j.e),/CORE_NOT_RESERVE/);assert.equal(j.batches(),0);
});
