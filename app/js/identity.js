import {routeIdentity} from './router.js?v=20261004-restore2';
import {emitNodiv} from './motion.js?v=20261003-1415';
let sessionToken='';
const API_URL='https://script.google.com/macros/s/AKfycby1cZye2Z46M2ydV6-TcurgOwmS8H4Bh6eXZJ3Z76TUs2oPO5eq6l-RGL0AyVQmfpeM3w/exec';
function apiRequest(params){return new Promise((resolve,reject)=>{const cb='__nodiv_app_'+Date.now()+'_'+Math.floor(Math.random()*99999),s=document.createElement('script'),timer=setTimeout(()=>done(new Error('NODIV CORE TIMEOUT')),10000);function done(err,data){clearTimeout(timer);try{delete window[cb]}catch(_){}s.remove();err?reject(err):resolve(data)}window[cb]=d=>done(null,d);s.onerror=()=>done(new Error('NODIV CORE UNREACHABLE'));s.src=API_URL+'?'+new URLSearchParams({...params,callback:cb});document.body.appendChild(s)})}
export async function startIdentity(){
 const btn=document.querySelector('#identityBtn'),msg=document.querySelector('#msg');
 if(!('NDEFReader' in window)){msg.textContent='WEB NFC NICHT VERFÜGBAR // Android + Chrome erforderlich.';emitNodiv('ACCESS_DENIED',{target:'#app'});return}
 btn.disabled=true;btn.textContent='NFC ARMED // PRESENT ACCESS CARD';msg.textContent='ACCESS CARD AN DAS GERÄT HALTEN';emitNodiv('NFC_ARMED',{target:'#identityBtn'});
 try{
  const reader=new NDEFReader();
  await reader.scan();
  let handling=false;
  reader.onreadingerror=()=>{handling=false;btn.disabled=false;btn.textContent='RETRY ACCESS CARD';msg.textContent='NFC-KARTE KONNTE NICHT GELESEN WERDEN // erneut scannen.';emitNodiv('ACCESS_DENIED',{target:'#app'})};
  reader.onreading=async e=>{
   if(handling)return;
   const raw=e&&typeof e.serialNumber==='string'?e.serialNumber.trim():'';
   const invalid=!raw||raw.toLowerCase()==='undefined'||raw.toLowerCase()==='null';
   if(invalid){btn.disabled=false;btn.textContent='RETRY ACCESS CARD';msg.textContent='KEINE GÜLTIGE NFC UID GELESEN // Karte erneut scannen.';emitNodiv('ACCESS_DENIED',{target:'#app'});return}
   handling=true;btn.textContent='VERIFYING IDENTITY';
   try{
    const d=await apiRequest({action:'identify',uid:raw});
    if(!d?.ok||!d.authenticated)throw new Error(d?.reason||d?.error||'ACCESS DENIED');
    const sess=await apiRequest({action:'sessionstart',uid:raw});
    if(!sess?.session||!sess?.token)throw new Error(sess?.status||'SESSION START FAILED');
    sessionToken=sess.token;emitNodiv('IDENTITY_VERIFIED',{target:'#app'});document.querySelector('#bootView').hidden=true;routeIdentity(d);
   }catch(err){handling=false;btn.disabled=false;btn.textContent='RETRY ACCESS CARD';msg.textContent=String(err.message||err);emitNodiv('ACCESS_DENIED',{target:'#app'})}
  };
 }catch(err){btn.disabled=false;btn.textContent='RETRY NFC';msg.textContent=String(err.message||err);emitNodiv('ACCESS_DENIED',{target:'#app'})}
}

