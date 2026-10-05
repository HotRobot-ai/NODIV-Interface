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
 const next=f.ctx.initializeEvent({parameter:{...e.parameter,nodes:'NODE-001,NODE-002'}});assert.equal(next.status,'EVENT_INITIALIZED');assert.notEqual(next.event.eventId,'EVT-1');assert.equal(f.ctx.readCurrentEvent().state,'INITIALIZED');assert.equal(f.sheets['Event Register'].rows[1][1],'COMPLETED');assert.deepEqual(f.sheets['Event Node Codes'].rows[1],beforeCodes);
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

function catchFixture(capacity=3){
 const f=exchangeFixture(capacity),token='c'.repeat(72);f.ctx.readPlayerEnergyBalance=()=>0;
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
