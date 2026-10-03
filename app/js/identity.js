import {routeIdentity} from './router.js?v=20261003-1600';
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
window.addEventListener('nodiv-pioneer-scan',()=>{emitNodiv('NFC_ARMED',{target:'#pioneerScan'});const b=document.querySelector('#pioneerScan');if(b){b.textContent='NFC ARMED // NODIV OBJECT SCANNEN';setTimeout(()=>{b.textContent='NFC // JETZT SCANNEN'},1800)}});

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
  if(init)init.disabled=ev.state==='INITIALIZED'||ev.state==='FIELD_ACTIVE';
  if(activate)activate.disabled=ev.state!=='INITIALIZED';
 }catch(err){if(hint)hint.textContent=String(err.message||err)}
}
window.addEventListener('nodiv-founder-status',()=>{setTimeout(refreshFounderEventStatus,0)});
window.addEventListener('nodiv-founder-event-initialize',async()=>{
 if(!sessionToken)return;
 const btn=document.querySelector('#initializeEvent');
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
window.addEventListener('nodiv-fop-install-order',async()=>{
 if(!sessionToken)return;
 const input=document.querySelector('#fopNodeId'),btn=document.querySelector('#fopInstallOrder'),panel=document.querySelector('#fopInstallCode'),value=document.querySelector('#fopCodeValue'),hint=document.querySelector('#fopInstallHint');
 const node=String(input?.value||'').trim().toUpperCase();
 if(!/^NODE-\d{3}$/.test(node)){if(hint)hint.textContent='Gültige Node-ID eingeben, z. B. NODE-001.';return}
 if(btn){btn.disabled=true;btn.textContent='AUFTRAG WIRD GELADEN'}
 try{
  const r=await apiRequest({action:'nodeinstallorder',token:sessionToken,node});
  if(!r?.ok||r?.action!==true)throw new Error(r?.message||r?.status||r?.error||'AUFTRAG NICHT VERFÜGBAR');
  if(panel)panel.hidden=false;
  if(value)value.textContent=r.node?.code||'••••';
  if(hint)hint.textContent=node+' // Schloss auf diesen Code stellen und erst danach bestätigen.';
  if(panel)panel.dataset.nodeId=node;
  emitNodiv('NFC_ARMED',{target:'#fopInstallCode'});
 }catch(err){if(panel)panel.hidden=false;if(value)value.textContent='LOCKED';if(hint)hint.textContent=String(err.message||err)}
 finally{if(btn){btn.disabled=false;btn.textContent='INSTALLATIONSAUFTRAG ABRUFEN'}}
});
window.addEventListener('nodiv-fop-install-confirm',async()=>{
 if(!sessionToken)return;
 const panel=document.querySelector('#fopInstallCode'),btn=document.querySelector('#fopInstallConfirm'),value=document.querySelector('#fopCodeValue'),hint=document.querySelector('#fopInstallHint');
 const node=panel?.dataset.nodeId||'';
 if(!node){if(hint)hint.textContent='Zuerst Installationsauftrag abrufen.';return}
 if(btn){btn.disabled=true;btn.textContent='BESTÄTIGUNG WIRD GESENDET'}
 try{
  const r=await apiRequest({action:'nodeinstallconfirm',token:sessionToken,node});
  if(!r?.ok||r?.action!==true)throw new Error(r?.message||r?.status||r?.error||'BESTÄTIGUNG FEHLGESCHLAGEN');
  if(value)value.textContent='ACTIVE';
  if(hint)hint.textContent=node+' // PRIMARY CODE AKTIV // INSTALLATION BESTÄTIGT';
  if(btn)btn.textContent='INSTALLIERT ✓';
  emitNodiv('IDENTITY_VERIFIED',{target:'#fopInstallCode'});
 }catch(err){if(hint)hint.textContent=String(err.message||err);if(btn){btn.disabled=false;btn.textContent='INSTALLATION BESTÄTIGEN'}}
});

window.addEventListener('nodiv-founder-core-open',async()=>{
 if(!sessionToken)return;
 const panel=document.querySelector('#coreProvisioner'),id=document.querySelector('#coreProvisionId'),hint=document.querySelector('#coreProvisionHint'),input=document.querySelector('#coreEnergy');
 if(!panel)return; panel.hidden=false; if(input){input.value='';input.focus()} if(id)id.textContent='NÄCHSTER CORE WIRD ERMITTELT'; if(hint)hint.textContent='NODIV prüft den nächsten freien N-Core-Datensatz.';
 try{const free=await apiRequest({action:'nextfree'});if(!free?.ok||!free.nextFreeCore)throw new Error('Kein freier NC-001 bis NC-200 Datensatz.');panel.dataset.coreId=free.nextFreeCore;if(id)id.textContent=free.nextFreeCore;if(hint)hint.textContent='Energiewert eingeben. Danach NFC-Scan starten.';}catch(err){panel.dataset.coreId='';if(id)id.textContent='NICHT VERFÜGBAR';if(hint)hint.textContent=String(err.message||err)}
});
window.addEventListener('nodiv-founder-core-scan',async()=>{
 if(!sessionToken)return;
 const panel=document.querySelector('#coreProvisioner'),input=document.querySelector('#coreEnergy'),hint=document.querySelector('#coreProvisionHint'),btn=document.querySelector('#scanCoreAntenna');
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
