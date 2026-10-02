import {routeIdentity} from './router.js';
import {emitNodiv} from './motion.js';
let sessionToken='';
const API_URL='https://script.google.com/macros/s/AKfycby1cZye2Z46M2ydV6-TcurgOwmS8H4Bh6eXZJ3Z76TUs2oPO5eq6l-RGL0AyVQmfpeM3w/exec';
function apiRequest(params){return new Promise((resolve,reject)=>{const cb='__nodiv_app_'+Date.now()+'_'+Math.floor(Math.random()*99999),s=document.createElement('script'),timer=setTimeout(()=>done(new Error('NODIV CORE TIMEOUT')),10000);function done(err,data){clearTimeout(timer);try{delete window[cb]}catch(_){}s.remove();err?reject(err):resolve(data)}window[cb]=d=>done(null,d);s.onerror=()=>done(new Error('NODIV CORE UNREACHABLE'));s.src=API_URL+'?'+new URLSearchParams({...params,callback:cb});document.body.appendChild(s)})}
export async function startIdentity(){
 const btn=document.querySelector('#identityBtn'),msg=document.querySelector('#msg');
 if(!('NDEFReader' in window)){msg.textContent='WEB NFC NICHT VERFÜGBAR // Android + Chrome erforderlich.';emitNodiv('ACCESS_DENIED',{target:'#app'});return}
 btn.disabled=true;btn.textContent='NFC ARMED // PRESENT ACCESS CARD';msg.textContent='ACCESS CARD AN DAS GERÄT HALTEN';emitNodiv('NFC_ARMED',{target:'#identityBtn'});
 try{const reader=new NDEFReader();await reader.scan();reader.onreading=async e=>{const uid=e.serialNumber||'';btn.textContent='VERIFYING IDENTITY';try{const d=await apiRequest({action:'identify',uid});if(!d?.ok||!d.authenticated)throw new Error(d?.reason||d?.error||'ACCESS DENIED');const sess=await apiRequest({action:'sessionstart',uid}); if(!sess?.session||!sess?.token) throw new Error(sess?.status||'SESSION START FAILED'); sessionToken=sess.token; emitNodiv('IDENTITY_VERIFIED',{target:'#app'});document.querySelector('#bootView').hidden=true;routeIdentity(d)}catch(err){btn.disabled=false;btn.textContent='RETRY ACCESS CARD';msg.textContent=String(err.message||err);emitNodiv('ACCESS_DENIED',{target:'#app'})}}}catch(err){btn.disabled=false;btn.textContent='RETRY NFC';msg.textContent=String(err.message||err);emitNodiv('ACCESS_DENIED',{target:'#app'})}
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
