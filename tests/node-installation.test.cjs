const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('Code.js','utf8');
function fixture({legacy=false,state='INITIALIZED',count=0}={}){
 let uuid=0,batches=0,failBatch=false;
 const cache=new Map(),properties=new Map();
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
 const cores=Array.from({length:200},(_,i)=>[String('NC-'+String(i+1).padStart(3,'0')),200,i<6?'uid'+(i+1):'','ERFASST','RESERVE','','','','','','','',0,200,i<count?'NODE':'NODIV_RESERVE',i<count?'NODE-001':'HQ','','']);
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
  PropertiesService:{getScriptProperties:()=>({getProperties:()=>Object.fromEntries(properties),getProperty:key=>properties.get(key),setProperty:(key,value)=>properties.set(key,value),deleteProperty:key=>properties.delete(key)})},
  Utilities:{getUuid:()=>String(++uuid).padEnd(36,'0'),formatDate:()=> '20261004-100000'},Session:{getScriptTimeZone:()=> 'Europe/Berlin'},
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
 return {ctx,sheets,cache,properties,e,order,scan,batches:()=>batches,fail:()=>failBatch=true};
}
test('PRIMARY order, sequential 1/3..3/3, no ownership writes before one atomic confirmation',()=>{
 const f=fixture();assert.equal(f.order().node.code,'0123');
 for(let i=1;i<=3;i++){const r=f.scan(i);assert.equal(r.count,i);assert.equal(r.cores[i-1].id,'NC-00'+i);assert.equal(r.cores[i-1].energy,200);assert.equal(r.canConfirm,i===3)}
 assert.equal(f.sheets['N-Core Register'].rows[1][14],'NODIV_RESERVE');
 assert.equal(f.sheets['Transaction Log'].rows.length,1);
 assert.equal(f.ctx.confirmNodeInstallation(f.e).status,'NODE_INSTALLED');assert.equal(f.batches(),2);
 for(let i=1;i<=3;i++){assert.equal(f.sheets['N-Core Register'].rows[i][14],'NODE');assert.equal(f.sheets['N-Core Register'].rows[i][15],'NODE-001');assert.equal(f.sheets['N-Core Register'].rows[i][4],'DEPLOYED');assert.match(f.sheets['N-Core Register'].rows[i][16],/^TX-/)}
 assert.equal(f.sheets['Transaction Log'].rows.length,5);assert.equal(f.sheets['Event Node Codes'].rows[1][9],'ACTIVE');
 assert.throws(()=>f.ctx.confirmNodeInstallation(f.e),/EXPIRED/);
});
test('incomplete confirmations, duplicates, unknown UID and fourth Core rejected',()=>{
 const f=fixture();f.order();for(let n=0;n<3;n++){assert.throws(()=>f.ctx.confirmNodeInstallation(f.e),/EXACTLY_3/);f.scan(n+1)}
 assert.throws(()=>f.scan(1),/DUPLICATE/);assert.throws(()=>f.scan(4),/CORE NOT ASSIGNED TO NODE-001/);
 f.e.parameter.uid='unknown';assert.throws(()=>f.ctx.scanNodeInstallationCore(f.e),/NOT_FOUND/);assert.equal(f.batches(),1);
});
test('reserve ownership, status and deployment checked during scan and confirmation',()=>{
 for(const mutation of [row=>row[14]='PIONEER',row=>row[15]='OTHER',row=>row[4]='IN_TRANSIT']){
  const f=fixture();f.order();mutation(f.sheets['N-Core Register'].rows[1]);assert.throws(()=>f.scan(1),/NOT_RESERVE/);
 }
 const f=fixture();f.order();f.sheets['Deployment Register'].rows.push(['DEP-1','NC-001','','','','','ASSIGNED']);assert.throws(()=>f.scan(1),/ALREADY_ASSIGNED/);
 const g=fixture();g.order();[1,2,3].forEach(g.scan);g.sheets['N-Core Register'].rows[3][15]='OTHER';assert.throws(()=>g.ctx.confirmNodeInstallation(g.e),/NOT_RESERVE/);assert.equal(g.batches(),1);assert.equal(g.sheets['N-Core Register'].rows[1][14],'NODIV_RESERVE');
});
test('wrong Node, changed event, expired login/order, invalid/replaced order and assigned FOP rejected',()=>{
 const f=fixture();f.order();f.e.parameter.node='NODE-002';assert.throws(()=>f.scan(1),/MISMATCH/);f.e.parameter.node='NODE-001';
 f.sheets['Event Register'].rows[1][1]='FIELD_ACTIVE';assert.throws(()=>f.scan(1),/INSTALL_ORDER_REQUIRED/);
 const g=fixture();g.order();const old=g.e.parameter.installation;g.order();g.e.parameter.installation=old;assert.throws(()=>g.scan(1),/EXPIRED/);
 g.cache.delete('NODIV_SESSION_'+g.e.parameter.token);assert.equal(g.scan(1).authenticated,false);
 const h=fixture();h.order();const key='NODIV_INSTALL_ORDER_'+h.e.parameter.installation,stored=JSON.parse(h.properties.get(key));stored.expiresAt=0;h.properties.set(key,JSON.stringify(stored));assert.throws(()=>h.scan(1),/EXPIRED/);
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
 const j=fixture();j.order();[1,2,3].forEach(j.scan);j.sheets['N-Core Register'].rows[2][2]='replaced';assert.throws(()=>j.ctx.confirmNodeInstallation(j.e),/CORE_NOT_RESERVE/);assert.equal(j.batches(),1);
});
function enableNode(f,id,assigned='F001',legacy=false){
 const n=Number(id.slice(5));f.sheets['Node Register'].rows[n]=[id,'nodeuid'+n,legacy?'INSTALLED':'AVAILABLE'];
 f.sheets['Event Node Codes'].rows.push(['EVT-1',id,'5678','1111','2222','3333','4444',legacy?'PRIMARY':'',legacy?'':'PRIMARY',legacy?'ACTIVE':'ASSIGNED_FOR_INSTALL',assigned]);
 f.sheets['Event Register'].rows[1][6]++;
}
function setEnergies(f,energies){
 f.sheets['N-Core Register'].rows.slice(1).forEach((row,i)=>{row[1]=energies[i]??100;row[2]=i<energies.length?'uid'+(i+1):'';row[13]=row[1]});
}
test('loadout favors STABLE balanced triples and preserves energy for future Nodes',()=>{
 const f=fixture();enableNode(f,'NODE-002');setEnergies(f,[50,100,150,200,250,300,350,400]);
 const first=f.order();assert.equal(first.loadout.length,3);assert.equal(first.nodeState,'STABLE');assert.ok(first.totalEnergy>=600);assert.ok(first.totalEnergy<1050);
 assert.ok(new Set(first.loadout.map(c=>c.id)).size===3);
 // A second operator receives a disjoint stable triple while the first is reserved.
 f.sheets['Access Card Register'].rows.push(['CARD-002','F002','FOP','fopuid2','ACTIVE','',0,true]);
 f.sheets['Event Node Codes'].rows[2][10]='F002';const token='b'.repeat(72);f.cache.set('NODIV_SESSION_'+token,JSON.stringify({identity:'F002',role:'FOP',cardId:'CARD-002'}));
 const second=f.ctx.getNodeInstallOrder({parameter:{token,node:'NODE-002'}});
 assert.equal(second.nodeState,'STABLE');assert.ok(second.loadout.every(c=>!first.loadout.some(other=>other.id===c.id)));
});
test('STABLE is preferred over a closer sub-600 triple; fallback state and deterministic ties',()=>{
 const f=fixture(),candidate=energy=>({coreId:'NC-'+String(energy).padStart(3,'0'),uid:'u'+energy,visibleEnergy:energy});
 const pool=[50,100,150,200,250,300].map(candidate);
 const picked=f.ctx.selectNodeInstallationLoadout(pool,8);assert.ok(picked.reduce((s,c)=>s+c.energy,0)>=600);
 assert.deepEqual(JSON.parse(JSON.stringify(picked)),JSON.parse(JSON.stringify(f.ctx.selectNodeInstallationLoadout(pool,8))));
 setEnergies(f,[50,100,150,160]);const order=f.order();assert.equal(order.totalEnergy,410);assert.equal(order.nodeState,'CRITICAL');
 const g=fixture();setEnergies(g,[150,150,150]);assert.equal(g.order().nodeState,'DEGRADED');
});
test('selection excludes bound, IN_TRANSIT, mission assigned, unregistered and other reserved Cores',()=>{
 const f=fixture();setEnergies(f,[200,200,200,200,200,200,200,200]);
 f.sheets['N-Core Register'].rows[1][14]='PIONEER';f.sheets['N-Core Register'].rows[2][4]='IN_TRANSIT';
 f.sheets['Deployment Register'].rows.push(['DEP-OTHER','NC-003','P001','PIONEER','NODE-002','DEPLOYMENT','ASSIGNED']);
 f.sheets['N-Core Register'].rows[4][2]='';f.sheets['N-Core Register'].rows[5][14]='NODE';f.sheets['N-Core Register'].rows[5][15]='NODE-009';
 assert.deepEqual(Array.from(f.order().loadout,c=>c.id),['NC-006','NC-007','NC-008']);
 const g=fixture();setEnergies(g,[200,200]);assert.throws(g.order,/3_AVAILABLE/);assert.equal(g.properties.size,0);
});
test('scans enforce assigned IDs in any order and final confirmation closes reservations atomically',()=>{
 const f=fixture(),order=f.order();assert.equal(f.scan(3).count,1);
 assert.throws(()=>f.scan(4),/CORE NOT ASSIGNED TO NODE-001/);assert.equal(f.scan(1).count,2);
 assert.throws(()=>f.ctx.confirmNodeInstallation(f.e),/EXACTLY_3/);assert.equal(f.scan(2).count,3);
 const result=f.ctx.confirmNodeInstallation(f.e);assert.equal(result.totalEnergy,600);assert.equal(result.nodeState,'STABLE');assert.equal(f.properties.size,0);
 assert.equal(f.sheets['Deployment Register'].rows.slice(1).filter(r=>r[6]==='DELIVERED').length,3);
});
test('reservations cannot be transferred through a different ownership flow or accepted as mission cargo',()=>{
 const f=fixture();f.order();assert.equal(f.ctx.hasOpenDeploymentForCore('NC-001'),true);
 const before=f.sheets['Transaction Log'].rows.length;
 assert.throws(()=>f.ctx.transferCoreOwnership({coreId:'NC-001',expectedFromType:'NODIV_RESERVE',expectedFromId:'HQ',toType:'PIONEER',toId:'P001'}),/RESERVED_FOR_NODE/);
 assert.equal(f.sheets['Transaction Log'].rows.length,before);
 const row=f.sheets['Deployment Register'].rows[1];assert.equal(f.ctx.acceptCoreDeployment({parameter:{token:f.e.parameter.token,deployment:row[0]}}).status,'INSTALL_WORKFLOW_REQUIRED');
 assert.equal(f.ctx.getPendingPlayerDeployments(f.e).deployments.length,0);
});
test('abort, expiry, login revocation and failed reservation publication do not leave phantom reservations',()=>{
 const f=fixture();const order=f.order();assert.equal(f.ctx.cancelNodeInstallation(f.e).status,'INSTALLATION_CANCELLED');assert.equal(f.properties.size,0);assert.equal(f.ctx.hasOpenDeploymentForCore(order.loadout[0].id),false);
 assert.equal(f.sheets['Deployment Register'].rows[1][6],'CANCELLED');assert.deepEqual(Array.from(f.order().loadout,c=>c.id),Array.from(order.loadout,c=>c.id));
 const g=fixture(),old=g.order(),key='NODIV_INSTALL_ORDER_'+old.installation,stored=JSON.parse(g.properties.get(key));stored.expiresAt=Date.now()-1;g.properties.set(key,JSON.stringify(stored));
 assert.equal(g.ctx.hasOpenDeploymentForCore(old.loadout[0].id),false);assert.throws(()=>g.scan(1),/EXPIRED/);g.order();assert.equal(g.sheets['Deployment Register'].rows[1][6],'EXPIRED');
 const h=fixture();h.order();h.cache.delete('NODIV_SESSION_'+h.e.parameter.token);assert.equal(h.ctx.hasOpenDeploymentForCore('NC-001'),false);
 const j=fixture();j.fail();assert.throws(j.order,/BATCH_FAILED/);assert.equal(j.properties.size,0);assert.equal(j.sheets['Deployment Register'].rows.length,1);
});
test('cache eviction retains durable order; same FOP login resumes it and revokes old installation token',()=>{
 const f=fixture(),order=f.order();f.cache.delete('NODIV_INSTALL_'+f.e.parameter.token);assert.equal(f.scan(1).count,1);
 const token='b'.repeat(72);f.cache.set('NODIV_SESSION_'+token,JSON.stringify({identity:'F001',role:'FOP',cardId:'CARD-001'}));
 assert.equal(f.ctx.getNodeInstallOrder({parameter:{token,node:'NODE-001'}}).installation,order.installation);assert.throws(()=>f.scan(2),/INSTALL_SESSION_MISMATCH/);
 assert.equal(f.properties.size,1);assert.equal(f.ctx.hasOpenDeploymentForCore(order.loadout[0].id),true);
});
test('real NODE-001 fixture 006=105,003=401,004=353 stays 859 E STABLE with no migration',()=>{
 const f=fixture({legacy:true,state:'FIELD_ACTIVE'});setEnergies(f,[200,200,401,353,200,105,200,200,200]);
 for(const n of [6,3,4]){const row=f.sheets['N-Core Register'].rows[n];row[14]='NODE';row[15]='NODE-001';row[4]='DEPLOYED'}
 enableNode(f,'NODE-002','F001',true);
 const before=JSON.stringify([f.sheets['Node Register'].rows[1],f.sheets['Event Node Codes'].rows[1],...[6,3,4].map(n=>f.sheets['N-Core Register'].rows[n])]);
 assert.throws(f.order,/ALREADY_INSTALLED/);f.e.parameter.node='NODE-002';const loadout=f.order();assert.ok(loadout.loadout.every(c=>!['NC-006','NC-003','NC-004'].includes(c.id)));
 for(const c of loadout.loadout)f.scan(Number(c.id.slice(3)));f.ctx.confirmNodeInstallation(f.e);
 const after=JSON.stringify([f.sheets['Node Register'].rows[1],f.sheets['Event Node Codes'].rows[1],...[6,3,4].map(n=>f.sheets['N-Core Register'].rows[n])]);
 assert.equal(after,before);assert.equal([6,3,4].reduce((sum,n)=>sum+f.sheets['N-Core Register'].rows[n][1],0),859);assert.equal(f.ctx.nodeEnergyState(859),'STABLE');
});
function recoveryFixture(){
 const f=fixture({legacy:true,state:'FIELD_ACTIVE'});setEnergies(f,[200,200,401,353,200,105]);
 for(const n of [6,3,4]){const row=f.sheets['N-Core Register'].rows[n];row[14]='NODE';row[15]='NODE-001';row[4]='DEPLOYED'}
 // Provisioned after event initialization: deliberately NO Event Node Codes row.
 f.sheets['Node Register'].rows[2]=['NODE-002','nodeuid2','AVAILABLE'];
 f.removal=()=>{const result=f.ctx.getNodeDeinstallOrder(f.e);f.e.parameter.installation=result.installation;return result};
 f.removeScan=n=>{f.e.parameter.uid='uid'+n;return f.ctx.scanNodeDeinstallationCore(f.e)};
 f.finish=()=>f.ctx.confirmNodeDeinstallation(f.e);
 f.addFounder=()=>{
  const token='c'.repeat(72);f.sheets['Access Card Register'].rows.push(['CARD-ROOT','ROOT','FOUNDER','rootuid','ACTIVE','',0,true]);
  f.cache.set('NODIV_SESSION_'+token,JSON.stringify({identity:'ROOT',role:'FOUNDER',cardId:'CARD-ROOT'}));
  return {parameter:{token,event:'EVT-1'}};
 };
 return f;
}
test('queue lists only actual eligible operations, never post-init NODE-002 or manufactured type',()=>{
 const f=recoveryFixture(),before=JSON.stringify(Object.values(f.sheets).map(sheet=>sheet.rows));
 const queue=f.ctx.getFopOperations(f.e);assert.deepEqual(Array.from(queue.operations,op=>op.label),['DEINSTALL // NODE-001']);
 assert.equal(JSON.stringify(Object.values(f.sheets).map(sheet=>sheet.rows)),before);
 assert.equal(queue.operations.some(op=>op.nodeId==='NODE-002'),false);
 f.e.parameter.node='NODE-002';assert.throws(()=>f.ctx.getNodeInstallOrder(f.e),/NODE_NOT_IN_EVENT/);assert.throws(()=>f.ctx.getNodeDeinstallOrder(f.e),/NODE_NOT_IN_EVENT/);
 const g=fixture();enableNode(g,'NODE-003','F002');g.sheets['Event Node Codes'].rows.push(['EVT-1','NODE-009','','','','','','','PRIMARY','ASSIGNED_FOR_INSTALL']);
 assert.deepEqual(Array.from(g.ctx.getFopOperations(g.e).operations,op=>op.label),['INSTALL // NODE-001']);
 g.order();assert.equal(g.ctx.getFopOperations(g.e).operations.length,0);
 const h=fixture();setEnergies(h,[200,200]);assert.equal(h.ctx.getFopOperations(h.e).status,'NO OPERATIONS AVAILABLE');
});
test('recovery enforces exact current 006/003/004, wrong/duplicate rejection and no 1/3 or 2/3 ownership writes',()=>{
 const f=recoveryFixture(),before=JSON.stringify(f.sheets['N-Core Register'].rows),order=f.removal();
 assert.equal(order.operation,'DEINSTALL');assert.equal(order.totalEnergy,859);assert.equal(order.nodeState,'STABLE');assert.deepEqual(Array.from(order.loadout,c=>c.id),['NC-003','NC-004','NC-006']);assert.equal(order.node.code,'0123');
 assert.throws(f.finish,/EXACTLY_3/);assert.throws(()=>f.removeScan(1),/CORE NOT ASSIGNED TO NODE-001/);
 assert.equal(f.removeScan(6).count,1);assert.throws(()=>f.removeScan(6),/DUPLICATE/);assert.throws(f.finish,/EXACTLY_3/);assert.equal(JSON.stringify(f.sheets['N-Core Register'].rows),before);
 assert.equal(f.removeScan(3).count,2);assert.throws(f.finish,/EXACTLY_3/);assert.equal(JSON.stringify(f.sheets['N-Core Register'].rows),before);
 f.removeScan(4);assert.throws(()=>f.ctx.confirmNodeInstallation(f.e),/TYPE_MISMATCH/);
 const codesBefore=f.sheets['Event Node Codes'].rows[1].slice(2,7),result=f.finish();assert.equal(result.status,'NODE_DEINSTALLED');assert.equal(result.message,'RECOVERY COMPLETE // NODE-001 // 3/3 CORES RETURNED');
 assert.equal(f.ctx.countCoresOwnedBy('NODE','NODE-001'),0);
 for(const n of [6,3,4]){const row=f.sheets['N-Core Register'].rows[n];assert.equal(row[14],'NODIV_RESERVE');assert.equal(row[15],'HQ');assert.equal(row[4],'RESERVE');assert.match(row[16],/^TX-/)}
 assert.equal(f.sheets['Node Register'].rows[1][2],'AVAILABLE');assert.equal(f.sheets['Node Register'].rows[1][4],'');
 assert.deepEqual(f.sheets['Event Node Codes'].rows[1].slice(2,7),codesBefore);assert.deepEqual(f.sheets['Event Node Codes'].rows[1].slice(7,11),['','','DEINSTALLED','']);
 assert.equal(f.sheets['Transaction Log'].rows.length,5);assert.equal(f.sheets['Transaction Log'].rows[1][2],'NODE_RECOVERY_CORE');assert.equal(f.sheets['Transaction Log'].rows[4][2],'NODE_DEINSTALLED');
 assert.equal(f.sheets['Event Register'].rows[1][7],0);assert.equal(f.properties.size,0);assert.equal(f.ctx.getFopOperations(f.e).operations.length,0);
 assert.equal(f.ctx.getNodeAccessAuthorization({nodeAccess:true},'NODE-001','AVAILABLE').allowed,false);
});
test('recovery failure is atomic, including ownership/log/Node/code/deployment state',()=>{
 const f=recoveryFixture();f.removal();[3,4,6].forEach(f.removeScan);
 const before=JSON.stringify([Object.values(f.sheets).map(s=>s.rows),Object.fromEntries(f.properties)]);f.fail();assert.throws(f.finish,/BATCH_FAILED/);
 assert.equal(JSON.stringify([Object.values(f.sheets).map(s=>s.rows),Object.fromEntries(f.properties)]),before);assert.equal(f.ctx.countCoresOwnedBy('NODE','NODE-001'),3);
});
test('recovery reserves Node and all three Cores against additions, removals, missions and other FOPs',()=>{
 const f=recoveryFixture();f.removal();assert.equal(f.ctx.getFopOperations(f.e).operations.length,0);
 const secondToken='b'.repeat(72);f.cache.set('NODIV_SESSION_'+secondToken,JSON.stringify({identity:'F001',role:'FOP',cardId:'CARD-001'}));
 assert.throws(()=>f.ctx.getNodeDeinstallOrder({parameter:{token:secondToken,node:'NODE-001'}}),/RESERVED/);
 assert.throws(()=>f.ctx.transferCoreOwnership({coreId:'NC-003',expectedFromType:'NODE',expectedFromId:'NODE-001',toType:'NODIV_RESERVE',toId:'HQ'}),/RESERVED/);
 assert.throws(()=>f.ctx.transferCoreOwnership({coreId:'NC-001',expectedFromType:'NODIV_RESERVE',expectedFromId:'HQ',toType:'NODE',toId:'NODE-001'}),/RESERVED/);
 assert.equal(f.ctx.getNodeAccessAuthorization({nodeAccess:true},'NODE-001','INSTALLED').reason,'NODE_OPERATION_RESERVED');
 const carrier=f.sheets['Access Card Register'].rows[1];carrier[6]=3;
 assert.equal(f.ctx.assignCoreDeployment({parameter:{token:f.e.parameter.token,uid:'uid1',carrier:'F001',targetNode:'NODE-001'}}).status,'NODE_OPERATION_RESERVED');
 assert.equal(f.ctx.hasOpenDeploymentForCore('NC-003'),true);assert.equal(f.ctx.getPendingPlayerDeployments(f.e).deployments.length,0);
});
test('cancelled, expired or revoked recovery releases reservations without changing Node/Core ownership',()=>{
 const f=recoveryFixture();f.removal();f.removeScan(3);const before=JSON.stringify(f.sheets['N-Core Register'].rows);
 assert.equal(f.ctx.cancelNodeDeinstallation(f.e).status,'DEINSTALLATION_CANCELLED');assert.equal(f.ctx.hasOpenDeploymentForCore('NC-003'),false);assert.equal(JSON.stringify(f.sheets['N-Core Register'].rows),before);assert.equal(f.ctx.getFopOperations(f.e).operations[0].type,'DEINSTALL');
 const g=recoveryFixture();const order=g.removal(),key='NODIV_INSTALL_ORDER_'+order.installation,data=JSON.parse(g.properties.get(key));data.expiresAt=0;g.properties.set(key,JSON.stringify(data));
 assert.throws(()=>g.removeScan(3),/EXPIRED/);assert.equal(g.ctx.hasOpenDeploymentForCore('NC-003'),false);assert.equal(g.ctx.getFopOperations(g.e).operations.length,1);g.removal();assert.equal(g.sheets['Deployment Register'].rows[1][6],'EXPIRED');
 const h=recoveryFixture();h.removal();h.cache.delete('NODIV_SESSION_'+h.e.parameter.token);assert.equal(h.ctx.hasOpenDeploymentForCore('NC-003'),false);assert.equal(h.removeScan(3).authenticated,false);
});
test('queue/order reject partial, unregistered and non-FIELD_ACTIVE removal states',()=>{
 for(const count of [0,1,2,4]){const f=fixture({legacy:true,state:'FIELD_ACTIVE',count});assert.equal(f.ctx.getFopOperations(f.e).operations.some(op=>op.type==='DEINSTALL'),false);assert.throws(()=>f.ctx.getNodeDeinstallOrder(f.e),/REQUIRES_3/)}
 const f=recoveryFixture();f.sheets['Node Register'].rows[1][1]='';assert.equal(f.ctx.getFopOperations(f.e).operations.length,0);
 const g=recoveryFixture();g.sheets['Event Register'].rows[1][1]='INITIALIZED';assert.equal(g.ctx.getFopOperations(g.e).operations.length,0);assert.throws(()=>g.ctx.getNodeDeinstallOrder(g.e),/NOT_FIELD_ACTIVE/);
});
test('FIELD_ACTIVE abort stays protected and shutdown reports installed Nodes, owned Cores and open operation',()=>{
 const f=recoveryFixture(),e=f.addFounder(),before=JSON.stringify(Object.values(f.sheets).map(s=>s.rows));
 assert.equal(f.ctx.abortEvent(e).status,'FIELD_ACTIVE_ABORT_DENIED');assert.equal(JSON.stringify(Object.values(f.sheets).map(s=>s.rows)),before);
 let result=f.ctx.shutdownFieldEvent(e);assert.equal(result.status,'FIELD_SHUTDOWN_BLOCKED');assert.ok(result.blockers.some(b=>b.includes('NODE-001: DEINSTALLATION_NOT_CONFIRMED')));assert.ok(result.blockers.some(b=>b.includes('NODE-001: 3 NODE-OWNED')));
 f.removal();result=f.ctx.shutdownFieldEvent(e);assert.ok(result.blockers.some(b=>b==='DEINSTALL // NODE-001: OPEN OPERATION'));assert.equal(f.sheets['Event Register'].rows[1][1],'FIELD_ACTIVE');
});
test('shutdown independently rejects a live open operation even on a recovered/empty Node',()=>{
 const f=recoveryFixture();const order=f.removal();[3,4,6].forEach(f.removeScan);f.finish();
 // Fault-injected unfinished order metadata: no installed Node remains to mask the operation check.
 const stored={id:'unfinished',nodeId:'NODE-001',operation:'DEINSTALL',identity:'F001',sessionToken:f.e.parameter.token,eventId:'EVT-1',eventState:'FIELD_ACTIVE',expiresAt:Date.now()+60000,loadout:[],cores:[]};
 f.properties.set('NODIV_INSTALL_ORDER_unfinished',JSON.stringify(stored));const result=f.ctx.shutdownFieldEvent(f.addFounder());
 assert.equal(result.status,'FIELD_SHUTDOWN_BLOCKED');assert.deepEqual(Array.from(result.blockers),['DEINSTALL // NODE-001: OPEN OPERATION']);
});
test('shutdown is event-bound, Founder-only and rejects even Cores owned by out-of-event Nodes',()=>{
 const f=recoveryFixture();f.removal();[3,4,6].forEach(f.removeScan);f.finish();
 assert.equal(f.ctx.shutdownFieldEvent({...f.e,parameter:{...f.e.parameter,event:'EVT-1'}}).status,'ROLE_DENIED');
 const e=f.addFounder();assert.equal(f.ctx.shutdownFieldEvent({parameter:{...e.parameter,event:'stale'}}).status,'EVENT_MISMATCH');
 f.sheets['N-Core Register'].rows[1][14]='NODE';f.sheets['N-Core Register'].rows[1][15]='NODE-002';
 const result=f.ctx.shutdownFieldEvent(e);assert.ok(result.blockers.includes('NODE-002: 1 NODE-OWNED CORE(S)'));assert.equal(f.sheets['Event Register'].rows[1][1],'FIELD_ACTIVE');
});
test('recovery then shutdown atomically completes event, preserves history and permits a fresh initialization',()=>{
 const f=recoveryFixture();f.removal();[6,4,3].forEach(f.removeScan);f.finish();const beforeCodes=f.sheets['Event Node Codes'].rows[1].slice();const beforeNode2=f.sheets['Node Register'].rows[2].slice();
 const e=f.addFounder(),result=f.ctx.shutdownFieldEvent(e);assert.equal(result.eventState,'COMPLETED');assert.ok(result.completedAt);assert.equal(f.sheets['Event Register'].rows[1][1],'COMPLETED');assert.equal(f.sheets['Event Register'].rows[0][10],'COMPLETED AT');assert.ok(f.sheets['Event Register'].rows[1][10]);
 assert.equal(f.ctx.readCurrentEvent(),null);assert.deepEqual(f.sheets['Event Node Codes'].rows[1],beforeCodes);assert.deepEqual(f.sheets['Node Register'].rows[2],beforeNode2);
 assert.equal(f.sheets['Transaction Log'].rows.at(-1)[2],'FIELD_EVENT_SHUTDOWN');assert.equal(f.ctx.getFopOperations(f.e).operations.length,0);
 assert.equal(f.ctx.getNodeAccessAuthorization({nodeAccess:true},'NODE-001','AVAILABLE').allowed,false);
 // Real preflight remains mandatory; isolate lifecycle eligibility in this test.
 f.ctx.getEventReadiness=()=>({ok:true,authenticated:true,ready:true});let number=0;f.ctx.generateMechanicalCode=used=>{const code=String(++number).padStart(4,'0');used[code]=true;return code};
 for(let n=3;n<=10;n++)f.sheets['Node Register'].rows[n]=['NODE-'+String(n).padStart(3,'0'),'nodeuid'+n,'AVAILABLE'];
 const next=f.ctx.initializeEvent({parameter:{...e.parameter}});assert.equal(next.status,'EVENT_INITIALIZED');assert.notEqual(next.event.eventId,'EVT-1');assert.equal(f.ctx.readCurrentEvent().state,'INITIALIZED');assert.equal(f.sheets['Event Register'].rows[1][1],'COMPLETED');assert.deepEqual(f.sheets['Event Node Codes'].rows[1],beforeCodes);
});
test('shutdown batch failure preserves event phase, timestamps and audit log',()=>{
 const f=recoveryFixture();f.removal();[6,4,3].forEach(f.removeScan);f.finish();const e=f.addFounder(),before=JSON.stringify(Object.values(f.sheets).map(s=>s.rows));f.fail();assert.throws(()=>f.ctx.shutdownFieldEvent(e),/BATCH_FAILED/);assert.equal(JSON.stringify(Object.values(f.sheets).map(s=>s.rows)),before);
});
test('recovery final revalidation rejects changed inventory/UIDs and unknown scans without partial writes',()=>{
 const f=recoveryFixture();f.removal();f.e.parameter.uid='unknown';assert.throws(()=>f.ctx.scanNodeDeinstallationCore(f.e),/CORE_NOT_FOUND/);[6,4,3].forEach(f.removeScan);
 const before=f.sheets['Transaction Log'].rows.length;f.sheets['N-Core Register'].rows[3][2]='replaced';assert.throws(f.finish,/CORE_NOT_AT_NODE/);assert.equal(f.sheets['Transaction Log'].rows.length,before);assert.equal(f.ctx.countCoresOwnedBy('NODE','NODE-001'),3);
 const g=recoveryFixture();g.removal();[6,4,3].forEach(g.removeScan);g.sheets['N-Core Register'].rows[1][14]='NODE';g.sheets['N-Core Register'].rows[1][15]='NODE-001';assert.throws(g.finish,/REQUIRES_3/);assert.equal(g.sheets['Node Register'].rows[1][2],'INSTALLED');
});
test('shutdown requires proper deinstallation records, not merely zero Node-owned Cores',()=>{
 const f=recoveryFixture();for(const n of [6,3,4]){f.sheets['N-Core Register'].rows[n][14]='NODIV_RESERVE';f.sheets['N-Core Register'].rows[n][15]='HQ'}
 const result=f.ctx.shutdownFieldEvent(f.addFounder());assert.equal(result.status,'FIELD_SHUTDOWN_BLOCKED');assert.ok(result.blockers.includes('NODE-001: DEINSTALLATION_NOT_CONFIRMED'));
});