window.addEventListener('nodiv-pioneer-live',async()=>{
 if(!sessionToken)return;
 const inv=document.querySelector('#pioneerInventory'),total=document.querySelector('#pioneerCarriedEnergy'),hqTotal=document.querySelector('#hqCarriedEnergy'),secured=document.querySelector('#pioneerSecuredEnergy');
 try{
  const state=await apiRequest({action:'playerstate',token:sessionToken});
  if(!state?.ok||!state?.session)throw new Error(state?.status||'PLAYER STATE UNAVAILABLE');
  const capacity=Math.max(0,Number(state.player?.coreCapacity||0)),cores=Array.isArray(state.cores)?state.cores:[];
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
window.addEventListener('nodiv-pioneer-scan',async()=>{
 const b=document.querySelector('#pioneerScan');
 if(!b||b.dataset.scanActive==='1'||pioneerRestoreBusy||pioneerExchangeBusy||catchBusy)return;
 if(!sessionToken){b.textContent='SESSION FEHLT // NEU ANMELDEN';emitNodiv('ACCESS_DENIED',{target:'#pioneerScan'});return}
 if(!('NDEFReader' in window)){b.textContent='WEB NFC NICHT VERFÜGBAR';emitNodiv('ACCESS_DENIED',{target:'#pioneerScan'});return}
 b.dataset.scanActive='1';b.disabled=true;b.textContent='NFC ARMED // NODIV OBJECT SCANNEN';emitNodiv('NFC_ARMED',{target:'#pioneerScan'});
 try{
  const controller=new AbortController(),reader=new NDEFReader();
  await reader.scan({signal:controller.signal});
  let handling=false;
  reader.onreadingerror=()=>{if(handling)return;b.textContent='NFC LESEFEHLER // ERNEUT';b.disabled=false;b.dataset.scanActive='0';emitNodiv('ACCESS_DENIED',{target:'#pioneerScan'})};
  reader.onreading=async ev=>{
   if(handling)return;handling=true;controller.abort();
   const uid=String(ev?.serialNumber||'').trim();
   if(!uid)throw new Error('KEINE NFC UID GELESEN');
   b.textContent='NODIV OBJECT // VERIFYING';
   try{
    const route=await apiRequest({action:'gameplayroute',token:sessionToken,uid:uid});
    if(!route?.ok||!route?.session)throw new Error(route?.error||route?.message||route?.reason||route?.status||'GAMEPLAY ROUTE FAILED');
    if(route.restoreMission)renderPioneerRestore(route.restoreMission,true);
    else if(route.exchangeResume)resumePioneerExchange(route.exchangeResume);
    else if(route.exchangePreview)showPioneerExchangePreview(route.exchangePreview);
    const object=route.object||route.target||{};
    const type=String(object.type||'OBJECT').toUpperCase(),id=String(object.id||'').toUpperCase();
    const decision=route.decision||{};
    const action=String(decision.action||route.action||'NO_ACTION').toUpperCase();
    const allowed=decision.allowed!==undefined?Boolean(decision.allowed):route.allowed!==false;
    const status=String(object.status||route.status||'').toUpperCase();
    const message=String(decision.message||decision.reason||route.message||route.reason||'').trim();
    b.textContent=(id||type)+' // '+(action==='NODE_INTERACTION'?'ACCESS READY':action.replaceAll('_',' '));
    b.title=[status,message].filter(Boolean).join(' // ');
    emitNodiv(allowed?'IDENTITY_VERIFIED':'ACCESS_DENIED',{target:'#pioneerScan'});
   }catch(err){
    b.textContent=String(err.message||err).toUpperCase().slice(0,70);emitNodiv('ACCESS_DENIED',{target:'#pioneerScan'});
   }finally{
    setTimeout(()=>{b.disabled=Boolean(pioneerExchange||(pioneerRestore?.atNode&&pioneerRestore?.authorized&&!['RESTORE_1_COMPLETE','RESTORE_2_COMPLETE'].includes(pioneerRestore?.status)));b.dataset.scanActive='0';b.textContent='NFC // JETZT SCANNEN';b.title=''},5000);
   }
  };
 }catch(err){b.disabled=false;b.dataset.scanActive='0';b.textContent=String(err.message||err).toUpperCase().slice(0,70);emitNodiv('ACCESS_DENIED',{target:'#pioneerScan'})}
});

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
   const ids=r.identitySummary||{}, uploads=r.uploadSummary||{}, nodeNames=Array.isArray(r.provisionedNodes)?r.provisionedNodes:[];
   snapshot.innerHTML='<small>EVENT CONFIGURATION // ZU BESTÄTIGEN</small>'+
    '<div><b>NODES</b> '+nodeNames.length+(nodeNames.length?' // '+nodeNames.join(', '):'')+'</div>'+
    '<div><b>N-CORES</b> '+(summary.registered||0)+' registriert // '+(summary.hqReserve||0)+' HQ Reserve // '+(summary.assigned||0)+' zugewiesen</div>'+
    '<div><b>FIELD IDENTITIES</b> '+(ids.PIONEER||0)+' Pioneer // '+(ids.LOCAL||0)+' Local // '+(ids.UNBOUND||0)+' Unbound // '+(ids.FOP||0)+' FOP</div>'+
    '<div><b>UPLOAD</b> '+(uploads.hq||0)+' HQ Bay(s) // '+(uploads.fop||0)+' FOP Upload(s)</div>'+
    '<div><b>ACCESS SECURITY</b> '+(nodeNames.length*5)+' mechanische Codes werden bei Initialisierung erzeugt</div>';
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
  const s=await apiRequest({action:'eventstatus',token:sessionToken});
  const nodes=Array.isArray(s?.provisionedNodes)?s.provisionedNodes:[];
  if(!nodes.length)throw new Error('Kein provisionierter Node vorhanden.');
  const r=await apiRequest({action:'eventinitialize',token:sessionToken,nodes:nodes.join(',')});
  if(!r?.ok||r?.action!==true)throw new Error(r?.message||r?.status||r?.error||'INITIALISIERUNG FEHLGESCHLAGEN');
  showFounderResult('EVENT INITIALISIERT',(r.event?.eventId||'EVENT')+' // '+(r.event?.plannedNodes||nodes.length)+' NODE(S)',true,btn);
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

let fopInstallation=null,fopInstallBusy=false,fopOperations=[],fopQueueBusy=false;
function selectedFopOperation(){const value=document.querySelector('#fopOperationSelect')?.value;return fopOperations.find(operation=>operation.id===value)||null}
async function refreshFopOperations(){
 if(!sessionToken||fopInstallBusy||fopQueueBusy)return;
 const select=document.querySelector('#fopOperationSelect'),hint=document.querySelector('#fopInstallHint');if(!select)return;
 fopQueueBusy=true;fopOperations=[];renderFopInstallation(fopInstallation);
 try{
  const r=await apiRequest({action:'fopoperations',token:sessionToken});
  if(!r?.ok||!r?.session||!Array.isArray(r.operations))throw new Error(r?.message||r?.status||r?.error||'OPERATIONS QUEUE UNAVAILABLE');
  fopOperations=r.operations.filter(operation=>['INSTALL','DEINSTALL'].includes(operation.type)&&/^NODE-\d{3}$/.test(operation.nodeId));
  select.replaceChildren();const prompt=document.createElement('option');prompt.value='';prompt.textContent=fopOperations.length?'OPERATION AUSWÄHLEN':'NO OPERATIONS AVAILABLE';select.appendChild(prompt);
  for(const operation of fopOperations){const option=document.createElement('option');option.value=operation.id;option.textContent=operation.label;select.appendChild(option)}select.value='';
 }catch(err){select.replaceChildren();const option=document.createElement('option');option.value='';option.textContent='NO OPERATIONS AVAILABLE';select.appendChild(option);if(hint)hint.textContent=String(err.message||err)}
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
 setText('#fopDeploymentNode',result?.node?.id||'SELECT OPERATION');
 setText('#fopLoadoutEnergy',result?result.totalEnergy+' E':'— E');
 setText('#fopLoadoutState',result?.nodeState||'—');
 const state=document.querySelector('#fopLoadoutState');if(state)state.dataset.state=result?.nodeState||'';
 setText('#fopOperationStatus',complete?'COMPLETE':result?(removal?'RECOVERING':'DEPLOYING'):'READY');
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
 const summary=document.querySelector('#fopDeploymentComplete');if(summary){summary.hidden=!complete;summary.textContent=complete?(removal?'RECOVERY COMPLETE // '+result.node.id+' // 3/3 CORES RETURNED':'DEPLOYMENT COMPLETE // '+result.node.id+' // 3/3 // '+result.totalEnergy+' E // '+result.nodeState):''}
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
  const r=await apiRequest({action:operation.type==='DEINSTALL'?'nodedeinstallorder':'nodeinstallorder',token:sessionToken,node});
  if(!r?.ok||r?.action!==true||!r.installation)throw new Error(r?.message||r?.status||r?.error||'AUFTRAG NICHT VERFÜGBAR');
  fopInstallation=r;
  if(panel)panel.hidden=false;
  if(value)value.textContent=r.node.code;
  if(hint)hint.textContent=node+' // '+r.instruction;
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
function renderPioneerRestore(result,atNode=false){
 pioneerRestore={...result,atNode};
 const board=document.querySelector('#pioneerRestoreBoard'),count=document.querySelector('#pioneerMissionCount'),panel=document.querySelector('#pioneerRestore');
 const phase=Number(result.phase||1),complete=['RESTORE_1_COMPLETE','RESTORE_2_COMPLETE'].includes(result.status),active=result.restore&&!complete;
 const missionLabel=document.querySelector('#restoreMissionLabel');if(missionLabel)missionLabel.textContent='RESTORE #'+phase;
 if(board)board.innerHTML=active?'<div><b>RESTORE #'+phase+'</b><span>AKTIV</span></div><p>'+result.nodeId+' wartet auf dich. Öffne die Mission und folge nur dem jeweils markierten Schritt.</p>':'<div><b>FIELD COMMS</b><span>STANDBY</span></div><p>Keine aktive RESTORE-Mission.</p>';
 if(count)count.textContent=active?'1 ACTIVE MISSION':'NO ACTIVE MISSION';
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
 const hqDone=Boolean(atNode||result.authorized||result.inCount||result.outCount||complete),nodeDone=Boolean(result.authorized||result.inCount||result.outCount||complete),inDone=Boolean(result.inCount||complete),outDone=Boolean(result.outCount||complete);
 let current='hq';if(hqDone)current='node';if(nodeDone)current='in';if(inDone)current='out';if(outDone)current='confirm';if(complete)current='complete';
 step('#restoreStepHq',hqDone?'done':current==='hq'?'current':'waiting');step('#restoreStepNode',nodeDone?'done':current==='node'?'current':'waiting');step('#restoreStepIn',inDone?'done':current==='in'?'current':'waiting');step('#restoreStepOut',outDone?'done':current==='out'?'current':'waiting');
 document.querySelector('#restoreStepHqDetail').textContent=hqDone?'Erledigt':result.inCore.id+' // '+result.inCore.energy+' E';
 document.querySelector('#restoreStepNodeDetail').textContent=nodeDone?'Erledigt':result.nodeId;
 document.querySelector('#restoreStepInTitle').textContent=result.inCore.id+' einsetzen';document.querySelector('#restoreStepInDetail').textContent=inDone?'Erledigt':result.inCore.energy+' E';
 document.querySelector('#restoreStepOutTitle').textContent=result.outCore.id+' entnehmen';document.querySelector('#restoreStepOutDetail').textContent=outDone?'Erledigt':result.outCore.energy+' E';
 const now=document.querySelector('#restoreNowTitle'),hint=document.querySelector('#restoreHint');
 if(complete){now.textContent='RESTORE ERFOLGREICH';hint.textContent=phase===2?'NODE stabilisiert. Dritter Slot freigeschaltet.':'NODE stabilisiert. Zweiter Slot freigeschaltet.';}
 else if(current==='hq'){now.textContent=result.inCore.id+' AM HQ ÜBERNEHMEN';hint.textContent='Nimm den angezeigten Transport-Core auf. Danach zum Ziel-Node gehen und dessen NFC-Tag scannen.';}
 else if(current==='node'){now.textContent=result.nodeId+' SCANNEN';hint.textContent='Halte dein Smartphone an den NFC-Tag des Ziel-Nodes.';}
 else if(current==='in'){now.textContent=result.inCore.id+' EINSETZEN';hint.textContent='Setze den Transport-Core ein und scanne ihn mit dem Smartphone.';}
 else if(current==='out'){now.textContent=result.outCore.id+' ENTNEHMEN';hint.textContent='Entnimm genau diesen Node-Core und scanne ihn mit dem Smartphone.';}
 else {now.textContent='RESTORE ABSCHLIESSEN';hint.textContent='Alle erforderlichen Schritte sind bestätigt. Schließe den RESTORE jetzt ab.';}
 const auth=document.querySelector('#restoreAuthorize'),scan=document.querySelector('#restoreScan'),confirm=document.querySelector('#restoreConfirm');
 auth.hidden=!active||current!=='node';auth.disabled=pioneerRestoreBusy;auth.textContent='NODE ÖFFNEN';
 scan.hidden=!active||!['in','out'].includes(current);scan.disabled=pioneerRestoreBusy;scan.textContent=current==='out'?result.outCore.id+' SCANNEN':result.inCore.id+' SCANNEN';
 confirm.hidden=!active||current!=='confirm';confirm.disabled=pioneerRestoreBusy||!result.canConfirm;
 const nodeScan=document.querySelector('#pioneerScan');if(nodeScan)nodeScan.disabled=Boolean(active&&atNode&&result.authorized);
}
window.addEventListener('nodiv-pioneer-restore-status',async()=>{
 if(!sessionToken)return;
 try{const r=await apiRequest({action:'restorestate',token:sessionToken});if(!r?.ok||!r.session)throw Error(r?.error||r?.status||'RESTORE STATE FAILED');if(r.restore)renderPioneerRestore(r,false);}
 catch(err){const board=document.querySelector('#pioneerRestoreBoard');if(board)board.textContent=String(err.message||err);}
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
 try{const r=await apiRequest({action:'playerstate',token:sessionToken});if(!r?.ok||!r.session)throw Error(r?.error||r?.status||'PLAYER STATE UNAVAILABLE');inventory.textContent=(r.cores||[]).map(c=>c.coreId+' // '+c.energy+' E').join(' // ')||'NO PERSONAL CORES';const slots=document.querySelector('#catcherPersonalSlots');if(slots)slots.textContent=inventory.textContent+' // '+(r.cores||[]).length+'/'+r.player.coreCapacity;}catch(error){inventory.textContent=String(error.message||error);}
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
