import {routeIdentity} from './router.js?v=20261010-fop-clear';
import {emitNodiv} from './motion.js?v=20261003-1415';
let sessionToken='';
const API_URL='https://script.google.com/macros/s/AKfycby1cZye2Z46M2ydV6-TcurgOwmS8H4Bh6eXZJ3Z76TUs2oPO5eq6l-RGL0AyVQmfpeM3w/exec';
// Apps Script cold starts/Sheet commits can exceed ten seconds. A transport
// timeout never proves rollback; no request is automatically retried here.
const API_TIMEOUT_MS=30000,API_LATE_RESPONSE_GRACE_MS=120000;
let apiRequestSequence=0;
function apiRequest(params){
 return new Promise((resolve,reject)=>{
  const cb='__nodiv_app_'+Date.now()+'_'+(++apiRequestSequence),script=document.createElement('script');let settled=false;
  const timer=setTimeout(()=>finish(new Error('NODIV CORE TIMEOUT // Serverstatus unklar. Status neu laden, bevor du erneut bestätigst.')),API_TIMEOUT_MS);
  function finish(error,data){
   if(settled)return;settled=true;clearTimeout(timer);script.onerror=null;script.remove();
   // Removing a JSONP script cannot reliably cancel an already dispatched request.
   // Keep a bounded no-op callback for an eventual late response; never apply it.
   if(error){window[cb]=()=>{};setTimeout(()=>{delete window[cb]},API_LATE_RESPONSE_GRACE_MS);}
   else delete window[cb];
   error?reject(error):resolve(data);
  }
  window[cb]=data=>finish(null,data);
  script.onerror=()=>finish(new Error('NODIV CORE UNREACHABLE // Serverstatus unklar. Status neu laden, bevor du erneut bestätigst.'));
  script.src=API_URL+'?'+new URLSearchParams({...params,callback:cb});
  try{document.body.appendChild(script);}catch(error){finish(error);}
 });
}
function nfcUidFromEvent(event){
 const uid=typeof event?.serialNumber==='string'?event.serialNumber.trim():'';
 if(!uid||['undefined','null'].includes(uid.toLowerCase()))throw new Error('KEINE GÜLTIGE NFC UID GELESEN // Erneut scannen.');
 return uid;
}
let identityAttempt=null;
function stopIdentityReader(attempt){
 if(attempt.reader){attempt.reader.onreading=null;attempt.reader.onreadingerror=null;}attempt.controller.abort();
}
function finishIdentityAttempt(attempt,error){
 stopIdentityReader(attempt);if(identityAttempt!==attempt)return;identityAttempt=null;
 if(error){const btn=document.querySelector('#identityBtn'),msg=document.querySelector('#msg');btn.disabled=false;btn.textContent='RETRY ACCESS CARD';msg.textContent=String(error.message||error);emitNodiv('ACCESS_DENIED',{target:'#app'});}
}
export async function startIdentity(){
 const btn=document.querySelector('#identityBtn'),msg=document.querySelector('#msg');
 if(identityAttempt||sessionToken)return;
 if(!('NDEFReader' in window)){msg.textContent='WEB NFC NICHT VERFÜGBAR // Android + Chrome erforderlich.';emitNodiv('ACCESS_DENIED',{target:'#app'});return}
 const attempt={controller:new AbortController(),reader:null,handling:false};identityAttempt=attempt;
 btn.disabled=true;btn.textContent='NFC ARMED // PRESENT ACCESS CARD';msg.textContent='ACCESS CARD AN DAS GERÄT HALTEN';emitNodiv('NFC_ARMED',{target:'#identityBtn'});
 try{
  const reader=new NDEFReader();attempt.reader=reader;
  reader.onreadingerror=()=>{if(identityAttempt===attempt&&!attempt.handling)finishIdentityAttempt(attempt,new Error('NFC-KARTE KONNTE NICHT GELESEN WERDEN // erneut scannen.'));};
  reader.onreading=async event=>{
   if(identityAttempt!==attempt||attempt.handling)return;attempt.handling=true;
   try{
    const uid=nfcUidFromEvent(event);stopIdentityReader(attempt);btn.textContent='VERIFYING IDENTITY';
    const identity=await apiRequest({action:'identify',uid});if(identityAttempt!==attempt)return;
    if(!identity?.ok||!identity.authenticated)throw new Error(identity?.reason||identity?.error||'ACCESS DENIED');
    const session=await apiRequest({action:'sessionstart',uid});if(identityAttempt!==attempt)return;
    if(!session?.session||!session?.token)throw new Error(session?.status||'SESSION START FAILED');
    sessionToken=session.token;emitNodiv('IDENTITY_VERIFIED',{target:'#app'});document.querySelector('#bootView').hidden=true;routeIdentity(identity);finishIdentityAttempt(attempt);
   }catch(error){if(identityAttempt===attempt){sessionToken='';document.querySelector('#bootView').hidden=false;}finishIdentityAttempt(attempt,error);}
  };
  await reader.scan({signal:attempt.controller.signal});
 }catch(error){finishIdentityAttempt(attempt,error);}
}
window.addEventListener('pagehide',()=>{if(identityAttempt)finishIdentityAttempt(identityAttempt,new Error('NFC-ANMELDUNG ABGEBROCHEN // Erneut starten.'));});

window.addEventListener('nodiv-pioneer-live',async()=>{
 if(!sessionToken)return;
 window.dispatchEvent(new CustomEvent('nodiv-upload-terminal-refresh'));
 const inv=document.querySelector('#pioneerInventory'),total=document.querySelector('#pioneerCarriedEnergy'),hqTotal=document.querySelector('#hqCarriedEnergy'),secured=document.querySelector('#pioneerSecuredEnergy');
 try{
  const state=await apiRequest({action:'playerstate',token:sessionToken});
  if(!state?.ok||!state?.session)throw new Error(state?.status||'PLAYER STATE UNAVAILABLE');
  const capacity=Math.max(0,Number(state.player?.coreCapacity||0)),cores=Array.isArray(state.cores)?state.cores:[];
  renderPioneerGhost(state.player,state.serverNow);
  if(state.evacuation)renderEvacuation({status:'EVACUATION_IN_PROGRESS',evacuation:state.evacuation});
  if(capacity>0&&cores.length===0&&(!pioneerReSupply||pioneerReSupply.status==='RESUPPLY_COMPLETE')&&!pioneerReSupplyBusy)window.dispatchEvent(new CustomEvent('nodiv-pioneer-resupply-status'));
  if(secured)secured.textContent=String(state.securedEnergy??0)+' E';
  if(total)total.textContent=String(state.carriedEnergy??0)+' E';
  if(hqTotal)hqTotal.textContent=String(state.carriedEnergy??0)+' E';
  if(inv){
   const slots=[];
   for(let i=0;i<3;i++){
    const core=cores[i];
    if(core)slots.push('<div class="pioneer-core"><span><b>'+String(core.energy??'—')+' E</b>'+String(core.status||'FIELD')+'</span></div>');
    else if(i<capacity)slots.push('<div class="pioneer-core"><span><b>EMPTY</b>READY</span></div>');
    else slots.push('<div class="pioneer-core locked">SLOT 0'+(i+1)+'<br>LOCKED</div>');
   }
   inv.innerHTML=slots.join('');
  }
 }catch(err){if(inv)inv.innerHTML='<div class="pioneer-core loading">LIVE DATA OFFLINE</div><div class="pioneer-core locked">SLOT 02<br>LOCKED</div><div class="pioneer-core locked">SLOT 03<br>LOCKED</div>';if(total)total.textContent='— E';if(hqTotal)hqTotal.textContent='— E'}
});
let pioneerObjectScan=null;
function stopPioneerObjectReader(attempt){
 if(attempt.reader){attempt.reader.onreading=null;attempt.reader.onreadingerror=null;}attempt.controller.abort();
}
function finishPioneerObjectScan(attempt){
 stopPioneerObjectReader(attempt);if(pioneerObjectScan!==attempt)return;pioneerObjectScan=null;
 const button=attempt.button;button.dataset.scanActive='0';
 button.disabled=Boolean((pioneerReSupply?.atNode&&pioneerReSupply?.authorized&&pioneerReSupply?.status!=='RESUPPLY_COMPLETE')||pioneerExchange||(pioneerRestore?.atNode&&pioneerRestore?.authorized&&!['RESTORE_1_COMPLETE','RESTORE_2_COMPLETE'].includes(pioneerRestore?.status)));
}
window.addEventListener('nodiv-pioneer-scan',async()=>{
 const b=document.querySelector('#pioneerScan');
 if(!b||pioneerObjectScan||b.dataset.scanActive==='1'||pioneerRestoreBusy||pioneerExchangeBusy||catchBusy||pioneerUploadBusy||pioneerReSupplyBusy||evacuationBusy)return;
 if(!sessionToken){b.textContent='SESSION FEHLT // NEU ANMELDEN';emitNodiv('ACCESS_DENIED',{target:'#pioneerScan'});return}
 if(!('NDEFReader' in window)){b.textContent='WEB NFC NICHT VERFÜGBAR';emitNodiv('ACCESS_DENIED',{target:'#pioneerScan'});return}
 const attempt={controller:new AbortController(),reader:null,handling:false,button:b};pioneerObjectScan=attempt;
 b.dataset.scanActive='1';b.disabled=true;b.textContent='NFC ARMED // NODIV OBJECT SCANNEN';emitNodiv('NFC_ARMED',{target:'#pioneerScan'});
 try{
  const reader=new NDEFReader();attempt.reader=reader;
  reader.onreadingerror=()=>{if(pioneerObjectScan!==attempt||attempt.handling)return;b.textContent='NFC LESEFEHLER // ERNEUT';finishPioneerObjectScan(attempt);emitNodiv('ACCESS_DENIED',{target:'#pioneerScan'});};
  reader.onreading=async event=>{
   if(pioneerObjectScan!==attempt||attempt.handling)return;attempt.handling=true;
   try{
    const uid=nfcUidFromEvent(event);stopPioneerObjectReader(attempt);b.textContent='NODIV OBJECT // VERIFYING';
    const route=await apiRequest({action:'gameplayroute',token:sessionToken,uid:uid});
    if(pioneerObjectScan!==attempt)return;
    if(!route?.ok||!route?.session)throw new Error(route?.error||route?.message||route?.reason||route?.status||'GAMEPLAY ROUTE FAILED');
    if(route.resupplyMission)renderPioneerReSupply(route.resupplyMission,true);
    else if(route.restoreMission)renderPioneerRestore(route.restoreMission,true);
    else if(route.exchangeResume)resumePioneerExchange(route.exchangeResume);
    else if(route.exchangePreview)showPioneerExchangePreview(route.exchangePreview);
    const object=route.object||route.target||{};
    const type=String(object.type||'OBJECT').toUpperCase(),id=String(object.id||'').toUpperCase();
    const decision=route.decision||{};
    if(type==='UPLOAD_TERMINAL'&&object.terminalType==='UPLOAD_HQ'&&object.status==='ACTIVE'&&route.decision?.allowed!==false){const preview=await apiRequest({action:'uploadpreview',token:sessionToken,uid});if(pioneerObjectScan!==attempt)return;if(!preview?.ok||!preview?.action)throw new Error(preview?.error||preview?.status||'UPLOAD PREVIEW FAILED');renderPioneerUpload(preview);}
    const action=String(decision.action||route.action||'NO_ACTION').toUpperCase();
    const allowed=decision.allowed!==undefined?Boolean(decision.allowed):route.allowed!==false;
    const status=String(object.status||route.status||'').toUpperCase();
    const message=String(decision.message||decision.reason||route.message||route.reason||'').trim();
    b.textContent=(id||type)+' // '+(action==='NODE_INTERACTION'?'ACCESS READY':action.replaceAll('_',' '));
    b.title=[status,message].filter(Boolean).join(' // ');
    emitNodiv(allowed?'IDENTITY_VERIFIED':'ACCESS_DENIED',{target:'#pioneerScan'});
   }catch(error){if(pioneerObjectScan!==attempt)return;b.textContent=String(error.message||error);b.title=b.textContent;emitNodiv('ACCESS_DENIED',{target:'#pioneerScan'});}
   finally{finishPioneerObjectScan(attempt);}
  };
  await reader.scan({signal:attempt.controller.signal});
 }catch(error){if(pioneerObjectScan===attempt){b.textContent=String(error.message||error);finishPioneerObjectScan(attempt);emitNodiv('ACCESS_DENIED',{target:'#pioneerScan'});}}
});
window.addEventListener('pagehide',()=>{if(pioneerObjectScan){pioneerObjectScan.button.textContent='NFC // JETZT SCANNEN';finishPioneerObjectScan(pioneerObjectScan);}});