function exchangeFixture(capacity=1){
 const f=fixture({legacy:true,state:'FIELD_ACTIVE',count:3}),rows=f.sheets['N-Core Register'].rows;
 for(let n=1;n<=6;n++){rows[n][2]='uid'+n;rows[n][4]=n<=3?'DEPLOYED':'FIELD';rows[n][14]=n<=3?'NODE':'NODIV_RESERVE';rows[n][15]=n<=3?'NODE-001':'HQ';}
 const own=[6,5,4].slice(0,capacity);for(const n of own){rows[n][14]='PIONEER';rows[n][15]='P003';}
 rows[6][1]=341;
 f.sheets['Access Card Register'].rows.push(['CARD-003','P003','PIONEER','p003uid','ACTIVE','',capacity,true]);
 const token='b'.repeat(72);f.cache.set('NODIV_SESSION_'+token,JSON.stringify({identity:'P003',role:'PIONEER',cardId:'CARD-003'}));
 const e={parameter:{token,node:'NODE-001',uid:'nodeuid'}},player=f.ctx.findIdentityById('P003');
 function preview(){e.parameter.uid='nodeuid';const r=f.ctx.getGameplayRoute(e);if(!r.exchangePreview)throw Error(r.decision.reason);e.parameter.preview=r.exchangePreview.preview;return r;}
 function authorize(size=capacity){preview();e.parameter.size=size;const r=f.ctx.normalExchange(e,'authorize');e.parameter.exchange=r.exchange;return r;}
 function scan(n){e.parameter.uid='uid'+n;return f.ctx.normalExchange(e,'scan');}
 return {...f,e,player,preview,authorize,exchangeScan:scan,own,finishExchange:()=>f.ctx.normalExchange(e,'confirm')};
}
test('P003 scan never returns code; server sizes only 1 and releases code only after authorization',()=>{
 const f=exchangeFixture(),route=f.preview();assert.equal(route.accessCode,undefined);assert.equal(f.ctx.getNodeAccessAuthorization(f.player,'NODE-001','INSTALLED').accessCode,undefined);
 assert.deepEqual(Array.from(route.exchangePreview.sizes),[1]);assert.equal(route.exchangePreview.slotLimit,1);
 f.e.parameter.size=2;assert.throws(()=>f.ctx.normalExchange(f.e,'authorize'),/SIZE_NOT_ALLOWED/);
 assert.equal(f.authorize(1).accessCode,'0123');assert.equal(f.batches(),0);assert.throws(()=>f.ctx.exchangePreview(f.e,f.player,'NODE-001'),/ALREADY_RUNNING/);
});
test('exchange rejects wrong, foreign, duplicate and wrong-phase cores; scans never change ownership',()=>{
 const f=exchangeFixture();f.authorize();const before=JSON.stringify(Object.values(f.sheets).map(s=>s.rows));
 assert.throws(()=>f.exchangeScan(1),/NOT_OWNED_BY_PIONEER/);assert.throws(()=>f.exchangeScan(5),/NOT_OWNED_BY_PIONEER/);
 f.exchangeScan(6);f.e.parameter.phase='OUT';assert.throws(()=>f.exchangeScan(6),/DUPLICATE/);delete f.e.parameter.phase;assert.throws(()=>f.exchangeScan(5),/NOT_IN_NODE/);
 f.e.parameter.uid='unknown';assert.throws(()=>f.ctx.normalExchange(f.e,'scan'),/NOT_FOUND/);assert.throws(f.finishExchange,/INCOMPLETE/);
 f.exchangeScan(1);f.e.parameter.phase='IN';assert.throws(()=>f.exchangeScan(1),/DUPLICATE/);delete f.e.parameter.phase;assert.equal(JSON.stringify(Object.values(f.sheets).map(s=>s.rows)),before);assert.equal(f.batches(),0);
});
test('atomic 1/2/3 equal exchange keeps Node exactly 3 and personal capacity, marks restore eligibility only at 1',()=>{
 for(const capacity of [1,2,3]){
  const f=exchangeFixture(capacity);f.authorize();for(const n of f.own)f.exchangeScan(n);for(let n=1;n<=capacity;n++)f.exchangeScan(n);
  const r=f.finishExchange();assert.equal(r.status,'EXCHANGE_COMPLETE');assert.equal(f.batches(),1);assert.equal(f.ctx.countCoresOwnedBy('NODE','NODE-001'),3);assert.equal(f.ctx.countCoresOwnedBy('PIONEER','P003'),capacity);
  assert.equal(f.ctx.findIdentityById('P003').coreCapacity,capacity);assert.equal(r.restore1Eligible,capacity===1);
  assert.equal(f.sheets['N-Core Register'].rows[6][14],'NODE');assert.equal(f.sheets['N-Core Register'].rows[1][14],'PIONEER');assert.equal(f.sheets['N-Core Register'].rows[1][4],'FIELD');assert.throws(f.finishExchange,/COMPLETED/);
 }
});
test('batch failure preserves all state and retry works; durable completion cannot replay even if property survives',()=>{
 const f=exchangeFixture();f.authorize();f.exchangeScan(6);f.exchangeScan(1);const before=JSON.stringify(Object.values(f.sheets).map(s=>s.rows));f.fail();assert.throws(f.finishExchange,/BATCH_FAILED/);assert.equal(JSON.stringify(Object.values(f.sheets).map(s=>s.rows)),before);
 const g=exchangeFixture();g.authorize();g.exchangeScan(6);g.exchangeScan(1);const key='NODIV_EXCHANGE_'+g.e.parameter.exchange,order=g.properties.get(key);g.finishExchange();g.properties.set(key,order);assert.equal(g.ctx.liveExchanges().length,0);assert.throws(g.finishExchange,/COMPLETED/);
});
test('5 minute cooldown is durable, blocks new authorization until exact boundary and marker does not grant slots',()=>{
 const f=exchangeFixture();f.authorize();f.exchangeScan(6);f.exchangeScan(1);f.finishExchange();assert.throws(f.preview,/COOLDOWN/);
 const log=f.sheets['Transaction Log'].rows.find(row=>row[2]==='NORMAL_EXCHANGE');log[1]=new Date(Date.now()-299000);assert.throws(f.preview,/COOLDOWN/);log[1]=new Date(Date.now()-300000);assert.deepEqual(Array.from(f.preview().exchangePreview.sizes),[1]);
 f.authorize();f.exchangeScan(1);f.exchangeScan(6);assert.equal(f.finishExchange().restore1Eligible,false);
});
test('event/session/node/capacity/inventory revalidated; expired and cancelled exchange release locks',()=>{
 for(const mutate of [f=>f.sheets['Event Register'].rows[1][1]='INITIALIZED',f=>f.sheets['Event Register'].rows[1][0]='OTHER',f=>f.e.parameter.node='NODE-002',f=>f.sheets['Event Node Codes'].rows[1][9]='DEINSTALLED',f=>f.sheets['Access Card Register'].rows[2][6]=2,f=>f.sheets['N-Core Register'].rows[6][2]='changed']){
  const f=exchangeFixture();f.authorize();mutate(f);assert.throws(()=>f.exchangeScan(6));assert.equal(f.batches(),0);
 }
 const f=exchangeFixture();f.authorize();f.cache.delete('NODIV_SESSION_'+f.e.parameter.token);assert.equal(f.exchangeScan(6).session,false);assert.equal(f.ctx.liveExchanges().length,1);
 const g=exchangeFixture();g.authorize();const key='NODIV_EXCHANGE_'+g.e.parameter.exchange,order=JSON.parse(g.properties.get(key));order.expiresAt=0;g.properties.set(key,JSON.stringify(order));assert.throws(()=>g.exchangeScan(6),/EXPIRED/);assert.equal(g.ctx.liveExchanges().length,0);g.authorize();g.ctx.normalExchange(g.e,'cancel');assert.equal(g.ctx.liveExchanges().length,0);assert.equal(g.batches(),0);
});
test('exchange locks Node, personal inventory and cores against competing exchange/FOP/transfers',()=>{
 const f=exchangeFixture();f.authorize();assert.throws(()=>f.ctx.transferCoreOwnership({coreId:'NC-006',expectedFromType:'PIONEER',expectedFromId:'P003',toType:'NODIV_RESERVE',toId:'HQ'}),/ALREADY_RUNNING/);
 const fop={parameter:{token:'a'.repeat(72),node:'NODE-001'}};assert.throws(()=>f.ctx.getNodeDeinstallOrder(fop),/ALREADY_RUNNING/);assert.equal(f.ctx.getFopOperations(fop).operations.length,0);
 const token='c'.repeat(72);f.cache.set('NODIV_SESSION_'+token,JSON.stringify({identity:'P003',role:'PIONEER',cardId:'CARD-003'}));const foreign={parameter:{...f.e.parameter,token}};assert.throws(()=>f.ctx.normalExchange(foreign,'scan'),/MISMATCH/);
 const g=exchangeFixture();g.ctx.getNodeDeinstallOrder({parameter:{token:'a'.repeat(72),node:'NODE-001'}});assert.throws(g.authorize,/NODE_OPERATION_RESERVED/);
});

test('real P003 NC-002 341 E and NODE-001 859 E authorize only one, without fixture migration',()=>{
 const f=exchangeFixture(),rows=f.sheets['N-Core Register'].rows;
 rows[1][14]='NODIV_RESERVE';rows[1][15]='HQ';rows[1][4]='RESERVE';
 for(const n of [3,4,6]){rows[n][14]='NODE';rows[n][15]='NODE-001';rows[n][4]='DEPLOYED'}
 rows[2][14]='PIONEER';rows[2][15]='P003';rows[2][4]='FIELD';rows[2][1]=341;rows[6][1]=105;rows[3][1]=401;rows[4][1]=353;
 const before=JSON.stringify(Object.values(f.sheets).map(s=>s.rows)),r=f.preview();assert.equal(r.exchangePreview.totalEnergy,859);assert.equal(r.exchangePreview.nodeState,'STABLE');assert.deepEqual(Array.from(r.exchangePreview.sizes),[1]);assert.equal(JSON.stringify(Object.values(f.sheets).map(s=>s.rows)),before);
 f.authorize();f.exchangeScan(2);f.exchangeScan(6);f.finishExchange();assert.equal(f.ctx.countCoresOwnedBy('NODE','NODE-001'),3);assert.equal(f.ctx.countCoresOwnedBy('PIONEER','P003'),1);
});
test('Node UID or mechanical slot/code changes and transit/deployment cores reject exchange',()=>{
 for(const mutate of [f=>f.sheets['Node Register'].rows[1][1]='replaced',f=>f.sheets['Event Node Codes'].rows[1][2]='9999']){const f=exchangeFixture();f.authorize();f.exchangeScan(6);f.exchangeScan(1);mutate(f);assert.throws(f.finishExchange,/NODE_CHANGED/);assert.equal(f.batches(),0);}
 const g=exchangeFixture();g.sheets['N-Core Register'].rows[6][4]='IN_TRANSIT';assert.deepEqual(Array.from(g.preview().exchangePreview.sizes),[]);assert.throws(g.authorize,/SIZE_NOT_ALLOWED/);
 const h=exchangeFixture();h.sheets['Deployment Register'].rows.push(['DEP-X','NC-001','','','','DEPLOYMENT','ASSIGNED']);assert.throws(h.authorize,/CORES_UNAVAILABLE/);
 const j=exchangeFixture();j.e.parameter.size=1;j.e.parameter.preview='invented';assert.throws(()=>j.ctx.normalExchange(j.e,'authorize'),/NODE_SCAN_REQUIRED/);
});

test('identical accepted IN and OUT requests are idempotent, even after later progress, without writes',()=>{
 const f=exchangeFixture();f.authorize();const before=JSON.stringify(Object.values(f.sheets).map(s=>s.rows));
 f.e.parameter.phase='IN';const first=f.exchangeScan(6),stored=f.properties.get('NODIV_EXCHANGE_'+f.e.parameter.exchange);
 assert.equal(first.inCount,1);assert.equal(first.outCount,0);assert.equal(first.replayed,false);
 const retry=f.exchangeScan(6);assert.equal(retry.inCount,1);assert.equal(retry.outCount,0);assert.equal(retry.replayed,true);assert.equal(f.properties.get('NODIV_EXCHANGE_'+f.e.parameter.exchange),stored);
 f.e.parameter.phase='OUT';const out=f.exchangeScan(1);assert.equal(out.outCount,1);assert.equal(out.canConfirm,true);
 const outRetry=f.exchangeScan(1);assert.equal(outRetry.inCount,1);assert.equal(outRetry.outCount,1);assert.equal(outRetry.replayed,true);
 assert.throws(()=>f.exchangeScan(6),/DUPLICATE/);f.e.parameter.phase='IN';assert.throws(()=>f.exchangeScan(1),/DUPLICATE/);
 const late=f.exchangeScan(6);assert.equal(late.inCount,1);assert.equal(late.outCount,1);assert.equal(late.canConfirm,true);
 delete f.e.parameter.phase;assert.equal(f.exchangeScan(6).replayed,true);
 assert.equal(JSON.stringify(Object.values(f.sheets).map(s=>s.rows)),before);assert.equal(f.batches(),0);
 f.finishExchange();assert.equal(f.ctx.countCoresOwnedBy('NODE','NODE-001'),3);
});
test('retry cannot bypass current session, core ownership, phase or snapshot validation',()=>{
 for(const mutate of [f=>f.sheets['N-Core Register'].rows[6][15]='OTHER',f=>f.sheets['N-Core Register'].rows[6][2]='replaced',f=>f.sheets['Event Register'].rows[1][1]='COMPLETED']){
  const f=exchangeFixture();f.authorize();f.e.parameter.phase='IN';f.exchangeScan(6);mutate(f);assert.throws(()=>f.exchangeScan(6));assert.equal(f.batches(),0);
 }
 const f=exchangeFixture();f.authorize();f.e.parameter.phase='OUT';assert.throws(()=>f.exchangeScan(1),/PHASE_MISMATCH/);f.e.parameter.phase='INVALID';assert.throws(()=>f.exchangeScan(6),/PHASE_INVALID/);
});

test('Node rescan resumes own exchange at 0/0, 1/0, 1/1 without creating order or changing ownership',()=>{
 for(const count of [0,1,2]){
  const f=exchangeFixture();const auth=f.authorize();if(count>=1)f.exchangeScan(6);if(count===2)f.exchangeScan(1);
  const before=JSON.stringify(Object.values(f.sheets).map(s=>s.rows)),properties=JSON.stringify([...f.properties]);f.e.parameter.uid='nodeuid';
  const route=f.ctx.getGameplayRoute(f.e),resume=route.exchangeResume;assert.equal(route.decision.action,'EXCHANGE_RESUME');assert.equal(resume.exchange,auth.exchange);assert.equal(resume.nodeId,'NODE-001');assert.equal(resume.size,1);assert.equal(resume.inCount,count>=1?1:0);assert.equal(resume.outCount,count===2?1:0);assert.equal(resume.canConfirm,count===2);assert.equal(resume.accessCode,'0123');assert.equal(route.exchangePreview,undefined);
  assert.equal(JSON.stringify([...f.properties]),properties);assert.equal(JSON.stringify(Object.values(f.sheets).map(s=>s.rows)),before);assert.equal(f.batches(),0);assert.equal(f.ctx.liveExchanges().length,1);
  if(count===0){f.e.parameter.exchange=resume.exchange;f.ctx.normalExchange(f.e,'cancel');assert.equal(f.ctx.liveExchanges().length,0);assert.equal(f.properties.has('NODIV_EXCHANGE_'+resume.exchange),false);assert.ok(f.preview().exchangePreview);}
  if(count===1){f.exchangeScan(1);assert.equal(f.finishExchange().status,'EXCHANGE_COMPLETE');}
  if(count===2)assert.equal(f.finishExchange().status,'EXCHANGE_COMPLETE');
 }
});
test('recovery rejects different identity/session/Node, expired/completed orders and changed event/code/core state',()=>{
 const f=exchangeFixture();f.authorize();assert.equal(f.ctx.recoverNormalExchange(f.e,'NODE-002'),null);
 const token='c'.repeat(72);f.cache.set('NODIV_SESSION_'+token,JSON.stringify({identity:'P003',role:'PIONEER',cardId:'CARD-003'}));assert.equal(f.ctx.recoverNormalExchange({parameter:{token}},'NODE-001').exchange,f.e.parameter.exchange);
 f.sheets['Access Card Register'].rows.push(['CARD-004','P004','PIONEER','p004uid','ACTIVE','',1,true]);f.cache.set('NODIV_SESSION_'+token,JSON.stringify({identity:'P004',role:'PIONEER',cardId:'CARD-004'}));assert.equal(f.ctx.recoverNormalExchange({parameter:{token}},'NODE-001'),null);
 for(const mutate of [f=>f.sheets['Event Register'].rows[1][0]='OTHER',f=>f.sheets['Event Register'].rows[1][1]='COMPLETED',f=>f.cache.delete('NODIV_SESSION_'+f.e.parameter.token),f=>{const key='NODIV_EXCHANGE_'+f.e.parameter.exchange,order=JSON.parse(f.properties.get(key));order.expiresAt=0;f.properties.set(key,JSON.stringify(order));}]){
  const g=exchangeFixture();g.authorize();mutate(g);assert.equal(g.ctx.recoverNormalExchange(g.e,'NODE-001'),null);assert.equal(g.batches(),0);
 }
 for(const mutate of [f=>f.sheets['N-Core Register'].rows[6][15]='OTHER',f=>f.sheets['Event Node Codes'].rows[1][2]='9999']){const g=exchangeFixture();g.authorize();mutate(g);assert.throws(()=>g.ctx.recoverNormalExchange(g.e,'NODE-001'));assert.equal(g.batches(),0);}
 const g=exchangeFixture();g.authorize();g.exchangeScan(6);g.exchangeScan(1);g.finishExchange();assert.equal(g.ctx.recoverNormalExchange(g.e,'NODE-001'),null);
});

test('Session A loss and Session B login rebind same P003 exchange at every progress; scan/cancel/confirm work',()=>{
 for(const count of [0,1,2])for(const end of ['cancel','confirm']){
  const f=exchangeFixture();const auth=f.authorize(),oldToken=f.e.parameter.token;
  if(count>=1)f.exchangeScan(6);if(count===2)f.exchangeScan(1);
  const before=JSON.stringify(Object.values(f.sheets).map(s=>s.rows)),key='NODIV_EXCHANGE_'+auth.exchange,stored=JSON.parse(f.properties.get(key));
  f.cache.delete('NODIV_SESSION_'+oldToken);assert.equal(f.ctx.liveExchanges().length,1);
  const token='c'.repeat(72);f.cache.set('NODIV_SESSION_'+token,JSON.stringify({identity:'P003',role:'PIONEER',cardId:'CARD-003'}));f.e.parameter.token=token;f.e.parameter.uid='nodeuid';
  const r=f.ctx.getGameplayRoute(f.e).exchangeResume;assert.equal(r.exchange,auth.exchange);assert.equal(r.inCount,count>=1?1:0);assert.equal(r.outCount,count===2?1:0);assert.equal(r.canConfirm,count===2);assert.equal(r.accessCode,'0123');
  const rebound=JSON.parse(f.properties.get(key));assert.equal(rebound.token,token);assert.deepEqual({...rebound,token:oldToken},stored);assert.equal(f.ctx.liveExchanges().length,1);assert.equal(JSON.stringify(Object.values(f.sheets).map(s=>s.rows)),before);assert.equal(f.batches(),0);
  // Even if the old session becomes usable again, its token no longer controls this order.
  f.cache.set('NODIV_SESSION_'+oldToken,JSON.stringify({identity:'P003',role:'PIONEER',cardId:'CARD-003'}));assert.throws(()=>f.ctx.normalExchange({parameter:{...f.e.parameter,token:oldToken}},'cancel'),/MISMATCH/);
  if(end==='cancel'){f.ctx.normalExchange(f.e,'cancel');assert.equal(f.ctx.liveExchanges().length,0);assert.equal(f.properties.has(key),false);assert.equal(f.batches(),0);}
  else {if(count===0)f.exchangeScan(6);if(count<2)f.exchangeScan(1);assert.equal(f.finishExchange().status,'EXCHANGE_COMPLETE');assert.equal(f.ctx.countCoresOwnedBy('NODE','NODE-001'),3);assert.equal(f.ctx.liveExchanges().length,0);}
 }
});
test('new Session B of another Identity cannot take over an orphaned reservation',()=>{
 const f=exchangeFixture();f.authorize();const key='NODIV_EXCHANGE_'+f.e.parameter.exchange,before=f.properties.get(key);f.cache.delete('NODIV_SESSION_'+f.e.parameter.token);
 f.sheets['Access Card Register'].rows.push(['CARD-004','P004','PIONEER','p004uid','ACTIVE','',1,true]);const token='c'.repeat(72);f.cache.set('NODIV_SESSION_'+token,JSON.stringify({identity:'P004',role:'PIONEER',cardId:'CARD-004'}));
 const e={parameter:{token,node:'NODE-001',uid:'nodeuid',exchange:f.e.parameter.exchange}};assert.equal(f.ctx.recoverNormalExchange(e,'NODE-001'),null);assert.throws(()=>f.ctx.getGameplayRoute(e),/ALREADY_RUNNING/);assert.throws(()=>f.ctx.normalExchange(e,'cancel'),/MISMATCH/);assert.equal(f.properties.get(key),before);assert.equal(f.batches(),0);
});

test('real 002->Node / 008->P003 confirm uses one validated batch, no transfer-loop reads or flush',()=>{
 const f=exchangeFixture(),rows=f.sheets['N-Core Register'].rows;
 rows[2][14]='PIONEER';rows[2][15]='P003';rows[2][4]='FIELD';rows[2][1]=341;
 rows[6][14]='NODIV_RESERVE';rows[6][15]='HQ';rows[6][4]='RESERVE';
 rows[8][2]='uid8';rows[8][14]='NODE';rows[8][15]='NODE-001';rows[8][4]='DEPLOYED';rows[8][1]=310;
 f.sheets['Deployment Register'].rows.push(['closed','','','','','','DELIVERED']);
 f.authorize();f.exchangeScan(2);f.exchangeScan(8);
 let flushes=0,coreReads=0,deploymentReads=0;f.ctx.SpreadsheetApp.flush=()=>flushes++;
 for(const [name,count] of [['N-Core Register',()=>coreReads++],['Deployment Register',()=>deploymentReads++]]){
  const sheet=f.sheets[name],original=sheet.getRange.bind(sheet);sheet.getRange=(...args)=>{if(args[0]===2&&args[1]===1)count();return original(...args)};
 }
 f.ctx.transferCoreOwnership=()=>{throw Error('TRANSFER_LOOP_MUST_NOT_RESCAN')};
 const result=f.finishExchange();assert.equal(result.status,'EXCHANGE_COMPLETE');assert.equal(f.batches(),1);assert.equal(flushes,0);assert.equal(coreReads,1);assert.equal(deploymentReads,1);
 assert.equal(rows[2][14],'NODE');assert.equal(rows[2][15],'NODE-001');assert.equal(rows[2][4],'DEPLOYED');assert.equal(rows[8][14],'PIONEER');assert.equal(rows[8][15],'P003');assert.equal(rows[8][4],'FIELD');assert.equal(f.ctx.countCoresOwnedBy('NODE','NODE-001'),3);
 const logs=f.sheets['Transaction Log'].rows.slice(1);assert.deepEqual(logs.map(row=>row[2]),['NORMAL_EXCHANGE_IN','NORMAL_EXCHANGE_OUT','RESTORE_1_ELIGIBLE','NORMAL_EXCHANGE']);assert.equal(logs[0][5],'NC-002');assert.equal(logs[1][5],'NC-008');assert.equal(logs[0][0],rows[2][16]);assert.equal(logs[1][0],rows[8][16]);
 assert.throws(f.finishExchange,/COMPLETED/);assert.equal(f.batches(),1);assert.equal(f.sheets['Transaction Log'].rows.length,5);
});
test('staging and batch failures leave no mutations or success logs; exchange remains recoverable and retry commits once',()=>{
 for(const failure of ['staging','batch']){
  const f=exchangeFixture();f.authorize();f.exchangeScan(6);f.exchangeScan(1);const before=JSON.stringify(Object.values(f.sheets).map(s=>s.rows)),key='NODIV_EXCHANGE_'+f.e.parameter.exchange,property=f.properties.get(key);
  const append=f.ctx.appendTransactionLog,batch=f.ctx.Sheets.Spreadsheets.batchUpdate;
  if(failure==='staging')f.ctx.appendTransactionLog=(data,requests)=>{if(data.eventType==='NORMAL_EXCHANGE')throw Error('STAGING_FAILED');return append(data,requests)};
  else f.ctx.Sheets.Spreadsheets.batchUpdate=()=>{throw Error('BATCH_FAILED')};
  assert.throws(f.finishExchange,/FAILED/);assert.equal(JSON.stringify(Object.values(f.sheets).map(s=>s.rows)),before);assert.equal(f.properties.get(key),property);assert.equal(f.batches(),0);assert.equal(f.ctx.recoverNormalExchange(f.e,'NODE-001').canConfirm,true);
  f.ctx.appendTransactionLog=append;f.ctx.Sheets.Spreadsheets.batchUpdate=batch;assert.equal(f.finishExchange().status,'EXCHANGE_COMPLETE');assert.equal(f.batches(),1);assert.equal(f.properties.has(key),false);
 }
});

function restoreFixture(){
 const f=exchangeFixture(),rows=f.sheets['N-Core Register'].rows;
 for(const row of rows.slice(1)){row[14]='NODIV_RESERVE';row[15]='HQ';row[4]='RESERVE';}
 for(const [n,energy] of [[1,353],[2,341],[3,401]]){rows[n][14]='NODE';rows[n][15]='NODE-001';rows[n][4]='DEPLOYED';rows[n][1]=energy;}
 enableNode(f,'NODE-002','F001',true);
 for(const [n,energy] of [[4,100],[5,150],[7,170]]){rows[n][2]='uid'+n;rows[n][14]='NODE';rows[n][15]='NODE-002';rows[n][4]='DEPLOYED';rows[n][1]=energy;}
 rows[6][1]=200;
 rows[8][2]='uid8';rows[8][14]='PIONEER';rows[8][15]='P003';rows[8][4]='FIELD';rows[8][1]=310;
 for(const [n,energy] of [[9,280],[10,400],[11,250]]){rows[n][2]='uid'+n;rows[n][1]=energy;}
 f.sheets['Transaction Log'].rows.push(['eligible',new Date(),'RESTORE_1_ELIGIBLE','P003','PIONEER','','','','','','','','','NODE-001','SUCCESS','first normal exchange']);
 f.sheets['Access Card Register'].rows.push(['CARD-ROOT','ROOT','FOUNDER','rootuid','ACTIVE','',0,true]);const founderToken='d'.repeat(72);f.cache.set('NODIV_SESSION_'+founderToken,JSON.stringify({identity:'ROOT',role:'FOUNDER',cardId:'CARD-ROOT'}));
 const founder={parameter:{token:founderToken,pioneer:'P003'}},e={parameter:{token:f.e.parameter.token,node:'NODE-002',uid:'nodeuid2'}};
 function assign(){const r=f.ctx.assignRestoreOne(founder);e.parameter.restore=r.restore;return r;}
 function target(){e.parameter.uid='nodeuid2';return f.ctx.getGameplayRoute(e).restoreMission;}
 function authorize(){target();return f.ctx.normalRestoreOne(e,'authorize');}
 function scan(n,phase){e.parameter.uid='uid'+n;e.parameter.phase=phase;return f.ctx.normalRestoreOne(e,'scan');}
 return {...f,founder,restoreE:e,assign,target,restoreAuthorize:authorize,restoreScan:scan,restoreFinish:()=>f.ctx.normalRestoreOne(e,'confirm')};
}
test('RESTORE eligibility and server selection skip real STABLE Node, minimize energy for STABLE then DEGRADED',()=>{
 const f=restoreFixture();assert.equal(f.ctx.getRestoreEligibility(f.founder).pioneers[0].identity,'P003');const r=f.assign();assert.equal(r.nodeId,'NODE-002');assert.equal(r.inCore.id,'NC-009');assert.equal(r.outCore.id,'NC-004');assert.equal(r.projectedEnergy,600);assert.equal(r.projectedState,'STABLE');assert.equal(r.accessCode,undefined);
 const g=restoreFixture();g.sheets['N-Core Register'].rows[9][2]='';g.sheets['N-Core Register'].rows[10][2]='';const fallback=g.assign();assert.equal(fallback.inCore.id,'NC-006');assert.equal(fallback.projectedEnergy,520);assert.equal(fallback.projectedState,'DEGRADED');
 const h=restoreFixture();for(const n of [6,9,10,11])h.sheets['N-Core Register'].rows[n][1]=100;assert.equal(h.assign().status,'NO_SUITABLE_RESTORE_TARGET_OR_CORE');assert.equal(h.ctx.liveRestores().length,0);
 const j=restoreFixture();j.sheets['Transaction Log'].rows.length=1;assert.throws(j.assign,/NOT_ELIGIBLE/);j.sheets['Access Card Register'].rows[2][6]=2;assert.throws(j.assign,/NOT_ELIGIBLE/);
});
test('Transit ownership remains HQ; cannot be personal/exchanged/caught/uploaded/generic delivered, no scan ownership writes',()=>{
 const f=restoreFixture();f.assign();const core=f.ctx.readCoreState('NC-009');assert.equal(core.ownerType,'NODIV_RESERVE');assert.equal(core.ownerId,'HQ');assert.equal(core.status,'IN_TRANSIT');assert.equal(f.ctx.countCoresOwnedBy('PIONEER','P003'),1);
 f.ctx.readPlayerEnergyBalance=()=>0;const inventory=f.ctx.getPlayerState(f.restoreE);assert.equal(inventory.cores.length,1);assert.equal(inventory.cores[0].coreId,'NC-008');
 const player=f.ctx.findIdentityById('P003');assert.equal(f.ctx.routeCoreGameplay(player,core).decision.allowed,false);assert.equal(f.ctx.routeCoreGameplay({identity:'L001',role:'LOCAL',catchAccess:true},core).decision.allowed,false);
 const generic={parameter:{...f.restoreE.parameter,deployment:f.restoreE.parameter.restore,uid:'nodeuid2'}};assert.equal(f.ctx.deliverCoreDeployment(generic).status,'RESTORE_WORKFLOW_REQUIRED');
 f.restoreE.parameter.uid='nodeuid';assert.equal(f.ctx.getGameplayRoute(f.restoreE).decision.reason,'RESTORE_WRONG_NODE');
 const before=JSON.stringify(Object.values(f.sheets).map(sheet=>sheet.rows));assert.equal(f.target().accessCode,undefined);assert.throws(()=>f.restoreScan(9,'IN'),/AUTHORIZATION_REQUIRED/);assert.match(f.restoreAuthorize().accessCode,/^\d{4}$/);
 assert.throws(()=>f.restoreScan(8,'IN'),/TRANSIT_CORE_REQUIRED/);f.restoreScan(9,'IN');assert.equal(f.restoreScan(9,'IN').replayed,true);assert.throws(()=>f.restoreScan(9,'OUT'),/DUPLICATE/);assert.throws(()=>f.restoreScan(5,'OUT'),/LOWEST_NODE_CORE_REQUIRED/);f.restoreScan(4,'OUT');assert.equal(f.restoreScan(4,'OUT').replayed,true);assert.throws(()=>f.restoreScan(4,'IN'),/DUPLICATE/);assert.equal(JSON.stringify(Object.values(f.sheets).map(sheet=>sheet.rows)),before);
});
test('Restore recovery/session rebind preserves all scan phases and code authorization; no second order or ownership mutation',()=>{
 for(const count of [0,1,2]){
  const f=restoreFixture();const assigned=f.assign();f.restoreAuthorize();if(count>=1)f.restoreScan(9,'IN');if(count===2)f.restoreScan(4,'OUT');
  const before=JSON.stringify(Object.values(f.sheets).map(sheet=>sheet.rows)),old=f.restoreE.parameter.token,newToken='c'.repeat(72);f.cache.delete('NODIV_SESSION_'+old);f.cache.set('NODIV_SESSION_'+newToken,JSON.stringify({identity:'P003',role:'PIONEER',cardId:'CARD-003'}));f.restoreE.parameter.token=newToken;
  const r=f.target();assert.equal(r.restore,assigned.restore);assert.equal(r.inCount,count>=1?1:0);assert.equal(r.outCount,count===2?1:0);assert.equal(r.canConfirm,count===2);assert.match(r.accessCode,/^\d{4}$/);assert.equal(f.ctx.liveRestores().length,1);assert.equal(JSON.parse(f.properties.get('NODIV_RESTORE_1_'+r.restore)).token,newToken);assert.equal(JSON.stringify(Object.values(f.sheets).map(sheet=>sheet.rows)),before);
  if(count===0)f.restoreScan(9,'IN');if(count<2)f.restoreScan(4,'OUT');assert.equal(f.restoreFinish().capacity,2);
 }
});
test('Restore final batch exchanges fixed cores, completes mission, capacity exactly 2 and locks only target for 1 hour',()=>{
 const f=restoreFixture(),personal=JSON.stringify(f.sheets['N-Core Register'].rows[8]);f.assign();f.restoreAuthorize();f.restoreScan(9,'IN');f.restoreScan(4,'OUT');const b=f.batches(),r=f.restoreFinish();assert.equal(f.batches(),b+1);assert.equal(r.status,'RESTORE_1_COMPLETE');assert.equal(r.totalEnergy,600);assert.equal(r.nodeState,'STABLE');
 const rows=f.sheets['N-Core Register'].rows;assert.equal(rows[9][14],'NODE');assert.equal(rows[9][15],'NODE-002');assert.equal(rows[9][4],'DEPLOYED');assert.equal(rows[4][14],'PIONEER');assert.equal(rows[4][15],'P003');assert.equal(rows[4][4],'FIELD');assert.equal(f.ctx.countCoresOwnedBy('NODE','NODE-002'),3);assert.equal(f.ctx.countCoresOwnedBy('PIONEER','P003'),2);assert.equal(JSON.stringify(rows[8]),personal);
 assert.equal(f.ctx.findIdentityById('P003').coreCapacity,2);assert.equal(f.sheets['Deployment Register'].rows[1][6],'COMPLETED');assert.equal(f.ctx.liveRestores().length,0);assert.equal(f.properties.has('NODIV_RESTORE_1_'+f.restoreE.parameter.restore),false);
 const logs=f.sheets['Transaction Log'].rows.map(row=>row[2]);assert.ok(logs.includes('RESTORE_1_IN'));assert.ok(logs.includes('RESTORE_1_OUT'));assert.ok(logs.includes('RESTORE_1_COMPLETE'));assert.equal(f.ctx.getRestoreEligibility(f.founder).pioneers.length,0);assert.throws(f.restoreFinish,/COMPLETED/);assert.equal(f.batches(),b+1);
 const player=f.ctx.findIdentityById('P003'),lock=f.ctx.getNodeAccessAuthorization(player,'NODE-002','INSTALLED');assert.equal(lock.reason,'RESTORE_TARGET_LOCKED');assert.ok(lock.remainingSeconds>3590&&lock.remainingSeconds<=3600);assert.equal(f.ctx.getNodeAccessAuthorization(player,'NODE-001','INSTALLED').allowed,true);
 const complete=f.sheets['Transaction Log'].rows.find(row=>row[2]==='RESTORE_1_COMPLETE');complete[1]=new Date(Date.now()-3600000);assert.equal(f.ctx.getNodeAccessAuthorization(player,'NODE-002','INSTALLED').allowed,true);assert.deepEqual(Array.from(f.ctx.exchangePreview(f.restoreE,player,'NODE-001').sizes),[1,2]);
});
test('Restore blocks concurrent FOP/Exchange/mission/ownership and rejects changed state, foreign Identity, Node/Event or expiry',()=>{
 const f=restoreFixture();f.assign();f.restoreAuthorize();assert.throws(()=>f.ctx.getNodeDeinstallOrder({parameter:{token:'a'.repeat(72),node:'NODE-002'}}),/RESTORE_OPERATION_RESERVED/);assert.throws(()=>f.ctx.exchangePreview(f.restoreE,f.ctx.findIdentityById('P003'),'NODE-002'),/RESTORE_OPERATION_RESERVED/);assert.throws(()=>f.ctx.transferCoreOwnership({coreId:'NC-009',expectedFromType:'NODIV_RESERVE',expectedFromId:'HQ',toType:'FOP',toId:'F001'}),/RESTORE_OPERATION_RESERVED/);
 for(const mutate of [f=>f.sheets['N-Core Register'].rows[5][15]='OTHER',f=>f.sheets['N-Core Register'].rows[9][2]='replaced',f=>f.sheets['Event Register'].rows[1][0]='OTHER',f=>f.restoreE.parameter.node='NODE-001',f=>f.restoreE.parameter.token='a'.repeat(72),f=>{const key='NODIV_RESTORE_1_'+f.restoreE.parameter.restore,order=JSON.parse(f.properties.get(key));order.expiresAt=0;f.properties.set(key,JSON.stringify(order));}]){
  const g=restoreFixture();g.assign();g.restoreAuthorize();g.restoreScan(9,'IN');g.restoreScan(4,'OUT');const before=JSON.stringify(Object.values(g.sheets).map(sheet=>sheet.rows));mutate(g);const changed=JSON.stringify(Object.values(g.sheets).map(sheet=>sheet.rows));assert.throws(g.restoreFinish);assert.equal(JSON.stringify(Object.values(g.sheets).map(sheet=>sheet.rows)),changed);
 }
});
test('Restore batch failure leaves all state including capacity/logs/order recoverable and retry commits once',()=>{
 const f=restoreFixture();f.assign();f.restoreAuthorize();f.restoreScan(9,'IN');f.restoreScan(4,'OUT');const before=JSON.stringify(Object.values(f.sheets).map(sheet=>sheet.rows)),original=f.ctx.Sheets.Spreadsheets.batchUpdate;
 f.ctx.Sheets.Spreadsheets.batchUpdate=()=>{throw Error('BATCH_FAILED')};assert.throws(f.restoreFinish,/BATCH_FAILED/);assert.equal(JSON.stringify(Object.values(f.sheets).map(sheet=>sheet.rows)),before);assert.equal(f.target().canConfirm,true);f.ctx.Sheets.Spreadsheets.batchUpdate=original;assert.equal(f.restoreFinish().capacity,2);
});
test('expired Restore releases transit status/reservation without moving ownership; failed assignment produces no live mission',()=>{
 const f=restoreFixture();f.assign();const key='NODIV_RESTORE_1_'+f.restoreE.parameter.restore,order=JSON.parse(f.properties.get(key));order.expiresAt=0;f.properties.set(key,JSON.stringify(order));assert.equal(f.ctx.liveRestores().length,0);f.ctx.cleanupRestoreOrders();assert.equal(f.ctx.readCoreState('NC-009').status,'RESERVE');assert.equal(f.ctx.readCoreState('NC-009').ownerId,'HQ');assert.equal(f.properties.has(key),false);
 const g=restoreFixture(),before=JSON.stringify(Object.values(g.sheets).map(sheet=>sheet.rows));g.fail();assert.throws(g.assign,/BATCH_FAILED/);assert.equal(JSON.stringify(Object.values(g.sheets).map(sheet=>sheet.rows)),before);assert.equal(g.ctx.liveRestores().length,0);
});

