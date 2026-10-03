import {routeIdentity} from './router.js?v=20261003-1510';
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

window.addEventListener('nodiv-founder-register-antenna',async()=>{
 const host=document.querySelector('#roleView'); if(!sessionToken){return}
 if(!('NDEFReader' in window)){showFounderResult('NFC NOT AVAILABLE','Android + Chrome erforderlich.',false);return}
 showFounderResult('NFC ARMED','Unregistrierte Node-Antenne an das Smartphone halten.',true);
 try{
  const reader=new NDEFReader(); await reader.scan();
  reader.onreading=async e=>{
   const uid=e.serialNumber||''; if(!uid){showFounderResult('UID MISSING','Antenne konnte nicht gelesen werden.',false);return}
   try{
    showFounderResult('VERIFYING UID','NODIV prüft und reserviert die nächste freie Node-ID.',true);
    const r=await apiRequest({action:'provisionnode',token:sessionToken,uid});
    if(!r?.ok||r?.action!==true) throw new Error(r?.message||r?.status||'PROVISION FAILED');
    showFounderResult('ANTENNA REGISTERED',(r.node?.id||'NODE')+' // '+(r.node?.status||'AVAILABLE'),true);
    emitNodiv('IDENTITY_VERIFIED',{target:'#roleView'});
   }catch(err){showFounderResult('REGISTRATION DENIED',String(err.message||err),false)}
  };
 }catch(err){showFounderResult('NFC ERROR',String(err.message||err),false)}
});
function showFounderResult(title,detail,ok){
 let el=document.querySelector('#founderResult');
 if(!el){el=document.createElement('div');el.id='founderResult';el.className='founder-result';document.querySelector('.founder-console')?.appendChild(el)}
 el.className='founder-result '+(ok?'ok':'bad');el.innerHTML='<strong>'+String(title)+'</strong><span>'+String(detail)+'</span>';
}

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
 try{const reader=new NDEFReader();await reader.scan();let handling=false;reader.onreadingerror=()=>{if(btn){btn.disabled=false;btn.textContent='NFC-SCAN ERNEUT STARTEN'}if(hint)hint.textContent='NFC-Antenne konnte nicht gelesen werden.'};reader.onreading=async e=>{if(handling)return;const uid=e&&typeof e.serialNumber==='string'?e.serialNumber.trim():'';if(!uid){if(hint)hint.textContent='Keine gültige NFC UID gelesen.';return}handling=true;try{const r=await apiRequest({action:'register',core:coreId,uid,energy:value});if(!r?.ok)throw new Error(r?.error||r?.message||'REGISTRATION FAILED');showFounderResult('N-CORE REGISTRIERT',coreId+' // '+value+' E',true);emitNodiv('CORE_TRANSFERRED',{target:'#coreProvisioner'});if(hint)hint.textContent='Registrierung abgeschlossen.';if(btn){btn.disabled=false;btn.textContent='NÄCHSTEN N-CORE VORBEREITEN'}panel.dataset.coreId='';window.dispatchEvent(new CustomEvent('nodiv-founder-status'));}catch(err){handling=false;if(btn){btn.disabled=false;btn.textContent='NFC-SCAN ERNEUT STARTEN'}if(hint)hint.textContent=String(err.message||err);showFounderResult('REGISTRIERUNG ABGEWIESEN',String(err.message||err),false)}};}catch(err){if(btn){btn.disabled=false;btn.textContent='NFC-SCAN ERNEUT STARTEN'}if(hint)hint.textContent=String(err.message||err)}
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
   cells[3].textContent=r.uploads?.UPLOAD_FOP?'ONLINE':'NICHT REGISTRIERT';
  }
  const nodeCount=Number(r.nodes?.registered||0),coreCount=Number(r.cores?.registered||0);
  const missing=[];
  if(nodeCount<10)missing.push((10-nodeCount)+' Start-Node'+(10-nodeCount===1?'':'s'));
  if(coreCount<30)missing.push((30-coreCount)+' Start-N-Core'+(30-coreCount===1?'':'s'));
  if(!r.uploads?.UPLOAD_HQ)missing.push('Upload HQ');
  if(!r.uploads?.UPLOAD_FOP)missing.push('Upload FOP');
  const analysis=document.querySelector('#commandAnalysis');
  if(analysis)analysis.textContent=missing.length?'VORBEREITUNG OFFEN // '+missing.length+' BEREICH'+(missing.length===1?'':'E'):'STARTINFRASTRUKTUR BEREIT';
  const prep=document.querySelector('#commandPreparation');
  if(prep)prep.innerHTML=missing.length
   ?'<strong>'+nodeCount+'/10 NODES // '+coreCount+'/30 N-CORES</strong><p>Offen: '+missing.join(' · ')+'</p>'
   :'<strong>STARTINFRASTRUKTUR BEREIT</strong><p>10 Nodes, 30 N-Cores und beide Upload-Terminals sind registriert.</p>';
  const matrix=document.querySelector('#matrixMode');
  if(matrix)matrix.textContent=missing.length?'VORBEREITUNG // '+missing.length+' OFFEN':'STARTBEREIT';
 }catch(err){showFounderResult('STATUS UNAVAILABLE',String(err.message||err),false)}
});