let startCorePioneerUid='';
window.addEventListener('nodiv-founder-startcore-open',()=>{startCorePioneerUid='';const state=document.querySelector('#startCoreIssueState'),hint=document.querySelector('#startCoreIssueHint'),btn=document.querySelector('#scanStartCore');if(state)state.textContent='PIONEER ACCESS CARD';if(hint)hint.textContent='Zuerst die Access Card des Pioneers scannen. Danach den auszugebenden N-Core.';if(btn){btn.disabled=false;btn.dataset.scanActive='0';btn.textContent='AUSGABE STARTEN'}});
window.addEventListener('nodiv-founder-startcore-scan',async()=>{
 const state=document.querySelector('#startCoreIssueState'),hint=document.querySelector('#startCoreIssueHint'),btn=document.querySelector('#scanStartCore');
 if(!('NDEFReader' in window)){if(hint)hint.textContent='Web NFC nicht verfügbar // Android + Chrome erforderlich.';return}
 if(btn?.dataset.scanActive==='1')return;
 if(btn){btn.dataset.scanActive='1';btn.disabled=true;btn.textContent='PIONEER ACCESS CARD SCANNEN'}
 try{
  const cardController=new AbortController(),cardReader=new NDEFReader();await cardReader.scan({signal:cardController.signal});let cardHandling=false;
  cardReader.onreading=async ev=>{if(cardHandling)return;cardHandling=true;cardController.abort();const cardUid=String(ev.serialNumber||'').trim();if(!cardUid)throw new Error('Access Card UID fehlt.');
   try{const identity=await apiRequest({action:'identify',uid:cardUid});if(!identity?.ok||!identity?.authenticated||String(identity.role||'').toUpperCase()!=='PIONEER')throw new Error('Gescannte Karte ist keine aktive PIONEER Access Card.');startCorePioneerUid=cardUid;if(state)state.textContent=(identity.identity||'PIONEER')+' // CORE SCAN';if(hint)hint.textContent='Pioneer verifiziert. Jetzt den N-Core an das Smartphone halten.';if(btn)btn.textContent='N-CORE SCANNEN';
    const coreController=new AbortController(),coreReader=new NDEFReader();await coreReader.scan({signal:coreController.signal});let coreHandling=false;
    coreReader.onreading=async ce=>{if(coreHandling)return;coreHandling=true;coreController.abort();const coreUid=String(ce.serialNumber||'').trim();if(!coreUid)throw new Error('N-Core UID fehlt.');
     try{const lookup=await apiRequest({action:'uidlookup',uid:coreUid});if(!lookup?.ok||!lookup?.found||lookup.type!=='N_CORE'||!lookup.id)throw new Error('Gescannter Tag ist kein registrierter N-Core.');const result=await apiRequest({action:'startcore',core:lookup.id,pioneerUid:startCorePioneerUid,uid:coreUid});if(!result?.ok)throw new Error(result?.error||result?.message||'START-CORE AUSGABE FEHLGESCHLAGEN');if(state)state.textContent=(result.identity||identity.identity||'PIONEER')+' // '+lookup.id+' AUSGEGEBEN';if(hint)hint.textContent=lookup.id+' wurde serverseitig dem Pioneer zugeordnet.';if(btn){btn.dataset.scanActive='0';btn.disabled=false;btn.textContent='WEITEREN START-CORE AUSGEBEN'}showFounderResult('START-CORE AUSGEGEBEN',(result.identity||identity.identity)+' // '+lookup.id,true,btn);emitNodiv('CORE_TRANSFERRED',{target:'#startCoreIssuer'});}
     catch(err){if(hint)hint.textContent=String(err.message||err);if(btn){btn.dataset.scanActive='0';btn.disabled=false;btn.textContent='AUSGABE ERNEUT STARTEN'}showFounderResult('START-CORE ABGEWIESEN',String(err.message||err),false,btn)}
    };
   }catch(err){if(hint)hint.textContent=String(err.message||err);if(btn){btn.dataset.scanActive='0';btn.disabled=false;btn.textContent='AUSGABE ERNEUT STARTEN'}showFounderResult('START-CORE ABGEWIESEN',String(err.message||err),false,btn)}
  };
 }catch(err){if(hint)hint.textContent=String(err.message||err);if(btn){btn.dataset.scanActive='0';btn.disabled=false;btn.textContent='AUSGABE ERNEUT STARTEN'}}
});

let founderAccessRole='';
window.addEventListener('nodiv-founder-accesscard-open',()=>{founderAccessRole='';const role=document.querySelector('#accessCardRole'),id=document.querySelector('#accessCardProvisionId'),hint=document.querySelector('#accessCardProvisionHint'),name=document.querySelector('#accessCardDisplayName');if(role)role.value='';if(name)name.value='';if(id)id.textContent='ROLLE AUSWÄHLEN';if(hint)hint.textContent='Rolle auswählen. NODIV ermittelt automatisch die nächste freie Identität.';});
window.addEventListener('nodiv-founder-accesscard-role',async e=>{founderAccessRole=String(e.detail?.role||'').trim().toUpperCase();const id=document.querySelector('#accessCardProvisionId'),hint=document.querySelector('#accessCardProvisionHint');if(!founderAccessRole){if(id)id.textContent='ROLLE AUSWÄHLEN';return}try{const r=await apiRequest({action:'nextidentity',role:founderAccessRole});if(!r?.ok||!r.available||!r.nextIdentity)throw new Error(founderAccessRole+' LIMIT ERREICHT');if(id)id.textContent=r.nextIdentity+' // '+founderAccessRole;if(hint)hint.textContent='Nächste freie Identität reserviert erst beim erfolgreichen NFC-Scan // '+r.count+' / '+r.limit+' belegt.';}catch(err){if(id)id.textContent='NICHT VERFÜGBAR';if(hint)hint.textContent=String(err.message||err)}});
window.addEventListener('nodiv-founder-accesscard-scan',async()=>{
 if(!sessionToken)return;
 const role=founderAccessRole,id=document.querySelector('#accessCardProvisionId'),hint=document.querySelector('#accessCardProvisionHint'),name=document.querySelector('#accessCardDisplayName'),btn=document.querySelector('#scanAccessCard');
 if(!role){if(hint)hint.textContent='Bitte zuerst PIONEER, LOCAL, UNBOUND oder FIELD OPERATOR auswählen.';return}
 if(!('NDEFReader' in window)){if(hint)hint.textContent='Web NFC nicht verfügbar // Android + Chrome erforderlich.';return}
 if(btn?.dataset.scanActive==='1')return;
 if(btn){btn.dataset.scanActive='1';btn.disabled=true;btn.textContent='NFC ARMED // ACCESS CARD SCANNEN'}
 if(hint)hint.textContent='Neue Access Card jetzt an das Smartphone halten.';
 try{
  const controller=new AbortController(),reader=new NDEFReader();
  await reader.scan({signal:controller.signal});
  let handling=false;
  reader.onreadingerror=()=>{if(handling)return;controller.abort();if(btn){btn.dataset.scanActive='0';btn.disabled=false;btn.textContent='NFC-SCAN ERNEUT STARTEN'}if(hint)hint.textContent='NFC-Karte konnte nicht gelesen werden.'};
  reader.onreading=async e=>{
   if(handling)return;
   handling=true;
   controller.abort();
   const uid=e&&typeof e.serialNumber==='string'?e.serialNumber.trim():'';
   if(!uid){handling=false;if(btn){btn.dataset.scanActive='0';btn.disabled=false;btn.textContent='NFC-SCAN ERNEUT STARTEN'}if(hint)hint.textContent='Keine gültige NFC UID gelesen.';return}
   if(hint)hint.textContent='GELESENE UID // '+uid+' // REGISTRIERUNG WIRD GEPRÜFT';
   try{
    const r=await apiRequest({action:'provisionaccesscard',token:sessionToken,role,uid,displayName:String(name?.value||'').trim()});
    if(!r?.ok||r?.action!==true)throw new Error(r?.message||r?.status||r?.error||'PROVISION FAILED');
    if(id)id.textContent=(r.card?.identity||'IDENTITY')+' // '+(r.card?.role||role);
    if(hint)hint.textContent='REGISTRIERT // '+(r.card?.identity||'')+' // UID '+uid;
    if(btn){btn.dataset.scanActive='0';btn.disabled=false;btn.textContent='WEITERE ACCESS CARD REGISTRIEREN'}
    showFounderResult('ACCESS CARD REGISTRIERT',(r.card?.identity||'')+' // '+(r.card?.role||role),true,btn);
    emitNodiv('IDENTITY_VERIFIED',{target:'#accessCardProvisioner'});
    founderAccessRole='';
    const roleSelect=document.querySelector('#accessCardRole');if(roleSelect)roleSelect.value='';
   }catch(err){
    if(btn){btn.dataset.scanActive='0';btn.disabled=false;btn.textContent='NFC-SCAN ERNEUT STARTEN'}
    if(hint)hint.textContent='GELESENE UID // '+uid+' // '+String(err.message||err);
    showFounderResult('REGISTRIERUNG ABGEWIESEN',String(err.message||err),false,btn);
   }
  };
 }catch(err){if(btn){btn.dataset.scanActive='0';btn.disabled=false;btn.textContent='NFC-SCAN ERNEUT STARTEN'}if(hint)hint.textContent=String(err.message||err)}
});
window.addEventListener('nodiv-founder-register-antenna',async()=>{
 if(!sessionToken)return;
 const btn=document.querySelector('#registerAntenna');
 if(!('NDEFReader' in window)){showFounderResult('NFC NICHT VERFÜGBAR','Android + Chrome erforderlich.',false,btn);return}
 if(btn?.dataset.scanActive==='1')return;
 if(btn){btn.dataset.scanActive='1';btn.disabled=true;btn.textContent='NFC ARMED // NODE SCANNEN'}
 showFounderResult('NFC ARMED','NFC-Tag des Nodes jetzt an das Smartphone halten.',true,btn);
 try{
  const controller=new AbortController(),reader=new NDEFReader();
  await reader.scan({signal:controller.signal});
  let handling=false;
  reader.onreadingerror=()=>{
   if(handling)return;
   controller.abort();
   if(btn){btn.dataset.scanActive='0';btn.disabled=false;btn.textContent='NODE REGISTRIEREN'}
   showFounderResult('NFC FEHLER','Node-Tag konnte nicht gelesen werden.',false,btn);
  };
  reader.onreading=async e=>{
   if(handling)return;
   handling=true;
   controller.abort();
   const uid=e&&typeof e.serialNumber==='string'?e.serialNumber.trim():'';
   if(!uid){
    if(btn){btn.dataset.scanActive='0';btn.disabled=false;btn.textContent='NODE REGISTRIEREN'}
    showFounderResult('UID FEHLT','Node-Tag konnte nicht eindeutig gelesen werden.',false,btn);
    return;
   }
   try{
    showFounderResult('NODE WIRD GEPRÜFT','NODIV prüft UID und reserviert die nächste freie Node-ID.',true,btn);
    const r=await apiRequest({action:'provisionnode',token:sessionToken,uid});
    if(!r?.ok||r?.action!==true)throw new Error(r?.message||r?.status||r?.error||'REGISTRIERUNG FEHLGESCHLAGEN');
    showFounderResult('NODE REGISTRIERT',(r.node?.id||'NODE')+' // '+(r.node?.status||'AVAILABLE'),true,btn);
    emitNodiv('IDENTITY_VERIFIED',{target:'#roleView'});
    window.dispatchEvent(new CustomEvent('nodiv-founder-status'));
   }catch(err){
    showFounderResult('REGISTRIERUNG ABGEWIESEN',String(err.message||err),false,btn);
   }finally{
    if(btn){btn.dataset.scanActive='0';btn.disabled=false;btn.textContent='NODE REGISTRIEREN'}
   }
  };
 }catch(err){
  if(btn){btn.dataset.scanActive='0';btn.disabled=false;btn.textContent='NODE REGISTRIEREN'}
  showFounderResult('NFC FEHLER',String(err.message||err),false,btn);
 }
});
function showFounderResult(title,detail,ok,target){
 const anchor=typeof target==='string'?document.querySelector(target):target;
 let el=anchor?.nextElementSibling;
 if(!el||!el.classList?.contains('founder-result')){
  el=document.createElement('div');
  el.className='founder-result';
  if(anchor)anchor.insertAdjacentElement('afterend',el);
  else document.querySelector('.founder-console')?.appendChild(el);
 }
 el.className='founder-result '+(ok?'ok':'bad');
 el.innerHTML='<strong>'+String(title)+'</strong><span>'+String(detail)+'</span>';
}