test('STABLE-only event creates no restore; upload inventory and catch/normal exchange exclude assigned HQ transit core',()=>{
 const f=restoreFixture();for(const n of [4,5,7])f.sheets['N-Core Register'].rows[n][1]=200;assert.equal(f.assign().status,'NO_SUITABLE_RESTORE_TARGET_OR_CORE');assert.equal(f.batches(),0);
 const g=restoreFixture();g.assign();g.sheets['Upload Terminal Register'].rows.push(['UPLOAD-HQ-BAY-01','UPLOAD_HQ','uploaduid','ACTIVE']);const preview=g.ctx.getHqUploadPreview({parameter:{token:g.restoreE.parameter.token,uid:'uploaduid'}});assert.deepEqual(Array.from(preview.cores,c=>c.coreId),['NC-008']);assert.throws(()=>g.ctx.exchangePreview(g.restoreE,g.ctx.findIdentityById('P003'),'NODE-001'),/RESTORE_OPERATION_RESERVED/);
 g.sheets['Access Card Register'].rows.push(['CARD-L','L001','LOCAL','localuid','ACTIVE','',1,false,true]);assert.equal(g.ctx.catchCoreTransfer({parameter:{card1Uid:'p003uid',card2Uid:'localuid',uid:'uid9'}}).session,false);assert.equal(g.ctx.readCoreState('NC-009').ownerType,'NODIV_RESERVE');
});

test('actual first Normal Exchange marker enables Restore assignment; FOP-reserved target and shared Core cannot be used',()=>{
 const f=restoreFixture();f.sheets['Transaction Log'].rows.length=1;assert.equal(f.ctx.getRestoreEligibility(f.founder).pioneers.length,0);
 const e={parameter:{token:f.restoreE.parameter.token,node:'NODE-001',uid:'nodeuid',size:1}},preview=f.ctx.getGameplayRoute(e).exchangePreview;e.parameter.preview=preview.preview;const auth=f.ctx.normalExchange(e,'authorize');e.parameter.exchange=auth.exchange;e.parameter.uid='uid8';f.ctx.normalExchange(e,'scan');e.parameter.uid='uid1';f.ctx.normalExchange(e,'scan');f.ctx.normalExchange(e,'confirm');
 assert.equal(f.ctx.getRestoreEligibility(f.founder).pioneers[0].identity,'P003');assert.equal(f.assign().nodeId,'NODE-002');
 const g=restoreFixture();g.ctx.getNodeDeinstallOrder({parameter:{token:'a'.repeat(72),node:'NODE-002'}});assert.equal(g.assign().status,'NO_SUITABLE_RESTORE_TARGET_OR_CORE');assert.equal(g.ctx.liveRestores().length,0);
});
test('foreign authenticated Pioneer cannot resume Restore; unauthorized assignment/code forging and incomplete confirm fail',()=>{
 const f=restoreFixture();f.assign();assert.throws(()=>f.ctx.assignRestoreOne({parameter:{token:f.restoreE.parameter.token,pioneer:'P003'}}),/FOUNDER_REQUIRED/);assert.throws(()=>f.ctx.normalRestoreOne(f.restoreE,'authorize'),/SESSION_NODE_MISMATCH/);
 f.sheets['Access Card Register'].rows.push(['CARD-004','P004','PIONEER','p004uid','ACTIVE','',1,true]);const token='c'.repeat(72);f.cache.set('NODIV_SESSION_'+token,JSON.stringify({identity:'P004',role:'PIONEER',cardId:'CARD-004'}));const e={parameter:{token,uid:'nodeuid2',node:'NODE-002',restore:f.restoreE.parameter.restore}};
 const before=JSON.stringify([...f.properties]);assert.equal(f.ctx.getGameplayRoute(e).decision.reason,'RESTORE_OPERATION_RESERVED');assert.throws(()=>f.ctx.normalRestoreOne(e,'authorize'),/SESSION_NODE_MISMATCH/);assert.equal(JSON.stringify([...f.properties]),before);
 f.restoreAuthorize();assert.throws(f.restoreFinish,/SCANS_INCOMPLETE/);f.restoreScan(9,'IN');assert.throws(f.restoreFinish,/SCANS_INCOMPLETE/);assert.equal(f.ctx.findIdentityById('P003').coreCapacity,1);
});

test('Restore commit uses atomic batch without flush/transfer rescans; completion marker prevents replay despite stale property',()=>{
 const f=restoreFixture();f.assign();f.restoreAuthorize();f.restoreScan(9,'IN');f.restoreScan(4,'OUT');const key='NODIV_RESTORE_1_'+f.restoreE.parameter.restore,order=f.properties.get(key);let flushes=0;f.ctx.SpreadsheetApp.flush=()=>flushes++;f.ctx.transferCoreOwnership=()=>{throw Error('RESTORE_COMMIT_MUST_USE_VALIDATED_BATCH')};f.restoreFinish();assert.equal(flushes,0);f.properties.set(key,order);assert.throws(f.restoreFinish,/EXPIRED_OR_COMPLETED/);assert.equal(f.ctx.getPioneerRestoreState(f.restoreE).status,'NO_ACTIVE_RESTORE');assert.equal(f.sheets['Transaction Log'].rows.filter(row=>row[2]==='RESTORE_1_COMPLETE').length,1);
});

function catchFixture(capacity=3,{ledger=false}={}){
 const f=exchangeFixture(capacity),token='c'.repeat(72);if(!ledger)f.ctx.readPlayerEnergyBalance=()=>0;
 f.sheets['Access Card Register'].rows.push(['CARD-C','P009','PIONEER','catcheruid','ACTIVE','',2,true,true]);
 f.cache.set('NODIV_SESSION_'+token,JSON.stringify({identity:'P009',role:'PIONEER',cardId:'CARD-C'}));
 const e={parameter:{token,mode:'preview',targetUid:'p003uid'}};
 return {...f,catchE:e,catchPreview(){return f.ctx.catchCoreTransfer(e)},catchConfirm(id){return f.ctx.catchCoreTransfer({parameter:{token,mode:'confirm',catchId:id}})}};
}
test('CATCH highest visible energy stays hidden until atomic confirmation; both inventories update, no progression mutation',()=>{
 const f=catchFixture(),rows=f.sheets['N-Core Register'].rows;rows[4][1]=410;rows[4][13]=1;rows[5][1]=390;rows[5][13]=900;
 const before=JSON.stringify(f.sheets),r=f.catchPreview();assert.equal(r.target,'P003');assert.equal(r.core,undefined);assert.equal(r.coreId,undefined);assert.equal(JSON.stringify(f.sheets),before);
 const completed=f.catchConfirm(r.catchId);assert.equal(completed.status,'CATCH_COMPLETE');assert.equal(completed.core.id,'NC-004');assert.equal(completed.core.energy,410);assert.equal(f.batches(),1);
 assert.equal(rows[4][14],'PIONEER');assert.equal(rows[4][15],'P009');assert.equal(rows[4][4],'FIELD');
 assert.equal(f.ctx.getPlayerState(f.e).cores.length,2);assert.equal(f.ctx.getPlayerState(f.catchE).cores.length,1);assert.equal(f.ctx.findIdentityById('P003').coreCapacity,3);
 const log=f.sheets['Transaction Log'].rows[1];assert.equal(log[2],'CATCH_COMPLETE');assert.equal(log[3],'P009');assert.equal(log[7],'P003');assert.equal(log[9],'P009');assert.equal(log[10],410);
 const snapshot=JSON.stringify(f.sheets);assert.equal(f.catchConfirm(r.catchId).replayed,true);assert.equal(JSON.stringify(f.sheets),snapshot);
});
test('CATCH excludes transit and mission-bound cores, chooses highest remaining; zero eligible denied',()=>{
 const f=catchFixture(),rows=f.sheets['N-Core Register'].rows;rows[6][4]='IN_TRANSIT';rows[5][1]=300;
 f.sheets['Deployment Register'].rows.push(['DEP','NC-005','','','','MISSION','ASSIGNED']);
 const r=f.catchPreview();assert.equal(f.catchConfirm(r.catchId).core.id,'NC-004');assert.equal(rows[6][15],'P003');assert.equal(rows[5][15],'P003');
 const g=catchFixture(1);g.sheets['N-Core Register'].rows[6][4]='IN_TRANSIT';assert.throws(()=>g.catchPreview(),/NO_CATCHABLE_CORE/);
 const h=catchFixture(1);h.sheets['N-Core Register'].rows[6][14]='NODIV_RESERVE';h.sheets['N-Core Register'].rows[6][15]='HQ';assert.throws(()=>h.catchPreview(),/NO_CATCHABLE_CORE/);
});
test('CATCH rights, active cards, self-catch, capacity, event and session are server validated',()=>{
 const mutate=[f=>f.sheets['Access Card Register'].rows.at(-1)[8]=false,f=>f.sheets['Access Card Register'].rows.at(-1)[4]='INACTIVE',f=>f.sheets['Access Card Register'].rows[2][4]='INACTIVE',f=>f.catchE.parameter.targetUid='catcheruid',f=>f.sheets['Access Card Register'].rows.at(-1)[6]=0,f=>f.sheets['Event Register'].rows[1][1]='COMPLETED'];
 for(const change of mutate){const f=catchFixture();change(f);const result=()=>f.catchPreview();if(f.sheets['Access Card Register'].rows.at(-1)[4]==='INACTIVE')assert.equal(result().session,false);else assert.throws(result,/ACCESS_DENIED|TARGET_INVALID|SELF_CATCH|CAPACITY_FULL|FIELD_ACTIVE/);assert.equal(f.batches(),0);}
 const f=catchFixture();f.sheets['Access Card Register'].rows.at(-1)[6]=1;const row=f.sheets['N-Core Register'].rows[8];row[2]='eight';row[14]='PIONEER';row[15]='P009';row[4]='FIELD';assert.throws(()=>f.catchPreview(),/CATCHER_CAPACITY_FULL/);
 assert.equal(f.ctx.catchCoreTransfer({parameter:{card1Uid:'p003uid',card2Uid:'catcheruid',uid:'uid6'}}).session,false);
});
test('CATCH blocks active Exchange inventory and rechecks reservations added after preview',()=>{
 const f=catchFixture(1);f.authorize(1);assert.throws(()=>f.catchPreview(),/NO_CATCHABLE_CORE/);
 for(const reserved of ['deployment','exchange']){const g=catchFixture(1),r=g.catchPreview(),before=JSON.stringify(g.sheets);if(reserved==='exchange')g.authorize(1);else g.sheets['Deployment Register'].rows.push(['DEP','NC-006','','','','MISSION','IN_TRANSIT']);const owners=g.sheets['N-Core Register'].rows.map(row=>row.slice(14));assert.throws(()=>g.catchConfirm(r.catchId),/NO_CATCHABLE_CORE/);assert.deepEqual(g.sheets['N-Core Register'].rows.map(row=>row.slice(14)),owners);}
 const g=catchFixture(),r=g.catchPreview();g.sheets['N-Core Register'].rows[4][1]=999;assert.throws(()=>g.catchConfirm(r.catchId),/SNAPSHOT_CHANGED/);assert.equal(g.batches(),0);
});
test('CATCH batch failure leaves ownership/log unchanged and confirmation retry succeeds',()=>{
 const f=catchFixture(),r=f.catchPreview(),before=JSON.stringify(f.sheets),batch=f.ctx.Sheets.Spreadsheets.batchUpdate;f.ctx.Sheets.Spreadsheets.batchUpdate=()=>{throw Error('BATCH_FAILED')};assert.throws(()=>f.catchConfirm(r.catchId),/BATCH_FAILED/);assert.equal(JSON.stringify(f.sheets),before);f.ctx.Sheets.Spreadsheets.batchUpdate=batch;assert.equal(f.catchConfirm(r.catchId).status,'CATCH_COMPLETE');
 const g=catchFixture(),p=g.catchPreview();g.ctx.transferCoreOwnership=()=>{throw Error('PRECOMMIT_FAILED')};const snapshot=JSON.stringify(g.sheets);assert.throws(()=>g.catchConfirm(p.catchId),/PRECOMMIT_FAILED/);assert.equal(JSON.stringify(g.sheets),snapshot);
});
test('CATCH concurrent previews on same Pioneer allow only one transfer, including a different catcher',()=>{
 const f=catchFixture(),a=f.catchPreview(),b=f.catchPreview();f.catchConfirm(a.catchId);assert.throws(()=>f.catchConfirm(b.catchId),/TARGET_PROTECTED/);assert.equal(f.batches(),1);
 const g=catchFixture(),one=g.catchPreview(),token='d'.repeat(72);g.sheets['Access Card Register'].rows.push(['CARD-D','L001','LOCAL','localuid','ACTIVE','',1,false,true]);g.cache.set('NODIV_SESSION_'+token,JSON.stringify({identity:'L001',role:'LOCAL',cardId:'CARD-D'}));
 const two=g.ctx.catchCoreTransfer({parameter:{token,mode:'preview',targetUid:'p003uid'}});g.catchConfirm(one.catchId);assert.throws(()=>g.ctx.catchCoreTransfer({parameter:{token,mode:'confirm',catchId:two.catchId}}),/TARGET_PROTECTED/);assert.equal(g.batches(),1);
});
test('CATCH revalidates cards/event/expiry, rejects foreign confirmation, atomic five-minute ghost',()=>{
 for(const mutate of [f=>f.sheets['Access Card Register'].rows.at(-1)[8]=false,f=>f.sheets['Access Card Register'].rows[2][3]='replacement',f=>f.sheets['Event Register'].rows[1][0]='OTHER']){
  const f=catchFixture(),r=f.catchPreview();mutate(f);assert.throws(()=>f.catchConfirm(r.catchId),/ACCESS_DENIED|TARGET_INVALID|EVENT_CHANGED/);assert.equal(f.batches(),0);
 }
 const f=catchFixture(),r=f.catchPreview(),key='NODIV_CATCH_V1_'+r.catchId,order=JSON.parse(f.properties.get(key));order.expiresAt=0;f.properties.set(key,JSON.stringify(order));assert.throws(()=>f.catchConfirm(r.catchId),/CATCH_EXPIRED/);
 assert.throws(()=>f.ctx.catchCoreTransfer({parameter:{token:f.e.parameter.token,mode:'confirm',catchId:r.catchId}}),/ACCESS_DENIED/);
 const g=catchFixture(1),p=g.catchPreview();g.catchConfirm(p.catchId);assert.ok(new Date(g.ctx.findIdentityById('P003').ghostUntil).getTime()>Date.now()+299000);
});
test('LOCAL Catcher receives PIONEER-owned FIELD Core and sees it immediately; P003 Restore capacity remains exactly 2',()=>{
 const f=catchFixture(1);f.sheets['Access Card Register'].rows[2][6]=2;f.sheets['Access Card Register'].rows.at(-1)[2]='LOCAL';f.sheets['Access Card Register'].rows.at(-1)[7]=false;f.cache.set('NODIV_SESSION_'+f.catchE.parameter.token,JSON.stringify({identity:'P009',role:'LOCAL',cardId:'CARD-C'}));
 const r=f.catchPreview();f.catchConfirm(r.catchId);assert.equal(f.ctx.getPlayerState(f.catchE).cores[0].coreId,'NC-006');assert.equal(f.ctx.getPlayerState(f.e).cores.length,0);assert.equal(f.ctx.findIdentityById('P003').coreCapacity,2);
});
test('CATCH lost batch response is recovered from durable receipt without transferring another Core',()=>{
 const f=catchFixture(),r=f.catchPreview(),batch=f.ctx.Sheets.Spreadsheets.batchUpdate;f.ctx.Sheets.Spreadsheets.batchUpdate=(...args)=>{batch(...args);throw Error('NETWORK_RESPONSE_LOST')};assert.throws(()=>f.catchConfirm(r.catchId),/NETWORK_RESPONSE_LOST/);const before=JSON.stringify(f.sheets);const retry=f.catchConfirm(r.catchId);assert.equal(retry.replayed,true);assert.equal(retry.core.energy,341);assert.equal(JSON.stringify(f.sheets),before);assert.equal(f.batches(),1);
});
test('CATCH confirms only with fresh authenticated Catcher, current capacity and unchanged target ownership',()=>{
 const f=catchFixture(),r=f.catchPreview();f.cache.delete('NODIV_SESSION_'+f.catchE.parameter.token);assert.equal(f.catchConfirm(r.catchId).session,false);assert.equal(f.batches(),0);
 const g=catchFixture(),p=g.catchPreview();g.sheets['Access Card Register'].rows.at(-1)[6]=0;assert.throws(()=>g.catchConfirm(p.catchId),/CAPACITY_FULL/);assert.equal(g.batches(),0);
 const h=catchFixture(),q=h.catchPreview();h.sheets['N-Core Register'].rows[6][15]='OTHER';assert.throws(()=>h.catchConfirm(q.catchId),/SNAPSHOT_CHANGED/);assert.equal(h.batches(),0);
 const j=catchFixture(),a=j.catchPreview(),token='e'.repeat(72);j.sheets['Access Card Register'].rows.push(['CARD-E','P010','PIONEER','otheruid','ACTIVE','',1,true,true]);j.cache.set('NODIV_SESSION_'+token,JSON.stringify({identity:'P010',role:'PIONEER',cardId:'CARD-E'}));assert.throws(()=>j.ctx.catchCoreTransfer({parameter:{token,mode:'confirm',catchId:a.catchId}}),/CATCH_SESSION_MISMATCH/);assert.equal(j.batches(),0);
});
test('CATCH does not grant Pioneer rights: P003 2/3 with NC-008 remains intact, authorized catch can fill second slot',()=>{
 const f=catchFixture(1),rows=f.sheets['N-Core Register'].rows;rows[6][14]='NODIV_RESERVE';rows[6][15]='HQ';rows[8][2]='uid8';rows[8][1]=310;rows[8][4]='FIELD';rows[8][14]='PIONEER';rows[8][15]='P003';f.sheets['Access Card Register'].rows[2][6]=2;
 f.sheets['Transaction Log'].rows.push(['RESTORED',new Date(),'RESTORE_1_COMPLETE','P003','PIONEER','','','','','','','','','NODE-002','SUCCESS','old-restore']);
 assert.throws(()=>f.ctx.catchCoreTransfer({parameter:{token:f.e.parameter.token,mode:'preview',targetUid:'catcheruid'}}),/CATCH_ACCESS_DENIED/);assert.equal(f.ctx.readCoreState('NC-008').ownerId,'P003');assert.equal(f.ctx.findIdentityById('P003').coreCapacity,2);
 f.sheets['Access Card Register'].rows[2][8]=true;rows[7][2]='uid7';rows[7][1]=100;rows[7][4]='FIELD';rows[7][14]='PIONEER';rows[7][15]='P009';const personal=JSON.stringify(rows[8]),order=f.ctx.catchCoreTransfer({parameter:{token:f.e.parameter.token,mode:'preview',targetUid:'catcheruid'}});
 f.ctx.catchCoreTransfer({parameter:{token:f.e.parameter.token,mode:'confirm',catchId:order.catchId}});assert.equal(JSON.stringify(rows[8]),personal);assert.equal(f.ctx.findIdentityById('P003').coreCapacity,2);assert.equal(f.ctx.countCoresOwnedBy('PIONEER','P003'),2);assert.deepEqual(Array.from(f.ctx.exchangePreview(f.e,f.ctx.findIdentityById('P003'),'NODE-001').sizes),[1,2]);assert.equal(f.sheets['Transaction Log'].rows.filter(r=>r[2]==='RESTORE_1_COMPLETE').length,1);
});

function restoreTwoFixture(){
 const f=restoreFixture(),logs=f.sheets['Transaction Log'].rows,rows=f.sheets['N-Core Register'].rows;
 f.sheets['Access Card Register'].rows[2][6]=2;rows[12][2]='uid12';rows[12][1]=210;rows[12][4]='FIELD';rows[12][14]='PIONEER';rows[12][15]='P003';
 const restoreTime=new Date(Date.now()-120000),time=new Date(Date.now()-60000);
 logs.push(['R1',restoreTime,'RESTORE_1_COMPLETE','P003','PIONEER','','','','','','','','','NODE-001','SUCCESS','old-r1']);
 for(const [type,core,fromType,fromId,toType,toId]of [['IN','NC-006','PIONEER','P003','NODE','NODE-001'],['IN','NC-013','PIONEER','P003','NODE','NODE-001'],['OUT','NC-008','NODE','NODE-001','PIONEER','P003'],['OUT','NC-012','NODE','NODE-001','PIONEER','P003']])logs.push(['TX-'+core,time,'NORMAL_EXCHANGE_'+type,'P003','PIONEER',core,fromType,fromId,toType,toId,200,0,200,'NODE-001','SUCCESS','']);
 logs.push(['SUMMARY',time,'NORMAL_EXCHANGE','P003','PIONEER','','','','','','','','','NODE-001','SUCCESS','legacy-2-core-exchange']);f.founder.parameter.phase=2;
 return f;
}
test('Restore #2 reconstructs legacy 2-for-2 operation after Restore #1 without writes or explicit eligibility marker',()=>{
 const f=restoreTwoFixture(),before=JSON.stringify(f.sheets);const eligible=f.ctx.getRestoreEligibility(f.founder).pioneers;assert.equal(eligible[0].identity,'P003');assert.equal(eligible[0].phase,2);assert.equal(eligible[0].capacity,2);assert.equal(JSON.stringify(f.sheets),before);assert.equal(f.ctx.restoreTwoExchangeEvidence(f.ctx.findIdentityById('P003'),f.ctx.exchangeLogRows()).exchange,'legacy-2-core-exchange');
 for(const mutate of [f=>f.sheets['Access Card Register'].rows[2][6]=1,f=>f.sheets['Transaction Log'].rows.splice(-5),f=>f.sheets['Transaction Log'].rows.at(-3)[3]='P004',f=>f.sheets['Transaction Log'].rows.at(-4)[13]='NODE-002',f=>f.sheets['Transaction Log'].rows.at(-2)[14]='FAILED',f=>f.sheets['Transaction Log'].rows.at(-1)[1]=new Date(Date.now()-300000),f=>f.sheets['Transaction Log'].rows.splice(-2,0,['OTHER',new Date(),'UPLOAD'])]){
  const g=restoreTwoFixture();mutate(g);assert.equal(g.ctx.restoreTwoEligible(g.ctx.findIdentityById('P003'),g.ctx.exchangeLogRows()),false);assert.throws(g.assign,/RESTORE_2_NOT_ELIGIBLE/);assert.equal(g.batches(),0);
 }
});
test('future successful 2-Core Exchange after Restore #1 writes RESTORE_2_ELIGIBLE atomically and remains detectable',()=>{
 const f=exchangeFixture(2);f.sheets['Transaction Log'].rows.push(['R1',new Date(Date.now()-1000),'RESTORE_1_COMPLETE','P003','PIONEER','','','','','','','','','NODE-OTHER','SUCCESS','r1']);f.authorize(2);for(const n of [6,5,1,2])f.exchangeScan(n);const r=f.finishExchange();assert.equal(r.status,'EXCHANGE_COMPLETE');const logs=f.ctx.exchangeLogRows();assert.equal(logs.filter(row=>row[2]==='RESTORE_2_ELIGIBLE').length,1);assert.equal(f.ctx.restoreTwoEligible(f.ctx.findIdentityById('P003'),logs),true);
 const g=exchangeFixture(2);g.sheets['Transaction Log'].rows.push(['R1',new Date(Date.now()-1000),'RESTORE_1_COMPLETE','P003','PIONEER','','','','','','','','','NODE-OTHER','SUCCESS','r1']);g.authorize(1);g.exchangeScan(6);g.exchangeScan(1);g.finishExchange();assert.equal(g.ctx.exchangeLogRows().some(row=>row[2]==='RESTORE_2_ELIGIBLE'),false);assert.equal(g.ctx.restoreTwoEligible(g.ctx.findIdentityById('P003'),g.ctx.exchangeLogRows()),false);
});
test('Restore #2 chooses smallest STABLE/fallback DEGRADED cargo, keeps distinct orders, protects transit',()=>{
 const f=restoreTwoFixture(),r=f.assign();assert.equal(r.phase,2);assert.equal(r.status,'RESTORE_2_ASSIGNED');assert.equal(r.nodeId,'NODE-002');assert.equal(r.inCore.id,'NC-009');assert.equal(r.projectedState,'STABLE');assert.ok(f.properties.has('NODIV_RESTORE_2_'+r.restore));assert.equal(f.sheets['Deployment Register'].rows[1][5],'RESTORE_2');
 assert.equal(f.ctx.liveRestores().length,1);assert.equal(f.ctx.getPioneerRestoreState(f.restoreE).phase,2);assert.equal(f.ctx.routeCoreGameplay(f.ctx.findIdentityById('P003'),f.ctx.readCoreState('NC-009')).decision.allowed,false);assert.throws(()=>f.ctx.transferCoreOwnership({coreId:'NC-009',expectedFromType:'NODIV_RESERVE',expectedFromId:'HQ',toType:'PIONEER',toId:'P003'}),/RESTORE_OPERATION_RESERVED/);assert.equal(f.ctx.countCoresOwnedBy('PIONEER','P003'),2);
 const g=restoreTwoFixture();for(const n of [9,10,11])g.sheets['N-Core Register'].rows[n][1]=200;assert.equal(g.assign().projectedState,'DEGRADED');
 const h=restoreTwoFixture();for(const n of [4,5,7])h.sheets['N-Core Register'].rows[n][1]=200;assert.equal(h.assign().status,'NO_SUITABLE_RESTORE_TARGET_OR_CORE');
});
test('Restore #2 wrong Node/IN/OUT rejected; scan retries idempotent and rebind works at all progress states',()=>{
 for(const count of [0,1,2]){
  const f=restoreTwoFixture();f.assign();assert.equal(f.ctx.getGameplayRoute({...f.restoreE,parameter:{...f.restoreE.parameter,uid:'nodeuid'}}).decision.reason,'RESTORE_WRONG_NODE');f.restoreAuthorize();assert.throws(()=>f.restoreScan(8,'IN'),/TRANSIT_CORE_REQUIRED/);if(count)f.restoreScan(9,'IN');if(count===2)f.restoreScan(4,'OUT');
  const token='f'.repeat(72);f.cache.delete('NODIV_SESSION_'+f.restoreE.parameter.token);f.cache.set('NODIV_SESSION_'+token,JSON.stringify({identity:'P003',role:'PIONEER',cardId:'CARD-003'}));f.restoreE.parameter.token=token;const r=f.target();assert.equal(r.phase,2);assert.equal(r.inCount,count?1:0);assert.equal(r.outCount,count===2?1:0);assert.match(r.accessCode,/^\d{4}$/);
  if(!count)f.restoreScan(9,'IN');assert.equal(f.restoreScan(9,'IN').replayed,true);assert.throws(()=>f.restoreScan(5,'OUT'),/LOWEST_NODE_CORE_REQUIRED/);if(count<2)f.restoreScan(4,'OUT');assert.equal(f.restoreScan(4,'OUT').replayed,true);assert.throws(()=>f.restoreScan(9,'OUT'),/DUPLICATE_CORE_SCAN/);assert.equal(f.restoreFinish().capacity,3);
 }
});
test('Restore #2 atomic completion leaves personal ownership unchanged, Node 3/3, OUT HQ, capacity 3, marker and 1h target lock',()=>{
 const f=restoreTwoFixture(),rows=f.sheets['N-Core Register'].rows,personal=JSON.stringify([rows[8],rows[12]]);f.assign();f.restoreAuthorize();f.restoreScan(9,'IN');f.restoreScan(4,'OUT');const b=f.batches(),r=f.restoreFinish();assert.equal(f.batches(),b+1);assert.equal(r.status,'RESTORE_2_COMPLETE');assert.equal(r.capacity,3);assert.equal(r.totalEnergy,600);assert.equal(JSON.stringify([rows[8],rows[12]]),personal);assert.equal(f.ctx.countCoresOwnedBy('PIONEER','P003'),2);assert.equal(f.ctx.countCoresOwnedBy('NODE','NODE-002'),3);assert.equal(rows[4][14],'NODIV_RESERVE');assert.equal(rows[4][15],'HQ');assert.equal(rows[4][4],'RESERVE');assert.equal(rows[9][14],'NODE');assert.equal(rows[9][4],'DEPLOYED');assert.equal(f.ctx.findIdentityById('P003').coreCapacity,3);assert.equal(f.ctx.exchangeLogRows().filter(row=>row[2]==='RESTORE_2_COMPLETE').length,1);assert.equal(f.ctx.liveRestores().length,0);assert.throws(f.restoreFinish,/EXPIRED_OR_COMPLETED/);assert.throws(f.assign,/NOT_ELIGIBLE/);assert.equal(f.ctx.getNodeAccessAuthorization(f.ctx.findIdentityById('P003'),'NODE-002','INSTALLED').reason,'RESTORE_TARGET_LOCKED');
 const one=f.ctx.exchangeLogRows().find(row=>row[2]==='RESTORE_1_COMPLETE');one[1]=new Date(Date.now()-4000000);f.sheets['Transaction Log'].rows.find(row=>row[2]==='RESTORE_1_COMPLETE')[1]=one[1];assert.equal(f.ctx.getNodeAccessAuthorization(f.ctx.findIdentityById('P003'),'NODE-001','INSTALLED').allowed,true);
});
test('Restore #2 batch failure preserves ownership/capacity and expired order releases only matching HQ transit',()=>{
 const f=restoreTwoFixture();f.assign();f.restoreAuthorize();f.restoreScan(9,'IN');f.restoreScan(4,'OUT');const before=JSON.stringify(f.sheets);f.fail();assert.throws(f.restoreFinish,/BATCH_FAILED/);assert.equal(JSON.stringify(f.sheets),before);assert.equal(f.target().inCount,1);
 const g=restoreTwoFixture(),r=g.assign(),key='NODIV_RESTORE_2_'+r.restore,order=JSON.parse(g.properties.get(key));order.expiresAt=0;g.properties.set(key,JSON.stringify(order));assert.equal(g.ctx.liveRestores().length,0);g.ctx.cleanupRestoreOrders();assert.equal(g.ctx.readCoreState('NC-009').status,'RESERVE');assert.equal(g.ctx.readCoreState('NC-009').ownerId,'HQ');assert.equal(g.sheets['Deployment Register'].rows[1][6],'EXPIRED');assert.ok(g.ctx.exchangeLogRows().some(row=>row[2]==='RESTORE_2_EXPIRED'));
});
test('Restore #1/#2 shared reservations block second assignments, Exchange and FOP',()=>{
 const f=restoreTwoFixture();f.assign();assert.throws(f.assign,/RESTORE_OPERATION_RESERVED/);assert.throws(()=>f.ctx.getNodeDeinstallOrder({parameter:{token:'a'.repeat(72),node:'NODE-002'}}),/RESTORE_OPERATION_RESERVED/);assert.throws(()=>f.ctx.exchangePreview(f.restoreE,f.ctx.findIdentityById('P003'),'NODE-002'),/RESTORE_OPERATION_RESERVED/);
 f.sheets['Access Card Register'].rows.push(['CARD-4','P004','PIONEER','p4','ACTIVE','',1,true]);f.sheets['Transaction Log'].rows.push(['eligible',new Date(),'RESTORE_1_ELIGIBLE','P004','PIONEER','','','','','','','','','NODE-001','SUCCESS','e']);const result=f.ctx.assignRestoreOne({parameter:{token:f.founder.parameter.token,pioneer:'P004',phase:1}});assert.equal(result.action,false);assert.equal(f.ctx.liveRestores().length,1);
});
test('Restore #2 revalidates phase capacity, Event, UID, Node fingerprint and foreign sessions before any final mutation',()=>{
 for(const mutate of [f=>f.sheets['Access Card Register'].rows[2][6]=3,f=>f.sheets['Event Register'].rows[1][0]='OTHER',f=>f.sheets['N-Core Register'].rows[9][2]='replaced',f=>f.sheets['Node Register'].rows[2][1]='replaced-node',f=>f.restoreE.parameter.token='a'.repeat(72)]){
  const f=restoreTwoFixture();f.assign();f.restoreAuthorize();f.restoreScan(9,'IN');f.restoreScan(4,'OUT');mutate(f);const before=JSON.stringify(f.sheets),b=f.batches();assert.throws(f.restoreFinish);assert.equal(JSON.stringify(f.sheets),before);assert.equal(f.batches(),b);
 }
});

