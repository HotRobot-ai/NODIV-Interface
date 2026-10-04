const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function ui({operation='INSTALL',empty=false}={}){
 class Element{
  constructor(){this.textContent='';this.children=[];this.hidden=false;this.disabled=false;this.dataset={};this.value=''}
  replaceChildren(){this.children=[]}
  appendChild(child){this.children.push(child)}
 }
 const elements={};for(const id of ['fopInstallProgress','fopInstallCores','fopInstallScan','fopInstallConfirm','fopProgressBar','fopDeploymentNode','fopLoadoutEnergy','fopLoadoutState','fopOperationStatus','fopInstallControls','fopPrimaryPanel','fopScanProgress','fopInstallActions','fopInstallCode','fopDeploymentComplete','fopInstallCancel','fopInstallOrder','fopOperationSelect','fopQueueRefresh','fopDeploymentCard','fopOperationLabel','fopDeploymentLabel','fopLoadoutLabel','fopCodeLabel','fopCodeValue','fopInstallHint','shutdownFieldEvent','eventState','eventHint','eventNodes','initializeEvent','activateEvent','checkEventReadiness','pioneerExchange','exchangeNode','exchangeSize','exchangeAuthorize','exchangeCode','exchangeScan','exchangeCancel','exchangeConfirm','exchangeProgress','exchangeHint','pioneerScan'])elements['#'+id]=new Element();
 const listeners={},document={querySelector:id=>elements[id]||null,createElement:()=>new Element()},requests=[];
 const ctx={document,console,AbortController,setTimeout,clearTimeout,URLSearchParams,emitNodiv(){},window:{addEventListener:(name,fn)=>listeners[name]=fn}};
 ctx.window.NDEFReader=ctx.NDEFReader=class{async scan(){ctx.reader=this}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('app/js/identity.js','utf8').replace(/^import .*\n/gm,'').replace('export async function','async function'),ctx);vm.runInContext("sessionToken='test'",ctx);
 const assigned=[{id:'NC-017',energy:175},{id:'NC-034',energy:246},{id:'NC-089',energy:281}],nodeId=operation==='DEINSTALL'?'NODE-001':'NODE-002';let scanned=[],complete=false;
 ctx.apiRequest=async p=>{
  requests.push(p);
  if(p.action==='fopoperations')return {ok:true,session:true,operations:empty||complete?[]:[{id:operation+':'+nodeId,type:operation,nodeId,label:operation+' // '+nodeId}]};
  if(['nodeinstallconfirm','nodedeinstallconfirm'].includes(p.action)){complete=true;return {ok:true,action:true,operation,status:operation==='DEINSTALL'?'NODE_DEINSTALLED':'NODE_INSTALLED',node:{id:nodeId},count:3,totalEnergy:702,nodeState:'STABLE'}}
  if(['nodeinstallcancel','nodedeinstallcancel'].includes(p.action)){scanned=[];return {ok:true,action:true,status:'OPERATION_CANCELLED'}}
  if(['nodeinstallorder','nodedeinstallorder'].includes(p.action))scanned=[];
  if(['nodeinstallscan','nodedeinstallscan'].includes(p.action)){
   if(!assigned.some(c=>c.id===p.uid))return {ok:false,error:'CORE NOT ASSIGNED TO '+nodeId};scanned.push(p.uid);
  }
  return {ok:true,action:true,operation,status:p.action.endsWith('order')?'NODE_OPERATION_ORDER':'CORE_SCANNED',installation:'order',node:{id:nodeId,code:'0427',slot:'PRIMARY'},loadout:assigned.map(c=>({...c,scanned:scanned.includes(c.id)})),count:scanned.length,canConfirm:scanned.length===3,totalEnergy:702,nodeState:'STABLE',instruction:'Nur zugewiesene Cores scannen.'};
 };
 return {elements,listeners,ctx,requests,async queue(){await listeners['nodiv-fop-operations']()},async order(){await listeners['nodiv-fop-operations']();elements['#fopOperationSelect'].value=operation+':'+nodeId;await listeners['nodiv-fop-operation-select']();await listeners['nodiv-fop-install-order']()},async scan(uid){await listeners['nodiv-fop-install-scan']();await ctx.reader.onreading({serialNumber:uid})}};
}
test('FOP installation still shows IDs/energy, unordered progress, foreign rejection and 3/3 gate',async()=>{
 const f=ui(),e=f.elements;await f.order();assert.equal(e['#fopCodeValue'].textContent,'0427');assert.equal(e['#fopInstallProgress'].textContent,'0/3');assert.equal(e['#fopInstallConfirm'].disabled,true);assert.equal(e['#fopOperationSelect'].disabled,true);
 assert.equal(e['#fopLoadoutEnergy'].textContent,'702 E');assert.equal(e['#fopLoadoutState'].textContent,'STABLE');assert.equal(e['#fopInstallCores'].children.length,3);assert.deepEqual(e['#fopInstallCores'].children[0].children.map(el=>el.textContent),['NC-017','175 E','AWAITING SCAN']);
 await f.scan('NC-999');assert.match(e['#fopInstallHint'].textContent,/CORE NOT ASSIGNED TO NODE-002/);assert.equal(e['#fopInstallProgress'].textContent,'0/3');
 for(const [i,id] of ['NC-089','NC-017','NC-034'].entries()){await f.scan(id);assert.equal(e['#fopInstallProgress'].textContent,(i+1)+'/3');assert.equal(e['#fopInstallConfirm'].disabled,i!==2)}assert.ok(e['#fopInstallCores'].children.every(el=>el.className.includes('verified')));
});
test('FOP installation completion still hides PRIMARY/scan/confirm actions and shows exact summary',async()=>{
 const f=ui(),e=f.elements;await f.order();for(const id of ['NC-089','NC-017','NC-034'])await f.scan(id);await f.listeners['nodiv-fop-install-confirm']();
 assert.equal(e['#fopDeploymentComplete'].textContent,'DEPLOYMENT COMPLETE // NODE-002 // 3/3 // 702 E // STABLE');assert.equal(e['#fopDeploymentComplete'].hidden,false);for(const id of ['#fopPrimaryPanel','#fopScanProgress','#fopInstallActions','#fopInstallCode'])assert.equal(e[id].hidden,true);
 assert.equal(e['#fopInstallConfirm'].disabled,true);assert.equal(e['#fopCodeValue'].textContent,'0427');assert.equal(e['#fopOperationStatus'].textContent,'COMPLETE');assert.equal(e['#fopInstallOrder'].disabled,true);
});
test('queue contains only server options and empty queue disables action; invented selection makes no request',async()=>{
 const f=ui({empty:true}),e=f.elements;await f.queue();assert.equal(e['#fopOperationSelect'].children[0].textContent,'NO OPERATIONS AVAILABLE');assert.equal(e['#fopOperationSelect'].disabled,true);assert.equal(e['#fopInstallOrder'].disabled,true);
 e['#fopOperationSelect'].value='INSTALL:NODE-999';const before=f.requests.length;await f.listeners['nodiv-fop-install-order']();assert.equal(f.requests.length,before);
 const g=ui({operation:'DEINSTALL'});await g.queue();assert.deepEqual(g.elements['#fopOperationSelect'].children.map(o=>o.textContent),['OPERATION AUSWÄHLEN','DEINSTALL // NODE-001']);
});
test('recovery uses removal APIs/visual mode and hides actions after exact recovery summary',async()=>{
 const f=ui({operation:'DEINSTALL'}),e=f.elements;await f.order();assert.equal(f.requests.at(-1).action,'nodedeinstallorder');assert.equal(e['#fopDeploymentCard'].dataset.operation,'DEINSTALL');assert.equal(e['#fopLoadoutLabel'].textContent,'REMOVAL LOADOUT');assert.equal(e['#fopOperationStatus'].textContent,'RECOVERING');assert.equal(e['#fopInstallConfirm'].textContent,'RECOVERY BESTÄTIGEN');
 for(const id of ['NC-089','NC-017','NC-034'])await f.scan(id);assert.ok(f.requests.some(p=>p.action==='nodedeinstallscan'));assert.match(e['#fopInstallHint'].textContent,/physisch entfernen/);
 await f.listeners['nodiv-fop-install-confirm']();assert.equal(e['#fopDeploymentComplete'].textContent,'RECOVERY COMPLETE // NODE-001 // 3/3 CORES RETURNED');assert.equal(e['#fopInstallActions'].hidden,true);assert.equal(e['#fopInstallConfirm'].disabled,true);assert.ok(f.requests.some(p=>p.action==='nodedeinstallconfirm'));
});
test('recovery abort resets slots and refreshes queue only after server acknowledgement',async()=>{
 const f=ui({operation:'DEINSTALL'}),e=f.elements;await f.order();await f.scan('NC-017');await f.listeners['nodiv-fop-install-cancel']();assert.ok(f.requests.some(p=>p.action==='nodedeinstallcancel'));assert.equal(e['#fopInstallCores'].children.length,0);assert.equal(e['#fopInstallCode'].hidden,true);assert.equal(e['#fopOperationSelect'].disabled,false);assert.equal(e['#fopInstallConfirm'].disabled,true);assert.match(e['#fopInstallHint'].textContent,/freigegeben/);
});
test('Founder shutdown sends the displayed Event ID and uses technical Alpha language',async()=>{
 const f=ui(),button=f.elements['#shutdownFieldEvent'],results=[];button.dataset.eventId='EVT-1';
 f.ctx.apiRequest=async p=>{f.requests.push(p);return {ok:true,action:true,eventId:'EVT-1',eventState:'COMPLETED'}};f.ctx.refreshFounderEventStatus=async()=>{};f.ctx.showFounderResult=(title,detail)=>results.push({title,detail});
 await f.listeners['nodiv-founder-event-shutdown']();assert.equal(f.requests[0].action,'eventshutdown');assert.equal(f.requests[0].event,'EVT-1');assert.equal(results[0].title,'FIELD EVENT SHUTDOWN // ALPHA');
});