let founderEventReady=false;
function founderCanInitialize(){
 const state=document.querySelector('#eventState')?.textContent||'STANDBY';
 return founderEventReady && ['STANDBY','COMPLETED'].includes(state);
}
async function refreshFounderEventStatus(){
 if(!sessionToken)return;
 const state=document.querySelector('#eventState'),hint=document.querySelector('#eventHint'),list=document.querySelector('#eventNodes'),init=document.querySelector('#initializeEvent'),activate=document.querySelector('#activateEvent');
 if(!state)return;
 try{
  const r=await apiRequest({action:'eventstatus',token:sessionToken});
  if(!r?.ok)throw new Error(r?.message||r?.error||'EVENT STATUS FAILED');
  const ev=r.event||{},nodes=Array.isArray(r.provisionedNodes)?r.provisionedNodes:[];
  state.textContent=ev.state||'STANDBY';
  if(list)list.innerHTML=nodes.length?nodes.map(n=>'<span>'+n+'</span>').join(''):'<span>KEINE NODES</span>';
  if(hint)hint.textContent=ev.eventId?(ev.eventId+' // '+(ev.plannedNodes||0)+' NODE(S)'):(nodes.length+' provisionierte Node(s) bereit.');
  if(!['STANDBY','COMPLETED'].includes(ev.state||'STANDBY'))founderEventReady=false;
  if(init)init.disabled=!founderCanInitialize();
  if(activate)activate.disabled=ev.state!=='INITIALIZED';
  const shutdown=document.querySelector('#shutdownFieldEvent');if(shutdown){shutdown.disabled=ev.state!=='FIELD_ACTIVE';shutdown.dataset.eventId=ev.eventId||'';}
  const withdrawal=document.querySelector('#startPreEvacuation');if(withdrawal){withdrawal.disabled=ev.state!=='FIELD_ACTIVE';withdrawal.dataset.eventId=ev.eventId||'';window.dispatchEvent(new CustomEvent('nodiv-preevacuation-refresh'));}
 }catch(err){if(hint)hint.textContent=String(err.message||err)}
}
window.addEventListener('nodiv-founder-status',()=>{setTimeout(refreshFounderEventStatus,0)});
window.addEventListener('nodiv-founder-event-readiness',async()=>{
 if(!sessionToken)return;
 const btn=document.querySelector('#checkEventReadiness'),init=document.querySelector('#initializeEvent'),repair=document.querySelector('#repairCoreOwnership');
 founderEventReady=false;
 if(init)init.disabled=true;
 if(btn){btn.disabled=true;btn.textContent='PRÜFUNG LÄUFT'}
 try{
  const r=await apiRequest({action:'eventreadiness',token:sessionToken});
  if(!r?.ok)throw new Error(r?.message||r?.error||'READINESS CHECK FEHLGESCHLAGEN');
  const failed=Array.isArray(r.checks)?r.checks.filter(x=>!x.ok):[];
  const coreDiagnostics=Array.isArray(r.coreDiagnostics)?r.coreDiagnostics:[];
  const badCores=coreDiagnostics.filter(x=>!x.ok);
  const summary=r.coreSummary||{};
  if(repair)repair.hidden=(summary.invalidOwnership||0)===0;
  const preflightBox=document.querySelector('#eventPreflight');
  const preflight=Array.isArray(r.preflight)?r.preflight:[];
  const preflightMap=Object.fromEntries(preflight.map(x=>[x.id,x]));
  if(preflightBox){
   preflightBox.hidden=!r.systemReady;
   let snapshot=preflightBox.querySelector('#eventConfigSnapshot');
   if(!snapshot){
    snapshot=document.createElement('div');
    snapshot.id='eventConfigSnapshot';
    snapshot.className='event-config-snapshot';
    preflightBox.insertBefore(snapshot,document.querySelector('#confirmEventConfiguration'));
   }
   const ids=r.identitySummary||{}, uploads=r.uploadSummary||{}, nodeNames=Array.isArray(r.startNodes)?r.startNodes:[], remainingNodes=Array.isArray(r.remainingHardwareNodes)?r.remainingHardwareNodes:[];
   snapshot.innerHTML='<small>EVENT CONFIGURATION // ZU BESTÄTIGEN</small>'+
    '<div><b>START-NODES</b> '+nodeNames.length+(nodeNames.length?' // '+nodeNames.join(', '):'')+'</div>'+
    '<div><b>ÜBRIGE HARDWARE // NICHT IM EVENT</b> '+remainingNodes.length+(remainingNodes.length?' // '+remainingNodes.join(', '):'')+'</div>'+
    '<div><b>N-CORES</b> '+(summary.registered||0)+' registriert // '+(summary.hqReserve||0)+' HQ Reserve // '+(summary.assigned||0)+' zugewiesen</div>'+
    '<div><b>FIELD IDENTITIES</b> '+(ids.PIONEER||0)+' Pioneer // '+(ids.LOCAL||0)+' Local // '+(ids.UNBOUND||0)+' Unbound // '+(ids.FOP||0)+' FOP</div>'+
    '<div><b>UPLOAD</b> '+(uploads.hq||0)+' HQ Bay(s) // '+(uploads.fop||0)+' FOP Upload(s)</div>'+
    '<div><b>ACCESS SECURITY</b> '+(r.startCodeCapacityRequired||0)+' mechanische Codes werden bei Initialisierung erzeugt</div>';
  }
  const physical=document.querySelector('#confirmPhysicalEquipment'),config=document.querySelector('#confirmEventConfiguration'),finalConfirm=document.querySelector('#confirmFounderFinal');
  if(physical){physical.disabled=!r.systemReady||!!preflightMap.PHYSICAL_EQUIPMENT?.confirmed;physical.textContent=preflightMap.PHYSICAL_EQUIPMENT?.confirmed?'PHYSICAL EQUIPMENT ✓':'PHYSICAL EQUIPMENT BESTÄTIGEN'}
  if(config){config.disabled=!preflightMap.PHYSICAL_EQUIPMENT?.confirmed||!!preflightMap.EVENT_CONFIGURATION?.confirmed;config.textContent=preflightMap.EVENT_CONFIGURATION?.confirmed?'EVENT CONFIGURATION ✓':'EVENT CONFIGURATION BESTÄTIGEN'}
  if(finalConfirm){finalConfirm.disabled=!preflightMap.EVENT_CONFIGURATION?.confirmed||!!preflightMap.FINAL_FOUNDER_CONFIRMATION?.confirmed;finalConfirm.textContent=preflightMap.FINAL_FOUNDER_CONFIRMATION?.confirmed?'FINAL FOUNDER CONFIRMATION ✓':'FINAL FOUNDER CONFIRMATION'}
  founderEventReady=r.ready===true && ['STANDBY','COMPLETED'].includes(document.querySelector('#eventState')?.textContent||'STANDBY');
  if(r.ready===true){
   const coreLine='N_CORES: '+(summary.registered||0)+' registriert // '+(summary.hqReserve||0)+' HQ Reserve // '+(summary.assigned||0)+' zugewiesen';
   showFounderResult('EVENT READY',(r.checks||[]).map(x=>x.id+' ✓').join(' // ')+' // PRE-FLIGHT ✓ // '+coreLine,true,btn);
   if(init)init.disabled=!founderCanInitialize();
  }else if(r.systemReady){
   const pending=(r.manualChecksPending||[]).join(' // ');
   showFounderResult('BASELINE READY','SYSTEM CHECKS ✓ // PRE-FLIGHT AUSSTEHEND: '+pending,true,btn);
   if(init)init.disabled=true;
  }else{
   const blockers=failed.map(x=>x.id+': '+x.detail);
   const coreLines=badCores.map(x=>x.id+(x.energy?' · '+x.energy+' E':'')+' → '+x.detail);
   showFounderResult('NICHT BEREIT',blockers.concat(coreLines).join(' // ')||r.status,false,btn);
   if(init)init.disabled=true;
  }
 }catch(err){founderEventReady=false;showFounderResult('READINESS FEHLER',String(err.message||err),false,btn);if(init)init.disabled=true}
 finally{if(btn){btn.disabled=false;btn.textContent='READINESS CHECK'}}
});
window.addEventListener('nodiv-founder-ownership-repair',async()=>{
 if(!sessionToken)return;
 const btn=document.querySelector('#repairCoreOwnership'),init=document.querySelector('#initializeEvent');
 founderEventReady=false;
 if(init)init.disabled=true;
 if(btn){btn.disabled=true;btn.textContent='OWNERSHIP WIRD REPARIERT'}
 try{
  const r=await apiRequest({action:'eventreadinessrepair',token:sessionToken});
  if(!r?.ok||r?.action!==true)throw new Error(r?.message||r?.status||r?.error||'REPARATUR FEHLGESCHLAGEN');
  const repaired=Array.isArray(r.repaired)?r.repaired:[];
  showFounderResult(
   repaired.length?'OWNERSHIP REPARIERT':'KEINE REPARATUR NÖTIG',
   repaired.length?repaired.map(x=>x.id+(x.energy?' · '+x.energy+' E':'')+' → HQ RESERVE').join(' // '):'Keine registrierten Cores ohne Ownership gefunden.',
   true,btn
  );
  if(btn)btn.hidden=true;
  if(init)init.disabled=true;
  document.querySelector('#checkEventReadiness')?.click();
 }catch(err){showFounderResult('REPARATUR FEHLER',String(err.message||err),false,btn)}
 finally{if(btn){btn.disabled=false;btn.textContent='OWNERSHIP REPARIEREN'}}
});
window.addEventListener('nodiv-founder-preflight',async e=>{
 if(!sessionToken)return;
 const check=String(e.detail?.check||'').toUpperCase();
 const ids={PHYSICAL_EQUIPMENT:'#confirmPhysicalEquipment',EVENT_CONFIGURATION:'#confirmEventConfiguration',FINAL_FOUNDER_CONFIRMATION:'#confirmFounderFinal'};
 const btn=document.querySelector(ids[check]||'');
 if(!btn)return;
 btn.disabled=true;
 try{
  const r=await apiRequest({action:'eventpreflightconfirm',token:sessionToken,check});
  if(!r?.ok||r?.action!==true)throw new Error(r?.message||r?.status||r?.error||'PRE-FLIGHT BESTÄTIGUNG FEHLGESCHLAGEN');
  showFounderResult('PRE-FLIGHT BESTÄTIGT',check.replaceAll('_',' '),true,btn);
  document.querySelector('#checkEventReadiness')?.click();
 }catch(err){showFounderResult('PRE-FLIGHT GESPERRT',String(err.message||err),false,btn);btn.disabled=false}
});
window.addEventListener('nodiv-founder-event-initialize',async()=>{
 if(!sessionToken)return;
 const btn=document.querySelector('#initializeEvent');
 founderEventReady=false;
 if(btn){btn.disabled=true;btn.textContent='EVENT WIRD INITIALISIERT'}
 try{
  const r=await apiRequest({action:'eventinitialize',token:sessionToken});
  if(!r?.ok||r?.action!==true)throw new Error(r?.message||r?.status||r?.error||'INITIALISIERUNG FEHLGESCHLAGEN');
  showFounderResult('EVENT INITIALISIERT',(r.event?.eventId||'EVENT')+' // '+(r.event?.plannedNodes||0)+' NODE(S)',true,btn);
  emitNodiv('IDENTITY_VERIFIED',{target:'#eventState'});
 }catch(err){showFounderResult('INITIALISIERUNG ABGEWIESEN',String(err.message||err),false,btn)}
 finally{if(btn)btn.textContent='EVENT INITIALISIEREN';await refreshFounderEventStatus()}
});
window.addEventListener('nodiv-founder-event-activate',async()=>{
 if(!sessionToken)return;
 const btn=document.querySelector('#activateEvent');
 if(btn){btn.disabled=true;btn.textContent='FIELD CHECK'}
 try{
  const r=await apiRequest({action:'eventactivate',token:sessionToken});
  if(!r?.ok||r?.action!==true)throw new Error(r?.message||r?.status||r?.error||'AKTIVIERUNG FEHLGESCHLAGEN');
  showFounderResult('FIELD OPERATIONS AKTIV',r.eventId||'EVENT ACTIVE',true,btn);
  emitNodiv('IDENTITY_VERIFIED',{target:'#eventState'});
 }catch(err){showFounderResult('AKTIVIERUNG GESPERRT',String(err.message||err),false,btn)}
 finally{if(btn)btn.textContent='FIELD OPERATIONS AKTIVIEREN';await refreshFounderEventStatus()}
});
window.addEventListener('nodiv-founder-event-shutdown',async()=>{
 if(!sessionToken)return;
 const btn=document.querySelector('#shutdownFieldEvent');if(!btn?.dataset.eventId)return;
 btn.disabled=true;
 try{
  const r=await apiRequest({action:'eventshutdown',token:sessionToken,event:btn.dataset.eventId});
  if(!r?.ok||r.action!==true)throw new Error(r?.message||r?.status||r?.error||'FIELD SHUTDOWN BLOCKED');
  showFounderResult('FIELD EVENT SHUTDOWN // ALPHA',r.eventId+' // '+r.eventState,true,btn);
 }catch(err){showFounderResult('FIELD SHUTDOWN BLOCKED',String(err.message||err),false,btn)}finally{await refreshFounderEventStatus()}
});