function installRebindFixture(scans=3,nodeId='NODE-001'){
 const f=fixture(),rows=f.sheets['N-Core Register'].rows;if(nodeId==='NODE-002'){f.sheets['Event Register'].rows[1][1]='FIELD_ACTIVE';enableNode(f,nodeId,'F001',true);f.e.parameter.node=nodeId;}for(const row of rows.slice(1))row[2]='';
 for(const [id,energy]of [[14,50],[6,105],[12,435]]){rows[id][2]='uid'+id;rows[id][1]=energy;}
 const order=f.order();for(const n of [14,6,12].slice(0,scans))f.scan(n);
 const oldToken=f.e.parameter.token,token='9'.repeat(72);f.cache.delete('NODIV_SESSION_'+oldToken);f.cache.set('NODIV_SESSION_'+token,JSON.stringify({identity:'F001',role:'FOP',cardId:'CARD-001'}));f.e.parameter.token=token;
 return {...f,initialOrder:order,oldToken};
}
test('INSTALL recovery rebinds arbitrary valid loadout after lost session, preserves 1/3 through 3/3 without new orders/reservations',()=>{
 for(const count of [1,2,3]){const f=installRebindFixture(count),before=JSON.stringify(f.sheets),b=f.batches(),r=f.ctx.getNodeInstallOrder(f.e);assert.equal(r.status,'NODE_INSTALL_ORDER_RESUMED');assert.equal(r.installation,f.initialOrder.installation);assert.equal(r.count,count);assert.equal(r.canConfirm,count===3);assert.equal(r.totalEnergy,590);assert.deepEqual(Array.from(r.loadout,c=>c.id).sort(),['NC-006','NC-012','NC-014']);assert.equal(JSON.stringify(f.sheets),before);assert.equal(f.batches(),b);assert.equal(f.ctx.readInstallationOrders().length,1);assert.equal(f.ctx.readInstallationOrders()[0].sessionToken,f.e.parameter.token);assert.equal(r.expiresAt,f.initialOrder.expiresAt);
  if(count===3){assert.equal(f.ctx.confirmNodeInstallation(f.e).status,'NODE_INSTALLED');assert.equal(f.ctx.countCoresOwnedBy('NODE','NODE-001'),3);assert.equal(f.ctx.readCoreState('NC-014').ownerId,'NODE-001');}
 }
});
test('INSTALL recovery validates complete loadout and deployment reservations before rebinding, including unscanned Cores',()=>{
 for(const mutate of [f=>f.sheets['N-Core Register'].rows[12][15]='OTHER',f=>f.sheets['N-Core Register'].rows[12][1]=436,f=>f.sheets['Deployment Register'].rows[1][6]='CANCELLED',f=>{const key='NODIV_INSTALL_ORDER_'+f.initialOrder.installation,o=JSON.parse(f.properties.get(key));o.cores[0].uid='wrong';f.properties.set(key,JSON.stringify(o));},f=>{const key='NODIV_INSTALL_ORDER_'+f.initialOrder.installation,o=JSON.parse(f.properties.get(key));o.loadout[1]={...o.loadout[0]};f.properties.set(key,JSON.stringify(o));}]){const f=installRebindFixture(1);mutate(f);const before=JSON.stringify(f.sheets),properties=JSON.stringify([...f.properties]);assert.throws(()=>f.ctx.getNodeInstallOrder(f.e),/RESERVE|ASSIGNED|RESERVATION_INVALID|LOADOUT_INVALID/);assert.equal(JSON.stringify(f.sheets),before);assert.equal(JSON.stringify([...f.properties]),properties);}
});

test('NODE-002 recovery preserves real 014=50,006=105,012=435 loadout at 3/3 and can confirm immediately',()=>{
 const f=installRebindFixture(3,'NODE-002'),before=JSON.stringify(f.sheets),r=f.ctx.getNodeInstallOrder(f.e);assert.equal(r.node.id,'NODE-002');assert.equal(r.installation,f.initialOrder.installation);assert.equal(r.totalEnergy,590);assert.equal(r.count,3);assert.equal(r.canConfirm,true);assert.equal(JSON.stringify(f.sheets),before);assert.deepEqual(Array.from(r.loadout,c=>[c.id,c.energy]),[['NC-014',50],['NC-006',105],['NC-012',435]]);assert.equal(f.ctx.confirmNodeInstallation(f.e).status,'NODE_INSTALLED');assert.equal(f.ctx.countCoresOwnedBy('NODE','NODE-002'),3);
});

test('Catch commits highest FIELD Core, SUCCESS log and exact five-minute GhostUntil in one atomic batch',()=>{
 const f=catchFixture(),r=f.catchPreview(),batch=f.ctx.Sheets.Spreadsheets.batchUpdate;let captured,flushes=0;f.ctx.SpreadsheetApp.flush=()=>flushes++;f.ctx.Sheets.Spreadsheets.batchUpdate=(body,id)=>{captured=body.requests;batch(body,id);};
 const start=Date.now(),result=f.catchConfirm(r.catchId),end=Date.now(),until=new Date(f.ctx.findIdentityById('P003').ghostUntil).getTime();assert.ok(until>=start+300000&&until<=end+300000);assert.equal(result.ghostUntil,new Date(until).toISOString());assert.equal(f.batches(),1);assert.equal(flushes,0);assert.equal(f.ctx.readCoreState('NC-006').ownerId,'P009');assert.ok(captured.some(req=>req.updateCells?.start.sheetId===7&&req.updateCells.start.columnIndex===9));assert.equal(f.ctx.getPlayerState(f.e).player.status,'GHOST');assert.ok(Number.isFinite(f.ctx.getPlayerState(f.e).serverNow));
 const before=JSON.stringify(f.sheets),receipt=f.catchConfirm(r.catchId);assert.equal(receipt.replayed,true);assert.equal(receipt.ghostUntil,result.ghostUntil);assert.equal(JSON.stringify(f.sheets),before);assert.equal(f.batches(),1);
});
test('Ghost prevents new preview and previously prepared confirm; expiry restores eligibility without affecting Node cooldown',()=>{
 const f=catchFixture(),a=f.catchPreview(),b=f.catchPreview();f.catchConfirm(a.catchId);let before=JSON.stringify(f.sheets);assert.throws(()=>f.catchPreview(),/TARGET_PROTECTED/);assert.throws(()=>f.catchConfirm(b.catchId),/TARGET_PROTECTED/);assert.equal(JSON.stringify(f.sheets),before);
 const player=f.ctx.findIdentityById('P003');assert.equal(f.ctx.getNodeAccessAuthorization(player,'NODE-001','INSTALLED').allowed,true);assert.ok(f.ctx.exchangePreview(f.e,player,'NODE-001').sizes.length>0);
 f.sheets['Access Card Register'].rows[2][9]=new Date(Date.now()-1000);assert.equal(f.catchPreview().status,'CATCH_READY');
 const g=catchFixture();g.sheets['Transaction Log'].rows.push(['cool',new Date(),'NORMAL_EXCHANGE','P003','PIONEER','','','','','','','','','NODE-001','SUCCESS','previous']);assert.throws(()=>g.ctx.exchangePreview(g.e,g.ctx.findIdentityById('P003'),'NODE-001'),/NODE_EXCHANGE_COOLDOWN/);assert.equal(g.catchPreview().status,'CATCH_READY');
});
test('Catch denial or failure creates neither transfer nor Ghost: protection, capacity, transit, snapshots, reservations and precommit/batch errors',()=>{
 for(const kind of ['protected','full','transit','snapshot','reservation','ownership','ghost-stage','transfer-stage','batch']){
  const f=catchFixture(1);let order;
  if(kind==='protected')f.sheets['Access Card Register'].rows[2][9]=new Date(Date.now()+120000);
  else if(kind==='full')f.sheets['Access Card Register'].rows.at(-1)[6]=0;
  else if(kind==='transit')f.sheets['N-Core Register'].rows[6][4]='IN_TRANSIT';
  else{order=f.catchPreview();if(kind==='snapshot')f.sheets['N-Core Register'].rows[6][1]=1;if(kind==='reservation')f.sheets['Deployment Register'].rows.push(['DEP','NC-006','','','','MISSION','ASSIGNED']);if(kind==='ownership')f.sheets['N-Core Register'].rows[6][15]='OTHER';if(kind==='ghost-stage')f.ctx.setAccessCardGhostUntilByUid=()=>{throw Error('GHOST_STAGE_FAILED')};if(kind==='transfer-stage')f.ctx.transferCoreOwnership=()=>{throw Error('TRANSFER_STAGE_FAILED')};if(kind==='batch')f.fail();}
  const before=JSON.stringify(f.sheets);assert.throws(()=>order?f.catchConfirm(order.catchId):f.catchPreview());assert.equal(JSON.stringify(f.sheets),before);assert.equal(f.batches(),0);assert.equal(f.ctx.exchangeLogRows().some(row=>row[2]==='CATCH_COMPLETE'),false);
 }
});
test('Lost successful Catch response replays original Ghost deadline even after that deadline expires',()=>{
 const f=catchFixture(),r=f.catchPreview(),batch=f.ctx.Sheets.Spreadsheets.batchUpdate;f.ctx.Sheets.Spreadsheets.batchUpdate=(...args)=>{batch(...args);throw Error('LOST_RESPONSE')};assert.throws(()=>f.catchConfirm(r.catchId),/LOST_RESPONSE/);const original=f.ctx.findIdentityById('P003').ghostUntil,receipt=f.catchConfirm(r.catchId);assert.equal(receipt.ghostUntil,original);assert.equal(f.batches(),1);
 const advanced=Date.now()+301000;f.ctx.Date=class extends Date{constructor(...args){super(...(args.length?args:[advanced]));}static now(){return advanced;}};const before=JSON.stringify(f.sheets);assert.equal(f.catchConfirm(r.catchId).ghostUntil,original);assert.equal(JSON.stringify(f.sheets),before);
});

test('Capacity guard rejects START_CORE and central incoming transfers at every unlocked limit without mutations',()=>{
 for(const capacity of [1,2,3])for(const start of [false,true]){
  const f=exchangeFixture(capacity),row=f.sheets['N-Core Register'].rows[7];row[2]='uid7';row[4]='RESERVE';
  const before=JSON.stringify(f.sheets);
  assert.throws(()=>start?f.ctx.startCoreTransfer({parameter:{core:'NC-007',pioneerUid:'p003uid',uid:'uid7'}}):f.ctx.transferCoreOwnership({coreId:'NC-007',expectedFromType:'NODIV_RESERVE',expectedFromId:'HQ',toType:'PIONEER',toId:'P003',newStatus:'FIELD'}),start?/START_CORE_CAPACITY_REQUIRED|START_CORE_PERSONAL_CORE_PRESENT/:/PIONEER_CAPACITY_FULL/);
  assert.equal(JSON.stringify(f.sheets),before);assert.equal(f.batches(),0);
 }
});
test('Capacity projection includes earlier staged incoming transfers and rejects overflow before any commit',()=>{
 const f=exchangeFixture(1);f.sheets['Access Card Register'].rows[2][6]=2;const requests=[],before=JSON.stringify(f.sheets);
 const transfer=n=>f.ctx.transferCoreOwnership({coreId:'NC-00'+n,expectedFromType:'NODIV_RESERVE',expectedFromId:'HQ',toType:'PIONEER',toId:'P003',newStatus:'FIELD',batchRequests:requests});
 transfer(4);assert.ok(requests.length>0);assert.throws(()=>transfer(5),/PIONEER_CAPACITY_FULL/);assert.equal(JSON.stringify(f.sheets),before);assert.equal(f.batches(),0);
});
test('Transit ownership consumes no personal slot; promoting transit cargo to FIELD cannot overflow capacity',()=>{
 const f=exchangeFixture(1),rows=f.sheets['N-Core Register'].rows;rows[6][4]='IN_TRANSIT';
 f.ctx.transferCoreOwnership({coreId:'NC-004',expectedFromType:'NODIV_RESERVE',expectedFromId:'HQ',toType:'PIONEER',toId:'P003',newStatus:'FIELD'});
 assert.equal(rows[4][15],'P003');assert.equal(rows[6][4],'IN_TRANSIT');const before=JSON.stringify(f.sheets);
 assert.throws(()=>f.ctx.transferCoreOwnership({coreId:'NC-006',expectedFromType:'PIONEER',expectedFromId:'P003',toType:'PIONEER',toId:'P003',newStatus:'FIELD'}),/PIONEER_CAPACITY_FULL/);assert.equal(JSON.stringify(f.sheets),before);
});
test('Capacity guard validates current card capacity/status before creating ownership or transaction logs',()=>{
 for(const invalid of [0,4,'invalid','inactive']){
  const f=exchangeFixture(1),card=f.sheets['Access Card Register'].rows[2];if(invalid==='inactive')card[4]='INACTIVE';else card[6]=invalid;
  const before=JSON.stringify(f.sheets);assert.throws(()=>f.ctx.transferCoreOwnership({coreId:'NC-004',expectedFromType:'NODIV_RESERVE',expectedFromId:'HQ',toType:'PIONEER',toId:'P003',newStatus:'FIELD'}),/PIONEER_CAPACITY_INVALID/);assert.equal(JSON.stringify(f.sheets),before);
 }
});
test('Catch remains possible with one free slot and blocked when full at capacities 1, 2 and 3',()=>{
 for(const capacity of [1,2,3])for(const full of [false,true]){
  const f=catchFixture(1),rows=f.sheets['N-Core Register'].rows;f.sheets['Access Card Register'].rows.at(-1)[6]=capacity;
  for(let n=0;n<capacity-(full?0:1);n++){rows[8+n][2]='uid'+(8+n);rows[8+n][4]='FIELD';rows[8+n][14]='PIONEER';rows[8+n][15]='P009';}
  const before=JSON.stringify(f.sheets);if(full){assert.throws(f.catchPreview,/CATCHER_CAPACITY_FULL/);assert.equal(JSON.stringify(f.sheets),before);}else{const order=f.catchPreview();assert.equal(f.catchConfirm(order.catchId).status,'CATCH_COMPLETE');assert.equal(f.ctx.countCoresOwnedBy('PIONEER','P009'),capacity);}
 }
});
test('Restore capacity projection rejects an overfilled final inventory before its atomic batch',()=>{
 const f=restoreFixture();f.assign();f.restoreAuthorize();f.restoreScan(9,'IN');f.restoreScan(4,'OUT');
 const extra=f.sheets['N-Core Register'].rows[12];extra[2]='uid12';extra[4]='FIELD';extra[14]='PIONEER';extra[15]='P003';
 const before=JSON.stringify(f.sheets),b=f.batches();assert.throws(f.restoreFinish,/PIONEER_CAPACITY_FULL/);assert.equal(JSON.stringify(f.sheets),before);assert.equal(f.batches(),b);assert.equal(f.ctx.findIdentityById('P003').coreCapacity,1);
});
test('Deployment assignment and acceptance keep mission cargo HQ-owned outside a full personal inventory',()=>{
 const f=exchangeFixture(3),rows=f.sheets['N-Core Register'].rows;rows[7][2]='uid7';rows[7][4]='RESERVE';
 const assigned=f.ctx.assignCoreDeployment({parameter:{token:'a'.repeat(72),carrier:'P003',uid:'uid7',targetNode:'NODE-001'}});assert.equal(assigned.status,'DEPLOYMENT_ASSIGNED');
 const accepted=f.ctx.acceptCoreDeployment({parameter:{token:f.e.parameter.token,deployment:assigned.deployment.deploymentId}});assert.equal(accepted.status,'MISSION_CARGO_IN_TRANSIT');assert.equal(rows[7][14],'NODIV_RESERVE');assert.equal(rows[7][15],'HQ');assert.equal(rows[7][4],'IN_TRANSIT');assert.equal(f.ctx.countCoresOwnedBy('PIONEER','P003'),3);
});

function uploadFixture(capacity=1){
 const f=exchangeFixture(capacity),Sheet=f.sheets['N-Core Register'].constructor;
 f.sheets['Player Energy Ledger']=new Sheet(9,[['Entry ID','Timestamp','Identity','Role','Type','Amount','Balance After','Reference','Details']]);
 f.sheets['Upload Terminal Register'].rows.push(['UPLOAD-HQ-BAY-01','UPLOAD_HQ','uploaduid','ACTIVE']);
 for(const n of f.own)f.sheets['N-Core Register'].rows[n][13]=n*50;
 const e={parameter:{token:f.e.parameter.token,uid:'uploaduid'}};
 return {...f,uploadE:e,uploadPreview(){const r=f.ctx.getHqUploadPreview(e);e.parameter.upload=r.upload;return r},uploadAuthorize(ids){e.parameter.cores=JSON.stringify(ids);return f.ctx.normalHqUpload(e,'authorize')},uploadConfirm(){return f.ctx.normalHqUpload(e,'confirm')}};
}
test('HQ Upload commits one, partial and full inventories with exact authoritative energy, permanent ledger and receipt',()=>{
 for(const [capacity,count] of [[1,1],[2,1],[2,2],[3,1],[3,2],[3,3]]){
  const f=uploadFixture(capacity),ids=f.own.slice(0,count).map(n=>'NC-00'+n),expected=f.own.slice(0,count).reduce((sum,n)=>sum+n*50,0);
  const preview=f.uploadPreview(),before=JSON.stringify(f.sheets);assert.equal(preview.cores.length,capacity);const authorized=f.uploadAuthorize(ids);assert.equal(authorized.totalEnergy,expected);assert.equal(JSON.stringify(f.sheets),before);assert.equal(f.batches(),1);
  const receipt=f.uploadConfirm();assert.equal(receipt.status,'UPLOAD_COMPLETE');assert.equal(receipt.totalEnergy,expected);assert.equal(f.ctx.readPlayerEnergyBalance('P003'),expected);assert.equal(f.batches(),2);
  for(const n of f.own.slice(0,count)){const core=f.ctx.readCoreState('NC-00'+n);assert.equal(core.ownerType,'NODIV_RESERVE');assert.equal(core.ownerId,'HQ');assert.equal(core.status,'RESERVE');}
  const state=f.ctx.getPlayerState(f.uploadE);assert.equal(state.cores.length,capacity-count);assert.equal(state.carriedEnergy,f.own.slice(count).reduce((sum,n)=>sum+n*50,0));assert.equal(state.securedEnergy,expected);
  assert.equal(f.sheets['Player Energy Ledger'].rows.length,2);const credit=f.sheets['Player Energy Ledger'].rows[1];assert.equal(credit[5],expected);assert.equal(credit[7],receipt.upload);
  const complete=f.ctx.exchangeLogRows().filter(row=>row[2]==='HQ_UPLOAD_COMPLETE');assert.equal(complete.length,1);const durable=JSON.parse(complete[0][15]);assert.equal(durable.energyEntry,credit[0]);assert.equal(durable.securedEnergy,credit[6]);assert.equal(complete[0][12],expected);assert.equal(f.ctx.exchangeLogRows().filter(row=>row[2]==='HQ_UPLOAD_CORE').length,count);
 }
});
test('HQ Upload adds energy to prior permanent balance and ignores browser energy claims',()=>{
 const f=uploadFixture();f.sheets['Player Energy Ledger'].rows.push(['prior',new Date(),'P003','PIONEER','CREDIT',75,75,'old','']);f.uploadPreview();f.uploadAuthorize(['NC-006']);f.uploadE.parameter.energy=999999;const r=f.uploadConfirm();assert.equal(r.totalEnergy,300);assert.equal(r.securedEnergy,375);assert.equal(f.ctx.readPlayerEnergyBalance('P003'),375);
});
test('HQ Upload preview excludes transit, non-FIELD, deployments, mission and exchange reservations',()=>{
 for(const kind of ['transit','reserve','deployment','restore','fop','exchange']){
  const f=uploadFixture(),row=f.sheets['N-Core Register'].rows[6];
  if(kind==='transit')row[4]='IN_TRANSIT';if(kind==='reserve')row[4]='RESERVE';
  if(kind==='deployment')f.sheets['Deployment Register'].rows.push(['DEP','NC-006','P003','PIONEER','NODE-001','DEPLOYMENT','ASSIGNED']);
  if(kind==='restore')f.ctx.liveRestores=()=>[{id:'restore',identity:'P003',cargo:{coreId:'NC-006'},out:'NC-004',nodeCores:[]}];
  if(kind==='fop')f.ctx.readInstallationOrders=()=>[{id:'fop',nodeId:'NODE-002',eventId:'EVT-1',operation:'INSTALL',expiresAt:Date.now()+60000,loadout:[{id:'NC-006'}]}],f.ctx.installationOrderIsLive=()=>true;
  if(kind==='exchange')f.authorize();
  const before=JSON.stringify(f.sheets),r=f.uploadPreview();assert.equal(r.selectable,false,kind);assert.equal(r.cores.length,0,kind);assert.equal(JSON.stringify(f.sheets),before);
 }
});
test('HQ Upload rejects invented, foreign, duplicate and empty selections without any writes',()=>{
 for(const ids of [[],['NC-001'],['NC-999'],['NC-006','NC-006']]){
  const f=uploadFixture();f.uploadPreview();const before=JSON.stringify(f.sheets);assert.throws(()=>f.uploadAuthorize(ids),/UPLOAD_SELECTION_INVALID|UPLOAD_CORE_NOT_AUTHORIZED/);assert.equal(JSON.stringify(f.sheets),before);assert.equal(f.batches(),1);
 }
});
test('HQ Upload validates active HQ Bay and Pioneer authentication at preview and commit',()=>{
 for(const kind of ['unknown','inactive','wrong-type','non-pioneer','lost-session']){
  const f=uploadFixture();f.uploadPreview();f.uploadAuthorize(['NC-006']);
  if(kind==='unknown')f.sheets['Upload Terminal Register'].rows[1][2]='different';if(kind==='inactive')f.sheets['Upload Terminal Register'].rows[1][3]='INACTIVE';if(kind==='wrong-type')f.sheets['Upload Terminal Register'].rows[1][1]='UPLOAD_FOP';if(kind==='non-pioneer')f.uploadE.parameter.token='a'.repeat(72);if(kind==='lost-session')f.cache.delete('NODIV_SESSION_'+f.uploadE.parameter.token);
  const before=JSON.stringify(f.sheets);if(kind==='lost-session'){assert.equal(f.uploadConfirm().session,false);assert.equal(f.uploadPreview().session,false);}else{assert.throws(f.uploadConfirm,/UPLOAD_BAY_INVALID|ROLE_DENIED/);assert.throws(f.uploadPreview,/UPLOAD_BAY_INVALID|ROLE_DENIED/);}assert.equal(JSON.stringify(f.sheets),before);assert.equal(f.batches(),1);
 }
});
test('HQ Upload revalidates status, ownership, UID, actual energy, capacity-independent reservations and expiry',()=>{
 for(const kind of ['transit','foreign','uid','energy','reservation','exchange','expired']){
  const f=uploadFixture();f.uploadPreview();f.uploadAuthorize(['NC-006']);const row=f.sheets['N-Core Register'].rows[6];
  if(kind==='transit')row[4]='IN_TRANSIT';if(kind==='foreign')row[15]='P004';if(kind==='uid')row[2]='new';if(kind==='energy')row[13]=301;if(kind==='reservation')f.sheets['Deployment Register'].rows.push(['DEP','NC-006','','','','MISSION','ASSIGNED']);if(kind==='exchange')f.authorize();if(kind==='expired'){const key='NODIV_HQ_UPLOAD_'+f.uploadE.parameter.upload,o=JSON.parse(f.properties.get(key));o.expiresAt=0;f.properties.set(key,JSON.stringify(o));}
  const before=JSON.stringify(f.sheets);assert.throws(f.uploadConfirm,/UPLOAD_CORE_UNAVAILABLE|UPLOAD_SNAPSHOT_CHANGED|UPLOAD_EXPIRED/);assert.equal(JSON.stringify(f.sheets),before);assert.equal(f.batches(),1);
 }
});
test('HQ Upload retries and lost successful responses replay the durable receipt without additional transfer, credit or Ghost',()=>{
 for(const lost of [false,true]){
  const f=uploadFixture();f.uploadPreview();f.uploadAuthorize(['NC-006']);const batch=f.ctx.Sheets.Spreadsheets.batchUpdate;
  if(lost)f.ctx.Sheets.Spreadsheets.batchUpdate=(...args)=>{batch(...args);throw Error('LOST_RESPONSE')};
  if(lost)assert.throws(f.uploadConfirm,/LOST_RESPONSE/);else f.uploadConfirm();
  // Property is intentionally absent: permanent transaction data alone must replay.
  f.properties.delete('NODIV_HQ_UPLOAD_'+f.uploadE.parameter.upload);const before=JSON.stringify(f.sheets),r=f.uploadConfirm();assert.equal(r.replayed,true);assert.equal(r.totalEnergy,300);assert.equal(JSON.stringify(f.sheets),before);assert.equal(f.batches(),2);assert.equal(f.ctx.findIdentityById('P003').ghostUntil,null);
 }
});
test('HQ Upload precommit and batch failures leave ownership, ledger and success logs untouched and retryable',()=>{
 for(const kind of ['transfer','ledger','receipt','batch']){
  const f=uploadFixture(2);f.uploadPreview();f.uploadAuthorize(['NC-006','NC-005']);
  if(kind==='transfer'){const transfer=f.ctx.transferCoreOwnership;let n=0;f.ctx.transferCoreOwnership=data=>{if(++n===2)throw Error('STAGE_FAILED');return transfer(data);};}
  if(kind==='ledger')f.ctx.bookPlayerEnergy=()=>{throw Error('STAGE_FAILED')};
  if(kind==='receipt'){const log=f.ctx.appendTransactionLog;f.ctx.appendTransactionLog=(data,requests)=>{if(data.eventType==='HQ_UPLOAD_COMPLETE')throw Error('STAGE_FAILED');return log(data,requests);};}
  if(kind==='batch')f.fail();const before=JSON.stringify(f.sheets);assert.throws(f.uploadConfirm,/STAGE_FAILED|BATCH_FAILED/);assert.equal(JSON.stringify(f.sheets),before);assert.equal(f.batches(),1);assert.ok(f.properties.has('NODIV_HQ_UPLOAD_'+f.uploadE.parameter.upload));assert.equal(f.ctx.readPlayerEnergyBalance('P003'),0);
 }
});
test('HQ Upload cannot replay or use another Pioneer choice; competing previews cannot double credit',()=>{
 const f=uploadFixture(),first=f.uploadPreview();f.uploadAuthorize(['NC-006']);const second=f.uploadPreview();f.uploadAuthorize(['NC-006']);f.uploadConfirm();assert.equal(second.upload,first.upload);f.uploadE.parameter.upload=first.upload;assert.equal(f.uploadConfirm().replayed,true);assert.equal(f.batches(),2);assert.equal(f.ctx.readPlayerEnergyBalance('P003'),300);
 f.sheets['Access Card Register'].rows.push(['CARD-4','P004','PIONEER','p4','ACTIVE','',1,true]);const token='4'.repeat(72);f.cache.set('NODIV_SESSION_'+token,JSON.stringify({identity:'P004',role:'PIONEER',cardId:'CARD-4'}));f.uploadE.parameter.token=token;f.uploadE.parameter.upload=second.upload;assert.throws(f.uploadConfirm,/UPLOAD_SESSION_MISMATCH/);assert.equal(f.batches(),2);
});
test('Ledger batch extension stages append-only entries without writes and keeps cumulative balances coherent',()=>{
 const f=uploadFixture(),requests=[],before=JSON.stringify(f.sheets);const a=f.ctx.bookPlayerEnergy({identity:'P003',role:'PIONEER',type:'CREDIT',amount:10},requests),b=f.ctx.bookPlayerEnergy({identity:'P003',role:'PIONEER',type:'CREDIT',amount:20},requests);assert.equal(a.balance,10);assert.equal(b.before,10);assert.equal(b.balance,30);assert.equal(JSON.stringify(f.sheets),before);f.ctx.Sheets.Spreadsheets.batchUpdate({requests},'spreadsheet');assert.equal(f.ctx.readPlayerEnergyBalance('P003'),30);
 assert.equal(f.ctx.bookPlayerEnergy({identity:'P003',role:'PIONEER',type:'CREDIT',amount:5}).balance,35);assert.throws(()=>f.ctx.bookPlayerEnergy({identity:'P003',role:'PIONEER',type:'CREDIT',amount:0}),/ungültig/);
});
test('HQ Upload requires explicit authorization, validates energies and uses visible fallback only when actual is absent',()=>{
 const f=uploadFixture();f.uploadPreview();const before=JSON.stringify(f.sheets);assert.throws(f.uploadConfirm,/UPLOAD_AUTHORIZATION_REQUIRED/);assert.equal(JSON.stringify(f.sheets),before);
 for(const actual of [NaN,-1,Infinity]){const g=uploadFixture();g.sheets['N-Core Register'].rows[6][13]=actual;const before=JSON.stringify(g.sheets);assert.throws(g.uploadPreview,/UPLOAD_ENERGY_INVALID/);assert.equal(JSON.stringify(g.sheets),before);assert.equal(g.batches(),0);}
 for(const actual of ['',0]){const g=uploadFixture();g.sheets['N-Core Register'].rows[6][13]=actual;g.uploadPreview();g.uploadAuthorize(['NC-006']);assert.equal(g.uploadConfirm().totalEnergy,actual===''?341:0);assert.equal(g.ctx.readPlayerEnergyBalance('P003'),actual===''?341:0);}
});
test('HQ Upload retry after rejected batch commits once with ownership, ledger and receipt in the same request',()=>{
 const f=uploadFixture(3);f.uploadPreview();f.uploadAuthorize(['NC-006','NC-005','NC-004']);const batch=f.ctx.Sheets.Spreadsheets.batchUpdate;let first=true,captured;
 f.ctx.Sheets.Spreadsheets.batchUpdate=(body,id)=>{captured=body.requests;if(first){first=false;throw Error('BATCH_REJECTED');}return batch(body,id);};const before=JSON.stringify(f.sheets);assert.throws(f.uploadConfirm,/BATCH_REJECTED/);assert.equal(JSON.stringify(f.sheets),before);
 const receipt=f.uploadConfirm();assert.equal(receipt.totalEnergy,750);assert.equal(f.batches(),2);assert.ok(captured.some(r=>r.updateCells?.start.sheetId===1));assert.ok(captured.some(r=>r.appendCells?.sheetId===9));assert.ok(captured.some(r=>r.appendCells?.sheetId===5));assert.equal(f.ctx.readPlayerEnergyBalance('P003'),750);assert.equal(f.ctx.getPlayerState(f.uploadE).cores.length,0);
 assert.equal(f.uploadConfirm().replayed,true);assert.equal(f.batches(),2);
});

