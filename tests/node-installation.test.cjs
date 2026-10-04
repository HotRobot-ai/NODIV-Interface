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
test('cache eviction retains durable order; competing login cannot reserve the same Node',()=>{
 const f=fixture(),order=f.order();f.cache.delete('NODIV_INSTALL_'+f.e.parameter.token);assert.equal(f.scan(1).count,1);
 const token='b'.repeat(72);f.cache.set('NODIV_SESSION_'+token,JSON.stringify({identity:'F001',role:'FOP',cardId:'CARD-001'}));
 assert.throws(()=>f.ctx.getNodeInstallOrder({parameter:{token,node:'NODE-001'}}),/NODE_INSTALLATION_RESERVED/);
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