let fopInstallation=null,fopInstallBusy=false,fopOperations=[],fopQueueBusy=false,fopQueueState='idle';
function selectedFopOperation(){const value=document.querySelector('#fopOperationSelect')?.value;return fopOperations.find(operation=>operation.id===value)||null}
async function refreshFopOperations(){
 if(!sessionToken||fopInstallBusy||fopQueueBusy)return;
 const select=document.querySelector('#fopOperationSelect'),hint=document.querySelector('#fopInstallHint');if(!select)return;
 fopQueueBusy=true;fopQueueState='loading';fopOperations=[];
 const queueHint=document.querySelector('#fopQueueHint');
 select.replaceChildren();const loading=document.createElement('option');loading.value='';loading.textContent='QUEUE WIRD GELADEN';select.appendChild(loading);
 if(queueHint)queueHint.textContent='Aufträge werden vom Server geladen.';renderFopInstallation(fopInstallation);
 try{
  const r=await apiRequest({action:'fopoperations',token:sessionToken});
  if(!r?.ok||!r?.session||!Array.isArray(r.operations))throw new Error(r?.message||r?.status||r?.error||'OPERATIONS QUEUE UNAVAILABLE');
  if(r.evacuation)renderEvacuation({status:'EVACUATION_IN_PROGRESS',evacuation:r.evacuation,eventId:r.eventId});
  fopOperations=r.operations.filter(operation=>['INSTALL','DEINSTALL'].includes(operation.type)&&/^NODE-\d{3}$/.test(operation.nodeId));
  select.replaceChildren();const prompt=document.createElement('option');prompt.value='';prompt.textContent=fopOperations.length?'OPERATION AUSWÄHLEN':'NO OPERATIONS AVAILABLE';select.appendChild(prompt);
  for(const operation of fopOperations){const option=document.createElement('option');option.value=operation.id;option.textContent=operation.label;select.appendChild(option)}select.value=fopOperations.find(operation=>operation.resume===true)?.id||'';
  fopQueueState='ready';if(queueHint)queueHint.textContent=fopOperations.length?'Operation auswählen.':'Server bestätigt: aktuell keine verfügbaren Operationen.';
 }catch(err){select.replaceChildren();const option=document.createElement('option');option.value='';option.textContent='QUEUE NICHT GELADEN';select.appendChild(option);fopQueueState='error';const message='Aufträge konnten nicht geladen werden: '+String(err.message||err)+' // QUEUE AKTUALISIEREN.';if(queueHint)queueHint.textContent=message;if(hint)hint.textContent=message}
 finally{fopQueueBusy=false;renderFopInstallation(fopInstallation)}
}
window.addEventListener('nodiv-fop-operations',refreshFopOperations);
window.addEventListener('nodiv-fop-operation-select',()=>renderFopInstallation(fopInstallation));
function renderFopInstallation(result){
 const progress=document.querySelector('#fopInstallProgress'),list=document.querySelector('#fopInstallCores'),scan=document.querySelector('#fopInstallScan'),confirm=document.querySelector('#fopInstallConfirm');
 const complete=['NODE_INSTALLED','NODE_DEINSTALLED'].includes(result?.status),removal=result?.operation==='DEINSTALL';
 const card=document.querySelector('#fopDeploymentCard');if(card)card.dataset.operation=removal?'DEINSTALL':'INSTALL';
 const setText=(id,text)=>{const el=document.querySelector(id);if(el)el.textContent=text};
 if(progress)progress.textContent=String(result?.count||0)+'/3';
 const bar=document.querySelector('#fopProgressBar');if(bar)bar.value=result?.count||0;
 if(list){list.replaceChildren();for(const core of result?.loadout||[]){
  const item=document.createElement('article');item.className='fop-core'+(core.scanned?' verified':'');
  for(const [tag,text] of [['small',core.id],['strong',core.energy+' E'],['span',core.scanned?'VERIFIED':'AWAITING SCAN']]){const el=document.createElement(tag);el.textContent=text;item.appendChild(el)}list.appendChild(item);
 }}
 setText('#fopDeploymentNode',result?.node?.id||'Operation auswählen');
 setText('#fopLoadoutEnergy',result?result.totalEnergy+' E':'— E');
 setText('#fopLoadoutState',result?.nodeState||'—');
 const state=document.querySelector('#fopLoadoutState');if(state)state.dataset.state=result?.nodeState||'';
 setText('#fopOperationStatus',complete?'COMPLETE':result?(removal?'RECOVERING':'DEPLOYING'):fopQueueBusy?'LOADING':fopQueueState==='error'?'UNAVAILABLE':fopQueueState==='ready'&&!fopOperations.length?'NO OPERATIONS':'READY');
 setText('#fopOperationLabel',removal?'FIELD RECOVERY':'FIELD INSTALLATION');
 setText('#fopDeploymentLabel',removal?'NODE DEINSTALLATION':'NODE DEPLOYMENT');
 setText('#fopLoadoutLabel',removal?'REMOVAL LOADOUT':'ASSIGNED LOADOUT');
 setText('#fopEnergyLabel',removal?'RECOVERABLE ENERGY':'TOTAL ENERGY');
 setText('#fopStateLabel',removal?'CURRENT NODE STATE':'PROJECTED NODE STATE');
 setText('#fopCodeLabel',removal?'ACTIVE LOCK CODE':result?.node?.slot||'PRIMARY CODE');
 setText('#fopInstallConfirm',removal?'RECOVERY BESTÄTIGEN':'INSTALLATION BESTÄTIGEN');
 if(!fopInstallBusy)setText('#fopInstallScan',removal?'REMOVAL CORE SCANNEN':'CODE EINGESTELLT // CORE SCANNEN');
 for(const id of ['#fopPrimaryPanel','#fopScanProgress','#fopInstallActions']){const el=document.querySelector(id);if(el)el.hidden=complete}
 const panel=document.querySelector('#fopInstallCode');if(panel)panel.hidden=!result||complete;
 const summary=document.querySelector('#fopDeploymentComplete');if(summary){summary.hidden=!complete;summary.textContent=complete?(removal?(result.evacuationTeam?'NODE EVACUATED // '+result.node.id+' // 3/3 EVACUATION CARGO → '+result.cargoCarrier:'RECOVERY COMPLETE // '+result.node.id+' // 3/3 CORES RETURNED'):'DEPLOYMENT COMPLETE // '+result.node.id+' // 3/3 // '+result.totalEnergy+' E // '+result.nodeState):''}
 if(scan)scan.disabled=!result||complete||result.count>=3||fopInstallBusy;
 if(confirm)confirm.disabled=complete||!result?.canConfirm||fopInstallBusy;
 const cancel=document.querySelector('#fopInstallCancel');if(cancel)cancel.disabled=!result||complete||fopInstallBusy;
 const active=Boolean(result&&!complete),selected=selectedFopOperation();
 const order=document.querySelector('#fopInstallOrder');if(order)order.disabled=fopInstallBusy||fopQueueBusy||active||!selected;
 const select=document.querySelector('#fopOperationSelect');if(select)select.disabled=fopInstallBusy||fopQueueBusy||active||!fopOperations.length;
 const refresh=document.querySelector('#fopQueueRefresh');if(refresh)refresh.disabled=fopInstallBusy||fopQueueBusy||active;
}
function fopRequestParams(action){const resolved=fopInstallation.operation==='DEINSTALL'?action.replace('nodeinstall','nodedeinstall'):action;return {action:resolved,token:sessionToken,node:fopInstallation.node.id,installation:fopInstallation.installation}}
window.addEventListener('nodiv-fop-install-order',async()=>{
 if(!sessionToken||fopInstallBusy)return;
 const btn=document.querySelector('#fopInstallOrder'),panel=document.querySelector('#fopInstallCode'),value=document.querySelector('#fopCodeValue'),hint=document.querySelector('#fopInstallHint');
 const operation=selectedFopOperation();if(!operation||fopQueueBusy||fopInstallation&&!['NODE_INSTALLED','NODE_DEINSTALLED'].includes(fopInstallation.status)){if(hint)hint.textContent='Zulässige Operation aus der Queue auswählen.';return}
 const node=operation.nodeId;
 fopInstallation=null;fopInstallBusy=true;renderFopInstallation(null);if(btn)btn.disabled=true;
 try{
  let evacuationParams={};if(operation.evacuation){if(hint)hint.textContent='ZUGEWIESENEN NODE NFC SCANNEN // '+node;evacuationParams={evacuation:operation.evacuation,uid:await scanEvacuationUid()};}
  const r=await apiRequest({action:operation.type==='DEINSTALL'?'nodedeinstallorder':'nodeinstallorder',token:sessionToken,node,...evacuationParams,...(operation.withdrawal?{withdrawal:operation.withdrawal}:{})});
  if(!r?.ok||r?.action!==true||!r.installation)throw new Error(r?.message||r?.status||r?.error||'AUFTRAG NICHT VERFÜGBAR');
  fopInstallation=r;
  if(panel)panel.hidden=false;
  if(value)value.textContent=r.node.code;
  if(hint)hint.textContent=node+' // '+(r.cargoCarrier?'CARGO → '+r.cargoCarrier+' // ':'')+r.instruction;
 }catch(err){if(value)value.textContent='LOCKED';if(hint)hint.textContent=String(err.message||err)}
 finally{fopInstallBusy=false;renderFopInstallation(fopInstallation)}
});
window.addEventListener('nodiv-fop-install-scan',async()=>{
 if(!sessionToken||!fopInstallation||fopInstallBusy||fopInstallation.count>=3)return;
 const hint=document.querySelector('#fopInstallHint'),btn=document.querySelector('#fopInstallScan');
 if(!('NDEFReader' in window)){if(hint)hint.textContent='Web NFC nicht verfügbar // Android + Chrome erforderlich.';return}
 fopInstallBusy=true;renderFopInstallation(fopInstallation);
 const controller=new AbortController();
 const finish=()=>{controller.abort();fopInstallBusy=false;renderFopInstallation(fopInstallation);if(btn)btn.textContent='NÄCHSTEN N-CORE SCANNEN'};
 try{
  const reader=new NDEFReader();await reader.scan({signal:controller.signal});let handling=false;
  if(btn)btn.textContent='NFC ARMED // N-CORE '+(fopInstallation.count+1)+'/3';
  reader.onreadingerror=()=>{if(handling)return;if(hint)hint.textContent='NFC LESEFEHLER // Scan erneut starten.';finish()};
  reader.onreading=async ev=>{
   if(handling)return;handling=true;controller.abort();
   try{
    const uid=String(ev?.serialNumber||'').trim();if(!uid)throw new Error('NFC UID fehlt.');
    const r=await apiRequest({...fopRequestParams('nodeinstallscan'),uid});
    if(!r?.ok||r.action!==true)throw new Error(r?.message||r?.status||r?.error||'CORE ABGEWIESEN');
    fopInstallation=r;
    if(hint)hint.textContent=r.node.id+' // '+r.count+'/3'+(r.canConfirm?(r.operation==='DEINSTALL'?' // Drei Cores physisch entfernen, dann Recovery bestätigen.':' // Drei Cores physisch einsetzen, dann Installation bestätigen.'):' // Nächsten zugewiesenen Core scannen.');
   }catch(err){if(hint)hint.textContent=String(err.message||err)}finally{finish()}
  };
 }catch(err){if(hint)hint.textContent=String(err.message||err);finish()}
});
window.addEventListener('nodiv-fop-install-confirm',async()=>{
 if(!sessionToken||!fopInstallation?.canConfirm||fopInstallBusy)return;
 const btn=document.querySelector('#fopInstallConfirm'),value=document.querySelector('#fopCodeValue'),hint=document.querySelector('#fopInstallHint');
 fopInstallBusy=true;renderFopInstallation(fopInstallation);
 try{
  const r=await apiRequest(fopRequestParams('nodeinstallconfirm'));
  if(!r?.ok||r?.action!==true)throw new Error(r?.message||r?.status||r?.error||'BESTÄTIGUNG FEHLGESCHLAGEN');
  fopInstallation={...fopInstallation,...r,canConfirm:false};
  if(hint)hint.textContent=r.status==='NODE_DEINSTALLED'?'Recovery serverseitig bestätigt.':'Installation serverseitig bestätigt.';
  emitNodiv('IDENTITY_VERIFIED',{target:'#fopInstallCode'});
 }catch(err){if(hint)hint.textContent=String(err.message||err)}
 finally{fopInstallBusy=false;renderFopInstallation(fopInstallation);if(['NODE_INSTALLED','NODE_DEINSTALLED'].includes(fopInstallation?.status))await refreshFopOperations()}
});

window.addEventListener('nodiv-fop-install-cancel',async()=>{
 if(!sessionToken||!fopInstallation||fopInstallBusy)return;
 const hint=document.querySelector('#fopInstallHint');fopInstallBusy=true;renderFopInstallation(fopInstallation);
 try{
  const r=await apiRequest(fopRequestParams('nodeinstallcancel'));
  if(!r?.ok||r.action!==true)throw new Error(r?.message||r?.status||r?.error||'ABBRUCH FEHLGESCHLAGEN');
  fopInstallation=null;if(hint)hint.textContent='Auftrag abgebrochen // Loadout freigegeben.';
 }catch(err){if(hint)hint.textContent=String(err.message||err)}finally{fopInstallBusy=false;renderFopInstallation(fopInstallation);if(!fopInstallation)await refreshFopOperations()}
});

window.addEventListener('nodiv-founder-core-open',async()=>{
 if(!sessionToken)return;
 const panel=document.querySelector('#coreProvisioner'),id=document.querySelector('#coreProvisionId'),hint=document.querySelector('#coreProvisionHint'),input=document.querySelector('#coreEnergy');
 if(!panel)return; panel.hidden=false; if(input){input.value='';input.focus()} if(id)id.textContent='NÄCHSTER CORE WIRD ERMITTELT'; if(hint)hint.textContent='NODIV prüft den nächsten freien N-Core-Datensatz.';
 try{const free=await apiRequest({action:'nextfree'});if(!free?.ok||!free.nextFreeCore)throw new Error('Kein freier NC-001 bis NC-200 Datensatz.');panel.dataset.coreId=free.nextFreeCore;if(id)id.textContent=free.nextFreeCore;if(hint)hint.textContent='Energiewert eingeben. Danach NFC-Scan starten.';}catch(err){panel.dataset.coreId='';if(id)id.textContent='NICHT VERFÜGBAR';if(hint)hint.textContent=String(err.message||err)}
});
window.addEventListener('nodiv-founder-core-scan',async()=>{
 if(!sessionToken)return;
 const panel=document.querySelector('#coreProvisioner'),id=document.querySelector('#coreProvisionId'),input=document.querySelector('#coreEnergy'),hint=document.querySelector('#coreProvisionHint'),btn=document.querySelector('#scanCoreAntenna');
 const coreId=panel?.dataset.coreId||'',value=Number(String(input?.value||'').trim());
 if(!coreId){if(hint)hint.textContent='Kein freier N-Core geladen.';return} if(!Number.isFinite(value)||value<=0){if(hint)hint.textContent='Bitte einen gültigen Energiewert größer 0 eingeben.';input?.focus();return}
 if(!('NDEFReader' in window)){if(hint)hint.textContent='Web NFC nicht verfügbar // Android + Chrome erforderlich.';return}
 if(btn){btn.disabled=true;btn.textContent='NFC ARMED // N-CORE SCANNEN'} if(hint)hint.textContent=coreId+' // '+value+' E // N-Core jetzt an das Gerät halten.';
 try{const reader=new NDEFReader();await reader.scan();let handling=false;reader.onreadingerror=()=>{if(btn){btn.disabled=false;btn.textContent='NFC-SCAN ERNEUT STARTEN'}if(hint)hint.textContent='NFC-Antenne konnte nicht gelesen werden.'};reader.onreading=async e=>{if(handling)return;const uid=e&&typeof e.serialNumber==='string'?e.serialNumber.trim():'';if(!uid){if(hint)hint.textContent='Keine gültige NFC UID gelesen.';return}handling=true;try{const r=await apiRequest({action:'register',core:coreId,uid,energy:value});if(!r?.ok)throw new Error(r?.error||r?.message||'REGISTRATION FAILED');showFounderResult('N-CORE REGISTRIERT',coreId+' // '+value+' E',true,btn);emitNodiv('CORE_TRANSFERRED',{target:'#coreProvisioner'});if(id){id.textContent=coreId+' // '+value+' E // ✓';id.classList.add('provision-success')}if(hint)hint.textContent='ERFOLGREICH REGISTRIERT // nächster N-Core wird geladen.';if(btn){btn.disabled=true;btn.textContent='REGISTRIERT ✓'}panel.dataset.coreId='';window.dispatchEvent(new CustomEvent('nodiv-founder-status'));setTimeout(async()=>{try{const free=await apiRequest({action:'nextfree'});if(!free?.ok||!free.nextFreeCore)throw new Error('Kein weiterer freier N-Core.');panel.dataset.coreId=free.nextFreeCore;if(id){id.classList.remove('provision-success');id.textContent=free.nextFreeCore}if(input)input.value='';if(hint)hint.textContent='Energiewert eingeben. Danach NFC-Scan starten.';if(btn){btn.disabled=false;btn.textContent='NFC-SCAN STARTEN'}input?.focus();}catch(nextErr){if(id){id.classList.remove('provision-success');id.textContent='KEIN FREIER N-CORE'}if(hint)hint.textContent=String(nextErr.message||nextErr);if(btn){btn.disabled=true;btn.textContent='REGISTRIERUNG ABGESCHLOSSEN'}}},900);}catch(err){handling=false;if(btn){btn.disabled=false;btn.textContent='NFC-SCAN ERNEUT STARTEN'}if(hint)hint.textContent=String(err.message||err);showFounderResult('REGISTRIERUNG ABGEWIESEN',String(err.message||err),false)}};}catch(err){if(btn){btn.disabled=false;btn.textContent='NFC-SCAN ERNEUT STARTEN'}if(hint)hint.textContent=String(err.message||err)}
});

window.addEventListener('nodiv-founder-register-upload',async e=>{
 if(!sessionToken)return;
 const type=e.detail?.type; if(!['UPLOAD_HQ','UPLOAD_FOP'].includes(type))return;
 if(!('NDEFReader' in window)){showFounderResult('NFC NOT AVAILABLE','Android + Chrome erforderlich.',false);return}
 showFounderResult('NFC ARMED',(type==='UPLOAD_HQ'?'HQ':'FIELD OPERATOR')+' Upload-Antenne jetzt scannen.',true);
 try{
  const reader=new NDEFReader();await reader.scan();
  reader.onreading=async ev=>{
   const uid=ev.serialNumber||''; if(!uid){showFounderResult('UID MISSING','Upload-Antenne konnte nicht gelesen werden.',false);return}
   try{
    const r=await apiRequest({action:'registeruploadterminal',token:sessionToken,type,uid});
    if(!r?.ok||r?.action!==true)throw new Error(r?.message||r?.status||'REGISTRATION FAILED');
    showFounderResult('UPLOAD TERMINAL REGISTERED',(r.terminal?.id||type)+' // ACTIVE',true);
    emitNodiv('IDENTITY_VERIFIED',{target:'#roleView'});
   }catch(err){showFounderResult('REGISTRATION DENIED',String(err.message||err),false)}
  };
 }catch(err){showFounderResult('NFC ERROR',String(err.message||err),false)}
});