test('Founder initialization requires fresh strict readiness and survives standby status refresh',async()=>{
 const f=ui(),e=f.elements;let state='STANDBY',ready=true,fail=false;
 f.ctx.showFounderResult=()=>{};
 f.ctx.apiRequest=async p=>{
  if(p.action==='eventstatus')return {ok:true,event:{state},provisionedNodes:[]};
  if(fail)throw new Error('network error');
  return {ok:true,ready,checks:[]};
 };
 const refresh=()=>f.ctx.refreshFounderEventStatus(),check=()=>f.listeners['nodiv-founder-event-readiness']();
 await refresh();assert.equal(e['#initializeEvent'].disabled,true);
 state='COMPLETED';await refresh();assert.equal(e['#initializeEvent'].disabled,true);
 await check();assert.equal(e['#initializeEvent'].disabled,false);
 await refresh();assert.equal(e['#initializeEvent'].disabled,false);
 state='STANDBY';await refresh();assert.equal(e['#initializeEvent'].disabled,false);
 for(const active of ['INITIALIZED','FIELD_ACTIVE']){
  state=active;await refresh();assert.equal(e['#initializeEvent'].disabled,true);
  await check();assert.equal(e['#initializeEvent'].disabled,true);
  state='COMPLETED';await refresh();assert.equal(e['#initializeEvent'].disabled,true);
 }
 await check();assert.equal(e['#initializeEvent'].disabled,false);
 for(const invalid of [false,'true',1]){ready=invalid;await check();await refresh();assert.equal(e['#initializeEvent'].disabled,true)}
 ready=true;await check();fail=true;await check();await refresh();assert.equal(e['#initializeEvent'].disabled,true);
});