function reSupplyFixture({capacity=1,second=false}={}){
 const f=uploadFixture(capacity),rows=f.sheets['N-Core Register'].rows;
 for(const n of f.own){rows[n][14]='NODIV_RESERVE';rows[n][15]='HQ';rows[n][4]='RESERVE';}
 for(const [n,energy] of [[1,100],[2,250],[3,350],[4,80],[5,120],[6,200]])rows[n][1]=rows[n][13]=energy;
 if(second){enableNode(f,'NODE-002','F001',true);for(const n of [4,5,6]){rows[n][14]='NODE';rows[n][15]='NODE-002';rows[n][4]='DEPLOYED';}}
 for(const [n,energy] of [[7,50],[8,100],[9,105],[10,400]]){rows[n][2]='uid'+n;rows[n][1]=rows[n][13]=energy;rows[n][4]='RESERVE';}
 const e={parameter:{token:f.e.parameter.token}};
 return {...f,reSupplyE:e,reSupplyState:()=>f.ctx.normalReSupply(e,'state'),reSupplyAssign(){const r=f.ctx.normalReSupply(e,'assign');e.parameter.resupply=r.resupply;e.parameter.node=r.nodeId;return r},reSupplyAccept(n){e.parameter.uid='uid'+n;return f.ctx.normalReSupply(e,'accept')},reSupplyTarget(){e.parameter.uid=e.parameter.node==='NODE-001'?'nodeuid':'nodeuid2';return f.ctx.getGameplayRoute(e)},reSupplyAuthorize:()=>f.ctx.normalReSupply(e,'authorize'),reSupplyScan(n,phase){e.parameter.uid='uid'+n;e.parameter.phase=phase;return f.ctx.normalReSupply(e,'scan')},reSupplyConfirm:()=>f.ctx.normalReSupply(e,'confirm')};
}
function readyReSupply(f){const r=f.reSupplyAssign();const order=JSON.parse(f.properties.get('NODIV_RESUPPLY_'+r.resupply));f.reSupplyAccept(Number(order.cargo.coreId.slice(3)));f.reSupplyTarget();f.reSupplyAuthorize();f.reSupplyScan(Number(order.cargo.coreId.slice(3)),'IN');f.reSupplyScan(Number(order.out.slice(3)),'OUT');return order;}
test('Re-Supply eligibility counts FIELD only, rejects personal Cores, invalid role/event and colliding cargo',()=>{
 const f=reSupplyFixture();assert.ok(f.reSupplyState().resupply);const gTransit=reSupplyFixture(),row=gTransit.sheets['N-Core Register'].rows[12];row[2]='uid12';row[14]='PIONEER';row[15]='P003';row[4]='IN_TRANSIT';assert.ok(gTransit.reSupplyState().resupply);const personal=reSupplyFixture();const owned=personal.sheets['N-Core Register'].rows[12];owned[2]='uid12';owned[14]='PIONEER';owned[15]='P003';owned[4]='FIELD';assert.equal(personal.reSupplyState().status,'RESUPPLY_PERSONAL_CORE_PRESENT');assert.throws(personal.reSupplyAssign,/RESUPPLY_PERSONAL_CORE_PRESENT/);assert.equal(personal.batches(),0);
 const g=reSupplyFixture();g.sheets['Deployment Register'].rows.push(['OTHER','NC-007','P003','PIONEER','NODE-001','DEPLOYMENT','ASSIGNED']);assert.equal(g.reSupplyState().status,'MISSION_CARGO_ALREADY_ACTIVE');g.sheets['Event Register'].rows[1][1]='COMPLETED';assert.equal(g.reSupplyState().status,'EVENT_NOT_FIELD_ACTIVE');g.reSupplyE.parameter.token='a'.repeat(72);assert.throws(g.reSupplyState,/PIONEER_REQUIRED/);
});
test('Re-Supply selects weakest eligible Event Node and smallest non-degrading HQ Core, with strongest fallback and deterministic ties',()=>{
 const f=reSupplyFixture({second:true});f.reSupplyE.parameter.node='NODE-999';f.reSupplyE.parameter.core='NC-010';const r=f.reSupplyAssign();assert.equal(r.nodeId,'NODE-002');assert.equal(r.inCore.id,'NC-008');assert.equal(r.outCore,undefined);assert.equal(r.accessCode,undefined);assert.equal(f.ctx.readCoreState('NC-008').status,'IN_TRANSIT');assert.equal(f.ctx.readCoreState('NC-008').ownerId,'HQ');
 const select=f.ctx.selectReSupplyCore,out={visibleEnergy:120},cores=[{coreId:'NC-003',visibleEnergy:110},{coreId:'NC-002',visibleEnergy:110},{coreId:'NC-004',visibleEnergy:50}];assert.equal(select(out,cores).coreId,'NC-002');assert.equal(select({visibleEnergy:100},cores).coreId,'NC-002');
});
test('Re-Supply avoids immediately repeated target with alternative, permits sole target and excludes invalid/foreign Nodes',()=>{
 const f=reSupplyFixture({second:true});f.sheets['Transaction Log'].rows.push(['previous',new Date(),'RESUPPLY_COMPLETE','P004','PIONEER','','','','','','','','','NODE-002','SUCCESS','previous']);assert.equal(f.reSupplyAssign().nodeId,'NODE-001');
 const g=reSupplyFixture();g.sheets['Transaction Log'].rows.push(['previous',new Date(),'RESUPPLY_COMPLETE','P004','PIONEER','','','','','','','','','NODE-001','SUCCESS','previous']);assert.equal(g.reSupplyAssign().nodeId,'NODE-001');
 for(const mutate of [f=>f.sheets['Event Node Codes'].rows.pop(),f=>f.sheets['N-Core Register'].rows[6][15]='HQ',f=>f.sheets['Node Register'].rows[2][2]='OFFLINE']){const h=reSupplyFixture({second:true});mutate(h);assert.equal(h.reSupplyAssign().nodeId,'NODE-001');}
});
test('Re-Supply cargo is HQ-owned, protected from catch/upload/exchange/transfers, slot-free and reserves the Node against FOP/Restore',()=>{
 const f=reSupplyFixture(),r=f.reSupplyAssign(),id=r.inCore.id;assert.equal(f.ctx.getPlayerState(f.reSupplyE).cores.length,0);assert.equal(f.ctx.getPlayerState(f.reSupplyE).securedEnergy,0);assert.equal(f.ctx.findActiveDeploymentForCarrier('P003','PIONEER').purpose,'RESUPPLY');
 assert.equal(f.ctx.getHqUploadPreview({parameter:{token:f.reSupplyE.parameter.token,uid:'uploaduid'}}).cores.length,0);assert.throws(()=>f.ctx.exchangePreview(f.reSupplyE,f.ctx.findIdentityById('P003'),'NODE-001'),/RESUPPLY_OPERATION_RESERVED/);assert.throws(()=>f.ctx.getNodeDeinstallOrder({parameter:{token:'a'.repeat(72),node:'NODE-001'}}),/RESUPPLY_OPERATION_RESERVED/);assert.equal(f.ctx.getFopOperations({parameter:{token:'a'.repeat(72)}}).operations.length,0);
 assert.throws(()=>f.ctx.transferCoreOwnership({coreId:id,expectedFromType:'NODIV_RESERVE',expectedFromId:'HQ',toType:'PIONEER',toId:'P003',newStatus:'FIELD'}),/RESUPPLY_OPERATION_RESERVED/);assert.equal(f.ctx.deliverCoreDeployment({parameter:{token:f.reSupplyE.parameter.token,uid:'nodeuid'}}).status,'RESUPPLY_WORKFLOW_REQUIRED');
 assert.equal(f.ctx.getNodeAccessAuthorization(f.ctx.findIdentityById('P003'),'NODE-001','INSTALLED').reason,'RESUPPLY_OPERATION_RESERVED');
});
test('Re-Supply requires physical HQ pickup, correct target scan, authorization, fixed IN/lowest OUT and idempotent scan retries',()=>{
 const f=reSupplyFixture({second:true}),r=f.reSupplyAssign();assert.throws(f.reSupplyAuthorize,/RESUPPLY_SESSION_NODE_MISMATCH/);assert.throws(()=>f.reSupplyAccept(10),/RESUPPLY_HQ_CORE_REQUIRED/);f.reSupplyAccept(8);
 f.reSupplyE.parameter.uid='nodeuid';const wrong=f.ctx.getGameplayRoute(f.reSupplyE);assert.equal(wrong.decision.allowed,false);assert.equal(wrong.decision.reason,'RESUPPLY_WRONG_NODE');assert.equal(wrong.resupplyMission,undefined);
 const target=f.reSupplyTarget().resupplyMission;assert.equal(target.accessCode,undefined);assert.equal(target.outCore.id,'NC-004');assert.match(f.reSupplyAuthorize().accessCode,/^\d{4}$/);assert.throws(()=>f.reSupplyScan(5,'OUT'),/LOWEST_NODE_CORE_REQUIRED/);assert.throws(()=>f.reSupplyScan(4,'OUT'),/PHASE_MISMATCH/);assert.throws(()=>f.reSupplyScan(10,'IN'),/TRANSIT_CORE_REQUIRED/);
 const before=JSON.stringify(f.sheets);assert.equal(f.reSupplyScan(8,'IN').inCount,1);assert.equal(f.reSupplyScan(8,'IN').replayed,true);assert.throws(()=>f.reSupplyScan(8,'OUT'),/DUPLICATE_CORE_SCAN/);assert.throws(f.reSupplyConfirm,/SCANS_INCOMPLETE/);assert.equal(f.reSupplyScan(4,'OUT').canConfirm,true);assert.equal(f.reSupplyScan(4,'OUT').replayed,true);assert.equal(JSON.stringify(f.sheets),before);assert.equal(r.resupply,f.reSupplyE.parameter.resupply);
});
test('Re-Supply final batch keeps Node 3/3, grants exactly one personal FIELD Core at unchanged capacity and no energy/progression/lock',()=>{
 for(const capacity of [1,2,3]){const f=reSupplyFixture({capacity}),order=readyReSupply(f),beforeEnergy=f.ctx.readPlayerEnergyBalance('P003'),b=f.batches(),r=f.reSupplyConfirm();assert.equal(r.status,'RESUPPLY_COMPLETE');assert.equal(r.acquiredCore.id,order.out);assert.equal(f.ctx.countCoresOwnedBy('NODE',order.nodeId),3);assert.equal(f.ctx.readCoreState(order.cargo.coreId).ownerType,'NODE');assert.equal(f.ctx.readCoreState(order.cargo.coreId).status,'DEPLOYED');assert.equal(f.ctx.getPlayerState(f.reSupplyE).cores.length,1);assert.equal(f.ctx.readCoreState(order.out).status,'FIELD');assert.equal(f.ctx.findIdentityById('P003').coreCapacity,capacity);assert.equal(f.ctx.readPlayerEnergyBalance('P003'),beforeEnergy);assert.equal(f.sheets['Deployment Register'].rows[1][6],'COMPLETED');assert.equal(f.batches(),b+1);assert.equal(f.ctx.liveReSupplies().length,0);assert.equal(f.ctx.getNodeAccessAuthorization(f.ctx.findIdentityById('P003'),order.nodeId,'INSTALLED').allowed,true);const logs=f.ctx.exchangeLogRows();assert.equal(logs.filter(row=>row[2]==='RESUPPLY_COMPLETE').length,1);assert.ok(!logs.some(row=>/^RESTORE_|NORMAL_EXCHANGE/.test(row[2])));const before=JSON.stringify(f.sheets);assert.equal(f.reSupplyConfirm().replayed,true);assert.equal(JSON.stringify(f.sheets),before);}
});
test('Re-Supply lost commit response safely replays after missing property; conflicting or foreign requests cannot transfer again',()=>{
 const f=reSupplyFixture(),order=readyReSupply(f),batch=f.ctx.Sheets.Spreadsheets.batchUpdate,b=f.batches();f.ctx.Sheets.Spreadsheets.batchUpdate=(...args)=>{batch(...args);throw Error('LOST_RESPONSE')};assert.throws(f.reSupplyConfirm,/LOST_RESPONSE/);f.properties.delete('NODIV_RESUPPLY_'+order.id);const before=JSON.stringify(f.sheets);assert.equal(f.reSupplyConfirm().replayed,true);assert.equal(JSON.stringify(f.sheets),before);assert.equal(f.batches(),b+1);f.reSupplyE.parameter.node='NODE-002';assert.throws(f.reSupplyConfirm,/NODE_MISMATCH/);f.reSupplyE.parameter.token='a'.repeat(72);assert.throws(f.reSupplyConfirm,/PIONEER_REQUIRED/);
});
test('Re-Supply revalidates Event, Node fingerprint, personal count, Core UID/ownership/energy and deployment before atomic final write',()=>{
 for(const mutate of [f=>f.sheets['Event Register'].rows[1][0]='OTHER',f=>f.sheets['Node Register'].rows[1][1]='replaced',f=>f.sheets['N-Core Register'].rows[2][1]=251,f=>f.sheets['N-Core Register'].rows[8][2]='replaced',f=>{const row=f.sheets['N-Core Register'].rows[12];row[2]='u12';row[14]='PIONEER';row[15]='P003';row[4]='FIELD';},f=>f.sheets['Deployment Register'].rows.push(['OTHER','NC-001','','','','DEPLOYMENT','ASSIGNED']),f=>f.reSupplyE.parameter.node='NODE-999']){
  const f=reSupplyFixture();readyReSupply(f);mutate(f);const before=JSON.stringify(f.sheets),b=f.batches();assert.throws(f.reSupplyConfirm);assert.equal(JSON.stringify(f.sheets),before);assert.equal(f.batches(),b);
 }
});
test('Re-Supply failed assignment/pickup/final batches and precommit staging failures never partially mutate Sheets',()=>{
 for(const stage of ['assign','accept','confirm','transfer']){const f=reSupplyFixture();if(stage==='accept')f.reSupplyAssign();if(['confirm','transfer'].includes(stage))readyReSupply(f);const before=JSON.stringify(f.sheets);if(stage==='transfer'){const transfer=f.ctx.stageValidatedExchangeTransfer;let n=0;f.ctx.stageValidatedExchangeTransfer=(...args)=>{if(++n===2)throw Error('STAGE_FAILED');return transfer(...args);};}else f.fail();assert.throws(()=>stage==='assign'?f.reSupplyAssign():stage==='accept'?f.reSupplyAccept(8):f.reSupplyConfirm(),/BATCH_FAILED|STAGE_FAILED/);assert.equal(JSON.stringify(f.sheets),before);}
});
test('Re-Supply recovery rebinds sessions at 0/0, 1/0 and 1/1; expires with atomic cargo release',()=>{
 for(const count of [0,1,2]){const f=reSupplyFixture(),r=f.reSupplyAssign();f.reSupplyAccept(8);f.reSupplyTarget();f.reSupplyAuthorize();if(count>0)f.reSupplyScan(8,'IN');if(count>1)f.reSupplyScan(1,'OUT');const old=f.reSupplyE.parameter.token,token='9'.repeat(72);f.cache.delete('NODIV_SESSION_'+old);f.cache.set('NODIV_SESSION_'+token,JSON.stringify({identity:'P003',role:'PIONEER',cardId:'CARD-003'}));f.reSupplyE.parameter.token=token;const before=JSON.stringify(f.sheets),resumed=f.reSupplyTarget().resupplyMission;assert.equal(resumed.resupply,r.resupply);assert.equal(resumed.inCount,count?1:0);assert.equal(resumed.outCount,count===2?1:0);assert.match(resumed.accessCode,/^\d{4}$/);assert.equal(JSON.stringify(f.sheets),before);if(count===0)f.reSupplyScan(8,'IN');if(count<2)f.reSupplyScan(1,'OUT');assert.equal(f.reSupplyConfirm().status,'RESUPPLY_COMPLETE');}
 const f=reSupplyFixture(),r=f.reSupplyAssign(),key='NODIV_RESUPPLY_'+r.resupply,order=JSON.parse(f.properties.get(key));order.expiresAt=0;f.properties.set(key,JSON.stringify(order));assert.equal(f.ctx.liveReSupplies().length,0);f.ctx.cleanupReSupplies();assert.equal(f.ctx.readCoreState('NC-008').status,'RESERVE');assert.equal(f.sheets['Deployment Register'].rows[1][6],'EXPIRED');assert.equal(f.properties.has(key),false);
});
test('Re-Supply accepts via existing deployment endpoint and lost HQ pickup response replays without a second acceptance log',()=>{
 const f=reSupplyFixture(),r=f.reSupplyAssign(),batch=f.ctx.Sheets.Spreadsheets.batchUpdate;let lost=true;f.ctx.Sheets.Spreadsheets.batchUpdate=(...args)=>{batch(...args);if(lost){lost=false;throw Error('LOST_PICKUP_RESPONSE');}};
 const e={parameter:{token:f.reSupplyE.parameter.token,deployment:r.resupply,uid:'uid8'}};assert.throws(()=>f.ctx.acceptCoreDeployment(e),/LOST_PICKUP_RESPONSE/);const b=f.batches();assert.equal(f.ctx.acceptCoreDeployment(e).accepted,true);assert.equal(f.batches(),b);assert.equal(f.ctx.exchangeLogRows().filter(row=>row[2]==='RESUPPLY_ACCEPTED').length,1);assert.ok(f.reSupplyTarget().resupplyMission);assert.equal(f.ctx.liveReSupplies().length,1);
});
test('Re-Supply rotates targets after a real isolated complete/upload cycle without repeat or inventory manipulation',()=>{
 const f=reSupplyFixture({second:true});const first=readyReSupply(f);assert.equal(first.nodeId,'NODE-002');f.reSupplyConfirm();f.uploadPreview();f.uploadAuthorize([first.out]);f.uploadConfirm();const second=f.reSupplyAssign();assert.equal(second.nodeId,'NODE-001');assert.equal(f.ctx.getPlayerState(f.reSupplyE).cores.length,0);assert.equal(f.ctx.liveReSupplies().length,1);
});
test('Re-Supply mission cannot be stolen by another authenticated Pioneer and blocks colliding Restore/Deployment assignments',()=>{
 const f=reSupplyFixture(),r=f.reSupplyAssign();f.sheets['Access Card Register'].rows.push(['CARD-4','P004','PIONEER','p4','ACTIVE','',1,true]);const token='4'.repeat(72);f.cache.set('NODIV_SESSION_'+token,JSON.stringify({identity:'P004',role:'PIONEER',cardId:'CARD-4'}));const before=JSON.stringify(f.sheets);
 assert.throws(()=>f.ctx.normalReSupply({parameter:{token,resupply:r.resupply,uid:'uid8'}},'accept'),/RESUPPLY_SESSION_MISMATCH/);const route=f.ctx.getGameplayRoute({parameter:{token,uid:'nodeuid'}});assert.equal(route.decision.reason,'RESUPPLY_OPERATION_RESERVED');assert.equal(route.resupplyMission,undefined);assert.equal(JSON.stringify(f.sheets),before);
 f.sheets['Access Card Register'].rows.push(['ROOT','ROOT','FOUNDER','root','ACTIVE','',0,true]);const root='d'.repeat(72);f.cache.set('NODIV_SESSION_'+root,JSON.stringify({identity:'ROOT',role:'FOUNDER',cardId:'ROOT'}));f.sheets['Transaction Log'].rows.push(['eligible',new Date(),'RESTORE_1_ELIGIBLE','P003','PIONEER','','','','','','','','','NODE-001','SUCCESS','e']);assert.throws(()=>f.ctx.assignRestoreOne({parameter:{token:root,pioneer:'P003'}}),/RESUPPLY_OPERATION_RESERVED/);assert.throws(()=>f.ctx.assignCoreDeployment({parameter:{token:root,carrier:'P003',uid:'uid9',targetNode:'NODE-001'}}),/RESUPPLY_OPERATION_RESERVED/);
});
test('Re-Supply excludes competing incoming Deployment targets and revalidates new conflicts before confirming',()=>{
 const f=reSupplyFixture({second:true});f.sheets['Deployment Register'].rows.push(['OTHER','NC-010','P004','PIONEER','NODE-002','DEPLOYMENT','ASSIGNED']);assert.equal(f.reSupplyAssign().nodeId,'NODE-001');
 const g=reSupplyFixture();readyReSupply(g);g.sheets['Deployment Register'].rows.push(['OTHER','NC-010','P004','PIONEER','NODE-001','DEPLOYMENT','ASSIGNED']);const before=JSON.stringify(g.sheets);assert.throws(g.reSupplyConfirm,/RESUPPLY_NODE_RESERVED/);assert.equal(JSON.stringify(g.sheets),before);
});
test('Parallel Re-Supply assignments reserve disjoint Nodes and HQ Cores and cannot create a second mission for one Pioneer',()=>{
 const f=reSupplyFixture({second:true}),first=f.reSupplyAssign(),b=f.batches(),before=JSON.stringify(f.sheets),retry=f.reSupplyAssign();assert.equal(retry.resupply,first.resupply);assert.equal(f.batches(),b);assert.equal(JSON.stringify(f.sheets),before);
 f.sheets['Access Card Register'].rows.push(['CARD-4','P004','PIONEER','p4','ACTIVE','',3,true]);const token='4'.repeat(72);f.cache.set('NODIV_SESSION_'+token,JSON.stringify({identity:'P004',role:'PIONEER',cardId:'CARD-4'}));const second=f.ctx.normalReSupply({parameter:{token,node:first.nodeId,core:first.inCore.id}},'assign');assert.notEqual(second.nodeId,first.nodeId);assert.notEqual(second.inCore.id,first.inCore.id);assert.equal(f.ctx.liveReSupplies().length,2);assert.equal(f.ctx.countCoresOwnedBy('PIONEER','P004'),0);
});
test('Re-Supply fixed lowest OUT has deterministic ties; forged IN/OUT fields never override the server snapshot',()=>{
 const f=reSupplyFixture();f.sheets['N-Core Register'].rows[2][1]=100;const order=readyReSupply(f);assert.equal(order.out,'NC-001');f.reSupplyE.parameter.out='NC-002';f.reSupplyE.parameter.inCore='NC-010';const r=f.reSupplyConfirm();assert.equal(r.acquiredCore.id,'NC-001');assert.equal(f.ctx.readCoreState('NC-002').ownerType,'NODE');assert.equal(f.ctx.readCoreState('NC-010').ownerType,'NODIV_RESERVE');assert.equal(f.ctx.countCoresOwnedBy('NODE','NODE-001'),3);
});

 test('Re-Supply state automatically assigns once at capacity 3 and reuses the exact mission on reload without writes',()=>{
 const f=reSupplyFixture({capacity:3}),first=f.reSupplyState(),before=JSON.stringify(f.sheets),b=f.batches(),properties=JSON.stringify([...f.properties]);assert.equal(first.status,'RESUPPLY_MISSION');assert.ok(first.resupply);assert.equal(b,1);
 for(let i=0;i<3;i++){const again=f.reSupplyState();assert.equal(again.resupply,first.resupply);assert.equal(again.inCore.id,first.inCore.id);assert.equal(again.nodeId,first.nodeId);assert.equal(f.batches(),b);assert.equal(JSON.stringify(f.sheets),before);assert.equal(JSON.stringify([...f.properties]),properties);}
 assert.equal(f.sheets['Deployment Register'].rows.slice(1).filter(row=>row[5]==='RESUPPLY').length,1);assert.equal(f.ctx.exchangeLogRows().filter(row=>row[2]==='RESUPPLY_ASSIGNED').length,1);assert.equal(f.sheets['N-Core Register'].rows.slice(1).filter(row=>row[4]==='IN_TRANSIT').length,1);
 });
 test('Re-Supply target uses globally lowest visible Core rather than Node total energy',()=>{
 const f=reSupplyFixture({second:true});for(const [n,e] of [[1,50],[2,400],[3,450]])f.sheets['N-Core Register'].rows[n][1]=f.sheets['N-Core Register'].rows[n][13]=e;assert.equal(f.reSupplyState().nodeId,'NODE-001');
 });
 test('Re-Supply target rotation uses successful completion, never a merely assigned target',()=>{
 const f=reSupplyFixture({second:true});f.sheets['Transaction Log'].rows.push(['completed',new Date(),'RESUPPLY_COMPLETE','P004','PIONEER','','','','','','','','','NODE-002','SUCCESS','receipt'],['assigned',new Date(),'RESUPPLY_ASSIGNED','P004','PIONEER','','','','','','','','','NODE-001','SUCCESS','order']);assert.equal(f.reSupplyState().nodeId,'NODE-001');
 });
 test('Re-Supply automatic assignment survives lost response without second reservation or batch',()=>{
 const f=reSupplyFixture({capacity:3}),batch=f.ctx.Sheets.Spreadsheets.batchUpdate;f.ctx.Sheets.Spreadsheets.batchUpdate=(...args)=>{batch(...args);throw Error('LOST_RESPONSE')};assert.throws(f.reSupplyState,/LOST_RESPONSE/);const order=JSON.parse([...f.properties].find(([key])=>key.startsWith('NODIV_RESUPPLY_'))[1]),before=JSON.stringify(f.sheets);const r=f.reSupplyState();assert.equal(r.resupply,order.id);assert.equal(r.inCore.id,order.cargo.coreId);assert.equal(f.batches(),1);assert.equal(JSON.stringify(f.sheets),before);
 });

test('Automatic Re-Supply state rejects inactive Pioneers and zero capacity without any reservation',()=>{
 for(const mutate of [f=>f.sheets['Access Card Register'].rows.find(row=>row[1]==='P003')[4]='INACTIVE',f=>f.sheets['Access Card Register'].rows.find(row=>row[1]==='P003')[6]=0]){
  const f=reSupplyFixture({capacity:3});mutate(f);const before=JSON.stringify(f.sheets);const result=f.reSupplyState();assert.equal(Boolean(result.resupply),false);assert.equal(JSON.stringify(f.sheets),before);assert.equal(f.batches(),0);assert.equal(f.ctx.reSupplyOrders().length,0);
 }
});
test('Automatic Re-Supply state without a suitable Node or HQ Core creates no partial reservation',()=>{
 for(const mutate of [f=>f.sheets['Event Node Codes'].rows.splice(1),f=>{for(const row of f.sheets['N-Core Register'].rows.slice(1))if(row[14]==='NODIV_RESERVE')row[4]='OFFLINE';}]){
  const f=reSupplyFixture({capacity:3});mutate(f);const before=JSON.stringify(f.sheets),result=f.reSupplyState();assert.equal(result.status,'NO_SUITABLE_RESUPPLY_TARGET_OR_CORE');assert.equal(result.action,false);assert.equal(JSON.stringify(f.sheets),before);assert.equal(f.batches(),0);assert.equal(f.ctx.reSupplyOrders().length,0);
 }
});


function eventLifecycleFixture(provisioned=15){
 const f=fixture();f.sheets['Event Register'].rows=[[]];f.sheets['Event Node Codes'].rows=[[]];
 f.sheets['Node Register'].rows=[[],...Array.from({length:provisioned},(_,i)=>['NODE-'+String(i+1).padStart(3,'0'),'nodeuid'+(i+1),'AVAILABLE'])];
 for(let n=1;n<=40;n++)f.sheets['N-Core Register'].rows[n][2]='uid'+n;
 f.sheets['Access Card Register'].rows.push(['ROOT','ROOT','FOUNDER','rootuid','ACTIVE','',0,true]);const token='d'.repeat(72);f.cache.set('NODIV_SESSION_'+token,JSON.stringify({identity:'ROOT',role:'FOUNDER',cardId:'ROOT'}));
 // Isolate event membership from the separately tested real Preflight workflow.
 f.ctx.getEventReadiness=()=>({ok:true,authenticated:true,ready:true});let seq=0;f.ctx.Utilities.getUuid=()=>String(++seq).padStart(8,'0')+'-0000-0000-0000-000000000000';
 const founder={parameter:{token}},initialize=nodes=>f.ctx.initializeEvent({parameter:{token,...(nodes!==undefined?{nodes}:{})}});
 function install(nodeId){f.e.parameter.node=nodeId;const order=f.order();for(const core of order.loadout){f.e.parameter.uid=f.ctx.readCoreState(core.id).uid;f.ctx.scanNodeInstallationCore(f.e);}return f.ctx.confirmNodeInstallation(f.e);}
 function expand(nodeId){return f.ctx.expandEventNode({parameter:{token,event:f.ctx.readCurrentEvent().eventId,node:nodeId}});}
 function remove(nodeId){f.e.parameter.node=nodeId;const order=f.ctx.getNodeDeinstallOrder(f.e);f.e.parameter.installation=order.installation;for(const core of order.loadout){f.e.parameter.uid=f.ctx.readCoreState(core.id).uid;f.ctx.scanNodeDeinstallationCore(f.e);}return f.ctx.confirmNodeDeinstallation(f.e);}
 function start(){initialize();for(let n=1;n<=10;n++)install('NODE-'+String(n).padStart(3,'0'));assert.equal(f.ctx.activateEvent(founder).status,'FIELD_ACTIVE');}
 return {...f,founder,initialize,install,expand,remove,start};
}
test('10+2 initialize deterministically selects exactly 10 of 15 physical Nodes, keeps reserve untouched and writes planned 10 active 0',()=>{
 const f=eventLifecycleFixture(),reserve=JSON.stringify(f.sheets['Node Register'].rows.slice(11)),r=f.initialize();assert.equal(r.event.nodes.length,10);assert.deepEqual(Array.from(r.event.nodes),Array.from({length:10},(_,i)=>'NODE-'+String(i+1).padStart(3,'0')));assert.equal(f.ctx.readCurrentEvent().plannedNodes,10);assert.equal(f.ctx.readCurrentEvent().activeNodes,0);assert.equal(f.sheets['Event Node Codes'].rows.length,11);assert.ok(f.sheets['Event Node Codes'].rows.slice(1).every(row=>row[9]==='ASSIGNED_FOR_INSTALL'));assert.equal(JSON.stringify(f.sheets['Node Register'].rows.slice(11)),reserve);
});
test('10+2 initialize rejects fewer provisioned Nodes, 9/11 selections, duplicates and unknown Nodes without writes',()=>{
 const ids=Array.from({length:10},(_,i)=>'NODE-'+String(i+1).padStart(3,'0'));
 for(const [count,nodes,reason] of [[9,undefined,/10_PROVISIONED/],[15,ids.slice(0,9).join(','),/EXACTLY_10/],[15,[...ids,'NODE-011'].join(','),/EXACTLY_10/],[15,[...ids.slice(0,9),'NODE-001'].join(','),/DUPLICATE/],[15,[...ids.slice(0,9),'NODE-099'].join(','),/Nicht provisionierte/]]){const f=eventLifecycleFixture(count),before=JSON.stringify(f.sheets);assert.throws(()=>f.initialize(nodes),reason);assert.equal(JSON.stringify(f.sheets),before);assert.equal(f.batches(),0);}
 const f=eventLifecycleFixture();assert.equal(f.initialize(ids.slice().reverse().join(',')).status,'EVENT_INITIALIZED');
});
test('10+2 initialization batch failure leaves no event, code rows or success log',()=>{
 const f=eventLifecycleFixture(),before=JSON.stringify(f.sheets);f.fail();assert.throws(f.initialize,/BATCH_FAILED/);assert.equal(JSON.stringify(f.sheets),before);assert.equal(f.ctx.readCurrentEvent(),null);
});
test('10+2 activation requires all 10 Start Nodes with 3 Cores; unselected reserve does not block',()=>{
 const f=eventLifecycleFixture();f.initialize();for(let n=1;n<=9;n++)f.install('NODE-'+String(n).padStart(3,'0'));assert.equal(f.ctx.activateEvent(f.founder).status,'NODES_NOT_INSTALLED');assert.equal(f.ctx.readCurrentEvent().activeNodes,0);f.install('NODE-010');const extra=f.sheets['N-Core Register'].rows[40];extra[14]='NODE';extra[15]='NODE-010';assert.equal(f.ctx.activateEvent(f.founder).status,'NODES_NOT_INSTALLED');extra[14]='NODIV_RESERVE';extra[15]='HQ';assert.equal(f.ctx.activateEvent(f.founder).status,'FIELD_ACTIVE');assert.equal(f.ctx.readCurrentEvent().activeNodes,10);assert.equal(f.sheets['Node Register'].rows[11][2],'AVAILABLE');
});
test('10+2 expansion is idempotent, stays inactive until FOP 3/3 confirm and blocks a thirteenth Event Node',()=>{
 const f=eventLifecycleFixture();f.start();const reserve=JSON.stringify(f.sheets['Node Register'].rows.slice(11));const first=f.expand('NODE-011');assert.equal(first.plannedNodes,11);assert.equal(first.activeNodes,10);assert.equal(f.ctx.findEventNodeCode(first.eventId,'NODE-011').changeStatus,'ASSIGNED_FOR_INSTALL');const before=JSON.stringify(f.sheets),b=f.batches();assert.equal(f.expand('NODE-011').replayed,true);assert.equal(f.expand('NODE-001').replayed,true);assert.equal(JSON.stringify(f.sheets),before);assert.equal(f.batches(),b);assert.equal(JSON.stringify(f.sheets['Node Register'].rows.slice(11)),reserve);
 assert.ok(f.ctx.getFopOperations(f.e).operations.some(o=>o.nodeId==='NODE-011'&&o.type==='INSTALL'));f.e.parameter.node='NODE-011';const order=f.order();for(const core of order.loadout){f.e.parameter.uid=f.ctx.readCoreState(core.id).uid;f.ctx.scanNodeInstallationCore(f.e);}assert.equal(f.ctx.readCurrentEvent().activeNodes,10);assert.equal(f.ctx.confirmNodeInstallation(f.e).status,'NODE_INSTALLED');assert.equal(f.ctx.readCurrentEvent().activeNodes,11);assert.equal(f.ctx.countCoresOwnedBy('NODE','NODE-011'),3);
 assert.equal(f.expand('NODE-012').plannedNodes,12);const unchanged=JSON.stringify(f.sheets);assert.throws(()=>f.expand('NODE-013'),/LIMIT_12/);assert.equal(JSON.stringify(f.sheets),unchanged);f.install('NODE-012');assert.equal(f.ctx.readCurrentEvent().activeNodes,12);assert.equal(f.ctx.getFopOperations(f.e).operations.some(o=>o.nodeId==='NODE-013'),false);
});
test('10+2 expansion requires Founder, current FIELD_ACTIVE Event, provisioned empty reserve and no other open membership',()=>{
 const f=eventLifecycleFixture();f.initialize();assert.throws(()=>f.expand('NODE-011'),/NOT_FIELD_ACTIVE/);for(let n=1;n<=10;n++)f.install('NODE-'+String(n).padStart(3,'0'));f.ctx.activateEvent(f.founder);
 assert.equal(f.ctx.expandEventNode({parameter:{token:f.e.parameter.token,event:f.ctx.readCurrentEvent().eventId,node:'NODE-011'}}).status,'ROLE_DENIED');assert.throws(()=>f.ctx.expandEventNode({parameter:{...f.founder.parameter,event:'OTHER',node:'NODE-011'}}),/EVENT_MISMATCH/);assert.throws(()=>f.expand('NODE-099'),/NOT_REGISTERED/);
 const eventId=f.ctx.readCurrentEvent().eventId;f.sheets['Event Register'].rows.unshift([]);f.sheets['Event Register'].rows[1]=['OTHER','INITIALIZED'];f.sheets['Event Node Codes'].rows.push(['OTHER','NODE-011']);const before=JSON.stringify(f.sheets);assert.throws(()=>f.expand('NODE-011'),/OTHER_OPEN_EVENT/);assert.equal(JSON.stringify(f.sheets),before);assert.equal(f.ctx.readCurrentEvent().eventId,eventId);
});
test('10+2 expansion batch failure creates no partial member, counter or log and retry is safe',()=>{
 const f=eventLifecycleFixture();f.start();const batch=f.ctx.Sheets.Spreadsheets.batchUpdate,before=JSON.stringify(f.sheets);f.ctx.Sheets.Spreadsheets.batchUpdate=()=>{throw Error('BATCH_FAILED')};assert.throws(()=>f.expand('NODE-011'),/BATCH_FAILED/);assert.equal(JSON.stringify(f.sheets),before);f.ctx.Sheets.Spreadsheets.batchUpdate=batch;assert.equal(f.expand('NODE-011').plannedNodes,11);assert.equal(f.ctx.exchangeLogRows().filter(row=>row[2]==='EVENT_NODE_EXPANDED').length,1);
});
test('10+2 shutdown covers all 10/11/12 actual members, blocks installed expansion and preserves unused reserve',()=>{
 for(const size of [10,11,12]){const f=eventLifecycleFixture();f.start();for(let n=11;n<=size;n++){f.expand('NODE-'+String(n).padStart(3,'0'));f.install('NODE-'+String(n).padStart(3,'0'));}const reserve=JSON.stringify(f.sheets['Node Register'].rows.slice(size+1)),event=f.ctx.readCurrentEvent();const request={parameter:{...f.founder.parameter,event:event.eventId}};for(let n=1;n<=10;n++)f.remove('NODE-'+String(n).padStart(3,'0'));if(size>10){const blocked=f.ctx.shutdownFieldEvent(request);assert.equal(blocked.status,'FIELD_SHUTDOWN_BLOCKED');assert.ok(blocked.blockers.some(x=>x.startsWith('NODE-011:')));}for(let n=11;n<=size;n++)f.remove('NODE-'+String(n).padStart(3,'0'));assert.equal(f.ctx.shutdownFieldEvent(request).eventState,'COMPLETED');assert.equal(f.ctx.readCurrentEvent(),null);assert.equal(JSON.stringify(f.sheets['Node Register'].rows.slice(size+1)),reserve);}
});

 test('10+2 expansion reserves operation boundaries, generates fresh codes and cannot mutate on conflicting reserve',()=>{
 for(const mutate of [f=>{f.sheets['N-Core Register'].rows[40][14]='NODE';f.sheets['N-Core Register'].rows[40][15]='NODE-011';},f=>f.sheets['Node Register'].rows[11][2]='OFFLINE',f=>f.sheets['Deployment Register'].rows.push(['OTHER','NC-040','F001','FOP','NODE-011','DEPLOYMENT','ASSIGNED'])]){const f=eventLifecycleFixture();f.start();mutate(f);const before=JSON.stringify(f.sheets);assert.throws(()=>f.expand('NODE-011'),/NOT_AVAILABLE|OPERATION_RESERVED/);assert.equal(JSON.stringify(f.sheets),before);}
 const f=eventLifecycleFixture();f.start();f.expand('NODE-011');f.expand('NODE-012');const codes=f.sheets['Event Node Codes'].rows.slice(1).flatMap(row=>row.slice(2,7));assert.equal(codes.length,60);assert.equal(new Set(codes).size,60);
 });
 test('10+2 expansion installation batch failure preserves ownership and ACTIVE count; successful retry increments once',()=>{
 const f=eventLifecycleFixture();f.start();f.expand('NODE-011');f.e.parameter.node='NODE-011';const order=f.order();for(const core of order.loadout){f.e.parameter.uid=f.ctx.readCoreState(core.id).uid;f.ctx.scanNodeInstallationCore(f.e);}const before=JSON.stringify(f.sheets),batch=f.ctx.Sheets.Spreadsheets.batchUpdate;f.ctx.Sheets.Spreadsheets.batchUpdate=()=>{throw Error('BATCH_FAILED')};assert.throws(()=>f.ctx.confirmNodeInstallation(f.e),/BATCH_FAILED/);assert.equal(JSON.stringify(f.sheets),before);assert.equal(f.ctx.readCurrentEvent().activeNodes,10);f.ctx.Sheets.Spreadsheets.batchUpdate=batch;f.ctx.confirmNodeInstallation(f.e);assert.equal(f.ctx.readCurrentEvent().activeNodes,11);const committed=JSON.stringify(f.sheets);assert.throws(()=>f.ctx.confirmNodeInstallation(f.e));assert.equal(JSON.stringify(f.sheets),committed);
 });