window.addEventListener('nodiv-founder-status',async()=>{
 if(!sessionToken)return;
 try{
  const r=await apiRequest({action:'founderstatus',token:sessionToken});
  if(!r?.ok)return;
  const cells=document.querySelectorAll('#founderOverview > div b');
  if(cells.length===4){
   cells[0].textContent=String(r.nodes?.registered??'—')+' / 15';
   cells[1].textContent=String(r.cores?.registered??'—')+' / 200';
   cells[2].textContent=r.uploads?.UPLOAD_HQ?'ONLINE':'NICHT REGISTRIERT';
   cells[3].textContent=r.uploads?.UPLOAD_HQ?'BEREIT':'NICHT REGISTRIERT';
  }
  const nodeCount=Number(r.nodes?.registered||0),coreCount=Number(r.cores?.registered||0);
  const missing=[];
  if(nodeCount<10)missing.push((10-nodeCount)+' Start-Node'+(10-nodeCount===1?'':'s'));
  if(coreCount<30)missing.push((30-coreCount)+' Start-N-Core'+(30-coreCount===1?'':'s'));
  if(!r.uploads?.UPLOAD_HQ)missing.push('Upload HQ');

  const analysis=document.querySelector('#commandAnalysis');
  if(analysis)analysis.textContent=missing.length?'VORBEREITUNG OFFEN // '+missing.length+' BEREICH'+(missing.length===1?'':'E'):'STARTINFRASTRUKTUR BEREIT';
  const prep=document.querySelector('#commandPreparation');
  if(prep)prep.innerHTML=missing.length
   ?'<strong>'+nodeCount+'/10 NODES // '+coreCount+'/30 N-CORES</strong><p>Offen: '+missing.join(' · ')+'</p>'
   :'<strong>STARTINFRASTRUKTUR BEREIT</strong><p>10 Nodes, 30 N-Cores und das HQ-Terminal sind registriert.</p>';
  const matrix=document.querySelector('#matrixMode');
  if(matrix)matrix.textContent=missing.length?'VORBEREITUNG // '+missing.length+' OFFEN':'STARTBEREIT';
 }catch(err){showFounderResult('STATUS UNAVAILABLE',String(err.message||err),false)}
});

let pioneerExchangePreview=null,pioneerExchange=null,pioneerExchangeBusy=false;
function renderPioneerExchange(result){
 const panel=document.querySelector('#pioneerExchange');if(!panel)return;
 panel.hidden=false;
 const complete=result?.status==='EXCHANGE_COMPLETE',active=Boolean(pioneerExchange)&&!complete;
 document.querySelector('#exchangeNode').textContent=pioneerExchangePreview.nodeId+' // '+pioneerExchangePreview.totalEnergy+' E // '+pioneerExchangePreview.nodeState;
 const sizes=document.querySelector('#exchangeSize');sizes.replaceChildren();
 for(const size of pioneerExchangePreview.sizes){const option=document.createElement('option');option.value=String(size);option.textContent=size+' CORE EXCHANGE';sizes.appendChild(option)}
 sizes.disabled=active||complete;
 document.querySelector('#exchangeAuthorize').hidden=active||complete;
 document.querySelector('#exchangeAuthorize').disabled=!pioneerExchangePreview.sizes.length||pioneerExchangeBusy;
 document.querySelector('#exchangeCode').textContent=active?'MECHANISCHER CODE // '+pioneerExchange.accessCode:'';
 document.querySelector('#exchangeScan').hidden=!active;
 document.querySelector('#exchangeCancel').hidden=!active;
 const confirm=document.querySelector('#exchangeConfirm');confirm.hidden=!active;confirm.disabled=!result?.canConfirm||pioneerExchangeBusy;
 document.querySelector('#exchangeScan').disabled=pioneerExchangeBusy||Boolean(result?.canConfirm);
 document.querySelector('#exchangeProgress').textContent=complete?'EXCHANGE COMPLETE // NODE COOLDOWN 05:00':active?'IN '+result.inCount+'/'+result.size+' // OUT '+result.outCount+'/'+result.size:'Exchange-Größe wählen. Code erst nach Autorisierung.';
 if(active)document.querySelector('#exchangeScan').textContent=result.inCount<result.size?'EIGENEN CORE SCANNEN':'ENTNOMMENEN NODE-CORE SCANNEN';
 const nodeScan=document.querySelector('#pioneerScan');if(nodeScan)nodeScan.disabled=active;
}
function resumePioneerExchange(resume){
 pioneerExchangePreview=resume;pioneerExchange=resume;
 renderPioneerExchange(resume);
 document.querySelector('#exchangeHint').textContent='EXCHANGE RESUMED // bestätigte Scans wiederhergestellt. Weiterarbeiten oder Exchange abbrechen.';
}
function showPioneerExchangePreview(preview){
 if(pioneerExchange)return;
 pioneerExchangePreview=preview;renderPioneerExchange(null);
 document.querySelector('#exchangeHint').textContent='Anzahl rein = Anzahl raus. Erst alle eigenen, dann die entnommenen Cores scannen.';
}
window.addEventListener('nodiv-pioneer-exchange',async e=>{
 if(pioneerExchangeBusy||pioneerRestoreBusy||catchBusy||!pioneerExchangePreview||!sessionToken)return;
 const action=e.detail?.action;
 const hint=document.querySelector('#exchangeHint');
 if(action==='scan'){
  if(!pioneerExchange)return;
  if(!('NDEFReader' in window)){hint.textContent='Web NFC benötigt Android + Chrome.';return;}
  pioneerExchangeBusy=true;renderPioneerExchange(pioneerExchange);
  try{
   const controller=new AbortController(),reader=new NDEFReader();let handled=false;
   await reader.scan({signal:controller.signal});
   reader.onreadingerror=()=>{if(handled)return;handled=true;controller.abort();pioneerExchangeBusy=false;renderPioneerExchange(pioneerExchange);hint.textContent='NFC LESEFEHLER // ERNEUT SCANNEN';};
   reader.onreading=async ev=>{
    if(handled)return;handled=true;controller.abort();
    try{
     const r=await apiRequest({action:'exchangescan',token:sessionToken,node:pioneerExchangePreview.nodeId,exchange:pioneerExchange.exchange,phase:pioneerExchange.inCount<pioneerExchange.size?'IN':'OUT',uid:String(ev.serialNumber||'')});
     if(!r?.ok||r.action!==true)throw new Error(r?.error||r?.message||r?.status||'SCAN REJECTED');
     pioneerExchange={...pioneerExchange,...r};hint.textContent=r.core.id+' // '+r.core.energy+' E // SCANNED';
    }catch(err){hint.textContent=String(err.message||err);}
    finally{pioneerExchangeBusy=false;renderPioneerExchange(pioneerExchange);}
   };
  }catch(err){pioneerExchangeBusy=false;renderPioneerExchange(pioneerExchange);hint.textContent=String(err.message||err);}
  return;
 }
 if(!['authorize','confirm','cancel'].includes(action))return;
 if(action!=='authorize'&&!pioneerExchange)return;
 pioneerExchangeBusy=true;
 try{
  const r=await apiRequest({action:'exchange'+action,token:sessionToken,node:pioneerExchangePreview.nodeId,preview:pioneerExchangePreview.preview,size:document.querySelector('#exchangeSize').value,exchange:pioneerExchange?.exchange||''});
  if(!r?.ok||r.action!==true)throw new Error(r?.error||r?.message||r?.status||'EXCHANGE REJECTED');
  if(action==='authorize')pioneerExchange=r;
  if(action==='cancel'){pioneerExchange=null;pioneerExchangePreview=null;document.querySelector('#pioneerExchange').hidden=true;document.querySelector('#pioneerScan').disabled=false;return;}
  pioneerExchangeBusy=false;renderPioneerExchange(r);
  if(action==='confirm'){pioneerExchange=null;pioneerExchangePreview=null;window.dispatchEvent(new CustomEvent('nodiv-pioneer-live'));}
  hint.textContent=action==='confirm'?'Tausch atomar verbucht. Node bleibt 3/3.':'Code autorisiert. Cores physisch tauschen und scannen.';
 }catch(err){hint.textContent=String(err.message||err);}
 finally{pioneerExchangeBusy=false;}
});

