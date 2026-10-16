const $=id=>document.getElementById(id); let token='',nodeGrant='',exchangeId='',accessCode='',ownScanned=false,nodeCoreScanned=false;
function out(id,msg,err=false){const el=$(id);el.textContent=msg;el.classList.toggle('err',err)}
async function api(path,{method='GET',data,auth=true}={}){const r=await fetch(path,{method,headers:{'content-type':'application/json',...(auth&&token?{authorization:`Bearer ${token}`}:{})},body:data?JSON.stringify(data):undefined,cache:'no-store'});const j=await r.json().catch(()=>({ok:false,error:'BAD_JSON'}));if(!r.ok||!j.ok)throw Error(j.error||`HTTP_${r.status}`);return j}
async function nfc(label){
 if(!('NDEFReader'in window))throw Error('WEB_NFC_NICHT_VERFUEGBAR');
 const reader=new NDEFReader(),ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),20000);
 out('exchangeOut',`${label}: Tag jetzt ans Handy halten …`);
 try{return await new Promise((resolve,reject)=>{reader.addEventListener('reading',e=>{const uid=(e.serialNumber||'').replace(/[^0-9A-Za-z]/g,'').toUpperCase();ctrl.abort();uid?resolve(uid):reject(Error('NFC_KEINE_SERIENNUMMER'));},{once:true});reader.addEventListener('readingerror',()=>reject(Error('NFC_LESFEHLER')),{once:true});reader.scan({signal:ctrl.signal}).catch(reject);});}finally{clearTimeout(timer)}
}
async function refresh(){try{$('health').textContent=(await api('/health',{auth:false})).secure?'ONLINE · HTTPS':'ONLINE · HTTP (NFC gesperrt)'}catch{$('health').textContent='NICHT ERREICHBAR'}}
$('btnAuth').onclick=async()=>{try{const uid=await nfc('Access Card');const r=await api('/api/session/start',{method:'POST',auth:false,data:{uid}});token=r.token;out('authOut',`Pioneer ${r.actorId} autorisiert.`);$('exchange').classList.remove('locked');$('btnState').disabled=false;$('btnRestartSave').disabled=false;$('btnRestartCompare').disabled=false;}catch(e){out('authOut',e.message,true)}};
$('btnNode').onclick=async()=>{try{const uid=await nfc('Node');const r=await api('/api/scan',{method:'POST',data:{uid}});nodeGrant=r.grantId;out('exchangeOut',`${r.nodeId} erkannt · Freigabe bereit.`);$('btnPrepare').disabled=false;}catch(e){out('exchangeOut',e.message,true)}};
$('btnPrepare').onclick=async()=>{try{const r=await api('/api/exchange/prepare',{method:'POST',data:{grantId:nodeGrant,count:1}});exchangeId=r.exchangeId;accessCode=r.accessCode;$('accessCode').textContent=accessCode;$('codeBox').classList.remove('hidden');$('btnOwn').disabled=false;$('btnNodeCore').disabled=false;out('exchangeOut','Exchange vorbereitet. Jetzt genau zwei N-Cores scannen.');}catch(e){out('exchangeOut',e.message,true)}};
async function scanCore(expected){const uid=await nfc(expected);const r=await api('/api/scan',{method:'POST',data:{uid,exchangeId}});if(expected==='Eigener N-Core'&&r.kind!=='PIONEER_CORE')throw Error('FALSCHER_CORE: erwartet eigener Core');if(expected==='Node-Core'&&r.kind!=='NODE_CORE')throw Error('FALSCHER_CORE: erwartet Node-Core');return r}
$('btnOwn').onclick=async()=>{try{const r=await scanCore('Eigener N-Core');ownScanned=true;out('exchangeOut',`Eigener Core ${r.coreId} erkannt.`);$('btnConfirm').disabled=!(ownScanned&&nodeCoreScanned);}catch(e){out('exchangeOut',e.message,true)}};
$('btnNodeCore').onclick=async()=>{try{const r=await scanCore('Node-Core');nodeCoreScanned=true;out('exchangeOut',`Node-Core ${r.coreId} erkannt.`);$('btnConfirm').disabled=!(ownScanned&&nodeCoreScanned);}catch(e){out('exchangeOut',e.message,true)}};
$('btnConfirm').onclick=async()=>{try{$('btnConfirm').disabled=true;const r=await api('/api/exchange/confirm',{method:'POST',data:{exchangeId,accessCode}});out('exchangeOut',`BESTÄTIGT · ${r.incomingCoreId} ⇄ ${r.outgoingCoreId}${r.replayed?' · REPLAY':''}`);await showState();}catch(e){$('btnConfirm').disabled=false;out('exchangeOut',e.message,true)}};
async function showState(){try{$('stateOut').textContent=JSON.stringify(await api('/api/state'),null,2)}catch(e){$('stateOut').textContent=e.message}}
$('btnState').onclick=showState;