test('Pioneer UI shows server size without code, authorizes before scanning, gates confirm and hides completed actions',async()=>{
 const f=ui(),e=f.elements,requests=[];let incoming=0,outgoing=0;
 f.ctx.apiRequest=async p=>{
  requests.push(p);
  if(p.action==='exchangescan'){if(p.uid==='own')incoming++;else outgoing++;}
  return {ok:true,action:true,status:p.action==='exchangeconfirm'?'EXCHANGE_COMPLETE':'EXCHANGE_AUTHORIZED',exchange:'ex-1',size:1,inCount:incoming,outCount:outgoing,canConfirm:incoming===1&&outgoing===1,...(p.action==='exchangeauthorize'?{accessCode:'0123'}:{}),core:{id:p.uid==='own'?'NC-002':'NC-006',energy:341}};
 };
 f.ctx.showPioneerExchangePreview({preview:'preview-1',nodeId:'NODE-001',totalEnergy:859,nodeState:'STABLE',sizes:[1]});
 assert.equal(e['#exchangeCode'].textContent,'');assert.equal(e['#exchangeSize'].children.length,1);assert.equal(e['#exchangeSize'].children[0].textContent,'1 CORE EXCHANGE');assert.equal(e['#exchangeScan'].hidden,true);
 e['#exchangeSize'].value='1';const action=action=>f.listeners['nodiv-pioneer-exchange']({detail:{action}});
 await action('authorize');assert.equal(requests[0].action,'exchangeauthorize');assert.equal(requests[0].preview,'preview-1');assert.equal(e['#exchangeCode'].textContent,'MECHANISCHER CODE // 0123');assert.equal(e['#exchangeConfirm'].disabled,true);assert.equal(e['#pioneerScan'].disabled,true);
 for(const uid of ['own','node']){await action('scan');await f.ctx.reader.onreading({serialNumber:uid});}
 assert.equal(e['#exchangeProgress'].textContent,'IN 1/1 // OUT 1/1');assert.equal(e['#exchangeConfirm'].disabled,false);assert.match(e['#exchangeCode'].textContent,/0123/);
 await action('confirm');assert.equal(e['#exchangeProgress'].textContent,'EXCHANGE COMPLETE // NODE COOLDOWN 05:00');assert.equal(e['#exchangeCode'].textContent,'');for(const id of ['exchangeAuthorize','exchangeScan','exchangeConfirm','exchangeCancel'])assert.equal(e['#'+id].hidden,true);assert.equal(e['#pioneerScan'].disabled,false);
});

