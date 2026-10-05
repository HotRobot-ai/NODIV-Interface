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
 const elements={};for(const id of ['fopInstallProgress','fopInstallCores','fopInstallScan','fopInstallConfirm','fopProgressBar','fopDeploymentNode','fopLoadoutEnergy','fopLoadoutState','fopOperationStatus','fopInstallControls','fopPrimaryPanel','fopScanProgress','fopInstallActions','fopInstallCode','fopDeploymentComplete','fopInstallCancel','fopInstallOrder','fopOperationSelect','fopQueueRefresh','fopDeploymentCard','fopOperationLabel','fopDeploymentLabel','fopLoadoutLabel','fopCodeLabel','fopCodeValue','fopInstallHint','shutdownFieldEvent','eventState','eventHint','eventNodes','initializeEvent','activateEvent','checkEventReadiness','pioneerExchange','exchangeNode','exchangeSize','exchangeAuthorize','exchangeCode','exchangeScan','exchangeCancel','exchangeConfirm','exchangeProgress','exchangeHint','pioneerScan','pioneerRestoreBoard','pioneerMissionCount','pioneerRestore','restoreNode','restoreLoadout','restoreInCard','restoreOutCard','restoreInCore','restoreInEnergy','restoreOutCore','restoreOutEnergy','restoreCurrentEnergy','restoreProjectedEnergy','restoreStateBadge','restoreStepHqDetail','restoreStepNodeDetail','restoreStepInTitle','restoreStepInDetail','restoreStepOutTitle','restoreStepOutDetail','restoreNowTitle','restoreProjection','restoreCode','restoreProgress','restoreHint','restoreAuthorize','restoreScan','restoreConfirm','restorePioneerSelect','founderRestoreHint','assignRestore','catchPanel','catchCatcherStep','catchTargetStep','catchCommitStep','catchHint','catchStart','catchConfirm','catchResult','catchInventory'])elements['#'+id]=new Element();
 for(const selector of ['.pioneer-priority','.pioneer-timer','.pioneer-priority h3','.pioneer-priority p','.pioneer-state b'])elements[selector]=new Element();
 const listeners={},document={querySelector:id=>elements[id]||null,createElement:()=>new Element(),addEventListener(){}},requests=[];
 const ctx={document,console,AbortController,setTimeout,clearTimeout,setInterval:()=>0,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail}},URLSearchParams,emitNodiv(){},window:{addEventListener:(name,fn)=>listeners[name]=fn}};
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

test('reload recovery restores code, server counts, phase/confirm gating and usable cancel',async()=>{
 for(const [incoming,outgoing] of [[0,0],[1,0],[1,1]]){
  const f=ui(),e=f.elements;f.ctx.resumePioneerExchange({exchange:'existing',status:'EXCHANGE_RESUMED',nodeId:'NODE-001',size:1,inCount:incoming,outCount:outgoing,canConfirm:outgoing===1,accessCode:'0123',totalEnergy:859,nodeState:'STABLE',sizes:[1]});
  assert.equal(e['#exchangeCode'].textContent,'MECHANISCHER CODE // 0123');assert.equal(e['#exchangeProgress'].textContent,'IN '+incoming+'/1 // OUT '+outgoing+'/1');assert.equal(e['#exchangeConfirm'].disabled,outgoing!==1);assert.equal(e['#exchangeAuthorize'].hidden,true);assert.equal(e['#exchangeCancel'].hidden,false);assert.match(e['#exchangeScan'].textContent,incoming?/NODE-CORE/:/EIGENEN CORE/);
  f.ctx.apiRequest=async p=>{f.requests.push(p);return {ok:true,action:true,status:'EXCHANGE_CANCELLED'}};await f.listeners['nodiv-pioneer-exchange']({detail:{action:'cancel'}});assert.equal(f.requests[0].action,'exchangecancel');assert.equal(f.requests[0].exchange,'existing');assert.equal(f.requests[0].node,'NODE-001');assert.equal(e['#pioneerExchange'].hidden,true);assert.equal(e['#pioneerScan'].disabled,false);
 }
});

