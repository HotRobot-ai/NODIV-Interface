import {routeIdentity} from './router.js';
import {emitNodiv} from './motion.js';
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

window.addEventListener('nodiv-founder-register-core',async()=>{
 if(!sessionToken)return;
 if(!('NDEFReader' in window)){showFounderResult('NFC NOT AVAILABLE','Android + Chrome erforderlich.',false);return}
 try{
  const free=await apiRequest({action:'nextfree'});
  if(!free?.ok||!free.nextFreeCore){showFounderResult('CORE SERIES COMPLETE','Kein freier NC-001 bis NC-200 Datensatz.',false);return}
  const coreId=free.nextFreeCore;
  const energy=window.prompt(coreId+' // sichtbaren Energiewert eingeben:','');
  if(energy===null)return;
  const value=Number(String(energy).trim());
  if(!Number.isFinite(value)||value<=0){showFounderResult('ENERGY INVALID','Gültigen sichtbaren Energiewert eingeben.',false);return}
  showFounderResult('NFC ARMED',coreId+' // N-Core Antenne jetzt scannen.',true);
  const reader=new NDEFReader();await reader.scan();
  reader.onreading=async e=>{
   const uid=e.serialNumber||'';
   if(!uid){showFounderResult('UID MISSING','N-Core Antenne konnte nicht gelesen werden.',false);return}
   try{
    showFounderResult('REGISTERING',coreId+' // '+value+' E',true);
    const r=await apiRequest({action:'register',core:coreId,uid,energy:value});
    if(!r?.ok)throw new Error(r?.error||r?.message||'REGISTRATION FAILED');
    showFounderResult('N-CORE REGISTERED',coreId+' // '+value+' E',true);
    emitNodiv('CORE_TRANSFERRED',{target:'#roleView'});
   }catch(err){showFounderResult('REGISTRATION DENIED',String(err.message||err),false)}
  };
 }catch(err){showFounderResult('SYSTEM ERROR',String(err.message||err),false)}
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
  if(cells.length!==4)return;
  cells[0].textContent=String(r.nodes?.registered??'—')+' / 15';
  cells[1].textContent=String(r.cores?.registered??'—')+' / 200';
  cells[2].textContent=r.uploads?.UPLOAD_HQ?'ONLINE':'NOT REGISTERED';
  cells[3].textContent=r.uploads?.UPLOAD_FOP?'ONLINE':'NOT REGISTERED';
 }catch(err){showFounderResult('STATUS UNAVAILABLE',String(err.message||err),false)}
});