let pioneerRestore=null,pioneerRestoreBusy=false,founderRestoreOptions=[];
function renderPioneerMissionBoard(){
 const board=document.querySelector('#pioneerRestoreBoard'),count=document.querySelector('#pioneerMissionCount'),feed=document.querySelector('#pioneerFeed');
 const restore=pioneerRestore?.restore&&!['RESTORE_1_COMPLETE','RESTORE_2_COMPLETE'].includes(pioneerRestore.status)?pioneerRestore:null;
 const supply=pioneerReSupply?.resupply&&pioneerReSupply.status!=='RESUPPLY_COMPLETE'?pioneerReSupply:null;
 const mission=restore||supply,label=restore?'RESTORE #'+Number(restore.phase||1):'RE-SUPPLY';
 if(feed){
  feed.hidden=!mission;
  const message=mission?'⚠ MISSION ACTIVE // '+label+' // '+mission.nodeId+' // OPEN MISSION BOARD ⚠':'';
  if(feed.dataset.message!==message){feed.replaceChildren();if(message){const line=document.createElement('div');line.textContent=message;feed.appendChild(line);}feed.dataset.message=message;}
 }
 if(count)count.textContent=mission?'1 ACTIVE MISSION':'NO ACTIVE MISSION';
 if(!board)return;
 if(!mission){board.innerHTML='<div><b>FIELD COMMS</b><span>STANDBY</span></div><p>Keine aktive Mission.</p>';return;}
 const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 let instruction='Transport-Core übernehmen.';
 if(mission.canConfirm||mission.outCount)instruction='Physischen Tausch bestätigen.';
 else if(mission.inCount)instruction='Vorgegebenen niedrigsten Node-Core entnehmen und scannen.';
 else if(mission.authorized)instruction='Transport-Core einsetzen und scannen.';
 else if(mission.atNode)instruction='Ziel-Node autorisieren.';
 else if(mission.accepted)instruction='Transport-Core zum Ziel-Node bringen und Node scannen.';
 board.innerHTML='<div><b>'+label+'</b><span>AKTIV</span></div><p>'+escape(mission.nodeId)+' // '+instruction+'</p>';
}
function renderPioneerRestore(result,atNode=false){
 pioneerRestore={...result,atNode};
 const panel=document.querySelector('#pioneerRestore');
 const phase=Number(result.phase||1),complete=['RESTORE_1_COMPLETE','RESTORE_2_COMPLETE'].includes(result.status),active=result.restore&&!complete;
 const missionLabel=document.querySelector('#restoreMissionLabel');if(missionLabel)missionLabel.textContent='RESTORE #'+phase;
 renderPioneerMissionBoard();
 if(!panel)return;panel.hidden=!result.restore;
 document.querySelector('#restoreNode').textContent=result.nodeId;
 const inCard=document.querySelector('#restoreInCard'),outCard=document.querySelector('#restoreOutCard');
 document.querySelector('#restoreInCore').textContent=result.inCore.id;document.querySelector('#restoreInEnergy').textContent=result.inCore.energy+' E';
 document.querySelector('#restoreOutCore').textContent=result.outCore.id;document.querySelector('#restoreOutEnergy').textContent=result.outCore.energy+' E';
 document.querySelector('#restoreCurrentEnergy').textContent=result.totalEnergy+' E';document.querySelector('#restoreProjectedEnergy').textContent=result.projectedEnergy+' E';
 if(inCard)inCard.dataset.state=result.inCount?'done':'pending';if(outCard)outCard.dataset.state=result.outCount?'done':'pending';
 const badge=document.querySelector('#restoreStateBadge');if(badge){badge.textContent=complete?'ERLEDIGT':result.authorized?'NODE OFFEN':atNode?'AM NODE':'AKTIV';badge.dataset.state=complete?'done':result.authorized?'active':'pending';}
 document.querySelector('#restoreProjection').textContent=result.nodeState+' → '+result.projectedState;
 document.querySelector('#restoreCode').textContent=active&&atNode&&result.authorized&&result.accessCode?'ZUGANGSCODE  '+result.accessCode:'';
 document.querySelector('#restoreProgress').textContent=complete?'RESTORE COMPLETE // CAPACITY '+(result.capacity||phase+1)+'/3 // TARGET LOCK 01:00:00':'IN '+result.inCount+'/1 // OUT '+result.outCount+'/1';
 const step=(id,state)=>{const el=document.querySelector(id);if(el)el.dataset.state=state;};
 const hqDone=Boolean(atNode||result.authorized||result.inCount||result.outCount||complete),nodeDone=Boolean(complete||atNode&&result.authorized),inDone=Boolean(result.inCount||complete),outDone=Boolean(result.outCount||complete);
 let current='hq';if(hqDone)current='node';if(nodeDone){current='in';if(inDone)current='out';if(outDone)current='confirm';}if(complete)current='complete';
 step('#restoreStepHq',hqDone?'done':current==='hq'?'current':'waiting');step('#restoreStepNode',nodeDone?'done':current==='node'?'current':'waiting');step('#restoreStepIn',inDone?'done':current==='in'?'current':'waiting');step('#restoreStepOut',outDone?'done':current==='out'?'current':'waiting');
 document.querySelector('#restoreStepHqDetail').textContent=hqDone?'Erledigt':result.inCore.id+' // '+result.inCore.energy+' E';
 document.querySelector('#restoreStepNodeDetail').textContent=nodeDone?'Erledigt':result.nodeId;
 document.querySelector('#restoreStepInTitle').textContent=result.inCore.id+' einsetzen';document.querySelector('#restoreStepInDetail').textContent=inDone?'Erledigt':result.inCore.energy+' E';
 document.querySelector('#restoreStepOutTitle').textContent=result.outCore.id+' entnehmen';document.querySelector('#restoreStepOutDetail').textContent=outDone?'Erledigt':result.outCore.energy+' E';
 const now=document.querySelector('#restoreNowTitle'),hint=document.querySelector('#restoreHint');
 if(complete){now.textContent='RESTORE ERFOLGREICH';hint.textContent=phase===2?'NODE stabilisiert. Dritter Slot freigeschaltet.':'NODE stabilisiert. Zweiter Slot freigeschaltet.';}
 else if(current==='hq'){now.textContent=result.inCore.id+' AM HQ ÜBERNEHMEN';hint.textContent='Nimm den angezeigten Transport-Core auf. Danach zum Ziel-Node gehen und dessen NFC-Tag scannen.';}
 else if(current==='node'){now.textContent=atNode?'NODE ÖFFNEN':result.nodeId+' ERNEUT SCANNEN';hint.textContent=atNode?'Autorisiere den Node-Zugang, um den RESTORE fortzusetzen.':'Scanne den NFC-Tag des Ziel-Nodes über NFC // JETZT SCANNEN. Dein bisheriger Scanfortschritt bleibt erhalten.';}
 else if(current==='in'){now.textContent=result.inCore.id+' EINSETZEN';hint.textContent='Setze den Transport-Core ein und scanne ihn mit dem Smartphone.';}
 else if(current==='out'){now.textContent=result.outCore.id+' ENTNEHMEN';hint.textContent='Entnimm genau diesen Node-Core und scanne ihn mit dem Smartphone.';}
 else {now.textContent='RESTORE ABSCHLIESSEN';hint.textContent='Alle erforderlichen Schritte sind bestätigt. Schließe den RESTORE jetzt ab.';}
 const auth=document.querySelector('#restoreAuthorize'),scan=document.querySelector('#restoreScan'),confirm=document.querySelector('#restoreConfirm');
 auth.hidden=!active||!atNode||current!=='node';auth.disabled=pioneerRestoreBusy;auth.textContent='NODE ÖFFNEN';
 scan.hidden=!active||!['in','out'].includes(current);scan.disabled=pioneerRestoreBusy;scan.textContent=current==='out'?result.outCore.id+' SCANNEN':result.inCore.id+' SCANNEN';
 confirm.hidden=!active||current!=='confirm';confirm.disabled=pioneerRestoreBusy||!result.canConfirm;
 const nodeScan=document.querySelector('#pioneerScan');if(nodeScan)nodeScan.disabled=Boolean(active&&atNode&&result.authorized);
}
window.addEventListener('nodiv-pioneer-restore-status',async()=>{
 if(!sessionToken)return;
 try{const r=await apiRequest({action:'restorestate',token:sessionToken});if(!r?.ok||!r.session)throw Error(r?.error||r?.status||'RESTORE STATE FAILED');if(r.restore)renderPioneerRestore(r,false);else{pioneerRestore=null;renderPioneerMissionBoard();}}
 catch(err){const hint=document.querySelector('#restoreHint');if(hint)hint.textContent=String(err.message||err);}
});
window.addEventListener('nodiv-pioneer-restore',async e=>{
 const action=e.detail?.action;if(pioneerRestoreBusy||pioneerExchangeBusy||!pioneerRestore?.atNode||!sessionToken)return;
 if(!['authorize','scan','confirm'].includes(action))return;
 const hint=document.querySelector('#restoreHint');
 const request=async uid=>{
  const r=await apiRequest({action:'restore'+action,token:sessionToken,node:pioneerRestore.nodeId,restore:pioneerRestore.restore,phase:pioneerRestore.inCount?'OUT':'IN',uid:uid||''});
  if(!r?.ok||r.action!==true)throw Error(r?.error||r?.message||r?.status||'RESTORE REJECTED');
  pioneerRestoreBusy=false;renderPioneerRestore({...pioneerRestore,...r},true);
  if(['RESTORE_1_COMPLETE','RESTORE_2_COMPLETE'].includes(r.status))window.dispatchEvent(new CustomEvent('nodiv-pioneer-live'));
 };
 if(action==='scan'){
  if(!pioneerRestore.authorized)return;
  if(!('NDEFReader' in window)){hint.textContent='Web NFC benötigt Android + Chrome.';return;}
  pioneerRestoreBusy=true;renderPioneerRestore(pioneerRestore,true);
  try{const controller=new AbortController(),reader=new NDEFReader();let handled=false;await reader.scan({signal:controller.signal});
   reader.onreadingerror=()=>{if(handled)return;handled=true;controller.abort();pioneerRestoreBusy=false;renderPioneerRestore(pioneerRestore,true);hint.textContent='NFC LESEFEHLER // ERNEUT';};
   reader.onreading=async ev=>{if(handled)return;handled=true;controller.abort();try{await request(String(ev.serialNumber||''));}catch(err){pioneerRestoreBusy=false;renderPioneerRestore(pioneerRestore,true);hint.textContent=String(err.message||err);}};
  }catch(err){pioneerRestoreBusy=false;renderPioneerRestore(pioneerRestore,true);hint.textContent=String(err.message||err);}
  return;
 }
 pioneerRestoreBusy=true;renderPioneerRestore(pioneerRestore,true);
 try{await request();}catch(err){pioneerRestoreBusy=false;renderPioneerRestore(pioneerRestore,true);hint.textContent=String(err.message||err);}
});
document.addEventListener('click',async e=>{
 const button=e.target.closest('#armRestoreTest');if(!button||!sessionToken)return;
 const hint=document.querySelector('#founderRestoreHint');button.disabled=true;
 try{
  const r=await apiRequest({action:'restoretestsetup',token:sessionToken});
  if(!r?.ok||r.action!==true)throw Error(r?.error||r?.message||r?.status||'RESTORE TEST SETUP FAILED');
  hint.textContent=r.message||'NODE-002 // RESTORE TEST LOADOUT ARMED';
 }catch(err){hint.textContent=String(err.message||err);button.disabled=false;}
});
document.addEventListener('click',async e=>{
 const button=e.target.closest('#repairRestoreReward');if(!button||!sessionToken)return;
 const hint=document.querySelector('#founderRestoreHint');button.disabled=true;
 try{
  const r=await apiRequest({action:'restore1repairreward',token:sessionToken});
  if(!r?.ok||r.action!==true)throw Error(r?.error||r?.message||r?.status||'RESTORE REWARD REPAIR FAILED');
  hint.textContent=r.message||'P003 // NC-013 94 E // 2/3 READY';
 }catch(err){hint.textContent=String(err.message||err);button.disabled=false;}
});
window.addEventListener('nodiv-founder-restore',async e=>{
 if(!sessionToken)return;
 const select=document.querySelector('#restorePioneerSelect'),hint=document.querySelector('#founderRestoreHint'),button=document.querySelector('#assignRestore');
 if(!select)return;
 if(e.detail?.action==='select'){const option=founderRestoreOptions.find(player=>player.identity===select.value);if(button)button.textContent=option?'RESTORE #'+(option.phase||1)+' VERGEBEN':'RESTORE VERGEBEN';return;}
 try{
  let assignmentMessage='';
  if(e.detail?.action==='assign'){
   if(!founderRestoreOptions.some(player=>player.identity===select.value))return;
   const pioneer=select.value,phase=founderRestoreOptions.find(player=>player.identity===pioneer)?.phase||1;button.disabled=true;
   const assigned=await apiRequest({action:'restoreassign',token:sessionToken,pioneer,phase});
   if(!assigned?.ok)throw Error(assigned?.error||assigned?.message||assigned?.status||'RESTORE ASSIGN FAILED');
   if(assigned.action===true){
    assignmentMessage='RESTORE #'+(assigned.phase||phase)+' // '+assigned.identity+' // '+assigned.nodeId+' // '+assigned.inCore.id+' / '+assigned.inCore.energy+' E // PROJECTED '+assigned.projectedEnergy+' E / '+assigned.projectedState;
   }else if(assigned.status==='NO_SUITABLE_RESTORE_TARGET_OR_CORE'){
    assignmentMessage=pioneer+' // KEIN RESTORE-ZIEL // Kein DEGRADED/CRITICAL Node mit geeignetem HQ-Core';
   }else{
    assignmentMessage=pioneer+' // RESTORE NICHT VERGEBEN // '+String(assigned.message||assigned.status||'UNBEKANNTER STATUS');
   }
  }
  const r=await apiRequest({action:'restoreeligible',token:sessionToken});if(!r?.ok||!r.session)throw Error(r?.error||r?.status||'RESTORE LIST FAILED');
  founderRestoreOptions=Array.isArray(r.pioneers)?r.pioneers:[];select.replaceChildren();
  const empty=document.createElement('option');empty.value='';empty.textContent=founderRestoreOptions.length?'ELIGIBLE PIONEER AUSWÄHLEN':'NO ELIGIBLE PIONEERS';select.appendChild(empty);
  for(const player of founderRestoreOptions){const option=document.createElement('option');option.value=player.identity;option.textContent=player.identity+' // '+(player.capacity||1)+'/3 // RESTORE #'+(player.phase||1);select.appendChild(option);}
  select.disabled=!founderRestoreOptions.length;button.disabled=!founderRestoreOptions.length;
  if(assignmentMessage)hint.textContent=assignmentMessage;
 }catch(err){hint.textContent=String(err.message||err);if(button)button.disabled=false;}
});

/* Direct encounter: NFC target authentication never lets the browser select a Core. */
let catchOrder=null,catchBusy=false,catchScanController=null;
function catchStep(id,state,text){const element=document.querySelector('#'+id);if(element){element.className='catch-step '+state;element.textContent=text;}}
window.addEventListener('nodiv-catch-live',async()=>{
 if(!sessionToken)return;const inventory=document.querySelector('#catchInventory');if(!inventory)return;
 const slots=document.querySelector('#catcherPersonalSlots'),secured=document.querySelector('#catcherSecuredEnergy');
 try{
  const r=await apiRequest({action:'playerstate',token:sessionToken});
  if(!r?.ok||!r.session||!r.player||!Array.isArray(r.cores)||!Number.isFinite(r.securedEnergy))throw Error(r?.error||r?.status||'PLAYER STATE UNAVAILABLE');
  inventory.textContent=r.cores.map(c=>c.coreId+' // '+c.energy+' E').join(' // ')||'NO PERSONAL CORES';
  if(slots)slots.textContent=inventory.textContent+' // '+r.cores.length+'/'+r.player.coreCapacity;
  if(secured)secured.textContent=r.securedEnergy+' E';
 }catch(error){inventory.textContent=String(error.message||error);if(slots)slots.textContent='LIVE INVENTORY UNAVAILABLE';if(secured)secured.textContent='— E';}
});
window.addEventListener('nodiv-catch',async e=>{
 if(!sessionToken||catchBusy||pioneerExchangeBusy||pioneerRestoreBusy||document.querySelector('#pioneerScan')?.dataset.scanActive==='1')return;
 const hint=document.querySelector('#catchHint'),start=document.querySelector('#catchStart'),confirm=document.querySelector('#catchConfirm'),result=document.querySelector('#catchResult');if(!hint||!start)return;
 if(e.detail?.action==='scan'){
  if(typeof NDEFReader==='undefined'){hint.textContent='WEB NFC NICHT VERFÜGBAR // Android + Chrome erforderlich.';return;}
  catchOrder=null;confirm.hidden=true;confirm.disabled=true;result.hidden=true;catchBusy=true;start.disabled=true;
  catchStep('catchTargetStep','running','TARGET // NFC SCAN RUNNING');catchStep('catchCommitStep','required','TRANSFER // CONFIRMATION REQUIRED');
  try{
   catchScanController?.abort();catchScanController=new AbortController();const reader=new NDEFReader();await reader.scan({signal:catchScanController.signal});let handled=false;
   const finish=()=>{catchBusy=false;start.disabled=false;catchScanController.abort();};
   reader.onreadingerror=()=>{if(handled)return;handled=true;finish();catchStep('catchTargetStep','required','TARGET // ACCESS CARD REQUIRED');hint.textContent='NFC READ FAILED // RETRY';};
   reader.onreading=async ev=>{if(handled)return;handled=true;catchScanController.abort();try{
    const r=await apiRequest({action:'catch',mode:'preview',token:sessionToken,targetUid:String(ev.serialNumber||'')});
    if(!r?.ok||!r.session||!r.canConfirm||r.status!=='CATCH_READY')throw Error(r?.error||r?.status||'CATCH DENIED');
    catchOrder=r;catchStep('catchTargetStep','accepted','TARGET // '+r.target+' // SERVER ACCEPTED');hint.textContent=r.target+' // CATCH READY';confirm.hidden=false;confirm.disabled=false;
   }catch(error){catchStep('catchTargetStep','required','TARGET // NOT ACCEPTED');hint.textContent=String(error.message||error);}finally{finish();}};
  }catch(error){catchBusy=false;start.disabled=false;catchStep('catchTargetStep','required','TARGET // ACCESS CARD REQUIRED');hint.textContent=String(error.message||error);}
  return;
 }
 if(e.detail?.action!=='confirm'||!catchOrder)return;
 catchBusy=true;start.disabled=true;confirm.disabled=true;catchStep('catchCommitStep','running','TRANSFER // SERVER COMMIT RUNNING');
 try{
  const r=await apiRequest({action:'catch',mode:'confirm',token:sessionToken,catchId:catchOrder.catchId});
  if(!r?.ok||r.status!=='CATCH_COMPLETE')throw Error(r?.error||r?.status||'CATCH DENIED');
  catchStep('catchCommitStep','accepted','TRANSFER // SERVER ACCEPTED');result.hidden=false;result.textContent='CATCH COMPLETE // '+r.core.id+' // '+r.core.energy+' E';hint.textContent='Core physisch übergeben.';confirm.hidden=true;catchOrder=null;
  window.dispatchEvent(new CustomEvent('nodiv-catch-live'));window.dispatchEvent(new CustomEvent('nodiv-pioneer-live'));
 }catch(error){catchStep('catchCommitStep','required','TRANSFER // NOT CONFIRMED');hint.textContent=String(error.message||error);confirm.disabled=false;}finally{catchBusy=false;start.disabled=false;}
});
// Refresh ownership after returning from a physical encounter on another device.
window.addEventListener('focus',()=>{window.dispatchEvent(new CustomEvent('nodiv-pioneer-live'));window.dispatchEvent(new CustomEvent('nodiv-catch-live'));});

// JSONP has no push channel: visible field screens refresh authoritative ownership.
setInterval(()=>{if(sessionToken&&document.visibilityState==='visible'){window.dispatchEvent(new CustomEvent(document.querySelector('#pioneerInventory')?'nodiv-pioneer-live':'nodiv-catch-live'));}},5000);

// Display server-authoritative GhostUntil; this clock never authorizes gameplay.
let pioneerGhostUntil=0,pioneerGhostClockOffset=0;
function renderPioneerGhost(player,serverNow){
 pioneerGhostUntil=new Date(player?.ghostUntil||0).getTime();
 pioneerGhostClockOffset=Number.isFinite(serverNow)?serverNow-Date.now():0;
 updatePioneerGhostClock();
}
function updatePioneerGhostClock(){
 const panel=document.querySelector('.pioneer-priority'),timer=document.querySelector('.pioneer-timer');if(!panel||!timer)return;
 const remaining=Math.max(0,Math.ceil((pioneerGhostUntil-Date.now()-pioneerGhostClockOffset)/1000)),active=remaining>0;
 panel.dataset.ghost=active?'active':'inactive';timer.hidden=!active;
 timer.textContent=active?String(Math.floor(remaining/60)).padStart(2,'0')+':'+String(remaining%60).padStart(2,'0'):'';
 const title=document.querySelector('.pioneer-priority h3'),hint=document.querySelector('.pioneer-priority p'),status=document.querySelector('.pioneer-state b');
 if(title)title.textContent=active?'GHOST ACTIVE':'FIELD STATUS NOMINAL';
 if(hint)hint.textContent=active?'CATCH-SCHUTZ // SERVER BESTÄTIGT':'No immediate action required.';
 if(status)status.textContent=active?'GHOST':'ACTIVE';
}
setInterval(updatePioneerGhostClock,1000);