test('Restore UI keeps mission cargo separate, gates code and confirm, resumes server progress and completes at 2/3',async()=>{
 const f=ui(),e=f.elements;let inCount=0,outCount=0;const mission={ok:true,session:true,action:true,restore:'RST-1',status:'RESTORE_IN_TRANSIT',identity:'P003',nodeId:'NODE-002',inCore:{id:'NC-009',energy:280},outCore:{id:'NC-004',energy:100},totalEnergy:420,nodeState:'CRITICAL',projectedEnergy:600,projectedState:'STABLE',inCount:0,outCount:0,authorized:false,canConfirm:false};
 f.ctx.window.dispatchEvent=()=>{};f.ctx.apiRequest=async p=>{f.requests.push(p);if(p.action==='restorescan'){if(p.phase==='IN')inCount=1;else outCount=1;}return {...mission,status:p.action==='restoreconfirm'?'RESTORE_1_COMPLETE':'RESTORE_AUTHORIZED',authorized:true,inCount,outCount,canConfirm:outCount===1,...(p.action==='restoreauthorize'?{accessCode:'5678'}:{})};};
 f.ctx.renderPioneerRestore(mission,false);assert.match(e['#pioneerRestoreBoard'].innerHTML,/RESTORE #1/);assert.equal(e['#restoreInCore'].textContent,'NC-009');assert.equal(e['#restoreAuthorize'].hidden,true);assert.equal(e['#restoreCode'].textContent,'');
 f.ctx.renderPioneerRestore({...mission,status:'RESTORE_TARGET_READY'},true);assert.equal(e['#restoreAuthorize'].hidden,false);assert.equal(e['#restoreScan'].hidden,true);const action=action=>f.listeners['nodiv-pioneer-restore']({detail:{action}});await action('authorize');assert.equal(e['#restoreCode'].textContent,'ZUGANGSCODE  5678');assert.equal(e['#restoreConfirm'].disabled,true);
 for(const uid of ['uid9','uid4']){await action('scan');await f.ctx.reader.onreading({serialNumber:uid});}
 assert.equal(e['#restoreProgress'].textContent,'IN 1/1 // OUT 1/1');assert.equal(e['#restoreConfirm'].disabled,false);assert.match(e['#restoreCode'].textContent,/5678/);assert.equal(f.requests.at(-1).phase,'OUT');
 const g=ui();g.ctx.renderPioneerRestore({...mission,status:'RESTORE_RESUMED',authorized:true,inCount:1,outCount:0,accessCode:'5678'},true);assert.equal(g.elements['#restoreProgress'].textContent,'IN 1/1 // OUT 0/1');assert.equal(g.elements['#restoreScan'].textContent,'NC-004 SCANNEN');
 await action('confirm');assert.match(e['#restoreProgress'].textContent,/CAPACITY 2\/3/);assert.equal(e['#restoreCode'].textContent,'');for(const id of ['restoreAuthorize','restoreScan','restoreConfirm'])assert.equal(e['#'+id].hidden,true);assert.equal(e['#pioneerScan'].disabled,false);
});
test('Founder RESTORE assignment uses only server eligibility and no manual Node/Core',async()=>{
 const f=ui(),e=f.elements;f.ctx.apiRequest=async p=>{f.requests.push(p);return p.action==='restoreeligible'?{ok:true,session:true,pioneers:[{identity:'P003',capacity:1}]}:{ok:true,action:true,identity:'P003',nodeId:'NODE-002',inCore:{id:'NC-009',energy:280},projectedEnergy:600,projectedState:'STABLE'};};
 const action=action=>f.listeners['nodiv-founder-restore']({detail:{action}});await action('refresh');assert.equal(e['#restorePioneerSelect'].children[1].textContent,'P003 // 1/3 // RESTORE #1');e['#restorePioneerSelect'].value='P999';await action('assign');assert.equal(f.requests.length,1);e['#restorePioneerSelect'].value='P003';await action('assign');const assignment=f.requests.find(p=>p.action==='restoreassign');assert.equal(assignment.pioneer,'P003');assert.equal(assignment.node,undefined);assert.equal(assignment.core,undefined);assert.match(e['#founderRestoreHint'].textContent,/NODE-002/);
});

test('CATCH UI authenticates target once, hides Core until confirm, uses server receipt and traffic-light phases',async()=>{
 const f=ui(),e=f.elements;f.ctx.window.dispatchEvent=()=>{};let fail=true;
 f.ctx.apiRequest=async p=>{f.requests.push(p);if(p.mode==='preview')return {ok:true,session:true,status:'CATCH_READY',canConfirm:true,target:'P003',catchId:'CAT-1'};if(fail){fail=false;throw Error('NODIV CORE TIMEOUT');}return {ok:true,session:true,status:'CATCH_COMPLETE',core:{id:'NC-008',energy:310},replayed:true};};
 const action=action=>f.listeners['nodiv-catch']({detail:{action}});await action('scan');assert.match(e['#catchTargetStep'].className,/running/);assert.equal(e['#catchConfirm'].hidden,true);
 await f.ctx.reader.onreading({serialNumber:'targetuid'});await f.ctx.reader.onreading({serialNumber:'targetuid'});assert.equal(f.requests.length,1);assert.equal(f.requests[0].targetUid,'targetuid');assert.equal(f.requests[0].uid,undefined);assert.equal(f.requests[0].core,undefined);assert.match(e['#catchTargetStep'].className,/accepted/);assert.equal(e['#catchConfirm'].disabled,false);assert.equal(e['#catchResult'].hidden,true);assert.equal(e['#catchHint'].textContent,'P003 // CATCH READY');
 await action('confirm');assert.match(e['#catchHint'].textContent,/TIMEOUT/);assert.match(e['#catchCommitStep'].className,/required/);assert.equal(e['#catchConfirm'].disabled,false);
 await action('confirm');assert.equal(f.requests.at(-1).catchId,'CAT-1');assert.equal(e['#catchResult'].textContent,'CATCH COMPLETE // NC-008 // 310 E');assert.match(e['#catchCommitStep'].className,/accepted/);assert.equal(e['#catchConfirm'].hidden,true);
});
test('CATCH rejected target and NFC error do not enable confirm; roles show CATCH only with server catchAccess',async()=>{
 const f=ui(),e=f.elements;f.ctx.apiRequest=async()=>({ok:false,error:'NO_CATCHABLE_CORE'});await f.listeners['nodiv-catch']({detail:{action:'scan'}});await f.ctx.reader.onreading({serialNumber:'targetuid'});assert.match(e['#catchHint'].textContent,/NO_CATCHABLE_CORE/);assert.equal(e['#catchConfirm'].hidden,true);
 await f.listeners['nodiv-catch']({detail:{action:'scan'}});await f.ctx.reader.onreadingerror();await f.ctx.reader.onreading({serialNumber:'targetuid'});assert.match(e['#catchTargetStep'].className,/required/);assert.equal(e['#catchStart'].disabled,false);
 const router=fs.readFileSync('app/js/router.js','utf8');assert.match(router,/if\(id\.catchAccess===true\)body\+=/);assert.doesNotMatch(router,/OPEN CATCH/);
});

test('RESTORE #2 Founder uses server phase and Pioneer recovery/completion displays capacity 3 without changing #1',async()=>{
 const f=ui(),e=f.elements;f.ctx.apiRequest=async p=>{f.requests.push(p);return p.action==='restoreeligible'?{ok:true,session:true,pioneers:[{identity:'P003',capacity:2,phase:2}]}:{ok:true,action:true,phase:2,identity:'P003',nodeId:'NODE-002',inCore:{id:'NC-009',energy:280},projectedEnergy:600,projectedState:'STABLE'};};
 await f.listeners['nodiv-founder-restore']({detail:{action:'refresh'}});assert.equal(e['#restorePioneerSelect'].children[1].textContent,'P003 // 2/3 // RESTORE #2');e['#restorePioneerSelect'].value='P003';await f.listeners['nodiv-founder-restore']({detail:{action:'select'}});assert.equal(e['#assignRestore'].textContent,'RESTORE #2 VERGEBEN');await f.listeners['nodiv-founder-restore']({detail:{action:'assign'}});assert.equal(f.requests.find(p=>p.action==='restoreassign').phase,2);
 const mission={phase:2,restore:'RST2-1',status:'RESTORE_RESUMED',nodeId:'NODE-002',inCore:{id:'NC-009',energy:280},outCore:{id:'NC-004',energy:100},totalEnergy:420,nodeState:'CRITICAL',projectedEnergy:600,projectedState:'STABLE',inCount:1,outCount:0,authorized:true,accessCode:'5678',canConfirm:false};
 f.ctx.renderPioneerRestore(mission,true);assert.match(e['#pioneerRestoreBoard'].innerHTML,/RESTORE #2/);assert.equal(e['#restoreInCore'].textContent,'NC-009');assert.match(e['#restoreCode'].textContent,/5678/);assert.equal(e['#restoreConfirm'].disabled,true);
 f.ctx.renderPioneerRestore({...mission,status:'RESTORE_2_COMPLETE',capacity:3,outCount:1},true);assert.match(e['#restoreProgress'].textContent,/CAPACITY 3\/3.*TARGET LOCK 01:00:00/);assert.match(e['#restoreHint'].textContent,/Dritter Slot freigeschaltet/);for(const id of ['restoreAuthorize','restoreScan','restoreConfirm'])assert.equal(e['#'+id].hidden,true);assert.equal(e['#restoreCode'].textContent,'');
});
test('RESTORE #2 successful confirm refreshes live personal capacity and removes scan/confirm controls',async()=>{
 const f=ui(),events=[];f.ctx.window.dispatchEvent=e=>events.push(e.type);const mission={phase:2,restore:'RST2-1',status:'RESTORE_RESUMED',nodeId:'NODE-002',inCore:{id:'NC-009',energy:280},outCore:{id:'NC-004',energy:100},totalEnergy:420,nodeState:'CRITICAL',projectedEnergy:600,projectedState:'STABLE',inCount:1,outCount:1,authorized:true,accessCode:'5678',canConfirm:true};f.ctx.renderPioneerRestore(mission,true);f.ctx.apiRequest=async()=>({ok:true,action:true,status:'RESTORE_2_COMPLETE',phase:2,capacity:3});await f.listeners['nodiv-pioneer-restore']({detail:{action:'confirm'}});assert.ok(events.includes('nodiv-pioneer-live'));assert.match(f.elements['#restoreProgress'].textContent,/CAPACITY 3\/3/);assert.equal(f.elements['#restoreConfirm'].hidden,true);assert.equal(f.elements['#pioneerScan'].disabled,false);
});

test('Pioneer Ghost countdown uses authoritative playerstate/server time, ticks prominently and expires without client mutation',async()=>{
 const f=ui(),e=f.elements,now=Date.now();let clock=now;const RealDate=Date;f.ctx.Date=class extends RealDate{static now(){return clock;}};
 f.ctx.apiRequest=async()=>({ok:true,session:true,serverNow:now+60000,player:{coreCapacity:2,ghostUntil:new Date(now+360000).toISOString(),status:'GHOST'},cores:[],carriedEnergy:0});await f.listeners['nodiv-pioneer-live']();assert.equal(e['.pioneer-timer'].hidden,false);assert.equal(e['.pioneer-timer'].textContent,'05:00');assert.equal(e['.pioneer-priority h3'].textContent,'GHOST ACTIVE');assert.equal(e['.pioneer-state b'].textContent,'GHOST');
 clock+=1000;f.ctx.updatePioneerGhostClock();assert.equal(e['.pioneer-timer'].textContent,'04:59');clock+=300000;f.ctx.updatePioneerGhostClock();assert.equal(e['.pioneer-timer'].hidden,true);assert.equal(e['.pioneer-state b'].textContent,'ACTIVE');assert.equal(f.requests.length,0);
});