test('Pioneer adopts accepted retry server counts after lost response and ignores repeated NFC callbacks',async()=>{
 const f=ui(),e=f.elements,requests=[];let scans=0;
 f.ctx.apiRequest=async p=>{requests.push(p);if(p.action==='exchangeauthorize')return {ok:true,action:true,exchange:'ex-1',size:1,inCount:0,outCount:0,accessCode:'0123'};
  scans++;if(scans===1)throw Error('NODIV CORE TIMEOUT');
  return {ok:true,action:true,exchange:'ex-1',size:1,inCount:1,outCount:p.phase==='OUT'?1:0,canConfirm:p.phase==='OUT',replayed:true,core:{id:p.uid,energy:341}};
 };
 f.ctx.showPioneerExchangePreview({preview:'p',nodeId:'NODE-001',totalEnergy:859,nodeState:'STABLE',sizes:[1]});e['#exchangeSize'].value='1';
 const action=action=>f.listeners['nodiv-pioneer-exchange']({detail:{action}});await action('authorize');
 await action('scan');const firstReader=f.ctx.reader;await firstReader.onreading({serialNumber:'NC-002'});await firstReader.onreading({serialNumber:'NC-002'});assert.equal(scans,1);assert.equal(e['#exchangeProgress'].textContent,'IN 0/1 // OUT 0/1');
 await action('scan');await f.ctx.reader.onreading({serialNumber:'NC-002'});assert.equal(requests.at(-1).phase,'IN');assert.equal(e['#exchangeProgress'].textContent,'IN 1/1 // OUT 0/1');assert.equal(e['#exchangeConfirm'].disabled,true);
 await action('scan');await f.ctx.reader.onreading({serialNumber:'NC-006'});assert.equal(requests.at(-1).phase,'OUT');assert.equal(e['#exchangeProgress'].textContent,'IN 1/1 // OUT 1/1');assert.equal(e['#exchangeConfirm'].disabled,false);
});
test('NFC read error closes that reader before a delayed reading can send a request',async()=>{
 const f=ui(),e=f.elements;f.ctx.apiRequest=async()=>({ok:true,action:true,exchange:'ex-1',size:1,inCount:0,outCount:0,accessCode:'0123'});
 f.ctx.showPioneerExchangePreview({preview:'p',nodeId:'NODE-001',totalEnergy:859,nodeState:'STABLE',sizes:[1]});e['#exchangeSize'].value='1';const action=action=>f.listeners['nodiv-pioneer-exchange']({detail:{action}});await action('authorize');await action('scan');
 let requests=0;f.ctx.apiRequest=async()=>{requests++;};f.ctx.reader.onreadingerror();await f.ctx.reader.onreading({serialNumber:'NC-002'});assert.equal(requests,0);assert.equal(e['#exchangeScan'].disabled,false);
});