// Normal HQ Upload: only server-issued choices; retries retain the same upload ID.
let pioneerUpload=null,pioneerUploadBusy=false,pioneerUploadSelection=new Set();
function renderPioneerUpload(result){
 pioneerUpload=result;pioneerUploadSelection=new Set();
 const panel=document.querySelector('#pioneerUpload'),choices=document.querySelector('#uploadChoices');if(!panel||!choices)return;
 panel.hidden=false;choices.hidden=false;choices.replaceChildren();document.querySelector('#uploadBay').textContent=' // '+(result.bay?.id||'HQ UPLOAD');
 document.querySelector('#uploadResult').hidden=true;document.querySelector('#uploadConfirm').hidden=true;document.querySelector('#uploadConfirm').disabled=true;
 document.querySelector('#uploadAuthorize').hidden=false;document.querySelector('#uploadAuthorize').disabled=true;
 for(const core of result.cores||[]){
  const label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span');input.type='checkbox';input.value=core.coreId;
  text.textContent=String(core.energy)+' E // FIELD';label.className='pioneer-core';label.appendChild(input);label.appendChild(text);choices.appendChild(label);
  input.addEventListener('change',()=>{if(input.checked)pioneerUploadSelection.add(core.coreId);else pioneerUploadSelection.delete(core.coreId);document.querySelector('#uploadAuthorize').disabled=pioneerUploadBusy||pioneerUploadSelection.size===0;});
 }
 if(result.canConfirm){pioneerUploadSelection=new Set((result.cores||[]).map(core=>core.coreId));choices.hidden=true;document.querySelector('#uploadAuthorize').hidden=true;document.querySelector('#uploadConfirm').hidden=false;document.querySelector('#uploadConfirm').disabled=false;}
 window.dispatchEvent(new CustomEvent('nodiv-upload-terminal-refresh'));
 document.querySelector('#uploadHint').textContent=result.canConfirm?'Auswahl autorisiert. Upload verbindlich bestätigen.':result.selectable?'1 bis alle verfügbaren Cores auswählen. Kostenlos // kein zusätzlicher Schutz.':'Keine uploadbaren persönlichen FIELD-Cores.';
}
window.addEventListener('nodiv-pioneer-upload',async e=>{
 if(!pioneerUpload||!sessionToken||pioneerUploadBusy||pioneerExchangeBusy||pioneerRestoreBusy||catchBusy)return;
 const action=e.detail?.action;if(!['authorize','confirm'].includes(action))return;
 if(action==='authorize'&&!pioneerUploadSelection.size)return;if(action==='confirm'&&!pioneerUpload.canConfirm)return;
 const authorize=document.querySelector('#uploadAuthorize'),confirm=document.querySelector('#uploadConfirm'),choices=document.querySelector('#uploadChoices'),hint=document.querySelector('#uploadHint');
 pioneerUploadBusy=true;authorize.disabled=true;confirm.disabled=true;const scan=document.querySelector('#pioneerScan'),scanDisabled=scan?.disabled;if(scan)scan.disabled=true;
 // Freeze choices while the server validates them; authorization locks the selection.
 choices.querySelectorAll('input').forEach(input=>input.disabled=true);
 try{
  const r=await apiRequest({action:'upload'+action,token:sessionToken,upload:pioneerUpload.upload,...(action==='authorize'?{cores:JSON.stringify([...pioneerUploadSelection])}:{})});
  if(!r?.ok||!r?.session||!r?.action)throw new Error(r?.error||r?.message||r?.status||'UPLOAD FAILED');
  pioneerUpload=r;
  if(r.status==='UPLOAD_COMPLETE'){
   choices.hidden=true;authorize.hidden=true;confirm.hidden=true;hint.textContent='';const result=document.querySelector('#uploadResult');result.hidden=false;result.textContent='UPLOAD COMPLETE // '+String(r.totalEnergy)+' E SECURED';
   window.dispatchEvent(new CustomEvent('nodiv-pioneer-live'));
  }else{
   authorize.hidden=true;confirm.hidden=false;hint.textContent=String(r.cores.length)+' CORE(S) // '+String(r.totalEnergy)+' E SECURED. Diese Cores verlassen dein persönliches Inventar. Upload jetzt verbindlich bestätigen.';
  }
 }catch(error){hint.textContent=String(error.message||error)+' // Mit derselben Auswahl erneut versuchen.';if(!pioneerUpload.canConfirm)choices.querySelectorAll('input').forEach(input=>input.disabled=false);}
 finally{pioneerUploadBusy=false;authorize.disabled=pioneerUploadSelection.size===0;confirm.disabled=!pioneerUpload.canConfirm;if(scan)scan.disabled=Boolean(scanDisabled);}
});

let pioneerReSupply=null,pioneerReSupplyBusy=false;
function renderPioneerReSupply(result,atNode=false){
 const panel=document.querySelector('#pioneerReSupply');if(!panel)return;
 const complete=result.status==='RESUPPLY_COMPLETE',mission=Boolean(result.resupply),active=mission&&!complete;
 if(mission)pioneerReSupply={...result,atNode};else pioneerReSupply=null;
 renderPioneerMissionBoard();
 panel.hidden=!mission;
 document.querySelector('#resupplyNode').textContent=result.nodeId||'PERSÖNLICHER CORE BENÖTIGT';
 const accept=document.querySelector('#resupplyAccept'),authorize=document.querySelector('#resupplyAuthorize'),scan=document.querySelector('#resupplyScan'),confirm=document.querySelector('#resupplyConfirm');
 accept.hidden=!active||result.accepted;accept.disabled=pioneerReSupplyBusy;
 authorize.hidden=!active||!result.accepted||!atNode||result.authorized;authorize.disabled=pioneerReSupplyBusy;
 scan.hidden=!active||!atNode||!result.authorized||result.canConfirm;scan.disabled=pioneerReSupplyBusy;
 confirm.hidden=!active||!atNode||!result.authorized;confirm.disabled=pioneerReSupplyBusy||!result.canConfirm;
 scan.textContent=result.inCount?'VORGEGEBENEN NODE-CORE ENTNEHMEN // NFC':'TRANSPORT-CORE EINSETZEN // NFC';
 document.querySelector('#resupplyEnergy').textContent=active?(atNode?'EINSETZEN: '+result.inCore.energy+' E // ENTNEHMEN: '+result.outCore.energy+' E':result.inCore.energy+' E // IN TRANSIT // MISSION CARGO'):'';
 document.querySelector('#resupplyCode').textContent=active&&atNode&&result.authorized&&result.accessCode?'MECHANISCHER CODE // '+result.accessCode:'';
 document.querySelector('#resupplyProgress').textContent=active&&atNode?'IN '+result.inCount+'/1 // OUT '+result.outCount+'/1':'';
 document.querySelector('#resupplyGuide').textContent=complete?'Zurück im Field HUD.':!mission?'Ein Transportauftrag bringt dir wieder einen persönlichen Core.':!result.accepted?'MISSION CARGO READY // Angezeigten HQ-Core übernehmen und scannen.':!atNode?'Transport-Core zum Ziel-Node bringen und Node per NFC scannen.':!result.authorized?'Ziel erkannt. Node-Zugang jetzt autorisieren.':result.canConfirm?'Beide Cores gescannt. Physischen Tausch bestätigen.':result.inCount?'Angezeigten niedrigsten Node-Core entnehmen und scannen.':'Transport-Core einsetzen und per NFC scannen.';
 const final=document.querySelector('#resupplyResult');final.hidden=!complete;final.textContent=complete?'RE-SUPPLY COMPLETE // '+result.acquiredCore.energy+' E CORE ACQUIRED':'';
 const nodeScan=document.querySelector('#pioneerScan');if(nodeScan)nodeScan.disabled=active&&atNode&&result.authorized;
}
window.addEventListener('nodiv-pioneer-resupply-status',async()=>{
 if(!sessionToken||pioneerReSupplyBusy||(pioneerReSupply?.atNode&&pioneerReSupply.status!=='RESUPPLY_COMPLETE'))return;
 pioneerReSupplyBusy=true;
 try{const r=await apiRequest({action:'resupplystate',token:sessionToken});if(!r?.ok||!r.session)throw Error(r?.error||r?.status||'RE-SUPPLY STATE FAILED');pioneerReSupplyBusy=false;renderPioneerReSupply(r);}
 catch(error){const hint=document.querySelector('#resupplyGuide');if(hint)hint.textContent=String(error.message||error);}
 finally{pioneerReSupplyBusy=false;}
});
window.addEventListener('nodiv-pioneer-resupply',async e=>{
 const action=e.detail?.action;if(!sessionToken||pioneerReSupplyBusy||pioneerExchangeBusy||pioneerRestoreBusy||catchBusy||pioneerUploadBusy)return;
 if(!['accept','authorize','scan','confirm'].includes(action))return;
 if(!pioneerReSupply)return;
 if(['authorize','scan','confirm'].includes(action)&&!pioneerReSupply.atNode)return;
 if(action==='scan'&&!pioneerReSupply.authorized)return;if(action==='confirm'&&!pioneerReSupply.canConfirm)return;
 const mission=pioneerReSupply,atNode=mission?.atNode===true,phase=mission?.inCount?'OUT':'IN';pioneerReSupplyBusy=true;
 renderPioneerReSupply(mission,atNode);
 const request=async uid=>{
  const r=await apiRequest({action:'resupply'+action,token:sessionToken,resupply:mission.resupply,node:mission.nodeId,uid:uid||'',phase});
  if(!r?.ok||r.action!==true)throw Error(r?.error||r?.message||r?.status||'RE-SUPPLY REJECTED');
  pioneerReSupplyBusy=false;renderPioneerReSupply({...mission,...r},atNode);
  if(r.status==='RESUPPLY_COMPLETE')window.dispatchEvent(new CustomEvent('nodiv-pioneer-live'));
 };
 const failed=error=>{pioneerReSupplyBusy=false;renderPioneerReSupply(mission,atNode);document.querySelector('#resupplyGuide').textContent=String(error.message||error);};
 try{
  if(['accept','scan'].includes(action)){
   if(!('NDEFReader' in window))throw Error('Android + Chrome / Web NFC erforderlich.');
   const controller=new AbortController(),reader=new NDEFReader();await reader.scan({signal:controller.signal});let handled=false;
   reader.onreadingerror=()=>{if(handled)return;handled=true;controller.abort();failed(Error('NFC LESEFEHLER // ERNEUT'));};
   reader.onreading=async ev=>{if(handled)return;handled=true;controller.abort();try{const uid=String(ev.serialNumber||'').trim();if(!uid)throw Error('NFC UID FEHLT');await request(uid);}catch(error){failed(error);}};
  }else await request();
 }catch(error){failed(error);}
});

// Optional Secure Approach: the server alone owns price, protection and terminal state.
let secureApproachBusy=false,secureApproachRequest='',pioneerTerminal=null;
function renderUploadTerminal(result){
 pioneerTerminal=result;
 const status=document.querySelector('#uploadTerminalState'),button=document.querySelector('#secureApproach');
 if(!status)return;
 status.dataset.state=result.state;
 const remaining=Math.max(0,Math.ceil((Number(result.expiresAt||0)-Number(result.serverNow||Date.now()))/1000));
 const timer=String(Math.floor(remaining/60)).padStart(2,'0')+':'+String(remaining%60).padStart(2,'0');
 status.textContent='TERMINAL // '+({GREEN:'GRÜN // FREI',YELLOW:'GELB // SECURE APPROACH',RED:'ROT // UPLOAD IN PROGRESS'}[result.state]||'UNAVAILABLE')+(result.state!=='GREEN'?' // '+timer+(result.ownReservation?' // DEIN ZUGANG':''):'');
 if(button)button.disabled=secureApproachBusy||result.state!=='GREEN';
 if(result.state!=='GREEN'){const confirm=document.querySelector('#secureApproachConfirm');if(confirm)confirm.hidden=true;}
}
async function refreshUploadTerminal(){
 if(!sessionToken||!document.querySelector('#uploadTerminalState')||secureApproachBusy)return;
 try{const r=await apiRequest({action:'uploadterminalstate',token:sessionToken});if(!r?.ok||!r?.session||!r?.state)throw Error(r?.error||r?.status||'TERMINAL UNAVAILABLE');renderUploadTerminal(r);}
 catch(error){const status=document.querySelector('#uploadTerminalState');if(status){status.textContent='TERMINAL // STATUS UNAVAILABLE';status.dataset.state='';}const button=document.querySelector('#secureApproach');if(button)button.disabled=true;}
}
window.addEventListener('nodiv-upload-terminal-refresh',refreshUploadTerminal);
window.addEventListener('nodiv-hq-approach',async e=>{
 const hint=document.querySelector('#hqApproachHint'),confirm=document.querySelector('#secureApproachConfirm');if(!hint||!confirm||secureApproachBusy)return;
 await refreshUploadTerminal();
 if(e.detail?.mode==='normal'){confirm.hidden=true;hint.textContent='Kostenlos // kein zusätzlicher Schutz. Bei GRÜN die reale HQ Upload Bay per NFC scannen.';return;}
 if(e.detail?.mode!=='secure'||pioneerTerminal?.state!=='GREEN')return;
 hint.textContent='150 E SECURED werden sofort verbraucht. 05:00 Catch-Schutz und exklusive Upload Bay. Keine Erstattung bei Ablauf.';confirm.hidden=false;confirm.disabled=false;
});
window.addEventListener('nodiv-secure-approach-confirm',async()=>{
 if(!sessionToken||secureApproachBusy)return;
 const hint=document.querySelector('#hqApproachHint'),confirm=document.querySelector('#secureApproachConfirm');if(!hint||!confirm||confirm.hidden)return;
 // Keep the request ID through timeout/reload; a retry cannot charge another debit.
 let storage,storedRequest='';try{storage=window.sessionStorage;storedRequest=storage?.getItem('nodiv-secure-approach-request')||'';}catch(error){}
 secureApproachRequest=secureApproachRequest||storedRequest||window.crypto?.randomUUID?.()||('sa-'+Date.now()+'-'+Math.random().toString(36).slice(2));
 try{storage?.setItem('nodiv-secure-approach-request',secureApproachRequest);}catch(error){}
 secureApproachBusy=true;confirm.disabled=true;const button=document.querySelector('#secureApproach');if(button)button.disabled=true;
 try{
  const r=await apiRequest({action:'secureapproach',token:sessionToken,request:secureApproachRequest});if(!r?.ok||!r?.action)throw Error(r?.error||r?.status||'SECURE APPROACH FAILED');
  renderUploadTerminal(r);confirm.hidden=true;hint.textContent=r.state==='YELLOW'&&r.ownReservation?'SECURE APPROACH ACTIVE // Reale HQ Upload Bay vor Ablauf per NFC scannen.':r.state==='RED'&&r.ownReservation?'UPLOAD IN PROGRESS // Bestehenden Upload fortsetzen.':'RESERVATION ENDED // Keine erneute Abbuchung.';
  secureApproachRequest='';try{storage?.removeItem('nodiv-secure-approach-request');}catch(error){}
  window.dispatchEvent(new CustomEvent('nodiv-pioneer-live'));
 }catch(error){hint.textContent=String(error.message||error)+' // Mit derselben Anfrage erneut versuchen.';}
 finally{secureApproachBusy=false;confirm.disabled=false;if(button)button.disabled=pioneerTerminal?.state!=='GREEN';}
});
// Server polling reconciles expiry/completion; the browser never releases reservations.
setInterval(()=>{if(document.querySelector('#uploadTerminalState'))refreshUploadTerminal();},10000);