test('10+2 expansion retry after lost committed response reuses member and log without another batch',()=>{
 const f=eventLifecycleFixture();f.start();const batch=f.ctx.Sheets.Spreadsheets.batchUpdate;f.ctx.Sheets.Spreadsheets.batchUpdate=(...args)=>{batch(...args);throw Error('LOST_RESPONSE')};assert.throws(()=>f.expand('NODE-011'),/LOST_RESPONSE/);const before=JSON.stringify(f.sheets),b=f.batches();assert.equal(f.expand('NODE-011').replayed,true);assert.equal(f.batches(),b);assert.equal(JSON.stringify(f.sheets),before);assert.equal(f.ctx.readCurrentEvent().plannedNodes,11);assert.equal(f.ctx.exchangeLogRows().filter(row=>row[2]==='EVENT_NODE_EXPANDED').length,1);
});

function resetFixture(){
 const f=fixture({state:'COMPLETED'});
 f.sheets['Event Node Codes'].rows[1]=['EVT-1','NODE-001','0123','1111','2222','3333','4444','','','DEINSTALLED','','historical'];
 f.sheets['Access Card Register'].rows.push(['ROOT','ROOT','FOUNDER','rootuid','ACTIVE','',0,true],['P3','P003','PIONEER','p3uid','ACTIVE','',1,true,true],['L1','L001','LOCAL','aabb1234','ACTIVE','',0],['U1','U001','UNBOUND','aabb5678','ACTIVE','',2]);
 const token='d'.repeat(72);f.cache.set('NODIV_SESSION_'+token,JSON.stringify({identity:'ROOT',role:'FOUNDER',cardId:'ROOT'}));
 f.sheets['Event Preflight']=new f.sheets['Node Register'].constructor(10,[['CHECK','CONFIRMED','BY','AT','NOTE','FINGERPRINT']]);
 const e={parameter:{token,mode:'preview'}},reset=mode=>{const r=f.ctx.preEventReset({parameter:{...e.parameter,mode}});return r;};
 function login(){const result=f.ctx.startPlayerSession({parameter:{uid:'rootuid'}});e.parameter.token=result.token;return result;}
 return {...f,e,reset,login};
}
function resetSnapshot(f){return JSON.stringify({sheets:Object.fromEntries(Object.entries(f.sheets).map(([k,s])=>[k,s.rows])),properties:[...f.properties]});}
function resetLogs(f){return f.sheets['Transaction Log'].rows.filter(row=>row[2]==='PRE_EVENT_RESET_COMPLETE');}
test('reset clean preview/confirm read-only, Founder only, completed history unchanged',()=>{
 const f=resetFixture(),before=resetSnapshot(f);assert.equal(f.reset('preview').classification,'ALREADY_CLEAN');assert.equal(f.reset('confirm').status,'PRE_EVENT_READY');assert.equal(resetSnapshot(f),before);assert.equal(f.batches(),0);
 assert.equal(f.ctx.preEventReset({parameter:{token:'a'.repeat(72),mode:'confirm'}}).status,'ROLE_DENIED');assert.equal(resetSnapshot(f),before);
});
test('reset FIELD_ACTIVE anywhere blocks preview and confirm without mutation',()=>{
 const f=resetFixture();f.sheets['Event Register'].rows.push(['OTHER','FIELD_ACTIVE']);const before=resetSnapshot(f);for(const mode of ['preview','confirm'])assert.equal(f.reset(mode).classification,'BLOCKER');assert.equal(resetSnapshot(f),before);assert.equal(f.batches(),0);
});
test('reset returns Pioneer/Local/Unbound cores atomically, preserves registration/energy/status/ledger, resets only Pioneer capacity and ghosts',()=>{
 const f=resetFixture();for(const [n,type,id] of [[1,'PIONEER','P003'],[2,'LOCAL','L001'],[3,'UNBOUND','U001']]){const row=f.sheets['N-Core Register'].rows[n];row[14]=type;row[15]=id;row[4]='FIELD';}
 f.sheets['Access Card Register'].rows[3][6]=3;f.sheets['Access Card Register'].rows[3][9]=new Date(Date.now()+300000).toISOString();
 const energies=JSON.stringify(f.sheets['N-Core Register'].rows.map(row=>[row[1],row[2],row[12],row[13]])),events=JSON.stringify(f.sheets['Event Register'].rows),codes=JSON.stringify(f.sheets['Event Node Codes'].rows);
 const before=resetSnapshot(f);assert.equal(f.reset('preview').classification,'CLEANUP_REQUIRED');assert.equal(resetSnapshot(f),before);assert.equal(f.reset('confirm').status,'PRE_EVENT_READY');assert.equal(f.batches(),1);
 for(let n=1;n<=6;n++)assert.deepEqual(f.sheets['N-Core Register'].rows[n].slice(14,16),['NODIV_RESERVE','HQ']);assert.equal(f.sheets['Access Card Register'].rows[3][6],1);assert.equal(f.sheets['Access Card Register'].rows[3][9],'');assert.equal(f.sheets['Access Card Register'].rows[4][6],0);assert.equal(f.sheets['Access Card Register'].rows[5][6],2);assert.ok(f.sheets['Access Card Register'].rows.slice(1).every(row=>row[4]==='ACTIVE'));assert.equal(JSON.stringify(f.sheets['N-Core Register'].rows.map(row=>[row[1],row[2],row[12],row[13]])),energies);assert.equal(JSON.stringify(f.sheets['Event Register'].rows),events);assert.equal(JSON.stringify(f.sheets['Event Node Codes'].rows),codes);assert.equal(resetLogs(f).length,1);
});
test('reset safely aborts INITIALIZED installed 3-core test node, preserves code/history and permits new 10-node event',()=>{
 const f=eventLifecycleFixture();f.initialize();f.install('NODE-001');const oldEvent=f.ctx.readCurrentEvent().eventId,oldCodes=f.sheets['Event Node Codes'].rows.slice(1).map(row=>row.slice(0,7));
 const r=f.ctx.preEventReset({parameter:{...f.founder.parameter,mode:'confirm'}});assert.equal(r.status,'PRE_EVENT_READY');assert.equal(f.sheets['Event Register'].rows[1][1],'ABORTED');assert.equal(f.ctx.readCurrentEvent(),null);assert.equal(f.ctx.countCoresOwnedBy('NODE','NODE-001'),0);assert.ok(f.sheets['Node Register'].rows.slice(1).every(row=>row[2]==='AVAILABLE'));assert.deepEqual(f.sheets['Event Node Codes'].rows.slice(1).map(row=>row.slice(0,7)),oldCodes);assert.ok(f.sheets['Transaction Log'].rows.some(row=>row[2]==='NODE_INSTALLED'));
 f.ctx.Utilities.formatDate=()=> '20261006-170000';const session=f.ctx.startPlayerSession({parameter:{uid:'rootuid'}});const fresh=f.ctx.initializeEvent({parameter:{token:session.token}});assert.equal(fresh.status,'EVENT_INITIALIZED');assert.equal(fresh.event.nodes.length,10);assert.notEqual(fresh.event.eventId,oldEvent);assert.equal(f.sheets['Event Node Codes'].rows.length,21);
});
test('reset unsafe node ownership and contradictory ownership block with no writes',()=>{
 for(const change of [row=>{row[14]='NODE';row[15]='NODE-001';row[4]='DEPLOYED';},row=>{row[14]='PIONEER';row[15]='UNKNOWN';row[4]='FIELD';},row=>{row[15]='NOT_HQ';}]){const f=resetFixture();change(f.sheets['N-Core Register'].rows[1]);const before=resetSnapshot(f);assert.equal(f.reset('confirm').classification,'BLOCKER');assert.equal(resetSnapshot(f),before);assert.equal(f.batches(),0);}
});
for(const purpose of ['RESTORE_1','RESTORE_2','RESUPPLY','DEPLOYMENT'])test('reset validated '+purpose+' transit cargo and open deployments terminate without deleting history',()=>{
 const f=resetFixture();f.sheets['N-Core Register'].rows[1][4]='IN_TRANSIT';const cargo=f.ctx.readCoreState('NC-001'),id='MISSION-1';f.sheets['Deployment Register'].rows.push([id,'NC-001','P003','PIONEER','NODE-001',purpose,'IN_TRANSIT','old','accepted'],['DONE','NC-002','P003','PIONEER','NODE-001',purpose,'DELIVERED','old'],['OPEN','NC-003','P003','PIONEER','NODE-001','DEPLOYMENT','ASSIGNED']);
 if(purpose!=='DEPLOYMENT')f.properties.set('NODIV_'+purpose+'_'+id,JSON.stringify({id,identity:'P003',nodeId:'NODE-001',eventId:'EVT-1',cargo}));
 assert.equal(f.reset('confirm').status,'PRE_EVENT_READY');assert.equal(f.sheets['N-Core Register'].rows[1][4],'RESERVE');assert.equal(f.sheets['Deployment Register'].rows[1][6],'CANCELLED');assert.equal(f.sheets['Deployment Register'].rows[2][6],'DELIVERED');assert.equal(f.sheets['Deployment Register'].rows[3][6],'CANCELLED');assert.equal(f.properties.size,0);
});
test('reset orphan or mismatched transit cargo is blocker, reservations retained',()=>{
 for(const mismatch of [false,true]){const f=resetFixture();f.sheets['N-Core Register'].rows[1][4]='IN_TRANSIT';if(mismatch){f.sheets['Deployment Register'].rows.push(['M','NC-001','P003','PIONEER','NODE-001','RESUPPLY','IN_TRANSIT']);f.properties.set('NODIV_RESUPPLY_M',JSON.stringify({id:'M',identity:'P003',nodeId:'NODE-001',eventId:'EVT-1',cargo:{}}));}const before=resetSnapshot(f);assert.equal(f.reset('confirm').classification,'BLOCKER');assert.equal(resetSnapshot(f),before);}
});
test('reset clears all operational order namespaces/test metadata, invalidates old sessions and progression without deleting audit',()=>{
 const f=resetFixture();for(const prefix of ['NODIV_INSTALL_ORDER_','NODIV_EXCHANGE_','NODIV_EXCHANGE_PREVIEW_','NODIV_RESTORE_1_','NODIV_RESTORE_2_','NODIV_RESUPPLY_','NODIV_CATCH_V1_','NODIV_HQ_UPLOAD_'])f.properties.set(prefix+'OLD','{}');f.properties.set('NODIV_RESTORE_TEST_NODE','{}');
 f.ctx.appendTransactionLog({eventType:'RESTORE_1_COMPLETE',actorId:'P003',actorRole:'PIONEER',result:'SUCCESS'});const historical=f.sheets['Transaction Log'].rows.length;
 assert.equal(f.reset('confirm').status,'PRE_EVENT_READY');assert.equal(f.properties.size,0);assert.equal(f.ctx.resolvePlayerSession(f.e.parameter.token).response.status,'SESSION_RESET');assert.equal(f.ctx.checkPlayerSession(f.e).authenticated,false);assert.equal(f.ctx.exchangeLogRows().length,0);assert.equal(f.sheets['Transaction Log'].rows.length,historical+1);assert.equal(f.login().authenticated,true);assert.equal(f.ctx.resolvePlayerSession(f.e.parameter.token).ok,true);
});
test('reset preflight history invalidated; repeat is clean without transfers, epoch or duplicate logs',()=>{
 const f=resetFixture();for(const id of ['PHYSICAL_EQUIPMENT','EVENT_CONFIGURATION','FINAL_FOUNDER_CONFIRMATION'])f.sheets['Event Preflight'].rows.push([id,true,'ROOT','old','','fingerprint']);assert.equal(f.reset('confirm').status,'PRE_EVENT_READY');f.login();assert.ok(f.ctx.readEventPreflight().every(check=>!check.confirmed));assert.equal(f.sheets['Event Preflight'].rows.length,7);assert.ok(f.sheets['Event Preflight'].rows.slice(1,4).every(row=>row[1]===true));const before=resetSnapshot(f),epoch=f.ctx.readPreEventResetEpoch();assert.equal(f.reset('confirm').classification,'ALREADY_CLEAN');assert.equal(resetSnapshot(f),before);assert.equal(f.ctx.readPreEventResetEpoch(),epoch);assert.equal(resetLogs(f).length,1);
 f.ctx.getEventConfigurationFingerprint=()=> 'fingerprint';const readiness=f.ctx.getEventReadiness(f.e);assert.equal(readiness.ready,false);assert.equal(readiness.preflightReady,false);assert.ok(readiness.preflight.every(check=>!check.confirmed));
});
test('reset failed batch preserves complete persistent state including properties, capacity, event and deployments',()=>{
 const f=resetFixture();f.sheets['Access Card Register'].rows[3][6]=2;f.sheets['N-Core Register'].rows[1][14]='PIONEER';f.sheets['N-Core Register'].rows[1][15]='P003';f.sheets['N-Core Register'].rows[1][4]='FIELD';f.sheets['Event Register'].rows[1][1]='INITIALIZED';f.sheets['Deployment Register'].rows.push(['OPEN','NC-002','P003','PIONEER','NODE-001','DEPLOYMENT','ASSIGNED']);f.properties.set('NODIV_EXCHANGE_OLD','{}');const before=resetSnapshot(f);f.fail();assert.throws(()=>f.reset('confirm'),/BATCH_FAILED/);assert.equal(resetSnapshot(f),before);assert.equal(f.ctx.resolvePlayerSession(f.e.parameter.token).ok,true);assert.equal(resetLogs(f).length,0);
});
test('reset lost batch response resumes only property cleanup, no second reset/epoch/transfer',()=>{
 const f=resetFixture();f.properties.set('NODIV_EXCHANGE_OLD','{}');const batch=f.ctx.Sheets.Spreadsheets.batchUpdate;f.ctx.Sheets.Spreadsheets.batchUpdate=(...args)=>{batch(...args);throw Error('LOST_RESPONSE');};assert.throws(()=>f.reset('confirm'),/LOST_RESPONSE/);assert.equal(resetLogs(f).length,1);assert.equal(f.properties.size,1);f.ctx.Sheets.Spreadsheets.batchUpdate=batch;f.login();const before=JSON.stringify(f.sheets),epoch=f.ctx.readPreEventResetEpoch();assert.equal(f.reset('confirm').replayed,true);assert.equal(f.properties.size,0);assert.equal(JSON.stringify(f.sheets),before);assert.equal(f.ctx.readPreEventResetEpoch(),epoch);assert.equal(resetLogs(f).length,1);
});
test('reset preserves all 15 physical Nodes, 200 registered Core energies/UIDs and inactive card status',()=>{
 const f=resetFixture();f.sheets['Node Register'].rows=[[],...Array.from({length:15},(_,i)=>['NODE-'+String(i+1).padStart(3,'0'),'020000'+String(i+1).padStart(2,'0'),'AVAILABLE'])];
 f.sheets['N-Core Register'].rows.slice(1).forEach((row,i)=>{row[2]='010000'+String(i+1).padStart(4,'0');row[1]=i+1;row[12]=i%5;row[13]=row[1]+row[12];});f.sheets['Access Card Register'].rows[3][6]=2;f.sheets['Access Card Register'].rows[3][4]='INACTIVE';
 const nodes=JSON.stringify(f.sheets['Node Register'].rows),cores=JSON.stringify(f.sheets['N-Core Register'].rows);const r=f.reset('confirm');assert.equal(r.status,'PRE_EVENT_READY');assert.equal(JSON.stringify(f.sheets['Node Register'].rows),nodes);assert.equal(JSON.stringify(f.sheets['N-Core Register'].rows),cores);assert.equal(f.sheets['Access Card Register'].rows[3][4],'INACTIVE');assert.equal(f.sheets['Access Card Register'].rows[3][6],1);f.login();const preview=f.reset('preview');assert.equal(preview.registeredCores,200);assert.equal(preview.nodes,15);assert.equal(preview.classification,'ALREADY_CLEAN');
});
test('reset property cleanup failure still invalidates old sessions and can be retried without new mutation',()=>{
 const f=resetFixture();f.properties.set('NODIV_CATCH_V1_OLD','{}');const get=f.ctx.PropertiesService.getScriptProperties;f.ctx.PropertiesService.getScriptProperties=()=>({...get(),deleteProperty(){throw Error('PROPERTY_FAILED');}});assert.equal(f.reset('confirm').cleanupPending,true);assert.equal(f.ctx.resolvePlayerSession(f.e.parameter.token).response.status,'SESSION_RESET');assert.equal(resetLogs(f).length,1);f.ctx.PropertiesService.getScriptProperties=get;f.login();const before=JSON.stringify(f.sheets);assert.equal(f.reset('confirm').replayed,true);assert.equal(JSON.stringify(f.sheets),before);assert.equal(f.properties.size,0);
});
test('reset cannot normalize duplicate deployments, duplicate physical UIDs or previously activated Node ownership',()=>{
 for(const change of [f=>{f.sheets['Deployment Register'].rows.push(['A','NC-001','P003','PIONEER','NODE-001','DEPLOYMENT','ASSIGNED'],['B','NC-001','P003','PIONEER','NODE-001','DEPLOYMENT','ASSIGNED']);},f=>{f.sheets['N-Core Register'].rows[2][2]=f.sheets['N-Core Register'].rows[1][2];}]){const f=resetFixture();change(f);const before=resetSnapshot(f);assert.equal(f.reset('confirm').classification,'BLOCKER');assert.equal(resetSnapshot(f),before);}
 const f=eventLifecycleFixture();f.initialize();f.install('NODE-001');f.ctx.appendTransactionLog({eventType:'EVENT_FIELD_ACTIVE',actorId:'ROOT',actorRole:'FOUNDER',result:'SUCCESS',details:f.ctx.readCurrentEvent().eventId+' // Field Operations activated'});const before=resetSnapshot(f);assert.equal(f.ctx.preEventReset({parameter:{...f.founder.parameter,mode:'confirm'}}).classification,'BLOCKER');assert.equal(resetSnapshot(f),before);
});

function secureApproachFixture(balance=150,capacity=1){
 const f=uploadFixture(capacity);let now=Date.now();const RealDate=Date;
 f.ctx.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
 if(balance)f.ctx.bookPlayerEnergy({identity:'P003',role:'PIONEER',type:'CREDIT',amount:balance});
 const e={parameter:{token:f.uploadE.parameter.token,request:'request-p003-1'}};
 function other(){
  f.sheets['Access Card Register'].rows.push(['CARD-4','P004','PIONEER','B004','ACTIVE','',1,true,true]);const token='4'.repeat(72);f.cache.set('NODIV_SESSION_'+token,JSON.stringify({identity:'P004',role:'PIONEER',cardId:'CARD-4'}));const row=f.sheets['N-Core Register'].rows[9];row[2]='B009';row[4]='FIELD';row[14]='PIONEER';row[15]='P004';
  return {parameter:{token,uid:'uploaduid',request:'request-p004-1'}};
 }
 return {...f,secureE:e,activate:()=>f.ctx.activateSecureApproach(e),terminal:()=>f.ctx.getUploadTerminalState(e),now:()=>now,advance:ms=>now+=ms,other};
}
test('Secure Approach terminal starts GREEN; state discloses no Identity, card, Node or location',()=>{
 const f=secureApproachFixture(),before=resetSnapshot(f),r=f.terminal();assert.equal(r.state,'GREEN');assert.equal(resetSnapshot(f),before);assert.equal(r.serverNow,f.now());for(const key of ['identity','cardId','node','position','order','request'])assert.equal(key in r,false);
});
test('Secure Approach rejects insufficient SECURED, non-Pioneer, inactive, missing request, invalid Bay and non-FIELD Event before mutation',()=>{
 for(const kind of ['insufficient','role','inactive','request','event','bay','multiple-bays']){
  const f=secureApproachFixture(kind==='insufficient'?149:150);
  if(kind==='role')f.secureE.parameter.token='a'.repeat(72);if(kind==='inactive')f.sheets['Access Card Register'].rows[2][4]='INACTIVE';if(kind==='request')f.secureE.parameter.request='';if(kind==='event')f.sheets['Event Register'].rows[1][1]='INITIALIZED';if(kind==='bay')f.sheets['Upload Terminal Register'].rows[1][3]='INACTIVE';if(kind==='multiple-bays')f.sheets['Upload Terminal Register'].rows.push(['OTHER','UPLOAD_HQ','B098','ACTIVE']);
  const before=resetSnapshot(f);if(kind==='inactive')assert.equal(f.activate().session,false);else assert.throws(f.activate,/INSUFFICIENT_SECURED_ENERGY|PIONEER_REQUIRED|REQUEST_REQUIRED|FIELD_ACTIVE_REQUIRED|CONFIGURATION_INVALID/);assert.equal(resetSnapshot(f),before);assert.equal(f.batches(),0);
 }
});
test('Secure Approach atomically debits exactly 150, reserves YELLOW for exactly 5 minutes and writes Ghost/receipt in the same batch',()=>{
 const f=secureApproachFixture(),start=f.now(),beforeCores=JSON.stringify(f.sheets['N-Core Register'].rows);f.secureE.parameter.amount=-1;f.secureE.parameter.price=0;const r=f.activate();assert.equal(r.state,'YELLOW');assert.equal(r.expiresAt,start+300000);assert.equal(new Date(r.ghostUntil).getTime(),r.expiresAt);assert.equal(new Date(f.ctx.findIdentityById('P003').ghostUntil).getTime(),r.expiresAt);assert.equal(f.ctx.readPlayerEnergyBalance('P003'),0);assert.equal(f.batches(),1);assert.equal(JSON.stringify(f.sheets['N-Core Register'].rows),beforeCores);
 const debit=f.sheets['Player Energy Ledger'].rows.at(-1),log=f.ctx.exchangeLogRows().find(row=>row[2]==='SECURE_APPROACH_ACTIVATED'),receipt=JSON.parse(log[15]);assert.equal(debit[4],'SECURE_APPROACH');assert.equal(debit[5],-150);assert.equal(debit[7],r.reservation);assert.equal(debit[0],receipt.energyEntry);assert.equal(f.terminal().ownReservation,true);
});
test('Secure Approach longer existing Ghost is never shortened or cleared by timeout',()=>{
 const f=secureApproachFixture(),until=f.now()+3600000;f.sheets['Access Card Register'].rows[2][9]=new Date(until).toISOString();const r=f.activate();assert.equal(new Date(r.ghostUntil).getTime(),until);f.advance(300001);assert.equal(f.terminal().state,'GREEN');assert.equal(new Date(f.ctx.findIdentityById('P003').ghostUntil).getTime(),until);assert.equal(f.ctx.readPlayerEnergyBalance('P003'),0);
});
test('Secure Approach YELLOW denies foreign upload and secure activation privately; owner enters RED via real Bay scan',()=>{
 const f=secureApproachFixture(300),other=f.other();f.ctx.bookPlayerEnergy({identity:'P004',role:'PIONEER',type:'CREDIT',amount:150});f.activate();const before=resetSnapshot(f),state=f.ctx.getUploadTerminalState(other);assert.equal(state.state,'YELLOW');assert.equal(state.ownReservation,false);assert.equal(JSON.stringify(state).includes('P003'),false);assert.throws(()=>f.ctx.getHqUploadPreview(other),/UPLOAD_TERMINAL_BUSY/);assert.throws(()=>f.ctx.activateSecureApproach(other),/UPLOAD_TERMINAL_BUSY/);assert.equal(resetSnapshot(f),before);const preview=f.uploadPreview();assert.equal(preview.selectable,true);assert.equal(f.terminal().state,'RED');assert.equal(f.ctx.readPlayerEnergyBalance('P003'),150);assert.equal(f.ctx.readPlayerEnergyBalance('P004'),150);
});
test('GREEN normal Upload claims RED without debit/Ghost/ownership changes; another Pioneer cannot preview or activate',()=>{
 const f=secureApproachFixture(),other=f.other(),ghost=f.ctx.findIdentityById('P003').ghostUntil,cores=JSON.stringify(f.sheets['N-Core Register'].rows),ledger=JSON.stringify(f.sheets['Player Energy Ledger'].rows);const first=f.uploadPreview();assert.equal(f.terminal().state,'RED');assert.equal(f.ctx.findIdentityById('P003').ghostUntil,ghost);assert.equal(JSON.stringify(f.sheets['N-Core Register'].rows),cores);assert.equal(JSON.stringify(f.sheets['Player Energy Ledger'].rows),ledger);const before=resetSnapshot(f),second=f.uploadPreview();assert.equal(second.upload,first.upload);assert.equal(second.replayed,true);assert.equal(resetSnapshot(f),before);assert.throws(()=>f.ctx.getHqUploadPreview(other),/UPLOAD_TERMINAL_BUSY/);assert.throws(()=>f.ctx.activateSecureApproach(other),/UPLOAD_TERMINAL_BUSY/);assert.equal(resetSnapshot(f),before);
});
test('RED owner authorizes/confirms unchanged Upload; completion frees GREEN and preserves Secure Approach Ghost',()=>{
 const f=secureApproachFixture(),other=f.other(),activation=f.activate();f.uploadPreview();f.uploadAuthorize(['NC-006']);assert.equal(f.terminal().state,'RED');other.parameter.upload=f.uploadE.parameter.upload;other.parameter.cores='["NC-006"]';for(const action of ['authorize','confirm'])assert.throws(()=>f.ctx.normalHqUpload(other,action),/UPLOAD_SESSION_MISMATCH/);const r=f.uploadConfirm();assert.equal(r.status,'UPLOAD_COMPLETE');assert.equal(r.totalEnergy,300);assert.equal(f.ctx.readPlayerEnergyBalance('P003'),300);assert.equal(f.terminal().state,'GREEN');assert.equal(new Date(f.ctx.findIdentityById('P003').ghostUntil).getTime(),activation.expiresAt);assert.equal(f.ctx.readCoreState('NC-006').ownerId,'HQ');const before=resetSnapshot(f);assert.equal(f.uploadConfirm().replayed,true);assert.equal(resetSnapshot(f),before);
});
test('RED expiration releases terminal and rejects old order without a permanent blocker',()=>{
 const f=secureApproachFixture(),other=f.other();f.uploadPreview();f.uploadAuthorize(['NC-006']);f.advance(300000);assert.equal(f.terminal().state,'GREEN');assert.throws(f.uploadConfirm,/UPLOAD_EXPIRED/);assert.equal(f.ctx.getHqUploadPreview(other).selectable,true);assert.equal(f.ctx.getUploadTerminalState(other).ownReservation,true);assert.throws(f.uploadPreview,/UPLOAD_TERMINAL_BUSY/);assert.equal(f.ctx.readPlayerEnergyBalance('P003'),150);
});
test('YELLOW expiry exactly at 5 minutes frees GREEN without refund; original activation retry cannot renew Ghost or debit',()=>{
 const f=secureApproachFixture(300),first=f.activate();f.advance(299999);assert.equal(f.terminal().state,'YELLOW');f.advance(1);assert.equal(f.terminal().state,'GREEN');const before=resetSnapshot(f),retry=f.activate();assert.equal(retry.replayed,true);assert.equal(retry.reservation,first.reservation);assert.equal(retry.expiresAt,first.expiresAt);assert.equal(retry.state,'GREEN');assert.equal(resetSnapshot(f),before);assert.equal(f.ctx.readPlayerEnergyBalance('P003'),150);
});
test('Secure Approach retry and lost committed response share one durable reservation, one debit and original Ghost timestamp',()=>{
 for(const lost of [false,true]){const f=secureApproachFixture(450),batch=f.ctx.Sheets.Spreadsheets.batchUpdate;let first;if(lost){f.ctx.Sheets.Spreadsheets.batchUpdate=(...args)=>{batch(...args);throw Error('LOST_RESPONSE');};assert.throws(f.activate,/LOST_RESPONSE/);}else first=f.activate();f.ctx.Sheets.Spreadsheets.batchUpdate=batch;const before=resetSnapshot(f),r=f.activate();assert.equal(r.replayed,true);if(first)assert.equal(r.reservation,first.reservation);assert.equal(resetSnapshot(f),before);assert.equal(f.batches(),1);assert.equal(f.ctx.readPlayerEnergyBalance('P003'),300);assert.equal(f.sheets['Player Energy Ledger'].rows.filter(row=>row[4]==='SECURE_APPROACH').length,1);assert.equal(f.ctx.exchangeLogRows().filter(row=>row[2]==='SECURE_APPROACH_ACTIVATED').length,1);}
});
test('Secure Approach staging/batch failure never partially debits, protects or reserves',()=>{
 for(const kind of ['ghost','ledger','receipt','batch']){const f=secureApproachFixture(),before=resetSnapshot(f);if(kind==='ghost')f.ctx.setAccessCardGhostUntilByUid=()=>{throw Error('STAGE_FAILED');};if(kind==='ledger')f.ctx.bookPlayerEnergy=()=>{throw Error('STAGE_FAILED');};if(kind==='receipt')f.ctx.appendTransactionLog=()=>{throw Error('STAGE_FAILED');};if(kind==='batch')f.fail();assert.throws(f.activate,/STAGE_FAILED|BATCH_FAILED/);assert.equal(resetSnapshot(f),before);assert.equal(f.terminal().state,'GREEN');assert.equal(f.ctx.readPlayerEnergyBalance('P003'),150);assert.equal(f.ctx.findIdentityById('P003').ghostUntil,null);}
});
test('ScriptLock serialized competing Secure Approach/normal Upload claims allow exactly one winner',()=>{
 for(const mode of ['secure','upload']){const f=secureApproachFixture(),other=f.other();f.ctx.bookPlayerEnergy({identity:'P004',role:'PIONEER',type:'CREDIT',amount:150});let held=false,locks=0;f.ctx.LockService.getScriptLock=()=>({waitLock(){assert.equal(held,false);held=true;locks++;},releaseLock(){held=false;}});const batch=f.ctx.Sheets.Spreadsheets.batchUpdate;f.ctx.Sheets.Spreadsheets.batchUpdate=(...args)=>{assert.equal(held,true);return batch(...args);};if(mode==='secure'){f.activate();assert.throws(()=>f.ctx.activateSecureApproach(other),/UPLOAD_TERMINAL_BUSY/);}else{f.uploadPreview();assert.throws(()=>f.ctx.getHqUploadPreview(other),/UPLOAD_TERMINAL_BUSY/);}assert.equal(f.batches(),1);assert.equal(locks,2);assert.equal(f.ctx.readPlayerEnergyBalance('P004'),150);}
});
test('Catch preview AND previously authorized confirm reject Secure Approach Ghost without changing Ownership',()=>{
 const f=catchFixture(1,{ledger:true}),Sheet=f.sheets['N-Core Register'].constructor;f.sheets['Player Energy Ledger']=new Sheet(9,[[]]);f.sheets['Upload Terminal Register'].rows.push(['HQ','UPLOAD_HQ','uploaduid','ACTIVE']);f.ctx.bookPlayerEnergy({identity:'P003',role:'PIONEER',type:'CREDIT',amount:150});const catchOrder=f.catchPreview(),beforeCores=JSON.stringify(f.sheets['N-Core Register'].rows);f.ctx.activateSecureApproach({parameter:{token:f.e.parameter.token,request:'catch-shield-1'}});assert.throws(f.catchPreview,/TARGET_PROTECTED/);assert.throws(()=>f.catchConfirm(catchOrder.catchId),/TARGET_PROTECTED/);assert.equal(JSON.stringify(f.sheets['N-Core Register'].rows),beforeCores);
});
test('Upload claim batch failure stays GREEN; lost claim response recovers same RED order, then authorizes/confirms once',()=>{
 for(const lost of [false,true]){const f=secureApproachFixture(),before=resetSnapshot(f),batch=f.ctx.Sheets.Spreadsheets.batchUpdate;f.ctx.Sheets.Spreadsheets.batchUpdate=(...args)=>{if(lost)batch(...args);throw Error(lost?'LOST_RESPONSE':'BATCH_FAILED');};assert.throws(f.uploadPreview,/LOST_RESPONSE|BATCH_FAILED/);f.ctx.Sheets.Spreadsheets.batchUpdate=batch;if(!lost){assert.equal(resetSnapshot(f),before);assert.equal(f.terminal().state,'GREEN');}else{assert.equal(f.terminal().state,'RED');const r=f.uploadPreview();assert.equal(r.replayed,true);assert.equal(f.batches(),1);f.uploadAuthorize(['NC-006']);assert.equal(f.uploadConfirm().status,'UPLOAD_COMPLETE');assert.equal(f.terminal().state,'GREEN');assert.equal(f.ctx.readPlayerEnergyBalance('P003'),450);}}
});
test('Legacy pre-deployment upload order remains RED/exclusive and can complete with existing TTL',()=>{
 const f=secureApproachFixture(),player=f.ctx.findIdentityById('P003'),context=f.ctx.hqUploadContext(player,'uploaduid'),order={id:'LEGACY',identity:player.identity,cardId:player.cardId,bayUid:f.ctx.normalizeUid('uploaduid'),bay:context.bay,cores:context.cores,authorized:false,expiresAt:f.now()+300000};f.properties.set('NODIV_HQ_UPLOAD_LEGACY',JSON.stringify(order));assert.equal(f.terminal().state,'RED');assert.throws(()=>f.ctx.getHqUploadPreview(f.other()),/UPLOAD_TERMINAL_BUSY/);const r=f.uploadPreview();assert.equal(r.upload,'LEGACY');assert.equal(f.batches(),0);f.uploadAuthorize(['NC-006']);assert.equal(f.uploadConfirm().status,'UPLOAD_COMPLETE');assert.equal(f.terminal().state,'GREEN');
});
test('Pre-Event Reset diagnoses and neutralizes Secure Approach reservation without refund or erasing historical debit',()=>{
 const f=resetFixture();f.sheets['Player Energy Ledger']=new f.sheets['N-Core Register'].constructor(9,[[]]);f.sheets['Upload Terminal Register'].rows.push(['HQ','UPLOAD_HQ','uploaduid','ACTIVE']);f.sheets['Event Register'].rows[1][1]='FIELD_ACTIVE';const token='3'.repeat(72);f.cache.set('NODIV_SESSION_'+token,JSON.stringify({identity:'P003',role:'PIONEER',cardId:'P3'}));f.ctx.bookPlayerEnergy({identity:'P003',role:'PIONEER',type:'CREDIT',amount:150});f.ctx.activateSecureApproach({parameter:{token,request:'reset-shield-1'}});assert.equal(f.reset('preview').uploadTerminal.state,'YELLOW');assert.equal(f.reset('confirm').classification,'BLOCKER');
 assert.equal(f.ctx.shutdownFieldEvent({parameter:{token:f.e.parameter.token,event:'EVT-1'}}).eventState,'COMPLETED');const ledger=JSON.stringify(f.sheets['Player Energy Ledger'].rows);assert.equal(f.reset('preview').uploadTerminal.state,'YELLOW');assert.equal(f.reset('confirm').status,'PRE_EVENT_READY');assert.equal(f.ctx.readUploadTerminalRecord().state,'GREEN');assert.equal(f.ctx.readPlayerEnergyBalance('P003'),0);assert.equal(JSON.stringify(f.sheets['Player Energy Ledger'].rows),ledger);assert.ok(f.sheets['Transaction Log'].rows.some(row=>row[2]==='SECURE_APPROACH_ACTIVATED'));assert.equal(f.ctx.findIdentityById('P003').ghostUntil,null);
});
test('Empty or invalid Upload preview never claims RED or consumes existing YELLOW reservation',()=>{
 const f=secureApproachFixture();f.activate();f.sheets['N-Core Register'].rows[6][4]='IN_TRANSIT';const before=resetSnapshot(f);assert.equal(f.uploadPreview().selectable,false);assert.equal(f.terminal().state,'YELLOW');assert.equal(resetSnapshot(f),before);f.uploadE.parameter.uid='BAD';assert.throws(f.uploadPreview,/UPLOAD_BAY_INVALID/);assert.equal(resetSnapshot(f),before);
 const g=secureApproachFixture();g.sheets['N-Core Register'].rows[6][4]='IN_TRANSIT';assert.equal(g.uploadPreview().selectable,false);assert.equal(g.terminal().state,'GREEN');assert.equal(g.batches(),0);
});
test('Secure Approach and RED upload resume with new authenticated session of same identity, never another card',()=>{
 const f=secureApproachFixture(),first=f.activate();f.cache.delete('NODIV_SESSION_'+f.secureE.parameter.token);const newSession=f.ctx.startPlayerSession({parameter:{uid:'p003uid'}});f.secureE.parameter.token=f.uploadE.parameter.token=newSession.token;assert.equal(f.activate().reservation,first.reservation);f.uploadPreview();f.uploadAuthorize(['NC-006']);const initial=f.uploadE.parameter.upload;f.cache.delete('NODIV_SESSION_'+newSession.token);const next=f.ctx.startPlayerSession({parameter:{uid:'p003uid'}});f.secureE.parameter.token=f.uploadE.parameter.token=next.token;const recovered=f.uploadPreview();assert.equal(recovered.upload,initial);assert.equal(recovered.canConfirm,true);assert.equal(f.uploadConfirm().status,'UPLOAD_COMPLETE');assert.equal(f.ctx.readPlayerEnergyBalance('P003'),300);
});
test('Secure Approach expired-request retry never disturbs a subsequent foreign reservation',()=>{
 const f=secureApproachFixture(300),other=f.other(),old=f.activate();f.advance(300000);f.ctx.bookPlayerEnergy({identity:'P004',role:'PIONEER',type:'CREDIT',amount:150});const next=f.ctx.activateSecureApproach(other),before=resetSnapshot(f),retry=f.activate();assert.equal(retry.reservation,old.reservation);assert.equal(retry.ownReservation,false);assert.equal(f.ctx.readUploadTerminalRecord().id,next.reservation);assert.equal(resetSnapshot(f),before);assert.equal(f.ctx.readPlayerEnergyBalance('P003'),150);
});
test('Secure Approach missing Ledger is zero balance and does not create a table or mutate anything',()=>{
 const f=secureApproachFixture(0);delete f.sheets['Player Energy Ledger'];const before=resetSnapshot(f);assert.throws(f.activate,/INSUFFICIENT_SECURED_ENERGY/);assert.equal(resetSnapshot(f),before);
});
test('RED reset clears Upload reservation/orders after shutdown; history and secured balance remain intact',()=>{
 const f=resetFixture();f.sheets['Player Energy Ledger']=new f.sheets['N-Core Register'].constructor(9,[[]]);f.sheets['Upload Terminal Register'].rows.push(['HQ','UPLOAD_HQ','uploaduid','ACTIVE']);f.sheets['Event Register'].rows[1][1]='FIELD_ACTIVE';const row=f.sheets['N-Core Register'].rows[1];row[14]='PIONEER';row[15]='P003';row[4]='FIELD';const token='3'.repeat(72);f.cache.set('NODIV_SESSION_'+token,JSON.stringify({identity:'P003',role:'PIONEER',cardId:'P3'}));f.ctx.getHqUploadPreview({parameter:{token,uid:'uploaduid'}});assert.equal(f.reset('preview').uploadTerminal.state,'RED');assert.equal(f.ctx.shutdownFieldEvent({parameter:{token:f.e.parameter.token,event:'EVT-1'}}).eventState,'COMPLETED');assert.equal(f.reset('confirm').status,'PRE_EVENT_READY');assert.equal(f.ctx.readUploadTerminalRecord().state,'GREEN');assert.equal(f.properties.size,0);assert.equal(f.ctx.readCoreState('NC-001').ownerId,'HQ');assert.ok(f.sheets['Transaction Log'].rows.some(row=>row[2]==='UPLOAD_TERMINAL_CLAIMED'));
});
test('Expired/completed RED receipt cannot be permanently blocked by corrupted leftover order metadata',()=>{
 for(const completed of [false,true]){const f=secureApproachFixture(),first=f.uploadPreview();if(completed){f.uploadAuthorize(['NC-006']);f.uploadConfirm();}else f.advance(300000);f.properties.set('NODIV_HQ_UPLOAD_'+first.upload,'invalid');assert.equal(f.terminal().state,'GREEN');const other=f.other();assert.equal(f.ctx.getHqUploadPreview(other).selectable,true);}
});
test('Secure Approach replay cannot cross Event or Access Card identity, and damaged live upload metadata blocks safely until authoritative TTL',()=>{
 const f=secureApproachFixture();f.activate();f.sheets['Event Register'].rows[1][0]='OTHER';const before=resetSnapshot(f);assert.throws(f.activate,/CONTEXT_CHANGED/);assert.equal(resetSnapshot(f),before);
 const g=secureApproachFixture(),first=g.uploadPreview();g.properties.set('NODIV_HQ_UPLOAD_'+first.upload,'null');assert.throws(g.terminal,/ORDER_MISMATCH/);g.advance(300000);assert.equal(g.terminal().state,'GREEN');
});