const BLOCK02_KEY='nodiv-v2-block02-before-v1';
function canonicalState(s){
 return {
  eventId:s.eventId,
  actor:s.actor,
  personal:(s.personal||[]).map(x=>({core_id:x.core_id,uid:x.uid,visible_energy:x.visible_energy,status:x.status})),
  nodes:(s.nodes||[]).map(n=>({node_id:n.node_id,state:n.state,cores:(n.cores||[]).map(x=>({core_id:x.core_id,uid:x.uid,visible_energy:x.visible_energy,status:x.status}))})),
  recent:(s.recent||[]).map(x=>({operation_id:x.operation_id,kind:x.kind,created_at:x.created_at,response:x.response}))
 };
}
async function fingerprint(value){
 const bytes=new TextEncoder().encode(JSON.stringify(value));
 const hash=await crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,16).toUpperCase();
}
$('btnRestartSave').onclick=async()=>{
 try{
  const state=canonicalState(await api('/api/state'));
  const fp=await fingerprint(state);
  localStorage.setItem(BLOCK02_KEY,JSON.stringify({savedAt:new Date().toISOString(),fingerprint:fp,state}));
  out('restartOut',`VORHER gespeichert · Fingerprint ${fp}\nJetzt Windows/Mini-PC vollständig neu starten. Danach dieselbe HTTPS-Seite öffnen, Access Card scannen und „NACH NEUSTART VERGLEICHEN“ drücken.`);
 }catch(e){out('restartOut',e.message,true)}
};
$('btnRestartCompare').onclick=async()=>{
 try{
  const beforeRaw=localStorage.getItem(BLOCK02_KEY);
  if(!beforeRaw)throw Error('KEIN_VORHER_STAND_GESPEICHERT');
  const before=JSON.parse(beforeRaw);
  const after=canonicalState(await api('/api/state'));
  const afterFp=await fingerprint(after);
  const same=JSON.stringify(before.state)===JSON.stringify(after);
  out('restartOut',same?`PASS · Persistenz identisch\nVorher ${before.fingerprint} · Nachher ${afterFp}\nOwnership, Node-Bestand und Operations/Audit-Sicht sind nach dem Neustart unverändert.`:`FAIL · Zustand unterscheidet sich\nVorher ${before.fingerprint} · Nachher ${afterFp}\nKeine weiteren Aktionen ausführen; Abweichung zuerst untersuchen.`,!same);
 }catch(e){out('restartOut',e.message,true)}
};
function percentile(sorted,p){return sorted[Math.min(sorted.length-1,Math.max(0,Math.ceil(sorted.length*p)-1))]}
$('btnLatency').onclick=async()=>{
 const btn=$('btnLatency');btn.disabled=true;out('latencyOut','Messung läuft: 3 Warmups + 25 echte Handy→Mini-PC-Roundtrips …');
 try{
  for(let i=0;i<3;i++)await api(`/health?warmup=${Date.now()}-${i}`,{auth:false});
  const values=[];
  for(let i=0;i<25;i++){
   const t0=performance.now();
   await api(`/health?block02=${Date.now()}-${i}`,{auth:false});
   values.push(performance.now()-t0);
  }
  const sorted=[...values].sort((a,b)=>a-b);
  const avg=values.reduce((a,b)=>a+b,0)/values.length;
  out('latencyOut',`25/25 erfolgreich · Handy-Ende-zu-Ende\nMIN ${sorted[0].toFixed(1)} ms · Ø ${avg.toFixed(1)} ms · P50 ${percentile(sorted,.50).toFixed(1)} ms · P95 ${percentile(sorted,.95).toFixed(1)} ms · MAX ${sorted.at(-1).toFixed(1)} ms`);
 }catch(e){out('latencyOut',`Messung abgebrochen: ${e.message}`,true)}
 finally{btn.disabled=false}
};
refresh();
