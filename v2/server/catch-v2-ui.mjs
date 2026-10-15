import {createCatchHttpClient} from './catch-http-client.mjs';

// Explicit V2 UI mount. A trusted NFC reader integration must be injected;
// never derive authorization from a browser-visible NFC UID.
export function mountCatchV2({root,baseUrl,eventId,getSessionToken,acquireFreshNfcProof}){
 if(!root||typeof root.replaceChildren!=='function')throw Error('CATCH_ROOT_REQUIRED');
 const title=document.createElement('h2');title.textContent='NODIV // CATCH V2';
 const label=document.createElement('label');label.textContent='Pioneer-Zielkennung';
 const input=document.createElement('input');input.autocomplete='off';input.required=true;input.setAttribute('aria-label','Pioneer-Zielkennung');
 const button=document.createElement('button');button.type='button';button.textContent='CATCH STARTEN';
 const status=document.createElement('p');status.setAttribute('role','status');status.textContent='Bereit zum Catch.';
 label.appendChild(input);root.replaceChildren(title,label,button,status);
 const flow=createCatchHttpClient({baseUrl,eventId,getSessionToken,acquireFreshNfcProof,
  onStatus:code=>{status.textContent=code==='CATCH_REFRESHING'?'Tausch erkannt. Catch wird aktualisiert – erneuter NFC-Scan erforderlich.':'Catch bestätigt.'}
 });
 button.addEventListener('click',async()=>{
  const targetId=input.value.trim();if(!targetId){status.textContent='Pioneer-Zielkennung fehlt.';return}
  button.disabled=true;status.textContent='Catch wird geprüft. NFC-Scan bereithalten.';
  try{await flow(targetId)}catch(e){
   status.textContent= e?.message==='NFC_SCAN_CANCELLED'?'NFC-Scan abgebrochen.': 'Catch nicht abgeschlossen: '+String(e?.message||'Unbekannter Fehler');
  }finally{button.disabled=false}
 });
 return {root};
}