function startCoreFixture(){
 const f=fixture({state:'FIELD_ACTIVE'});f.sheets['Access Card Register'].rows.push(['CARD-P','P003','PIONEER','B003','ACTIVE','',1,true]);
 const e={parameter:{core:'NC-001',pioneerUid:'B003',uid:'uid1'}};
 return {...f,startE:e,issue:()=>f.ctx.startCoreTransfer(e)};
}
test('START_CORE grants ACTIVE 0/1 Pioneer one registered HQ RESERVE Core under ScriptLock with authoritative card identity',()=>{
 const f=startCoreFixture();let held=false;f.ctx.LockService.getScriptLock=()=>({waitLock(){assert.equal(held,false);held=true;},releaseLock(){held=false;}});const transfer=f.ctx.transferCoreOwnership;f.ctx.transferCoreOwnership=args=>{assert.equal(held,true);return transfer(args);};
 f.startE.parameter.identity='FORGED';f.startE.parameter.capacity=3;const r=f.issue();assert.equal(r.identity,'P003');assert.equal(r.cardId,'CARD-P');assert.equal(f.ctx.countCoresOwnedBy('PIONEER','P003'),1);assert.equal(f.ctx.findIdentityById('P003').coreCapacity,1);const core=f.ctx.readCoreState('NC-001');assert.equal(core.ownerType,'PIONEER');assert.equal(core.ownerId,'P003');assert.equal(core.status,'FIELD');assert.equal(held,false);
 const log=f.sheets['Transaction Log'].rows.filter(row=>row[2]==='START_CORE');assert.equal(log.length,1);assert.equal(log[0][3],'P003');assert.equal(log[0][5],'NC-001');assert.match(log[0][15],/^EVT-1 \/\/ /);
});
test('START_CORE requires current FIELD_ACTIVE Event; missing, STANDBY, INITIALIZED, COMPLETED and ABORTED reject without mutation',()=>{
 for(const state of [null,'STANDBY','INITIALIZED','COMPLETED','ABORTED']){const f=startCoreFixture();if(state===null)f.sheets['Event Register'].rows=[[]];else f.sheets['Event Register'].rows[1][1]=state;const before=resetSnapshot(f);assert.throws(f.issue,/FIELD_ACTIVE_REQUIRED/);assert.equal(resetSnapshot(f),before);}
});
test('START_CORE rejects non-ACTIVE/unknown Access Card and every non-Pioneer role without mutation',()=>{
 for(const role of ['FOUNDER','FOP','LOCAL','UNBOUND','INACTIVE','UNKNOWN']){const f=startCoreFixture();if(role==='INACTIVE')f.sheets['Access Card Register'].rows[2][4]='INACTIVE';else if(role==='UNKNOWN')f.startE.parameter.pioneerUid='B999';else f.sheets['Access Card Register'].rows[2][2]=role;const before=resetSnapshot(f);assert.throws(f.issue,/nicht ACTIVE|nicht registriert|kein PIONEER/);assert.equal(resetSnapshot(f),before);}
});
test('START_CORE requires exactly capacity 1 and zero personal Cores at any existing inventory size',()=>{
 for(const capacity of [0,2,3,1.5]){const f=startCoreFixture();f.sheets['Access Card Register'].rows[2][6]=capacity;const before=resetSnapshot(f);assert.throws(f.issue,/START_CORE_CAPACITY_REQUIRED/);assert.equal(resetSnapshot(f),before);}
 for(const count of [1,2,3]){const f=startCoreFixture();for(let n=2;n<2+count;n++){const row=f.sheets['N-Core Register'].rows[n];row[14]='PIONEER';row[15]='P003';row[4]='FIELD';}const before=resetSnapshot(f);assert.throws(f.issue,/START_CORE_PERSONAL_CORE_PRESENT/);assert.equal(resetSnapshot(f),before);}
});
test('START_CORE rejects non-reserve Owner/Status, unknown Core registration and mismatched physical UID before any write',()=>{
 for(const kind of ['owner','hq','transit','field','deployed','unregistered','uid','foreign-core-id']){const f=startCoreFixture(),row=f.sheets['N-Core Register'].rows[1];if(kind==='owner')row[14]='FOP';if(kind==='hq')row[15]='OTHER';if(kind==='transit')row[4]='IN_TRANSIT';if(kind==='field')row[4]='FIELD';if(kind==='deployed')row[4]='DEPLOYED';if(kind==='unregistered')row[2]='';if(kind==='uid')f.startE.parameter.uid='B999';if(kind==='foreign-core-id')f.startE.parameter.core='NC-002';const before=resetSnapshot(f);assert.throws(f.issue,/NODIV_RESERVE|RESERVE_REQUIRED|nicht registriert|UID stimmt nicht/);assert.equal(resetSnapshot(f),before);}
});
test('START_CORE retries/same or second Core cannot issue again; first Core and successful log remain unchanged',()=>{
 const f=startCoreFixture();f.issue();const first=f.ctx.readCoreState('NC-001'),before=resetSnapshot(f);assert.throws(f.issue,/PERSONAL_CORE_PRESENT/);f.startE.parameter.core='NC-002';f.startE.parameter.uid='uid2';assert.throws(f.issue,/PERSONAL_CORE_PRESENT/);assert.equal(resetSnapshot(f),before);assert.equal(f.ctx.readCoreState('NC-001').lastTransaction,first.lastTransaction);assert.equal(f.ctx.readCoreState('NC-002').ownerId,'HQ');assert.equal(f.sheets['Transaction Log'].rows.filter(row=>row[2]==='START_CORE').length,1);
});
test('START_CORE existing issuance receipt prevents reacquisition after a legal personal Core return, including legacy receipts',()=>{
 for(const legacy of [false,true]){const f=startCoreFixture();f.issue();if(legacy)f.sheets['Transaction Log'].rows[1][15]='Start-Core issued from NODIV reserve // Access Card verified by UID';f.ctx.transferCoreOwnership({coreId:'NC-001',expectedFromType:'PIONEER',expectedFromId:'P003',toType:'NODIV_RESERVE',toId:'HQ',newStatus:'RESERVE',eventType:'CORE_RETURN'});assert.equal(f.ctx.countCoresOwnedBy('PIONEER','P003'),0);f.startE.parameter.core='NC-002';f.startE.parameter.uid='uid2';const before=resetSnapshot(f);assert.throws(f.issue,/START_CORE_ALREADY_ISSUED/);assert.equal(resetSnapshot(f),before);}
});
test('START_CORE retains existing reservation guards and prior-event history does not block fresh event issuance',()=>{
 const f=startCoreFixture();f.sheets['Deployment Register'].rows.push(['DEP','NC-001','F001','FOP','NODE-001','DEPLOYMENT','ASSIGNED']);const before=resetSnapshot(f);assert.throws(f.issue,/ASSIGNED|RESERV/);assert.equal(resetSnapshot(f),before);
 const g=startCoreFixture();g.ctx.appendTransactionLog({eventType:'START_CORE',actorId:'P003',actorRole:'PIONEER',result:'SUCCESS',details:'prior Event'});g.ctx.appendTransactionLog({eventType:'EVENT_INITIALIZED',actorId:'ROOT',actorRole:'FOUNDER',result:'SUCCESS',details:'EVT-1 // 10 Nodes // mechanical code sets generated'});assert.equal(g.issue().identity,'P003');assert.equal(g.ctx.countCoresOwnedBy('PIONEER','P003'),1);
});
test('START_CORE rejected batch leaves ownership and issuance log unchanged, and permits a valid retry',()=>{
 const f=startCoreFixture(),batch=f.ctx.Sheets.Spreadsheets.batchUpdate,before=resetSnapshot(f);f.ctx.Sheets.Spreadsheets.batchUpdate=()=>{throw Error('BATCH_FAILED');};assert.throws(f.issue,/BATCH_FAILED/);assert.equal(resetSnapshot(f),before);assert.equal(f.ctx.countCoresOwnedBy('PIONEER','P003'),0);f.ctx.Sheets.Spreadsheets.batchUpdate=batch;assert.equal(f.issue().transfer.core.ownerId,'P003');assert.equal(f.batches(),1);assert.equal(f.sheets['Transaction Log'].rows.filter(row=>row[2]==='START_CORE').length,1);
});

function preEvacuationFixture(expansions=0){
 const f=eventLifecycleFixture();f.start();for(let n=11;n<11+expansions;n++){f.expand('NODE-'+String(n).padStart(3,'0'));f.install('NODE-'+String(n).padStart(3,'0'));}
 let now=Date.now();const RealDate=Date;f.ctx.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
 const e={parameter:{...f.founder.parameter,event:f.ctx.readCurrentEvent().eventId}};
 return {...f,preEvacE:e,withdraw:()=>f.ctx.preEvacuationWithdrawal(e,true),withdrawState:()=>f.ctx.preEvacuationWithdrawal(e,false),now:()=>now,advance:ms=>now+=ms};
}
function preEvacLogs(f,type){return f.ctx.exchangeLogRows().filter(row=>row[2]===type);}
test('PRE-EVACUATION 10-node confirmation atomically starts permanent 30-minute countdown without deinstalling any original Node',()=>{
 const f=preEvacuationFixture(),cores=JSON.stringify(f.sheets['N-Core Register'].rows),nodes=JSON.stringify(f.sheets['Node Register'].rows),codes=JSON.stringify(f.sheets['Event Node Codes'].rows),b=f.batches(),r=f.withdraw();assert.equal(r.status,'PRE_EVACUATION_WITHDRAWAL_COMPLETE');assert.equal(r.completedAt,f.now());assert.equal(r.readyAt,f.now()+1800000);assert.equal(r.evacuationReady,false);assert.equal(r.targets.length,0);assert.equal(f.batches(),b+1);assert.equal(preEvacLogs(f,'PRE_EVACUATION_WITHDRAWAL_STARTED').length,1);assert.equal(preEvacLogs(f,'PRE_EVACUATION_WITHDRAWAL_COMPLETE').length,1);assert.equal(JSON.stringify(f.sheets['N-Core Register'].rows),cores);assert.equal(JSON.stringify(f.sheets['Node Register'].rows),nodes);assert.equal(JSON.stringify(f.sheets['Event Node Codes'].rows),codes);assert.equal(f.ctx.readCurrentEvent().state,'FIELD_ACTIVE');assert.equal(f.ctx.readCurrentEvent().activeNodes,10);
});
test('PRE-EVACUATION 11 nodes queues exactly the Expansion Node and countdown waits for its existing 3/3 FOP recovery',()=>{
 const f=preEvacuationFixture(1),r=f.withdraw();assert.equal(r.status,'PRE_EVACUATION_WITHDRAWAL_PENDING');assert.deepEqual(Array.from(r.targets),['NODE-011']);assert.equal(r.completedAt,undefined);const queue=f.ctx.getFopOperations(f.e).operations;assert.equal(queue.length,1);assert.equal(queue[0].nodeId,'NODE-011');assert.equal(queue[0].type,'DEINSTALL');assert.equal(queue[0].withdrawal,r.withdrawal);assert.match(queue[0].label,/PRE-EVACUATION/);assert.equal(preEvacLogs(f,'PRE_EVACUATION_WITHDRAWAL_COMPLETE').length,0);
 f.advance(123000);assert.equal(f.withdrawState().evacuationReady,false);f.remove('NODE-011');const complete=f.withdrawState();assert.equal(complete.completedAt,f.now());assert.equal(complete.readyAt,f.now()+1800000);assert.equal(f.ctx.readCurrentEvent().activeNodes,10);assert.equal(f.ctx.readCurrentEvent().plannedNodes,11);const receipt=JSON.parse(preEvacLogs(f,'PRE_EVACUATION_WITHDRAWAL_COMPLETE')[0][15]);assert.equal(receipt.returnedCores.length,3);for(const id of receipt.returnedCores){const core=f.ctx.readCoreState(id);assert.equal(core.ownerType,'NODIV_RESERVE');assert.equal(core.ownerId,'HQ');assert.equal(core.status,'RESERVE');}assert.equal(f.ctx.getNodeGameplayStatus('NODE-011'),'AVAILABLE');
});
test('PRE-EVACUATION 12 nodes completes atomically with second Expansion recovery only; exactly 10 original Nodes remain',()=>{
 const f=preEvacuationFixture(2);assert.deepEqual(Array.from(f.withdraw().targets),['NODE-011','NODE-012']);f.remove('NODE-012');const pending=f.withdrawState();assert.equal(pending.completedAt,undefined);assert.deepEqual(Array.from(pending.pendingNodes),['NODE-011']);assert.equal(preEvacLogs(f,'PRE_EVACUATION_WITHDRAWAL_COMPLETE').length,0);f.advance(300000);f.remove('NODE-011');const complete=f.withdrawState();assert.equal(complete.completedAt,f.now());assert.equal(f.ctx.readCurrentEvent().activeNodes,10);assert.equal(f.ctx.readCurrentEvent().plannedNodes,12);const receipt=JSON.parse(preEvacLogs(f,'PRE_EVACUATION_WITHDRAWAL_COMPLETE')[0][15]);assert.equal(new Set(receipt.returnedCores).size,6);assert.ok(receipt.returnedCores.every(id=>f.ctx.readCoreState(id).ownerId==='HQ'));for(let n=1;n<=10;n++)assert.equal(f.ctx.countCoresOwnedBy('NODE','NODE-'+String(n).padStart(3,'0')),3);
});
test('PRE-EVACUATION scoped request rejects original Node, Reserve Node, INSTALL, stale/forged ID without mutations',()=>{
 const f=preEvacuationFixture(1),r=f.withdraw();for(const [node,operation,id] of [['NODE-001','DEINSTALL',r.withdrawal],['NODE-015','DEINSTALL',r.withdrawal],['NODE-011','INSTALL',r.withdrawal],['NODE-011','DEINSTALL','FORGED']]){const before=resetSnapshot(f);assert.throws(()=>f.ctx.getNodeOperationOrder({parameter:{token:f.e.parameter.token,node,withdrawal:id}},operation),/TARGET_NOT_ASSIGNED|NODE_NOT_INSTALLED|INSTALL_ORDER_REQUIRED|ALREADY_INSTALLED|NODE_NOT_IN_EVENT/);assert.equal(resetSnapshot(f),before);}
});
test('PRE-EVACUATION incomplete 1/3 or 2/3 recovery does not change Ownership or begin countdown',()=>{
 const f=preEvacuationFixture(1);const r=f.withdraw(),order=f.ctx.getNodeDeinstallOrder({parameter:{token:f.e.parameter.token,node:'NODE-011',withdrawal:r.withdrawal}}),e={parameter:{token:f.e.parameter.token,node:'NODE-011',installation:order.installation}},before=JSON.stringify(f.sheets);
 for(let n=0;n<2;n++){e.parameter.uid=f.ctx.readCoreState(order.loadout[n].id).uid;f.ctx.scanNodeDeinstallationCore(e);assert.throws(()=>f.ctx.confirmNodeDeinstallation(e),/EXACTLY_3/);assert.equal(JSON.stringify(f.sheets),before);assert.equal(f.withdrawState().completedAt,undefined);}assert.equal(preEvacLogs(f,'PRE_EVACUATION_WITHDRAWAL_COMPLETE').length,0);
});
test('PRE-EVACUATION deinstalled but inconsistent HQ Ownership/status or missing delivered proof never completes',()=>{
 for(const kind of ['ownership','status','deployment','node-owned','missing-log']){const f=preEvacuationFixture(2);f.withdraw();const out=f.remove('NODE-011'),log=f.ctx.exchangeLogRows().find(row=>row[2]==='NODE_DEINSTALLED'&&row[13]==='NODE-011'),coreId=String(log[15]).split(' // ')[3].split(',')[0],row=f.sheets['N-Core Register'].rows[Number(coreId.slice(3))];if(kind==='ownership'){row[14]='PIONEER';row[15]='P003';}if(kind==='status')row[4]='IN_TRANSIT';if(kind==='deployment')f.sheets['Deployment Register'].rows.find(row=>row[1]===coreId&&row[5]==='NODE_DEINSTALLATION')[6]='CANCELLED';if(kind==='node-owned'){row[14]='NODE';row[15]='NODE-011';row[4]='DEPLOYED';}if(kind==='missing-log')f.sheets['Transaction Log'].rows=f.sheets['Transaction Log'].rows.filter(row=>row[2]!=='NODE_RECOVERY_CORE'||row[5]!==coreId);f.remove('NODE-012');const state=f.withdrawState();assert.equal(state.status,'PRE_EVACUATION_BLOCKED',kind);assert.equal(state.completedAt,undefined);assert.equal(state.evacuationReady,false);assert.equal(preEvacLogs(f,'PRE_EVACUATION_WITHDRAWAL_COMPLETE').length,0);}
});
test('PRE-EVACUATION deadline survives Reload/Founder Session replacement; exact boundary determines READY without automatic Event transition',()=>{
 const f=preEvacuationFixture(),first=f.withdraw();f.advance(1799999);assert.equal(f.withdrawState().evacuationReady,false);f.cache.delete('NODIV_SESSION_'+f.preEvacE.parameter.token);const session=f.ctx.startPlayerSession({parameter:{uid:'rootuid'}});f.preEvacE.parameter.token=session.token;const recovered=f.withdrawState();assert.equal(recovered.completedAt,first.completedAt);assert.equal(recovered.readyAt,first.readyAt);f.advance(1);const ready=f.withdrawState();assert.equal(ready.evacuationReady,true);assert.equal(ready.status,'EVACUATION_READY');assert.equal(ready.automaticEvacuation,false);assert.equal(f.ctx.readCurrentEvent().state,'FIELD_ACTIVE');assert.equal(f.ctx.readCurrentEvent().activeNodes,10);const before=resetSnapshot(f);assert.equal(f.withdraw().replayed,true);assert.equal(resetSnapshot(f),before);
});
test('PRE-EVACUATION Founder only, current Field Event and complete 10+2 membership required; no state call creates a withdrawal',()=>{
 const f=preEvacuationFixture();const before=resetSnapshot(f);assert.equal(f.withdrawState().status,'PRE_EVACUATION_NOT_STARTED');assert.equal(resetSnapshot(f),before);assert.throws(()=>f.ctx.preEvacuationWithdrawal({parameter:{token:f.e.parameter.token,event:f.preEvacE.parameter.event}},true),/ROLE_DENIED/);f.preEvacE.parameter.event='OTHER';assert.throws(f.withdraw,/EVENT_MISMATCH/);assert.equal(resetSnapshot(f),before);f.preEvacE.parameter.event=f.ctx.readCurrentEvent().eventId;f.sheets['Event Register'].rows[1][1]='INITIALIZED';const changed=resetSnapshot(f);assert.throws(f.withdraw,/NOT_FIELD_ACTIVE/);assert.equal(resetSnapshot(f),changed);
});
test('PRE-EVACUATION start/final recovery rejected batches leave no partial countdown, preserve ownership and allow valid retry',()=>{
 const f=preEvacuationFixture(),batch=f.ctx.Sheets.Spreadsheets.batchUpdate,before=resetSnapshot(f);f.ctx.Sheets.Spreadsheets.batchUpdate=()=>{throw Error('BATCH_FAILED');};assert.throws(f.withdraw,/BATCH_FAILED/);assert.equal(resetSnapshot(f),before);f.ctx.Sheets.Spreadsheets.batchUpdate=batch;assert.equal(f.withdraw().completedAt,f.now());
 const g=preEvacuationFixture(1);g.withdraw();const order=g.ctx.getNodeDeinstallOrder({parameter:{token:g.e.parameter.token,node:'NODE-011'}}),e={parameter:{token:g.e.parameter.token,node:'NODE-011',installation:order.installation}};for(const core of order.loadout){e.parameter.uid=g.ctx.readCoreState(core.id).uid;g.ctx.scanNodeDeinstallationCore(e);}const b=g.ctx.Sheets.Spreadsheets.batchUpdate,snapshot=resetSnapshot(g);g.ctx.Sheets.Spreadsheets.batchUpdate=()=>{throw Error('BATCH_FAILED');};assert.throws(()=>g.ctx.confirmNodeDeinstallation(e),/BATCH_FAILED/);assert.equal(resetSnapshot(g),snapshot);assert.equal(g.withdrawState().completedAt,undefined);g.ctx.Sheets.Spreadsheets.batchUpdate=b;g.ctx.confirmNodeDeinstallation(e);assert.equal(g.withdrawState().completedAt,g.now());assert.equal(preEvacLogs(g,'PRE_EVACUATION_WITHDRAWAL_COMPLETE').length,1);
});
test('PRE-EVACUATION lost START or final recovery response cannot duplicate receipts or move countdown',()=>{
 for(const expansion of [0,1]){const f=preEvacuationFixture(expansion),batch=f.ctx.Sheets.Spreadsheets.batchUpdate;let first,confirm;if(expansion){f.withdraw();const order=f.ctx.getNodeDeinstallOrder({parameter:{token:f.e.parameter.token,node:'NODE-011'}}),e={parameter:{token:f.e.parameter.token,node:'NODE-011',installation:order.installation}};for(const core of order.loadout){e.parameter.uid=f.ctx.readCoreState(core.id).uid;f.ctx.scanNodeDeinstallationCore(e);}confirm=()=>f.ctx.confirmNodeDeinstallation(e);}f.ctx.Sheets.Spreadsheets.batchUpdate=(...args)=>{batch(...args);throw Error('LOST_RESPONSE');};if(expansion)assert.throws(confirm,/LOST_RESPONSE/);else assert.throws(f.withdraw,/LOST_RESPONSE/);f.ctx.Sheets.Spreadsheets.batchUpdate=batch;first=f.withdrawState();assert.equal(first.completedAt,f.now());f.advance(5000);const before=resetSnapshot(f),retry=f.withdraw();assert.equal(retry.completedAt,first.completedAt);assert.equal(retry.readyAt,first.readyAt);assert.equal(resetSnapshot(f),before);assert.equal(preEvacLogs(f,'PRE_EVACUATION_WITHDRAWAL_COMPLETE').length,1);}
});
test('PRE-EVACUATION derives actual original IDs from membership, never assumes NODE-001..010 are the start set',()=>{
 const f=eventLifecycleFixture();f.initialize(Array.from({length:10},(_,i)=>'NODE-'+String(i+4).padStart(3,'0')).join(','));for(let n=4;n<=13;n++)f.install('NODE-'+String(n).padStart(3,'0'));f.ctx.activateEvent(f.founder);f.expand('NODE-001');f.install('NODE-001');const e={parameter:{token:f.founder.parameter.token,event:f.ctx.readCurrentEvent().eventId}},r=f.ctx.preEvacuationWithdrawal(e,true);assert.deepEqual(Array.from(r.targets),['NODE-001']);assert.throws(()=>f.ctx.getNodeDeinstallOrder({parameter:{token:f.e.parameter.token,node:'NODE-004',withdrawal:r.withdrawal}}),/TARGET_NOT_ASSIGNED/);f.remove('NODE-001');assert.equal(f.ctx.preEvacuationWithdrawal(e,false).status,'PRE_EVACUATION_WITHDRAWAL_COMPLETE');
});