// Founder preparation only. Render the server's remaining time; never start evacuation.
let preEvacuationBusy=false;
function renderPreEvacuation(result){
 const state=document.querySelector('#preEvacuationState'),hint=document.querySelector('#preEvacuationHint'),button=document.querySelector('#startPreEvacuation');if(!state||!hint)return;
 state.textContent=result.status;
 if(button)button.disabled=preEvacuationBusy||Boolean(result.withdrawal);
 if(result.status==='PRE_EVACUATION_NOT_STARTED'){hint.textContent='Nur über EVENT_NODE_EXPANDED hinzugefügte Nodes werden zurückgezogen. Die ursprünglichen 10 bleiben im Feld.';return;}
 if(result.evacuationReady===true){hint.textContent='30 Minuten abgeschlossen. Founder-Freigabe bereit. Keine Evakuierung wurde gestartet.';return;}
 if(result.completedAt!==undefined){const seconds=Math.ceil(Math.max(0,Number(result.remainingMs||0))/1000);hint.textContent='SERVER COUNTDOWN // '+String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')+' // '+(result.blockers?.join(' // ')||'10 Start-Nodes verbleiben im Feld.');return;}
 hint.textContent='FOP WITHDRAWAL // '+(result.pendingNodes||result.targets||[]).join(' // ')+(result.blockers?.length?' // '+result.blockers.join(' // '):' // Zusatznodes über bestehenden 3/3-Rückbau an HQ zurückführen.');
}
async function refreshPreEvacuation(){
 const button=document.querySelector('#startPreEvacuation');if(!sessionToken||!button?.dataset.eventId||preEvacuationBusy)return;
 try{const r=await apiRequest({action:'preevacuationstate',token:sessionToken,event:button.dataset.eventId});if(!r?.ok||!r?.session)throw Error(r?.error||r?.status||'PRE-EVACUATION UNAVAILABLE');renderPreEvacuation(r);}
 catch(error){const hint=document.querySelector('#preEvacuationHint');if(hint)hint.textContent=String(error.message||error);}
}
window.addEventListener('nodiv-preevacuation-refresh',refreshPreEvacuation);
window.addEventListener('nodiv-preevacuation-start',async()=>{
 const button=document.querySelector('#startPreEvacuation'),hint=document.querySelector('#preEvacuationHint');if(!sessionToken||!button?.dataset.eventId||preEvacuationBusy)return;
 preEvacuationBusy=true;button.disabled=true;
 try{const r=await apiRequest({action:'preevacuationstart',token:sessionToken,event:button.dataset.eventId});if(!r?.ok||r.action!==true)throw Error(r?.error||r?.status||'PRE-EVACUATION BLOCKED');preEvacuationBusy=false;renderPreEvacuation(r);}
 catch(error){if(hint)hint.textContent=String(error.message||error);button.disabled=false;}
 finally{preEvacuationBusy=false;}
});
setInterval(()=>{const button=document.querySelector('#startPreEvacuation');if(button?.dataset.eventId)refreshPreEvacuation();},10000);

// Minimal EVAC-1 test controls. Durable server team/cargo state is the authority.
let evacuationBusy=false,evacuationEventId='',evacuationView=null;
function renderFopEventStatus(state){
 const badge=document.querySelector('#fopEventStatus');if(!badge)return;
 const known=['FIELD_ACTIVE','INITIALIZED','COMPLETED','STANDBY'].includes(state);
 badge.dataset.state=state==='FIELD_ACTIVE'?'active':known?'inactive':'unknown';
 badge.textContent=state==='FIELD_ACTIVE'?'EVENT AKTIV':state==='INITIALIZED'?'EVENT VORBEREITET // NOCH NICHT AKTIV':known?'KEIN AKTIVES EVENT':'EVENTSTATUS UNKLAR';
}
function renderEvacuation(result){
 const status=document.querySelector('#evacuationStatus'),details=document.querySelector('#evacuationDetails');if(!status||!details)return;
 if(result.eventId)evacuationEventId=result.eventId;
 if(result.eventState)renderFopEventStatus(result.eventState);
 const team=result.evacuation;evacuationView=team||null;status.textContent=team?(team.status+(team.command?' // '+team.command:'')):result.status;
 details.textContent=team?team.nodes.map((node,i)=>'NODE '+(i+1)+' // '+node.nodeId+' // '+node.status+' // CARGO → '+node.carrier).concat(team.cargo.map(cargo=>cargo.carrier+' // 3 EVACUATION / '+(cargo.status||'IN_TRANSIT').replaceAll('_',' ')+' CORES // '+cargo.cores.map(core=>core.energy+' E').join(' + '))).concat((team.finalUploads||[]).map(player=>player.identity+' // FINAL UPLOAD '+(player.completed?'COMPLETE':'PENDING'))).join(' | '):result.teams?.length?result.teams.map(team=>team.teamId+' // '+team.status).join(' | '):result.status==='EVACUATION_IN_PROGRESS'?'FOP bildet physisch ein Team mit genau zwei Pioneers.':'Founder-Start erst nach EVACUATION_READY.';
 if(document.querySelector('#fopEventStatus')){
  const labels={EVACUATION_NOT_STARTED:'Noch nicht gestartet',EVACUATION_IN_PROGRESS:'Evakuierung läuft',EVACUATION_COMPLETED:'Evakuierung abgeschlossen'};
  if(!team&&labels[result.status])status.textContent=labels[result.status];
  if(team){status.textContent=team.status==='EVACUATION_TEAM_COMPLETE'?'Team-Aufgabe abgeschlossen':'Team im Einsatz';details.textContent=team.command==='RETURN TO HQ'?'Kehrt gemeinsam zum HQ zurück.':team.nodes.map(node=>node.nodeId+' – '+(node.status==='EVACUATED'?'Rückbau abgeschlossen':node.status==='NEXT'?'als Nächstes scannen':'noch offen')).join(' / ');}
  if(!team)details.textContent=result.status==='EVACUATION_IN_PROGRESS'?'Bilde ein Team mit genau zwei Pioneers. Tippe „Team erfassen“ und scanne beide Access Cards.':result.status==='EVACUATION_COMPLETED'?'Die Evakuierung ist beendet. Es ist kein weiterer Schritt erforderlich.':'Warte auf den Start durch den Founder. Danach kannst du dein Team erfassen.';
 }
 renderEvacuationFinal(team);
 const start=document.querySelector('#evacuationStart'),form=document.querySelector('#evacuationTeam');if(start){start.disabled=evacuationBusy||result.evacuationReady!==true;start.hidden=result.status==='EVACUATION_IN_PROGRESS';}if(form){form.disabled=evacuationBusy||result.status!=='EVACUATION_IN_PROGRESS'||Boolean(team);form.hidden=Boolean(team);}
}
async function refreshEvacuation(){
 if(!sessionToken||!document.querySelector('#evacuationPanel')||evacuationBusy)return;
 try{const r=await apiRequest({action:'evacuationstate',token:sessionToken});if(r?.error==='EVACUATION_FIELD_ACTIVE_REQUIRED'){renderFopEventStatus('STANDBY');}if(!r?.ok||!r?.session)throw Error(r?.error||r?.status||'EVACUATION STATE FAILED');renderEvacuation(r);}
 catch(error){if(String(error.message||error)!=='EVACUATION_FIELD_ACTIVE_REQUIRED')renderFopEventStatus('unknown');const status=document.querySelector('#evacuationStatus');if(status)status.textContent=String(error.message||error)==='EVACUATION_FIELD_ACTIVE_REQUIRED'?'Kein aktives Event':'Status konnte nicht geladen werden: '+String(error.message||error);const form=document.querySelector('#evacuationTeam');if(form)form.disabled=true;}
}
function scanEvacuationUid(){
 return new Promise(async(resolve,reject)=>{
  const controller=new AbortController();let settled=false;const finish=(error,uid)=>{if(settled)return;settled=true;clearTimeout(timer);controller.abort();error?reject(error):resolve(uid);};
  const timer=setTimeout(()=>finish(Error('NFC SCAN TIMEOUT // erneut versuchen')),60000);
  try{const reader=new NDEFReader();await reader.scan({signal:controller.signal});reader.onreading=e=>{const uid=String(e.serialNumber||'').trim();if(uid)finish(null,uid);};reader.onreadingerror=()=>finish(Error('NFC READ FAILED'));}catch(error){finish(error);}
 });
}
window.addEventListener('nodiv-evacuation-refresh',refreshEvacuation);
window.addEventListener('nodiv-evacuation-start',async()=>{
 if(evacuationBusy||!evacuationEventId)return;evacuationBusy=true;
 const button=document.querySelector('#evacuationStart');if(button)button.disabled=true;
 try{const r=await apiRequest({action:'evacuationstart',token:sessionToken,event:evacuationEventId});if(!r?.ok||r.action!==true)throw Error(r?.error||r?.status||'EVACUATION START FAILED');renderEvacuation(r);}
 catch(error){document.querySelector('#evacuationStatus').textContent=String(error.message||error);}
 finally{evacuationBusy=false;await refreshEvacuation();}
});
window.addEventListener('nodiv-evacuation-team',async()=>{
 if(evacuationBusy)return;const button=document.querySelector('#evacuationTeam'),status=document.querySelector('#evacuationStatus');if(!button||button.disabled)return;evacuationBusy=true;button.disabled=true;
 try{status.textContent='PIONEER A ACCESS CARD SCANNEN';const pioneerAUid=await scanEvacuationUid();status.textContent='PIONEER B ACCESS CARD SCANNEN';const pioneerBUid=await scanEvacuationUid();status.textContent='TEAM SERVER VALIDATION';const r=await apiRequest({action:'evacuationteam',token:sessionToken,event:evacuationEventId,pioneerAUid,pioneerBUid});if(!r?.ok||r.action!==true)throw Error(r?.error||r?.status||'TEAM FAILED');renderEvacuation({status:'EVACUATION_IN_PROGRESS',...r});await refreshFopOperations();}
 catch(error){status.textContent=String(error.message||error);}
 finally{evacuationBusy=false;if(!button.hidden)button.disabled=false;}
});
setInterval(()=>{if(document.querySelector('#evacuationPanel'))refreshEvacuation();},10000);

// The server's durable scan receipt survives reload/session replacement.
function renderEvacuationFinal(team){
 const panel=document.querySelector('#evacuationFinal'),select=document.querySelector('#evacuationFinalCore'),scan=document.querySelector('#evacuationFinalScan'),confirm=document.querySelector('#evacuationFinalConfirm'),hint=document.querySelector('#evacuationFinalHint');if(!panel||!select||!scan||!confirm||!hint)return;
 const final=team?.finalUpload;panel.hidden=!final||(!final.available&&!final.completed);if(panel.hidden)return;
 const previous=select.value;select.replaceChildren();
 for(const core of team.cargo[0]?.cores||[]){const option=document.createElement('option');option.value=core.id;option.textContent=core.energy+' E // '+core.id;select.appendChild(option);}
 const choices=team.cargo[0]?.cores||[];select.value=final.scan?.coreId|| (choices.some(core=>core.id===previous)?previous:choices[0]?.id||'');
 select.hidden=scan.hidden=confirm.hidden=Boolean(final.completed);select.disabled=scan.disabled=evacuationBusy||!final.available;confirm.disabled=evacuationBusy||!final.scan;
 hint.textContent=final.completed?'FINAL UPLOAD COMPLETE // '+final.energy+' E SECURED // '+(team.withdrawn?'RETURN TO HQ':'WAITING FOR SECOND PIONEER'):final.scan?'CORE SCAN ACCEPTED // FINAL UPLOAD BESTÄTIGEN':'Einen eigenen Evakuierungs-Core wählen und physisch scannen.';
}
window.addEventListener('nodiv-evacuation-finalscan',async()=>{
 const team=evacuationView,select=document.querySelector('#evacuationFinalCore'),hint=document.querySelector('#evacuationFinalHint');if(evacuationBusy||!team?.finalUpload?.available||!select)return;let failure='';const core=select.value;if(!team.cargo[0]?.cores.some(item=>item.id===core))return;
 evacuationBusy=true;renderEvacuationFinal(team);
 try{hint.textContent='GEWÄHLTEN CARGO-CORE SCANNEN';const uid=await scanEvacuationUid(),r=await apiRequest({action:'evacuationfinalscan',token:sessionToken,event:team.eventId,team:team.teamId,core,uid});if(!r?.ok||r.action!==true)throw Error(r?.error||r?.status||'FINAL SCAN FAILED');renderEvacuation(r);}
 catch(error){failure=String(error.message||error);}
 finally{evacuationBusy=false;if(evacuationView)renderEvacuationFinal(evacuationView);if(failure)hint.textContent=failure;}
});
window.addEventListener('nodiv-evacuation-finalconfirm',async()=>{
 const team=evacuationView,hint=document.querySelector('#evacuationFinalHint');if(evacuationBusy||!team?.finalUpload?.scan||document.querySelector('#evacuationFinalConfirm')?.disabled)return;let failure='';evacuationBusy=true;renderEvacuationFinal(team);
 try{const r=await apiRequest({action:'evacuationfinalconfirm',token:sessionToken,event:team.eventId,team:team.teamId,scan:team.finalUpload.scan.id});if(!r?.ok||r.action!==true)throw Error(r?.error||r?.status||'FINAL UPLOAD FAILED');renderEvacuation(r);window.dispatchEvent(new CustomEvent('nodiv-pioneer-live'));}
 catch(error){failure=String(error.message||error);}
 finally{evacuationBusy=false;if(evacuationView)renderEvacuationFinal(evacuationView);if(failure)hint.textContent=failure;}
});

window.addEventListener('nodiv-evacuation-finalchoice',()=>{const select=document.querySelector('#evacuationFinalCore'),confirm=document.querySelector('#evacuationFinalConfirm');if(confirm)confirm.disabled=evacuationBusy||!evacuationView?.finalUpload?.scan||select?.value!==evacuationView.finalUpload.scan.coreId;});