function evacuationFixture({ready=true,start=true,expansions=0}={}){
 const f=preEvacuationFixture(expansions);f.sheets['Player Energy Ledger']=new f.sheets['Transaction Log'].constructor(9,[[]]);f.withdraw();for(let n=11;n<11+expansions;n++)f.remove('NODE-'+String(n).padStart(3,'0'));if(ready)f.advance(1800000);
 function add(identity,role){const card='CARD-'+identity,uid='carduid'+identity,token=(identity+'e'.repeat(72)).slice(0,72).toLowerCase().replace(/[^a-f0-9]/g,'b');f.sheets['Access Card Register'].rows.push([card,identity,role,uid,'ACTIVE','',role==='PIONEER'?1:0,true,role==='PIONEER']);f.cache.set('NODIV_SESSION_'+token,JSON.stringify({identity,role,cardId:card}));return {identity,uid,token};}
 const a=add('P001','PIONEER'),b=add('P002','PIONEER'),c=add('P003','PIONEER'),d=add('P004','PIONEER');
 const event=f.ctx.readCurrentEvent().eventId,begin=()=>f.ctx.evacuationAction({parameter:{...f.founder.parameter,event}},'evacuationstart');
 const make=(token=f.e.parameter.token,A=a,B=b)=>f.ctx.evacuationAction({parameter:{token,event,pioneerAUid:A.uid,pioneerBUid:B.uid}},'evacuationteam');
 if(start)begin();
 function order(team,node=team.nodes.find(n=>n.status==='NEXT').nodeId,token=f.e.parameter.token){return f.ctx.getNodeDeinstallOrder({parameter:{token,node,evacuation:team.teamId,uid:f.sheets['Node Register'].rows.find(row=>row[0]===node)[1]}});}
 function scanAll(order,token=f.e.parameter.token){const e={parameter:{token,node:order.node.id,installation:order.installation}};for(const core of order.loadout){e.parameter.uid=f.ctx.readCoreState(core.id).uid;f.ctx.scanNodeDeinstallationCore(e);}return e;}
 return {...f,a,b,c,d,add,event,begin,make,evacOrder:order,scanAll,evacState:token=>f.ctx.evacuationAction({parameter:{token,event}},'evacuationstate')};
}
test('EVAC-1 Founder requires EVACUATION_READY and current Event; cannot automatically change phase',()=>{
 const f=evacuationFixture({ready:false,start:false}),before=resetSnapshot(f);assert.throws(f.begin,/NOT_READY/);assert.equal(resetSnapshot(f),before);assert.throws(f.make,/NOT_STARTED/);f.advance(1800000);assert.equal(f.begin().status,'EVACUATION_IN_PROGRESS');assert.equal(f.ctx.readCurrentEvent().state,'FIELD_ACTIVE');const after=resetSnapshot(f);assert.equal(f.begin().replayed,true);assert.equal(resetSnapshot(f),after);assert.throws(()=>f.ctx.evacuationAction({parameter:{token:f.e.parameter.token,event:f.event}},'evacuationstart'),/FOUNDER_REQUIRED/);
});
test('EVAC-1 physical Access Cards form exactly FOP + two active Pioneers and reserve two unique Start Nodes atomically',()=>{
 const f=evacuationFixture(),before=JSON.stringify(f.sheets['N-Core Register'].rows),r=f.make().evacuation;assert.equal(r.nodes.length,2);assert.deepEqual(Array.from(r.nodes,n=>n.nodeId),['NODE-001','NODE-002']);assert.deepEqual(Array.from(r.nodes,n=>n.status),['NEXT','WAITING']);assert.equal(r.fop,'F001');assert.deepEqual(Array.from(r.pioneers),['P001','P002']);assert.equal(JSON.stringify(f.sheets['N-Core Register'].rows),before);const deps=f.sheets['Deployment Register'].rows.filter(row=>row[5]==='EVACUATION');assert.equal(deps.length,6);assert.ok(deps.every(row=>row[6]==='ASSIGNED'));const snapshot=resetSnapshot(f);assert.equal(f.make().replayed,true);assert.equal(resetSnapshot(f),snapshot);
 for(const args of [[f.e.parameter.token,f.a,f.a],[f.a.token,f.a,f.b],[f.e.parameter.token,{uid:'unknown'},f.b]])assert.throws(()=>f.make(...args),/TWO_PIONEERS|FOP_REQUIRED|CARD_REQUIRED/);
});
test('EVAC-1 prevents member/node overlap across teams, mismatched roles and inactive Pioneer cards',()=>{
 const f=evacuationFixture(),one=f.make().evacuation,fop=f.add('F002','FOP');assert.throws(()=>f.make(f.e.parameter.token,f.c,f.d),/ALREADY_ASSIGNED/);assert.throws(()=>f.make(fop.token,f.a,f.c),/ALREADY_ASSIGNED/);const two=f.make(fop.token,f.c,f.d).evacuation;assert.ok(two.nodes.every(node=>!one.nodes.some(n=>n.nodeId===node.nodeId)));assert.equal(new Set(f.ctx.evacuationTeams(f.event).flatMap(team=>team.nodes.map(n=>n.nodeId))).size,4);
 const g=evacuationFixture();g.sheets['Access Card Register'].rows.find(row=>row[1]==='P001')[4]='INACTIVE';assert.throws(g.make,/PIONEER_REQUIRED/);assert.equal(g.ctx.evacuationTeams(g.event).length,0);
});
test('EVAC-1 next Node only, own FOP + physical Node NFC, foreign team/Node/recipient attempts rejected',()=>{
 const f=evacuationFixture(),team=f.make().evacuation,queue=f.ctx.getFopOperations(f.e);assert.equal(queue.operations.length,1);assert.equal(queue.operations[0].nodeId,'NODE-001');assert.equal(queue.operations[0].evacuation,team.teamId);
 const before=resetSnapshot(f);for(const params of [{token:f.e.parameter.token,node:'NODE-001'}, {token:f.e.parameter.token,node:'NODE-002',evacuation:team.teamId,uid:'nodeuid2'}, {token:f.a.token,node:'NODE-001',evacuation:team.teamId,uid:'nodeuid1'}, {token:f.e.parameter.token,node:'NODE-001',evacuation:team.teamId,uid:'nodeuid3'}])assert.throws(()=>f.ctx.getNodeDeinstallOrder({parameter:params}),/TEAM_MISMATCH|NOT_NEXT|ROLE_DENIED|NFC_REQUIRED/);assert.equal(resetSnapshot(f),before);
 assert.throws(()=>f.ctx.getNodeDeinstallOrder({parameter:{token:f.e.parameter.token,node:'NODE-003'}}),/TEAM_REQUIRED/);assert.equal(f.evacState(f.a.token).evacuation.cargo.length,0);
});
test('EVAC-1 exact 3/3 recovery atomically moves Node 1 cargo to A, then Node 2 cargo to B and marks team COMPLETE',()=>{
 const f=evacuationFixture(),team=f.make().evacuation;for(const [index,pioneer] of [f.a,f.b].entries()){
  const current=f.evacState(f.e.parameter.token).evacuation,order=f.evacOrder(current),before=JSON.stringify(f.sheets['N-Core Register'].rows),e=f.scanAll(order);assert.equal(JSON.stringify(f.sheets['N-Core Register'].rows),before);
  const result=f.ctx.confirmNodeDeinstallation(e);assert.equal(result.status,'NODE_DEINSTALLED');assert.equal(f.ctx.countCoresOwnedBy('NODE',order.node.id),0);assert.equal(f.ctx.getNodeGameplayStatus(order.node.id),'AVAILABLE');assert.equal(f.ctx.findEventNodeCode(f.event,order.node.id).activeSlot,'');
  const cargo=f.ctx.getPlayerState({parameter:{token:pioneer.token}});assert.equal(cargo.cores.length,0);assert.equal(cargo.carriedEnergy,0);assert.equal(cargo.player.coreCapacity,1);assert.equal(cargo.evacuation.cargo.length,1);assert.equal(cargo.evacuation.cargo[0].cores.length,3);assert.equal(cargo.evacuation.cargo[0].status,'IN_TRANSIT');
  for(const item of order.loadout){const core=f.ctx.readCoreState(item.id);assert.equal(core.ownerType,'NODIV_RESERVE');assert.equal(core.ownerId,'HQ');assert.equal(core.status,'IN_TRANSIT');const dep=f.ctx.findDeploymentById(f.ctx.evacuationDeploymentId(team.teamId,order.node.id,item.id));assert.equal(dep.carrierId,pioneer.identity);assert.equal(dep.status,'IN_TRANSIT');assert.equal(dep.purpose,'EVACUATION');}
  const snapshot=resetSnapshot(f);assert.equal(f.ctx.confirmNodeDeinstallation(e).replayed,true);assert.equal(resetSnapshot(f),snapshot);
  assert.equal(result.evacuation.status,index===0?'EVACUATION_TEAM_ACTIVE':'EVACUATION_TEAM_COMPLETE');
 }
 assert.equal(f.ctx.readCurrentEvent().state,'FIELD_ACTIVE');assert.equal(f.ctx.readCurrentEvent().activeNodes,8);assert.equal(f.ctx.evacuationRecords('EVACUATION_TEAM_COMPLETE',f.event).length,1);assert.equal(f.ctx.evacuationRecords('EVACUATION_NODE_RECOVERED',f.event).length,2);assert.equal(f.ctx.exchangeLogRows().filter(row=>row[2]==='EVACUATION_CORE_IN_TRANSIT').length,6);assert.equal(f.ctx.getFopOperations(f.e).operations.length,0);
});
test('EVAC-1 isolated cargo is not catchable/uploadable/exchangeable/Restore/Re-Supply cargo nor generically transferable',()=>{
 const f=evacuationFixture(),team=f.make().evacuation,order=f.evacOrder(team),e=f.scanAll(order);f.ctx.confirmNodeDeinstallation(e);
 const core=f.ctx.readCoreState(order.loadout[0].id),p=f.ctx.findIdentityById('P001');assert.equal(f.ctx.routeCoreGameplay(p,core).decision.reason,'EVACUATION_CARGO_PROTECTED');assert.throws(()=>f.ctx.catchContext(f.ctx.findIdentityById('P003'),p),/NO_CATCHABLE_CORE/);
 assert.throws(()=>f.ctx.assertReSupplyEligibility(p),/MISSION_CARGO_ALREADY_ACTIVE/);assert.ok(!f.ctx.getAvailableInstallationCores().some(c=>c.coreId===core.coreId));
 const before=resetSnapshot(f);for(const dest of ['PIONEER','NODE','NODIV_RESERVE'])assert.throws(()=>f.ctx.transferCoreOwnership({coreId:core.coreId,expectedFromType:'NODIV_RESERVE',expectedFromId:'HQ',toType:dest,toId:dest==='PIONEER'?'P003':dest==='NODE'?'NODE-003':'HQ',newStatus:'FIELD',batchRequests:[]}),/EVACUATION_CARGO_PROTECTED/);assert.equal(resetSnapshot(f),before);
 assert.equal(f.ctx.getNodeAccessAuthorization(p,'NODE-002','INSTALLED').allowed,false);assert.equal(f.ctx.deliverCoreDeployment({parameter:{token:f.a.token,uid:'nodeuid1'}}).status,'EVACUATION_CARGO_PROTECTED');
});
test('EVAC-1 order rebind after new Session preserves 0/3, 1/3 and 3/3 scans; replay remains session independent',()=>{
 for(const count of [0,1,3]){const f=evacuationFixture(),team=f.make().evacuation,order=f.evacOrder(team),e={parameter:{token:f.e.parameter.token,node:order.node.id,installation:order.installation}};for(const core of order.loadout.slice(0,count)){e.parameter.uid=f.ctx.readCoreState(core.id).uid;f.ctx.scanNodeDeinstallationCore(e);}f.cache.delete('NODIV_SESSION_'+f.e.parameter.token);const token=f.ctx.startPlayerSession({parameter:{uid:'fopuid'}}).token;const resumed=f.evacOrder(team,'NODE-001',token);assert.equal(resumed.installation,order.installation);assert.equal(resumed.count,count);const next={parameter:{token,node:'NODE-001',installation:order.installation}};for(const core of resumed.loadout){next.parameter.uid=f.ctx.readCoreState(core.id).uid;f.ctx.scanNodeDeinstallationCore(next);}assert.equal(f.ctx.confirmNodeDeinstallation(next).evacuation.cargo.length,1);assert.equal(f.ctx.confirmNodeDeinstallation(next).replayed,true);}
});
test('EVAC-1 batch failure never partly assigns a team, moves cargo or marks recovery complete; lost response replays once',()=>{
 const f=evacuationFixture(),batch=f.ctx.Sheets.Spreadsheets.batchUpdate,before=resetSnapshot(f);f.ctx.Sheets.Spreadsheets.batchUpdate=()=>{throw Error('BATCH_FAILED')};assert.throws(f.make,/BATCH_FAILED/);assert.equal(resetSnapshot(f),before);f.ctx.Sheets.Spreadsheets.batchUpdate=batch;const team=f.make().evacuation,order=f.evacOrder(team),e=f.scanAll(order),snapshot=resetSnapshot(f);f.ctx.Sheets.Spreadsheets.batchUpdate=()=>{throw Error('BATCH_FAILED')};assert.throws(()=>f.ctx.confirmNodeDeinstallation(e),/BATCH_FAILED/);assert.equal(resetSnapshot(f),snapshot);f.ctx.Sheets.Spreadsheets.batchUpdate=(...args)=>{batch(...args);throw Error('LOST_RESPONSE')};assert.throws(()=>f.ctx.confirmNodeDeinstallation(e),/LOST_RESPONSE/);f.ctx.Sheets.Spreadsheets.batchUpdate=batch;const after=resetSnapshot(f);assert.equal(f.ctx.confirmNodeDeinstallation(e).replayed,true);assert.equal(resetSnapshot(f),after);assert.equal(f.ctx.evacuationRecords('EVACUATION_NODE_RECOVERED',f.event).length,1);
});
test('EVAC-1 snapshot, Event change, member revocation and reservation conflicts reject without mutation',()=>{
 for(const kind of ['snapshot','event','member','reservation']){const f=evacuationFixture(),team=f.make().evacuation,order=f.evacOrder(team),e=f.scanAll(order);if(kind==='snapshot')f.sheets['N-Core Register'].rows[Number(order.loadout[0].id.slice(3))][1]++;if(kind==='event')f.sheets['Event Register'].rows[1][0]='OTHER';if(kind==='member')f.sheets['Access Card Register'].rows.find(row=>row[1]==='P001')[4]='INACTIVE';if(kind==='reservation')f.sheets['Deployment Register'].rows.find(row=>row[5]==='EVACUATION')[2]='P003';const snapshot=resetSnapshot(f);assert.throws(()=>f.ctx.confirmNodeDeinstallation(e),/SNAPSHOT_CHANGED|NOT_IN_EVENT|MEMBER_INVALID|RESERVATION_INVALID/);assert.equal(resetSnapshot(f),snapshot);}
});
test('EVAC-1 five teams recover exactly ten Start Nodes and thirty protected cargo Cores, never Event COMPLETED',()=>{
 const f=evacuationFixture(),nodeIds=[],teams=[];for(let i=0;i<5;i++){const fop=i===0?{token:f.e.parameter.token}:f.add('F00'+(i+1),'FOP'),a=i===0?f.a:f.add('P0'+(10+i*2),'PIONEER'),b=i===0?f.b:f.add('P0'+(11+i*2),'PIONEER');teams.push({token:fop.token,state:f.make(fop.token,a,b).evacuation});}
 for(const {token,state} of teams){for(let i=0;i<2;i++){const order=f.evacOrder(f.evacState(token).evacuation,undefined,token);nodeIds.push(order.node.id);f.ctx.confirmNodeDeinstallation(f.scanAll(order,token));}assert.equal(f.evacState(token).evacuation.status,'EVACUATION_TEAM_COMPLETE');}
 assert.equal(new Set(nodeIds).size,10);assert.equal(f.ctx.readCurrentEvent().activeNodes,0);assert.equal(f.ctx.readCurrentEvent().state,'FIELD_ACTIVE');assert.equal(f.sheets['N-Core Register'].rows.filter(row=>row[14]==='NODIV_RESERVE'&&row[15]==='HQ'&&row[4]==='IN_TRANSIT').length,30);assert.equal(f.ctx.evacuationRecords('EVACUATION_TEAM_COMPLETE',f.event).length,5);assert.equal(f.ctx.shutdownFieldEvent({parameter:{...f.founder.parameter,event:f.event}}).status,'FIELD_SHUTDOWN_BLOCKED');
});
test('EVAC-1 preserves existing personal FIELD slots and catch selection while three cargo Cores are carried',()=>{
 const f=evacuationFixture();f.sheets['N-Core Register'].rows[40][14]='PIONEER';f.sheets['N-Core Register'].rows[40][15]='P001';f.sheets['N-Core Register'].rows[40][4]='FIELD';const team=f.make().evacuation,order=f.evacOrder(team);f.ctx.confirmNodeDeinstallation(f.scanAll(order));const state=f.ctx.getPlayerState({parameter:{token:f.a.token}});assert.equal(state.cores.length,1);assert.equal(state.cores[0].coreId,'NC-040');assert.equal(state.evacuation.cargo[0].cores.length,3);assert.equal(state.player.coreCapacity,1);assert.equal(f.ctx.catchContext(f.ctx.findIdentityById('P003'),f.ctx.findIdentityById('P001')).core.coreId,'NC-040');
});
test('EVAC-1 assignment survives lost response with same six reservations and no second team; incomplete recovery never moves a Core',()=>{
 const f=evacuationFixture(),batch=f.ctx.Sheets.Spreadsheets.batchUpdate;f.ctx.Sheets.Spreadsheets.batchUpdate=(...args)=>{batch(...args);throw Error('LOST_RESPONSE')};assert.throws(f.make,/LOST_RESPONSE/);f.ctx.Sheets.Spreadsheets.batchUpdate=batch;const before=resetSnapshot(f),team=f.make().evacuation;assert.equal(resetSnapshot(f),before);assert.equal(f.ctx.evacuationTeams(f.event).length,1);assert.equal(f.sheets['Deployment Register'].rows.filter(row=>row[5]==='EVACUATION').length,6);
 const order=f.evacOrder(team),e={parameter:{token:f.e.parameter.token,node:order.node.id,installation:order.installation}};for(let i=0;i<3;i++){const snapshot=resetSnapshot(f);assert.throws(()=>f.ctx.confirmNodeDeinstallation(e),/EXACTLY_3/);assert.equal(resetSnapshot(f),snapshot);e.parameter.uid=f.ctx.readCoreState(order.loadout[i].id).uid;f.ctx.scanNodeDeinstallationCore(e);}e.parameter.uid='uid40';assert.throws(()=>f.ctx.scanNodeDeinstallationCore(e),/CORE NOT ASSIGNED/);assert.equal(f.ctx.evacuationRecoveries(f.ctx.evacuationTeam(team.teamId)).length,0);
});
test('EVAC-1 cancel/expired scan order keeps team reservation, reacquires only same Node and never takes another team cargo',()=>{
 const f=evacuationFixture(),team=f.make().evacuation,order=f.evacOrder(team),e={parameter:{token:f.e.parameter.token,node:order.node.id,installation:order.installation}};f.ctx.cancelNodeDeinstallation(e);assert.equal(f.sheets['Deployment Register'].rows.filter(row=>row[5]==='EVACUATION'&&row[6]==='ASSIGNED').length,6);const newOrder=f.evacOrder(team);assert.notEqual(newOrder.installation,order.installation);f.advance(2*60*60*1000);assert.throws(()=>f.ctx.confirmNodeDeinstallation({parameter:{...e.parameter,installation:newOrder.installation}}),/EXPIRED/);f.ctx.startPlayerSession({parameter:{uid:'fopuid'}}); // Auth is refreshed below; team receipt remains durable.
 const token=f.ctx.startPlayerSession({parameter:{uid:'fopuid'}}).token,again=f.evacOrder(team,'NODE-001',token);assert.notEqual(again.installation,newOrder.installation);assert.equal(again.node.id,'NODE-001');assert.equal(f.ctx.evacuationTeams(f.event).length,1);
});
test('EVAC-1 protects all carried cargo from Upload and legacy delivery, binds Pioneer recovery to its own Access Card',()=>{
 const f=evacuationFixture(),team=f.make().evacuation,order=f.evacOrder(team);f.ctx.confirmNodeDeinstallation(f.scanAll(order));f.sheets['Upload Terminal Register'].rows.push(['HQ','UPLOAD_HQ','uploaduid','ACTIVE']);assert.equal(f.ctx.hqUploadContext(f.ctx.findIdentityById('P001'),'uploaduid').cores.length,0);assert.equal(f.ctx.evacuationPlayerState(f.ctx.findIdentityById('P003')),null);
 const token=f.ctx.startPlayerSession({parameter:{uid:f.a.uid}}).token,state=f.ctx.evacuationAction({parameter:{token,event:f.event}},'evacuationstate');assert.equal(state.evacuation.teamId,team.teamId);assert.equal(state.evacuation.cargo[0].carrier,'P001');assert.equal(state.evacuation.cargo[0].cores.length,3);
 const before=resetSnapshot(f);assert.throws(()=>f.expand('NODE-011'),/EVACUATION_IN_PROGRESS/);assert.equal(resetSnapshot(f),before);
});
test('EVAC-1 insufficient free Nodes or colliding mission never creates partial team reservations',()=>{
 const f=evacuationFixture();f.sheets['Deployment Register'].rows.push(['OTHER','NC-040','P001','PIONEER','NODE-009','DEPLOYMENT','ASSIGNED']);const before=resetSnapshot(f);assert.throws(f.make,/MEMBER_RESERVED/);assert.equal(resetSnapshot(f),before);
 const g=evacuationFixture();for(const node of g.sheets['Event Node Codes'].rows.slice(2))node[8]='RESERVE 1';const snapshot=resetSnapshot(g);assert.throws(g.make,/TWO_NODES_UNAVAILABLE/);assert.equal(resetSnapshot(g),snapshot);assert.equal(g.ctx.evacuationTeams(g.event).length,0);
});
test('EVAC-1 after 12-node PRE withdrawal assigns only original ten, never the returned Expansion Nodes',()=>{
 const f=evacuationFixture({expansions:2}),team=f.make().evacuation;assert.ok(team.nodes.every(node=>!['NODE-011','NODE-012'].includes(node.nodeId)));assert.equal(f.ctx.readCurrentEvent().activeNodes,10);assert.equal(f.ctx.readCurrentEvent().plannedNodes,12);const before=resetSnapshot(f);assert.throws(()=>f.evacOrder(team,'NODE-011'),/NODE_NOT_INSTALLED/);assert.equal(resetSnapshot(f),before);assert.equal(f.ctx.getNodeGameplayStatus('NODE-011'),'AVAILABLE');assert.equal(f.ctx.getNodeGameplayStatus('NODE-012'),'AVAILABLE');
});

function finishEvacuationTeam(f,token=f.e.parameter.token,A=f.a,B=f.b){
 let team=f.make(token,A,B).evacuation;for(let i=0;i<2;i++){const order=f.evacOrder(team,team.nextNode,token);team=f.ctx.confirmNodeDeinstallation(f.scanAll(order,token)).evacuation;}return team;
}
function finalScan(f,player,coreIndex=0){
 const state=f.evacState(player.token).evacuation,core=state.cargo[0].cores[coreIndex],e={parameter:{token:player.token,event:f.event,team:state.teamId,core:core.id,uid:f.ctx.readCoreState(core.id).uid}};
 const response=f.ctx.evacuationAction(e,'evacuationfinalscan');return {response,e:{parameter:{token:player.token,event:f.event,team:state.teamId,scan:response.evacuation.finalUpload.scan.id}},core};
}
test('EVAC-2 rejects early upload; only own cargo and one physical scanned Core accepted; no mutation before confirm',()=>{
 const f=evacuationFixture();f.ctx.transferCoreOwnership({coreId:'NC-040',expectedFromType:'NODIV_RESERVE',expectedFromId:'HQ',toType:'PIONEER',toId:'P001',newStatus:'FIELD',eventType:'START_CORE',actorId:'ROOT',actorRole:'FOUNDER'});const team=f.make().evacuation;assert.throws(()=>f.ctx.evacuationAction({parameter:{token:f.a.token,event:f.event,team:team.teamId,core:team.nodes[0].nodeId,uid:'x'}},'evacuationfinalscan'),/TEAM_NOT_COMPLETE/);
 for(let i=0;i<2;i++){const state=f.evacState(f.e.parameter.token).evacuation,order=f.evacOrder(state);f.ctx.confirmNodeDeinstallation(f.scanAll(order));}
 const state=f.evacState(f.a.token).evacuation;assert.equal(state.cargo.length,1);assert.equal(state.cargo[0].cores.length,3);assert.equal(state.finalUpload.available,true);
 for(const id of [f.evacState(f.b.token).evacuation.cargo[0].cores[0].id,'NC-040']){const before=resetSnapshot(f);assert.throws(()=>f.ctx.evacuationAction({parameter:{token:f.a.token,event:f.event,team:state.teamId,core:id,uid:f.ctx.readCoreState(id).uid}},'evacuationfinalscan'),/NOT_ASSIGNED/);assert.equal(resetSnapshot(f),before);}
 const own=f.sheets['N-Core Register'].rows.filter(row=>state.cargo[0].cores.some(core=>core.id===row[0]));const before=JSON.stringify(own),scan=finalScan(f,f.a);assert.equal(JSON.stringify(own),before);assert.equal(f.ctx.readPlayerEnergyBalance(f.a.identity),0);assert.throws(()=>f.ctx.evacuationAction({parameter:{...scan.e.parameter,scan:'wrong'}},'evacuationfinalconfirm'),/SCAN_REQUIRED/);
 const snapshot=resetSnapshot(f);assert.equal(f.ctx.evacuationAction({...scan.e,parameter:{...scan.e.parameter,core:scan.core.id,uid:f.ctx.readCoreState(scan.core.id).uid}},'evacuationfinalscan').replayed,true);assert.equal(resetSnapshot(f),snapshot);
});
test('EVAC-2 atomically credits visible Energy, withdraws cargo and waits for both Pioneers; permanent guards protect remaining Cores',()=>{
 const f=evacuationFixture();finishEvacuationTeam(f);const scan=finalScan(f,f.a,2),beforePersonal=f.ctx.countCoresOwnedBy('PIONEER',f.a.identity),r=f.ctx.evacuationAction(scan.e,'evacuationfinalconfirm');
 assert.equal(r.status,'EVACUATION_FINAL_UPLOAD_COMPLETE');assert.equal(f.ctx.readPlayerEnergyBalance(f.a.identity),scan.core.energy);assert.equal(r.evacuation.withdrawn,false);assert.equal(r.evacuation.finalUpload.completed,true);assert.equal(r.evacuation.cargo[0].status,'WITHDRAWN');assert.equal(f.ctx.countCoresOwnedBy('PIONEER',f.a.identity),beforePersonal);
 const receipts=f.ctx.evacuationRecords('EVACUATION_FINAL_UPLOAD',f.event);assert.equal(receipts.length,1);assert.equal(receipts[0].coreId,scan.core.id);assert.equal(receipts[0].energy,scan.core.energy);
 for(const core of r.evacuation.cargo[0].cores){assert.equal(f.ctx.readCoreState(core.id).status,'RESERVE');assert.equal(f.ctx.hasOpenDeploymentForCore(core.id),true);assert.equal(f.ctx.evacuationCoreReserved(core.id),true);assert.throws(()=>f.ctx.transferCoreOwnership({coreId:core.id,expectedFromType:'NODIV_RESERVE',expectedFromId:'HQ',toType:'PIONEER',toId:'P003',newStatus:'FIELD',eventType:'START_CORE',actorId:'ROOT',actorRole:'FOUNDER'}),/EVACUATION|RESERVED|DEPLOYMENT/);}
 const snapshot=resetSnapshot(f);assert.equal(f.ctx.evacuationAction(scan.e,'evacuationfinalconfirm').replayed,true);assert.equal(resetSnapshot(f),snapshot);assert.throws(()=>f.ctx.evacuationAction({parameter:{...scan.e.parameter,scan:'another'}},'evacuationfinalconfirm'),/ALREADY_COMPLETED/);
 const second=finalScan(f,f.b);const done=f.ctx.evacuationAction(second.e,'evacuationfinalconfirm');assert.equal(done.evacuation.command,'RETURN TO HQ');assert.equal(done.evacuation.withdrawn,true);assert.ok(done.evacuation.finalUploads.every(p=>p.completed));assert.equal(f.ctx.readCurrentEvent().state,'FIELD_ACTIVE');assert.equal(f.ctx.evacuationRecords('EVACUATION_TEAM_WITHDRAWAL',f.event).length,1);
});
test('EVAC-2 failure before Batch changes nothing; lost response is replayable without second credit; Session replacement restores proof',()=>{
 const f=evacuationFixture();finishEvacuationTeam(f);const scan=finalScan(f,f.a),batch=f.ctx.Sheets.Spreadsheets.batchUpdate,before=resetSnapshot(f);f.ctx.Sheets.Spreadsheets.batchUpdate=()=>{throw Error('BATCH_FAILED')};assert.throws(()=>f.ctx.evacuationAction(scan.e,'evacuationfinalconfirm'),/BATCH_FAILED/);assert.equal(resetSnapshot(f),before);
 f.cache.delete('NODIV_SESSION_'+f.a.token);const token=f.ctx.startPlayerSession({parameter:{uid:f.a.uid}}).token;scan.e.parameter.token=token;assert.equal(f.evacState(token).evacuation.finalUpload.scan.id,scan.e.parameter.scan);
 f.ctx.Sheets.Spreadsheets.batchUpdate=(...args)=>{batch(...args);throw Error('LOST_RESPONSE')};assert.throws(()=>f.ctx.evacuationAction(scan.e,'evacuationfinalconfirm'),/LOST_RESPONSE/);f.ctx.Sheets.Spreadsheets.batchUpdate=batch;const after=resetSnapshot(f);assert.equal(f.ctx.evacuationAction(scan.e,'evacuationfinalconfirm').replayed,true);assert.equal(resetSnapshot(f),after);assert.equal(f.ctx.evacuationRecords('EVACUATION_FINAL_UPLOAD',f.event).length,1);assert.equal(f.ctx.readPlayerEnergyBalance(f.a.identity),scan.core.energy);
});
test('EVAC-2 revalidates scan snapshot, event, identity and Deployment before commit',()=>{
 for(const kind of ['snapshot','event','identity','deployment','expiry']){const f=evacuationFixture();finishEvacuationTeam(f);const scan=finalScan(f,f.a);if(kind==='snapshot')f.sheets['N-Core Register'].rows.find(row=>row[0]===scan.core.id)[1]++;if(kind==='event')scan.e.parameter.event='OTHER';if(kind==='identity')scan.e.parameter.token=f.c.token;if(kind==='deployment')f.sheets['Deployment Register'].rows.find(row=>row[1]===scan.core.id&&row[5]==='EVACUATION')[2]='P003';if(kind==='expiry')f.advance(2*60*60*1000);const before=resetSnapshot(f);assert.throws(()=>f.ctx.evacuationAction(scan.e,'evacuationfinalconfirm'),/CHANGED|MISMATCH|INVALID|SCAN_REQUIRED|SESSION/);assert.equal(resetSnapshot(f),before);assert.equal(f.ctx.readPlayerEnergyBalance(f.a.identity),0);}
});
test('EVAC-2 final team atomically completes Event exactly once; completed-state replay and recovery work and Field actions remain closed',()=>{
 const f=evacuationFixture({expansions:2}),teams=[];for(let i=0;i<5;i++){const fop=i===0?{token:f.e.parameter.token}:f.add('F00'+(i+1),'FOP'),a=i===0?f.a:f.add('P0'+(10+i*2),'PIONEER'),b=i===0?f.b:f.add('P0'+(11+i*2),'PIONEER');finishEvacuationTeam(f,fop.token,a,b);teams.push({a,b,fop});}
 let last;for(const [i,team] of teams.entries()){for(const player of [team.a,team.b]){const scan=finalScan(f,player);last=scan.e;f.ctx.evacuationAction(scan.e,'evacuationfinalconfirm');if(i<4||player===team.a)assert.equal(f.ctx.readCurrentEvent().state,'FIELD_ACTIVE');}}
 assert.equal(f.ctx.readCurrentEvent(),null);assert.equal(f.sheets['Event Register'].rows[1][1],'COMPLETED');assert.equal(f.ctx.evacuationRecords('EVACUATION_COMPLETED',f.event).length,1);assert.equal(f.ctx.evacuationRecords('EVACUATION_FINAL_UPLOAD',f.event).length,10);assert.equal(f.ctx.evacuationRecords('EVACUATION_TEAM_WITHDRAWAL',f.event).length,5);
 const snapshot=resetSnapshot(f);assert.equal(f.ctx.evacuationAction(last,'evacuationfinalconfirm').replayed,true);assert.equal(resetSnapshot(f),snapshot);assert.equal(f.evacState(f.a.token).status,'EVACUATION_COMPLETED');assert.equal(f.evacState(teams[4].fop.token).evacuation.command,'RETURN TO HQ');assert.equal(f.ctx.evacuationPlayerState(f.ctx.findIdentityById(f.a.identity)).finalUpload.completed,true);
 for(const row of f.sheets['N-Core Register'].rows.filter(row=>f.ctx.evacuationFinalCargoReserved(row[0]))){assert.equal(row[14],'NODIV_RESERVE');assert.equal(row[4],'RESERVE');assert.equal(f.ctx.hasOpenDeploymentForCore(row[0]),true);}
 assert.throws(()=>f.ctx.hqUploadContext(f.ctx.findIdentityById(f.a.identity),'uploaduid'),/FIELD_ACTIVE_REQUIRED/);assert.equal(f.ctx.getGameplayRoute({parameter:{token:f.a.token,uid:'nodeuid1'}}).decision.allowed,false);assert.equal(f.ctx.preEventResetPlan().blockers.length,0);
});

test('EVAC-2 refuses global closure while an original Node, inconsistent ownership or an open recovery remains',()=>{
 const f=evacuationFixture();finishEvacuationTeam(f);for(const player of [f.a,f.b]){const scan=finalScan(f,player);f.ctx.evacuationAction(scan.e,'evacuationfinalconfirm');}
 let blockers=f.ctx.evacuationFinalCompletion(f.ctx.readCurrentEvent(),[]);assert.ok(blockers.includes('TEN_START_NODES_NOT_RECOVERED'));assert.ok(blockers.includes('EVENT_NODES_NOT_WITHDRAWN'));assert.ok(blockers.includes('NODE_OWNED_CORES_REMAIN'));assert.equal(f.ctx.evacuationRecords('EVACUATION_COMPLETED',f.event).length,0);
 const fop=f.add('F002','FOP'),team=f.make(fop.token,f.c,f.d).evacuation;f.evacOrder(team,team.nextNode,fop.token);blockers=f.ctx.evacuationFinalCompletion(f.ctx.readCurrentEvent(),[]);assert.ok(blockers.includes('OPEN_EVACUATION_OPERATION'));assert.equal(f.ctx.readCurrentEvent().state,'FIELD_ACTIVE');
});
test('EVAC-2 scan choice is single and may change before commit; old scan cannot confirm and authoritative visible Energy wins',()=>{
 const f=evacuationFixture();finishEvacuationTeam(f);const first=finalScan(f,f.a,0),second=finalScan(f,f.a,1);assert.notEqual(first.e.parameter.scan,second.e.parameter.scan);const before=resetSnapshot(f);assert.throws(()=>f.ctx.evacuationAction(first.e,'evacuationfinalconfirm'),/SCAN_REQUIRED/);assert.equal(resetSnapshot(f),before);
 const r=f.ctx.evacuationAction({...second.e,parameter:{...second.e.parameter,energy:99999,cores:JSON.stringify([first.core.id,second.core.id])}},'evacuationfinalconfirm');assert.equal(r.evacuation.finalUpload.energy,second.core.energy);assert.equal(f.ctx.readPlayerEnergyBalance(f.a.identity),second.core.energy);assert.ok(!f.ctx.getAvailableInstallationCores().some(core=>r.evacuation.cargo[0].cores.some(c=>c.id===core.coreId)));
});
test('EVAC-2 stages ledger/receipt/cargo under ScriptLock; precommit failure is empty and competing confirms cannot credit twice',()=>{
 const f=evacuationFixture();finishEvacuationTeam(f);const scan=finalScan(f,f.a),book=f.ctx.bookPlayerEnergy,batch=f.ctx.Sheets.Spreadsheets.batchUpdate,before=resetSnapshot(f);let held=false,locks=0,batches=0;
 f.ctx.LockService.getScriptLock=()=>({waitLock(){assert.equal(held,false);held=true;locks++;},releaseLock(){held=false;}});f.ctx.Sheets.Spreadsheets.batchUpdate=(...args)=>{assert.equal(held,true);batches++;return batch(...args);};f.ctx.bookPlayerEnergy=()=>{throw Error('PRECOMMIT_FAILURE')};assert.throws(()=>f.ctx.evacuationAction(scan.e,'evacuationfinalconfirm'),/PRECOMMIT_FAILURE/);assert.equal(resetSnapshot(f),before);assert.equal(batches,0);
 f.ctx.bookPlayerEnergy=book;f.ctx.evacuationAction(scan.e,'evacuationfinalconfirm');f.ctx.evacuationAction(scan.e,'evacuationfinalconfirm');assert.equal(locks,3);assert.equal(batches,1);assert.equal(f.ctx.evacuationRecords('EVACUATION_FINAL_UPLOAD',f.event).length,1);assert.equal(f.ctx.readPlayerEnergyBalance(f.a.identity),scan.core.energy);
});
