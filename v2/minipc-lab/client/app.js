const $=id=>document.getElementById(id);
let token='',session=null,view=null;
let exchange=null,catchPreview='',fopFlow=null,missionFlow=null,hqFlow=null,hqPanelOpen=false,evacFlow=null,scanActive=false;

const ROLE_LABEL={FOUNDER:'FOUNDER',FOP:'FIELD OPERATOR',PIONEER:'PIONEER',LOCAL:'LOCAL',UNBOUND:'UNBOUND'};
const ROLE_CHANNEL={FOUNDER:'ROOT // SYSTEM CONTROL',FOP:'FIELD OPERATIONS',PIONEER:'NODIV',LOCAL:'FIELD ACCESS',UNBOUND:'UNBOUND ACCESS'};
const ERROR_TEXT={
  ACCESS_CARD_DENIED:'Access Card nicht freigegeben.',
  NO_SESSION:'Sitzung abgelaufen. Access Card erneut scannen.',
  ROLE_DENIED:'Diese Aktion ist für deine Rolle nicht freigegeben.',
  NODE_TAG_DENIED:'Dieser Node ist nicht für das aktive Event freigegeben.',
  NODE_NOT_INSTALLED:'Dieser Node ist aktuell nicht installiert.',
  NODE_EXCHANGE_COOLDOWN:'Node noch gesperrt. Warte auf die Freigabe.',
  RESTORE_TARGET_LOCKED:'Dieser Node ist für dich nach RESTORE noch gesperrt.',
  TARGET_PROTECTED:'Dieser Pioneer steht aktuell unter Catch-Schutz.',
  CATCHER_CAPACITY_FULL:'Dein Inventar ist voll.',
  NO_CATCHABLE_CORE:'Bei diesem Pioneer ist aktuell kein Core catchbar.',
  UPLOAD_POINTS_BUSY:'Alle Uploadpunkte sind aktuell reserviert oder belegt.',
  UPLOAD_POINT_BUSY:'Dieser Uploadpunkt ist aktuell nicht frei.',
  INSUFFICIENT_SECURED_ENERGY:'Für Secure Approach fehlen 150 E gesicherte Energie.',
  MISSION_NOT_ASSIGNED:'Aktuell liegt kein Systemauftrag für dich vor.',
  MISSION_NODE_MISMATCH:'Falscher Ziel-Node. Prüfe deinen Auftrag.',
  MISSION_CORE_MISMATCH:'Dieser N-Core gehört nicht zu deinem aktuellen Auftrag.',
  MISSION_SCAN_MISMATCH:'Die Scans passen nicht mehr zum aktuellen Serverzustand.',
  EVAC_COMPLETION_BLOCKED:'Eventabschluss noch nicht freigegeben. EVAC vollständig fortsetzen.',
  EVAC_PENDING_OPERATIONS:'Eventabschluss wartet noch auf offene serverseitige Vorgänge.',
  INSTALL_CARGO_INVALID:'Dieser N-Core gehört nicht zu deinem aktuellen FOP-Loadout.',
  FOP_THREE_CORES_REQUIRED:'Für die Installation werden exakt drei N-Cores benötigt.',
  EVAC_NORMAL_ACTION_FROZEN:'Normale Feldaktionen sind während EVAC gesperrt.',
  RESUPPLY_ASSIGNMENT_UNAVAILABLE:'RE-SUPPLY kann derzeit nicht sicher zugewiesen werden.',
  NO_KNOWN_AVAILABLE_NODE:'Kein geeigneter bekannter Node für RE-SUPPLY verfügbar.',
  NO_HQ_RESERVE:'Kein freier N-Core in der HQ-Reserve für RE-SUPPLY verfügbar.',
  RESUPPLY_ASSIGNMENT_CONFLICT:'Voll-Upload nicht möglich: Ein anderer Auftrag ist noch aktiv.',
  NFC_KEINE_SERIENNUMMER:'NFC-Tag erkannt, aber keine UID übertragen. Tag erneut ruhig an das Smartphone halten.',
  NFC_LESFEHLER:'NFC konnte nicht gelesen werden. Tag erneut an das Smartphone halten.',
  NFC_SCAN_TIMEOUT:'Kein NFC-Tag innerhalb von 30 Sekunden erkannt. Scan erneut starten.',
  DESKTOP_TEST_MODE_REQUIRED:'Diese Funktion ist nur im gekennzeichneten Schreibtisch-Testmodus verfügbar.',
  DESKTOP_TEST_START_STATE_INVALID:'Testspiel kann aus diesem Zustand nicht gestartet werden.',
  DESKTOP_TEST_END_STATE_INVALID:'Testspiel kann aus diesem Zustand nicht beendet werden.',
  DESKTOP_TEST_CORE_CHANGED:'Der N-Core-Bestand hat sich geändert. Founder-Status neu laden.',
  FOP_LOADOUT_UNAVAILABLE:'Für ein 3-Core-FOP-Loadout fehlen freie reale N-Cores in der HQ-Reserve.',
  REGISTRATION_PHASE_DENIED:'Hardware kann in diesem Testzustand nicht mehr registriert werden.',
  REGISTRATION_UID_DUPLICATE:'Diese NFC-UID ist bereits im Testbestand registriert.',
  REGISTRATION_ENERGY_INVALID:'E-Wert ungültig. Bitte den tatsächlich eingravierten Wert erfassen.',
  'WEB NFC NICHT VERFÜGBAR':'Web NFC ist hier nicht verfügbar. Auf Android Chrome über die HTTPS-Adresse öffnen.'
};
function friendly(error){const code=String(error?.message||error||'UNBEKANNTER FEHLER');return ERROR_TEXT[code]||code.replaceAll('_',' ');}
function setFeedback(id,msg,error=false){const el=$(id);if(!el)return;el.textContent=msg;el.classList.toggle('error',error);el.classList.toggle('ok',!error&&!!msg);}
function phase(kind,msg){
  const bar=$('flowBar');if(!bar)return;
  bar.hidden=!msg;bar.dataset.phase=kind||'idle';
  $('flowPhase').textContent={scan:'NFC SCAN',check:'SERVERPRÜFUNG',commit:'COMMIT',success:'BESTÄTIGT',error:'BLOCKIERT'}[kind]||'BEREIT';
  $('flowMessage').textContent=msg||'';
}
async function api(path,{method='GET',data,auth=true}={}){
  const r=await fetch(path,{method,headers:{'content-type':'application/json',...(auth&&token?{authorization:`Bearer ${token}`}:{})},body:data?JSON.stringify(data):undefined,cache:'no-store'});
  const j=await r.json().catch(()=>({ok:false,error:'BAD_JSON'}));
  if(!r.ok||!j.ok)throw Error(j.error||`HTTP_${r.status}`);
  return j;
}
function uidFromEvent(e){return String(e.serialNumber||'').replace(/[^0-9A-Za-z]/g,'').toUpperCase();}
async function nfc(label){
  if(!('NDEFReader'in window))throw Error('WEB NFC NICHT VERFÜGBAR');
  scanActive=true;
  phase('scan',`${label}: Tag jetzt ans Smartphone halten.`);
  const reader=new NDEFReader(),ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),30000);
  try{
    return await new Promise((resolve,reject)=>{
      reader.addEventListener('reading',e=>{
        const uid=uidFromEvent(e);
        if(!uid){reject(Error('NFC_KEINE_SERIENNUMMER'));return;}
        phase('check',`${label}: NFC erkannt. UID wird geprüft.`);resolve(uid);ctrl.abort();
      },{once:true});
      ctrl.signal.addEventListener('abort',()=>reject(Error('NFC_SCAN_TIMEOUT')),{once:true});
      reader.addEventListener('readingerror',()=>reject(Error('NFC_LESFEHLER')),{once:true});
      reader.scan({signal:ctrl.signal}).catch(reject);
    });
  }finally{clearTimeout(timer);scanActive=false}
}
// One active action at a time; preserve the original label and restore it on failure.
let activeActionButton=null;
document.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(!button||button.disabled||!button.isConnected)return;
  if(activeActionButton){event.preventDefault();event.stopImmediatePropagation();return;}
  if(!button.onclick)return;
  activeActionButton=button;
  button.dataset.originalLabel=button.textContent;
  button.dataset.actionState='running';button.disabled=true;button.setAttribute('aria-busy','true');
  button.textContent='AKTION LÄUFT …';
  // Handler is invoked by the existing onclick listener. Release only when the
  // corresponding async action settles, rather than using a fixed timeout.
  const handler=button.onclick;
  button.onclick=null;
  // Invoke synchronously inside the trusted click event: Web NFC requires
  // transient user activation and may reject a deferred scan() call.
  let result;
  try{result=handler.call(button,event);}
  catch(e){result=Promise.reject(e);}
  Promise.resolve(result).catch(e=>phase('error',friendly(e))).finally(()=>{
    if(button.isConnected){button.disabled=false;button.textContent=button.dataset.originalLabel;button.dataset.actionState='ready';button.removeAttribute('aria-busy');button.onclick=handler;}
    activeActionButton=null;
  });
  event.preventDefault();event.stopImmediatePropagation();
},true);
function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmt(seconds){seconds=Math.max(0,Math.ceil(Number(seconds)||0));return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
function op(prefix){return `${prefix}-${crypto.randomUUID()}`;}

async function refreshHealth(){
  try{const h=await api('/health',{auth:false});$('health').textContent=window.isSecureContext&&location.protocol==='https:'?'ONLINE // HTTPS · NFC BEREIT':(window.isSecureContext?'ONLINE // SICHERER KONTEXT':'ONLINE // HTTP · NFC GESPERRT');}
  catch{$('health').textContent='SERVER NICHT ERREICHBAR';}
}
function roleInteractionActive(){
  const host=$('roleContent'),active=document.activeElement;
  const formFocused=!!(host&&active&&host.contains(active)&&['INPUT','SELECT','TEXTAREA'].includes(active.tagName));
  return !!(scanActive||exchange||(cooldownNodeId&&nodeCooldownUntil>Date.now()/1000)||catchPreview||fopFlow||missionFlow||hqFlow||hqPanelOpen||evacFlow||host?.dataset.userEditing==='1'||formFocused);
}
async function refreshRole({quiet=false,passive=false}={}){
  if(!token)return;
  try{view=await api('/api/role/state');ghostSnapshotAt=Date.now();ghostSnapshotRemaining=Number(view.protection?.remainingSeconds)||0;renderRole({passive});if(!quiet)phase('success','Serverzustand aktualisiert.');}
  catch(e){if(!quiet)phase('error',friendly(e));}
}

function renderRole({passive=false}={}){
  if(!view)return;
  $('roleShell').dataset.role=view.actor.role;
  $('roleChannel').textContent=ROLE_CHANNEL[view.actor.role]||'NODIV';
  $('roleIdentity').textContent=view.actor.id;
  $('roleName').textContent=ROLE_LABEL[view.actor.role]||view.actor.role;
  $('nextTitle').textContent=view.nextAction?.label||'STATUS PRÜFEN';
  $('nextDetail').textContent=view.nextAction?.detail||'';
  $('nextAction').classList.toggle('pioneer-next',view.actor.role==='PIONEER');
  const host=$('roleContent');
  if(passive&&roleInteractionActive())return;
  if(view.actor.role==='PIONEER')host.innerHTML=renderPioneer(view);
  if(view.actor.role==='LOCAL'||view.actor.role==='UNBOUND')host.innerHTML=renderCatcher(view);
  if(view.actor.role==='FOP')host.innerHTML=renderFop(view);
  if(view.actor.role==='FOUNDER')host.innerHTML=renderFounder(view);
  host.dataset.userEditing='0';
  bindRole();
  if(view.actor.role==='PIONEER')showNodeCooldown();
  if(view.actor.role==='FOP')openFopCustody();
}
function eventActionBlocked(v){
  if(v.event?.state==='FIELD_ACTIVE')return '';
  const title=v.event?.state==='TEST_ENDED'?'TESTSPIEL BEENDET':'TESTSPIEL NOCH NICHT AKTIV';
  const detail=v.event?.state==='TEST_ENDED'?'Dieser Teststand ist kontrolliert beendet. Es werden keine weiteren Feldaktionen angenommen.':'Founder muss den Testbestand vorbereiten und das TESTSPIEL starten.';
  return `<section class="card"><small class="card-kicker">NODIV // TESTMODUS</small><h3>${title}</h3><p>${detail}</p><div class="status-pill warn">${esc(v.event?.state||'UNKNOWN')}</div></section>`;
}

function renderSlots(v){
  const fields=v.inventory.cores.filter(c=>c.status==='FIELD');
  return Array.from({length:3},(_,i)=>{
    if(i>=v.actor.capacity)return `<div class="slot locked"><small>SLOT 0${i+1}</small><b>LOCKED</b></div>`;
    const c=fields[i];return c?`<div class="slot"><small>SLOT 0${i+1}</small><b>${c.energy} E</b></div>`:`<div class="slot"><small>SLOT 0${i+1}</small><b>EMPTY</b></div>`;
  }).join('');
}
function renderMission(v){
  if(!v.mission)return '';
  const name=v.mission.kind==='RESUPPLY'?'RE-SUPPLY':v.mission.kind.replace('_',' #');
  return `<section class="card" id="missionCard"><small class="card-kicker">SYSTEMAUFTRAG // ${esc(name)}</small><h3>${esc(v.mission.nodeId)}</h3><p>${v.mission.kind==='RESUPPLY'?'Persönliches Inventar wiederherstellen.':'Ziel-Node stabilisieren.'} Transit-Core bleibt getrennt vom persönlichen Inventar.</p><div class="metrics"><div class="metric"><small>TRANSIT</small><b>${v.mission.cargo?.energy??'—'} E</b></div><div class="metric"><small>ZEIT</small><b>${fmt(v.mission.remainingSeconds)}</b></div></div><p class="phase-note"><strong>AM ZIEL-NODE:</strong> Drücke die Schaltfläche unten und halte deine Access Card nicht an den Node – scanne den NFC-Tag des Ziel-Nodes.</p><button id="missionStart" class="primary">1. ZIEL-NODE JETZT SCANNEN</button><div id="missionProgress" class="feedback"></div></section>`;
}
function renderPioneer(v){
  if(v.event?.state!=='FIELD_ACTIVE')return eventActionBlocked(v);
  const protect=v.protection?.active?`<section class="card protect"><small class="card-kicker">NODIV // PROTECTION</small><h3>CATCH-SCHUTZ AKTIV</h3><div class="timer" id="ghostCountdown">${fmt(v.protection.remainingSeconds)}</div><p>Nur der verbleibende Schutz ist relevant. Danach gilt wieder der normale Catch-Status.</p></section>`:'';
  const transit=v.transit?.length?`<section class="card"><small class="card-kicker">MISSION CARGO // IN TRANSIT</small><div class="slots">${v.transit.slice(0,3).map(c=>`<div class="slot transit"><small>TRANSIT</small><b>${c.energy} E</b></div>`).join('')}</div></section>`:'';
  const dispatch=v.restoreDispatch?.eligible&&!v.mission?`<section class="card"><small class="card-kicker">NODIV // SYSTEMAUFTRAG</small><h3>RESTORE #${v.restoreDispatch.phase} FREIGESCHALTET</h3><p>Die Qualifikation wurde serverseitig bestätigt. Erst beim Abruf wird ein realer HQ-Core als IN TRANSIT gebunden.</p><button id="restoreAssign" class="primary">SYSTEMAUFTRAG ABRUFEN</button></section>`:'';
  const supply=v.resupplyDispatch&&!v.mission?`<section class="card" id="resupplyCard"><small class="card-kicker">HQ // RE-SUPPLY</small><h3>${v.resupplyDispatch.mandatory?'VERSORGUNG ERFORDERLICH':'FREIER N-CORE-SLOT'}</h3><p>${v.resupplyDispatch.mandatory?'Ohne persönlichen N-Core ist eine Versorgungsmission erforderlich.':'Du kannst einen N-Core aus der HQ-Reserve über einen Ziel-Node übernehmen.'}</p>${v.resupplyDispatch.eligible?`<button id="resupplyAssign" class="primary">${v.resupplyDispatch.mandatory?'RE-SUPPLY-AUFTRAG STARTEN':'RE-SUPPLY ANFORDERN'}</button>`:`<p class="phase-note">AUFTRAG BLOCKIERT: ${esc(v.resupplyDispatch.reason||'UNBEKANNT')}</p>`}</section>`:'';
  const evac=v.event.evacState==='STARTED'?`<section class="card evac"><small class="card-kicker">EVAC // ACTIVE</small><h3>EVAKUIERUNG LÄUFT</h3><p>Normale Aktionen sind gesperrt. Folge ausschließlich deinem EVAC-Team und dem Last Secure Upload Point.</p><p class="phase-note">Nur bestätigte EVAC-Scans werden akzeptiert.</p><button id="evacPioneerOpen" class="primary">EVAC-AUFTRAG ÖFFNEN</button><div id="evacPioneerWork"></div></section>`:'';
  return `<section class="card pioneer-inventory"><div class="pioneer-inventory-head"><span>N-CORE INVENTAR</span><strong>${v.inventory.energy} E</strong></div><div class="pioneer-capacity">${v.inventory.used} / ${v.inventory.capacity} SLOTS BELEGT</div><div class="slots pioneer-slots">${renderSlots(v)}</div></section>${protect}${transit}${renderMission(v)}${dispatch}${supply}${v.event.evacState==='STARTED'?evac:`<section class="card" id="exchangeCard"><small class="card-kicker">NODE // EXCHANGE</small><h3>NODE-KONTAKT</h3><p>Erst Node scannen. Der Server bestimmt danach, welcher Tausch möglich ist.</p><button id="exchangeStart" class="primary">NODE SCANNEN</button><div id="exchangeWork"></div></section><section class="card" id="hqCard"><small class="card-kicker">HQ // SECURE UPLOAD</small><h3>UPLOAD ANMELDUNG</h3><div class="metrics"><div class="metric"><small>GESICHERTE ENERGIE</small><b>${v.securedEnergy} E</b></div><div class="metric"><small>FREIE PUNKTE</small><b>${v.hq.available}/${v.hq.total}</b></div></div><button id="hqOpen" class="primary" ${v.inventory.cores.some(c=>c.status==='FIELD')?'':'disabled title="Kein persönlicher N-Core für Upload vorhanden"'}>HQ-ZUGANG ÖFFNEN</button><div id="hqWork"></div></section>`}`;
}
function renderCatcher(v){
  if(v.event?.state!=='FIELD_ACTIVE')return eventActionBlocked(v);
  const role=v.actor.role;
  const evac=v.event.evacState==='STARTED';
  return `<section class="card"><small class="card-kicker">${role} // ACCESS</small><h3>${evac?'CATCH GESPERRT':'PIONEER FINDEN'}</h3><p>${evac?'Während EVAC sind normale Catch-Aktionen eingefroren.':'Der Pioneer hält seine Access Card an dein Smartphone. Schutz, Ziel-Core und Kapazität prüft ausschließlich der Server.'}</p><div class="metrics"><div class="metric"><small>INVENTAR</small><b>${v.inventory.used}/${v.inventory.capacity}</b></div><div class="metric"><small>GESICHERTE ENERGIE</small><b>${esc(v.securedEnergy??0)} E</b></div></div><div class="slots">${(v.inventory.cores||[]).filter(c=>c.status==='FIELD').map((c,i)=>`<div class="slot"><small>SLOT 0${i+1}</small><b>${esc(c.energy)} E</b></div>`).join('')||'<p class="phase-note">NOCH KEIN N-CORE ERBEUTET</p>'}</div><button id="catchScan" class="primary" ${evac?'disabled':''}>PIONEER-KARTE SCANNEN</button><button id="catchConfirm" hidden>CATCH BESTÄTIGEN</button><div id="catchOut" class="feedback"></div></section>${evac?"":`<section class="card"><h3>${role==="LOCAL"?"HQ UPLOAD":"FOP ÜBERGABE"}</h3><p>${role==="LOCAL"?"HQ-Tag scannen, um den N-Core zu sichern.":"Alle getragenen N-Cores werden vollständig an den FOP übergeben."}</p><div class="slots">${(v.inventory.cores||[]).filter(c=>c.status==="FIELD").map((c,i)=>`<div class="slot"><small>ÜBERGABE ${i+1}</small><b>${esc(c.energy)} E</b></div>`).join("")||"<p class=\"phase-note\">KEINE N-CORES VORHANDEN</p>"}</div><div class="metric"><small>${role==="LOCAL"?"ZU SICHERN":"GESAMTE ÜBERGABE"}</small><b>${(v.inventory.cores||[]).filter(c=>c.status==="FIELD").reduce((sum,c)=>sum+Number(c.energy||0),0)} E</b></div><button id="custodyAction" class="primary" ${v.inventory.used===0?"disabled":""}>${role==="LOCAL"?"HQ-TAG SCANNEN":"FOP-KARTE SCANNEN"}</button><div id="custodyOut" class="feedback"></div></section>`}`;
}
function renderFop(v){
  if(v.event?.state!=='FIELD_ACTIVE')return eventActionBlocked(v);
  const evac=v.evacVisible?`<section class="card evac"><small class="card-kicker">FOUNDER // EVAC DIRECTIVE</small><h3>EVAKUIERUNG AKTIV</h3><p>Die EVAC-Steuerung ist jetzt sichtbar. Normale FOP-Node-Aktionen bleiben gesperrt.</p><button id="evacFopOpen" class="primary">EVAC-TEAM ÖFFNEN</button><div id="evacFopWork"></div></section>`:'';
  return `<section class="card"><small class="card-kicker">FIELD OPERATOR // NODE OPS</small><h3>EINSATZTERMINAL</h3><div class="metrics"><div class="metric"><small>INSTALLIERT</small><b>${v.nodes.installed}</b></div><div class="metric"><small>VERFÜGBAR</small><b>${v.nodes.available}</b></div></div><p>Node scannen. Der Server entscheidet Installation oder Deinstallation.</p><button id="fopNodeScan" class="primary" ${v.evacVisible?'disabled':''}>NODE SCANNEN</button><div id="fopWork"></div><h3>N-CORE TRANSPORT</h3><p>Aktuell transportierte N-Cores. Rückgabe nur am HQ.</p><div id="fopCustodyWork" class="feedback" role="status">Transportinventar wird geladen …</div><button id="fopCustodyOpen">INVENTAR AKTUALISIEREN</button></section>${evac}`;
}
function founderHardwareRows(v){
  const h=v.hardware||{cards:[],nodes:[],cores:[],hq:[]};
  const tail=uid=>String(uid||'').slice(-6);
  const rows=[
    ...h.cards.map(x=>`<div class="hardware-row"><span>${esc(ROLE_LABEL[x.role]||x.role)}</span><strong>${esc(x.id)}</strong><small>UID …${esc(tail(x.uid))}</small></div>`),
    ...h.nodes.map(x=>`<div class="hardware-row"><span>NODE</span><strong>${esc(x.id)}</strong><small>UID …${esc(tail(x.uid))}</small></div>`),
    ...h.cores.map(x=>`<div class="hardware-row"><span>N-CORE</span><strong>${esc(x.id)} · ${x.energy} E</strong><small>UID …${esc(tail(x.uid))}</small></div>`),
    ...h.hq.map(x=>`<div class="hardware-row"><span>HQ</span><strong>${esc(x.id)}</strong><small>UID …${esc(tail(x.uid))}</small></div>`)
  ];
  return rows.length?rows.join(''):'<p class="empty-state">Noch keine zusätzliche Hardware registriert.</p>';
}
function renderFounder(v){
  const counts=Object.fromEntries((v.overview.roles||[]).map(x=>[x.role,x.count]));
  const nodes=Object.fromEntries((v.overview.nodes||[]).map(x=>[x.state,x.count]));
  const canEvac=v.allowedActions.includes('EVAC_START');
  const canComplete=v.allowedActions.includes('EVAC_COMPLETE');
  const rt=v.realtest;
  const dt=v.desktopTest;
  const es=v.evacSupport;
  const blocker=x=>x.startsWith('CARD_REQUIRED:')?`Access Card fehlt: ${x.split(':')[1]}`:x.startsWith('NODE_REQUIRED:')?`Node-Tag fehlt: ${x.split(':')[1]}`:x==='HQ_REQUIRED'?'HQ-Uploadpunkt noch nicht registriert':x==='TWELVE_CORES_REQUIRED'?'Mindestens 12 reale N-Cores mit E-Wert registrieren':x==='FRESH_EVENT_REQUIRED'?'Testbestand enthält bereits Spielaktionen':x==='SECURE_APPROACH_150E_NOT_POSSIBLE'?'Für den Secure-Approach-Test fehlt im FOP-Feldloadout ein tauschbarer Core mit mindestens 150 E':x;
  const hardwareVisible=dt?dt.canRegister:v.event.state==='READY';
  const hardware=hardwareVisible?`<section class="card founder-hardware"><small class="card-kicker">FOUNDER // HARDWARE</small><h3>REALEN TESTBESTAND EINRICHTEN</h3><p class="lead">Registriere nur Hardware, die wirklich auf dem Tisch liegt. NODIV erzeugt keine Spieler, UIDs, Cores oder Energie.</p><div class="founder-register"><label>1 · HARDWARETYP<select id="regKind"><option value="CARD">Access Card</option><option value="NODE">Node</option><option value="CORE">N-Core</option><option value="HQ">HQ-Uploadpunkt</option></select></label><div id="regTargetWrap"></div><label id="regEnergyWrap" hidden>3 · EINGRAVIERTER E-WERT<input id="regEnergy" inputmode="numeric" type="number" min="1" max="9999" placeholder="z. B. 341" /></label><button id="regScan" class="primary founder-scan">NFC-TAG SCANNEN</button><div id="regOut" class="feedback" role="status"></div></div><details class="hardware-list"><summary>REGISTRIERTEN BESTAND ANZEIGEN</summary><div class="hardware-rows">${founderHardwareRows(v)}</div></details></section>`:'';
  const realtest=rt?`<section class="card"><small class="card-kicker">BLOCK 06 // REALTEST</small><h3>${rt.eventState==='READY'?'VORBEREITUNG':rt.eventState==='INITIALIZED'?'STARTFREIGABE':'TESTBESTAND'}</h3><div class="founder-grid"><div class="metric"><small>TEST-ACCESS CARDS</small><b>${rt.counts.cards}/6</b></div><div class="metric"><small>NODES</small><b>${rt.counts.nodes}/4</b></div><div class="metric"><small>N-CORES</small><b>${rt.counts.cores}/12+</b></div><div class="metric"><small>HQ</small><b>${rt.counts.hq}/1</b></div></div><p>${rt.blockers?.length?rt.blockers.map(blocker).map(esc).join(' · '):'Alle erforderlichen Registrierungen sind serverseitig konsistent.'}</p><p class="phase-note"><b>Catch braucht keinen zweiten Pioneer.</b> Für Catch genügt 1 Pioneer + Local oder Unbound. Pioneer B wird in diesem vollständigen Test erst für den EVAC-Teamablauf benötigt.</p>${rt.plan?`<p class="phase-note">Pioneer A Start: ${rt.plan.p9003?.energy??'—'} E · Pioneer B Start: ${rt.plan.p9004?.energy??'—'} E · FOP Transit: ${rt.plan.fop?.length??0} Cores (${(rt.plan.fopEnergies||[]).join(' / ')} E) · HQ-Reserve bleibt erhalten.</p>`:''}${rt.canInitialize?'<button id="founderInitialize" class="primary">TESTEVENT VORBEREITEN</button>':''}${rt.canStart?'<button id="founderStart" class="primary">EVENT STARTEN</button>':''}<div id="realtestOut" class="feedback"></div></section>`:'';
  const desktop=dt?(()=>{
    const features=(dt.playable||[]).map(x=>`<div class="capability ${x.available?'on':'off'}"><span>${x.available?'●':'○'}</span><div><b>${esc(x.code.replaceAll('_',' '))}</b><small>${esc(x.detail)}</small></div></div>`).join('');
    const roles=dt.counts?.roles||{};
    const assignedP=(dt.plan?.pioneerAssignments||[]).length,assignedF=(dt.plan?.fopAssignments||[]).length;
    const ended=dt.ended?`<div class="test-ended"><b>TEST_ENDED</b><p>Vorzeitiger Testabschluss gespeichert. Kein regulärer EVAC-Abschluss wurde erzeugt.</p>${dt.endSnapshot?`<small>Ausgangszustand: ${esc(dt.endSnapshot.stateBefore||'—')} · Operationstypen: ${(dt.endSnapshot.operations||[]).length} · Missionstypen: ${(dt.endSnapshot.missions||[]).length}</small>`:''}</div>`:'';
    const prepare=dt.eventState==='READY'?'<button id="founderDesktopInitialize" class="primary">TESTSPIEL VORBEREITEN</button>':'';
    const start=dt.eventState==='INITIALIZED'?'<button id="founderDesktopStart" class="primary">TESTSPIEL STARTEN</button>':'';
    const end=['INITIALIZED','FIELD_ACTIVE'].includes(dt.eventState)?'<button id="founderDesktopEnd" class="danger">TESTSPIEL BEENDEN</button>':'';
    return `<section class="card desktop-test"><small class="card-kicker">TESTMODUS // SCHREIBTISCHBETRIEB</small><h3>${esc(dt.eventState)}</h3><div class="founder-grid"><div class="metric"><small>ACCESS CARDS</small><b>${dt.counts.cards}</b></div><div class="metric"><small>NODES</small><b>${dt.counts.nodes}</b></div><div class="metric"><small>N-CORES</small><b>${dt.counts.cores}</b></div><div class="metric"><small>HQ</small><b>${dt.counts.hq}</b></div></div><p class="phase-note">Pioneer ${roles.PIONEER||0} · FOP ${roles.FOP||0} · Local ${roles.LOCAL||0} · Unbound ${roles.UNBOUND||0}. Beim Vorbereiten werden höchstens ${assignedP} reale Pioneer-Start-Cores und ${assignedF}/3 reale FOP-Transit-Cores gebunden.</p><h4>MIT DIESEM BESTAND SPIELBAR</h4><div class="capability-list">${features}</div>${prepare}${start}${end}<div id="desktopTestOut" class="feedback"></div>${ended}</section>`;
  })():'';
  const evacSupport=es?`<section class="card evac"><small class="card-kicker">BLOCK 06 // EVAC SUPPORT</small><h3>${es.done?'SUPPORT VOLLSTÄNDIG':es.ready?'REALES TEAM BESTÄTIGT':'REALES TEAM ZUERST'}</h3><div class="founder-grid"><div class="metric"><small>REAL RECOVERY</small><b>${es.physicalRecoveries}/2</b></div><div class="metric"><small>REAL FINAL</small><b>${es.physicalUploads}/2</b></div><div class="metric"><small>GESAMT RECOVERY</small><b>${es.totalRecoveries}/10</b></div><div class="metric"><small>GESAMT FINAL</small><b>${es.totalUploads}/10</b></div></div><p>${es.done?'Alle fünf Teams haben die regulären EVAC-Runtime-Regeln erfüllt. Founder-Abschluss ist der nächste Schritt.':es.ready?'Das reale Team ist vollständig. Die vier nicht-physischen Support-Teams dürfen jetzt über denselben EVAC-Kern abgearbeitet werden.':'FOP + Pioneer A + Pioneer B müssen zuerst NODE-001/002 und beide Final Uploads real per NFC abschließen.'}</p>${es.ready?'<button id="founderEvacSupport" class="primary">SUPPORT-TEAMS DURCHLAUFEN</button>':''}<div id="evacSupportOut" class="feedback"></div></section>`:'';
  return `${hardware}${desktop}${realtest}${evacSupport}<section class="card"><small class="card-kicker">FOUNDER // ROOT AUTHORITY</small><h3>EVENTSTATUS</h3><strong class="big">${esc(v.event.state)}</strong><div class="founder-grid"><div class="metric"><small>NODES INSTALLIERT</small><b>${nodes.INSTALLED||0}</b></div><div class="metric"><small>PIONEER</small><b>${counts.PIONEER||0}</b></div><div class="metric"><small>FOP</small><b>${counts.FOP||0}</b></div><div class="metric"><small>LOCAL / UNBOUND</small><b>${(counts.LOCAL||0)+(counts.UNBOUND||0)}</b></div></div></section>${canEvac?`<section class="card evac"><small class="card-kicker">EVACUATION READY</small><h3>FOUNDER-FREIGABE VERFÜGBAR</h3><p>Diese Aktion startet die bestehende EVAC-Mechanik. Der TESTMODUS schwächt keine EVAC-Regel ab.</p><button id="founderEvacStart" class="danger">EVAKUIERUNG STARTEN</button><div id="founderOut" class="feedback"></div></section>`:''}${canComplete?`<section class="card evac"><small class="card-kicker">EVACUATION COMPLETE</small><h3>REGULÄRER EVENTABSCHLUSS FREIGEGEBEN</h3><p>Alle erforderlichen EVAC-Nachweise sind serverseitig vollständig. Das ist ausdrücklich nicht derselbe Vorgang wie TESTSPIEL BEENDEN.</p><button id="founderEvacComplete" class="danger">EVENT REGULÄR ABSCHLIESSEN</button><div id="founderOut" class="feedback"></div></section>`:''}`;
}

function updateFounderRegFields(){
  const kind=$('regKind')?.value,wrap=$('regTargetWrap'),energy=$('regEnergyWrap');
  if(!kind||!wrap)return;
  const hw=view?.hardware||{cards:[],nodes:[],hq:[]};
  const desktop=!!view?.desktopTest;
  const cards=new Set((hw.cards||[]).map(x=>x.id)),nodes=new Set((hw.nodes||[]).map(x=>x.id)),hq=new Set((hw.hq||[]).map(x=>x.id));
  if(energy)energy.hidden=kind!=='CORE';
  if(kind==='CARD'){
    if(desktop){
      const targets=[['AUTO:FOP','Field Operator'],['AUTO:PIONEER','Pioneer'],['AUTO:LOCAL','Local'],['AUTO:UNBOUND','Unbound']];
      wrap.innerHTML=`<label>2 · ROLLE<select id="regTarget">${targets.map(([id,label])=>`<option value="${id}">${esc(label)}</option>`).join('')}</select></label><p class="field-help">NODIV vergibt die interne Kennung automatisch. Es gibt keine künstliche Mindestzahl an Spielern.</p>`;
    }else{
      const targets=[['FOP-TEST','FOP · Field Operator'],['P9003','Pioneer A · Exchange / Catch-Ziel'],['P9004','Pioneer B · EVAC-Partner (nicht für Catch nötig)'],['LOCAL-TEST','Local · Catch'],['UNBOUND-TEST','Unbound · Catch'],['AUTO:FOP','+ weitere FOP-Karte'],['AUTO:PIONEER','+ weitere Pioneer-Karte'],['AUTO:LOCAL','+ weitere Local-Karte'],['AUTO:UNBOUND','+ weitere Unbound-Karte']];
      wrap.innerHTML=`<label>2 · ROLLE / KARTE<select id="regTarget">${targets.map(([id,label])=>`<option value="${id}" ${cards.has(id)?'disabled':''}>${esc(label)}${cards.has(id)?' · registriert':''}</option>`).join('')}</select></label><p class="field-help">Founder ist bereits über den einmaligen Bootstrap gebunden. Zusätzliche Spieler-Karten sind nicht auf zwei Pioneer begrenzt.</p>`;
    }
  }else if(kind==='NODE'){
    wrap.innerHTML=desktop?'<div class="auto-target"><small>2 · NODE-KENNUNG</small><strong>WIRD AUTOMATISCH VERGEBEN</strong><span>Nächster freie NODE-xxx-Slot wird erst nach eindeutigem NFC-Scan belegt.</span></div>':`<label>2 · NODE<select id="regTarget">${Array.from({length:10},(_,i)=>`NODE-${String(i+1).padStart(3,'0')}`).map(id=>`<option value="${id}" ${nodes.has(id)?'disabled':''}>${id}${nodes.has(id)?' · registriert':''}</option>`).join('')}</select></label>`;
  }else if(kind==='CORE'){
    wrap.innerHTML='<div class="auto-target"><small>2 · KENNUNG</small><strong>WIRD AUTOMATISCH VERGEBEN</strong><span>Du erfasst nur UID und den tatsächlich eingravierten E-Wert.</span></div>';
  }else{
    wrap.innerHTML=`<div class="auto-target"><small>2 · UPLOADPUNKT</small><strong>HQ-01</strong><span>${hq.has('HQ-01')?'Bereits registriert':'Bereit für NFC-Registrierung'}</span></div>`;
  }
}

function bindRole(){
  $('exchangeStart')?.addEventListener('click',startExchange);
  $('missionStart')?.addEventListener('click',startMission);
  $('restoreAssign')?.addEventListener('click',assignRestoreMission);
  $('resupplyAssign')?.addEventListener('click',assignResupplyMission);
  $('hqOpen')?.addEventListener('click',openHq);
  $('catchScan')?.addEventListener('click',scanCatch);
  $('catchConfirm')?.addEventListener('click',confirmCatch);
  $('custodyAction')?.addEventListener('click',performCustodyAction);
  $('fopNodeScan')?.addEventListener('click',scanFopNode);
  $('fopCustodyOpen')?.addEventListener('click',openFopCustody);
  $('regScan')?.addEventListener('click',registerFounderHardware);
  if($('regKind')){updateFounderRegFields();$('regKind').addEventListener('change',updateFounderRegFields);}
  $('founderInitialize')?.addEventListener('click',initializeRealtest);
  $('founderStart')?.addEventListener('click',startRealtest);
  $('founderDesktopInitialize')?.addEventListener('click',initializeDesktopTest);
  $('founderDesktopStart')?.addEventListener('click',startDesktopTest);
  $('founderDesktopEnd')?.addEventListener('click',endDesktopTest);
  $('founderEvacStart')?.addEventListener('click',startFounderEvac);
  $('founderEvacSupport')?.addEventListener('click',runFounderEvacSupport);
  $('founderEvacComplete')?.addEventListener('click',completeFounderEvac);
  $('evacFopOpen')?.addEventListener('click',openFopEvac);
  $('evacPioneerOpen')?.addEventListener('click',openPioneerEvac);
}

const EXCHANGE_KEY='nodiv-v2-exchange-pending';
let nodeCooldownUntil=0;
let cooldownNodeId=null;
function showNodeCooldown(){
  const host=$('exchangeWork');
  if(!host||exchange?.exchangeId||!cooldownNodeId)return;
  const left=Math.max(0,Math.ceil(nodeCooldownUntil-Date.now()/1000));
  let display=host.querySelector('#nodeCooldownDisplay');
  if(!display){
    display=document.createElement('div');
    display.id='nodeCooldownDisplay';
    display.className='feedback';
    display.setAttribute('role','timer');
    host.replaceChildren(display);
  }
  const label=left>0?`${cooldownNodeId} // NODE-SPERRE AKTIV // ${fmt(left)} · Anderen Node scannen möglich.`:`${cooldownNodeId} // NODE WIEDER FREI · Zum Tauschen erneut scannen.`;
  if(display.textContent!==label)display.textContent=label;
  if(left===0){cooldownNodeId=null;nodeCooldownUntil=0;}
}
setInterval(showNodeCooldown,1000);
function showExchangeTimer(){
  const display=$('exchangeTime');
  if(!display||!exchange?.exchangeId)return;
  const expiry=Number(exchange.expiresAt||exchange.expires_at||0);
  if(!expiry){display.textContent='EXCHANGE AKTIV · Ablaufzeit wird vom Server geprüft.';return;}
  const left=Math.max(0,Math.ceil(expiry-Date.now()/1000));
  display.textContent=left?('EXCHANGE AKTIV // RESTZEIT '+fmt(left)): 'EXCHANGE-ZEIT ABGELAUFEN · STATUS PRÜFEN';
  if(left===0){
    const scan=$('exchangeCoreScan'),confirm=$('exchangeConfirm');
    if(scan)scan.disabled=true;
    if(confirm)confirm.disabled=true;
    let retry=$('exchangeStatusRetry');
    if(!retry){retry=document.createElement('button');retry.id='exchangeStatusRetry';retry.textContent='STATUS PRÜFEN';display.after(retry);retry.onclick=recoverExchange;}
  }
}
setInterval(showExchangeTimer,1000);
function exchangeControls(){
  const count=exchange.count;
  $('exchangeWork').innerHTML=`<div class="code"><span>ACCESS CODE</span><b>${esc(exchange.accessCode)}</b></div><p>Node ${esc(exchange.nodeId)} · Scanne ${count} eigene und ${count} Node-Cores.</p><div id="exchangeProgress" class="feedback">EIGEN ${exchange.inCount}/${count} · NODE ${exchange.outCount}/${count}</div><button id="exchangeCoreScan" class="primary" ${exchange.ready?'hidden':''}>N-CORE SCANNEN</button><button id="exchangeConfirm" class="primary" ${exchange.ready?'':'hidden'}>EXCHANGE BESTÄTIGEN</button><div id="exchangeTime" class="feedback"></div>`;
  $('exchangeCoreScan').onclick=scanExchangeCore;$('exchangeConfirm').onclick=confirmExchange;
  showExchangeTimer();
}
async function recoverExchange(){
  const raw=sessionStorage.getItem(EXCHANGE_KEY);if(!raw||!view||view.actor.role!=='PIONEER')return;
  try{
    const saved=JSON.parse(raw);if(saved.actorId!==view.actor.id)return;
    const s=await api('/api/exchange/status?exchangeId='+encodeURIComponent(saved.exchangeId));
    if(s.state!=='PREPARED'){sessionStorage.removeItem(EXCHANGE_KEY);phase(s.state==='CONFIRMED'?'success':'error',s.state==='CONFIRMED'?'Exchange bereits bestätigt.':'Exchange abgelaufen. Node erneut scannen.');return;}
    exchange={...saved,...s};exchangeControls();phase('success','Exchange vom Server wiederhergestellt.');
  }catch(e){phase('error','Exchange-Status nicht abrufbar: '+friendly(e));}
}
async function startExchange(){
  try{
    if(exchange?.exchangeId){phase('error','Exchange läuft bereits. Erst abschließen oder Ablauf abwarten.');return;}
    exchange=null;cooldownNodeId=null;nodeCooldownUntil=0;const uid=await nfc('NODE');
    phase('check','Node wird serverseitig geprüft.');
    const grant=await api('/api/scan',{method:'POST',data:{uid}});
    if(grant.cooldownUntil&&grant.cooldownUntil>Math.floor(Date.now()/1000)){nodeCooldownUntil=Number(grant.cooldownUntil);cooldownNodeId=grant.nodeId;showNodeCooldown();phase('error','Node-Sperre aktiv. Kein neuer Tausch möglich.');return;}
    const max=Math.min(3,view.inventory.used,view.actor.capacity);
    if(max<1)throw Error('PIONEER_CORE_REQUIRED');
    exchange={grantId:grant.grantId,nodeId:grant.nodeId,max};
    $('exchangeWork').innerHTML=`<div class="code"><span>NODE</span><b>${esc(grant.nodeId)}</b></div><label>TAUSCHGRÖSSE<select id="exchangeCount">${Array.from({length:max},(_,i)=>`<option value="${i+1}">${i+1} Core${i?'s':''}</option>`).join('')}</select></label><button id="exchangePrepare">TAUSCH AUTORISIEREN</button><div id="exchangeOut" class="feedback"></div>`;
    $('exchangePrepare').onclick=prepareExchange;phase('success','Node bestätigt. Tauschgröße wählen.');
  }catch(e){phase('error',friendly(e));}
}
async function prepareExchange(){
  try{
    const count=Number($('exchangeCount').value);phase('check','Tausch wird vom Server vorbereitet.');
    const r=await api('/api/exchange/prepare',{method:'POST',data:{grantId:exchange.grantId,count}});
    exchange={...exchange,...r,inCount:0,outCount:0};
    sessionStorage.setItem(EXCHANGE_KEY,JSON.stringify({...exchange,actorId:view.actor.id}));
    exchangeControls();
    $('exchangeCoreScan').onclick=scanExchangeCore;$('exchangeConfirm').onclick=confirmExchange;phase('success','Autorisierung erteilt. Core-Scans können beginnen.');
  }catch(e){phase('error',friendly(e));}
}
async function scanExchangeCore(){
  try{
    const uid=await nfc('N-CORE');phase('check','Core wird gegen Besitz und Node-Zustand geprüft.');
    const r=await api('/api/scan',{method:'POST',data:{uid,exchangeId:exchange.exchangeId}});
    exchange.inCount=r.inCount;exchange.outCount=r.outCount;exchange.ready=r.ready;
    sessionStorage.setItem(EXCHANGE_KEY,JSON.stringify({...exchange,actorId:view.actor.id}));
    $('exchangeProgress').textContent=`EIGEN ${r.inCount}/${r.count} · NODE ${r.outCount}/${r.count} // ${r.visibleEnergy} E bestätigt`;
    if(r.ready){$('exchangeCoreScan').hidden=true;$('exchangeConfirm').hidden=false;phase('success','Alle Scans bestätigt. Noch keine Umbuchung erfolgt.');}
    else phase('success','Scan bestätigt. Nächsten Core scannen.');
  }catch(e){phase('error',friendly(e));}
}
async function confirmExchange(){
  try{phase('commit','Exchange wird atomar gebucht.');const r=await api('/api/exchange/confirm',{method:'POST',data:{exchangeId:exchange.exchangeId,accessCode:exchange.accessCode}});exchange=null;sessionStorage.removeItem(EXCHANGE_KEY);cooldownNodeId=null;nodeCooldownUntil=0;phase('success','Exchange abgeschlossen. Dieser Node ist gesperrt. Andere Nodes bleiben zugänglich.');await refreshRole({quiet:true});}
  catch(e){phase('error',friendly(e));}
}

const MISSION_STEPS=[['nodeUid','MISSION_NODE','ZIEL-NODE','Ziel-Node scannen'],['cargoUid','MISSION_CARGO','TRANSIT-CORE','Transit-Core scannen'],['outUid','MISSION_OUT_CORE','NIEDRIGSTEN NODE-CORE','Schwächsten Node-Core scannen']];
async function startMission(){
  if(!missionFlow)missionFlow={nodeUid:'',cargoUid:'',outUid:'',step:0,lowestCoreEnergy:null};
  const host=$('missionProgress');
  if(!host)return;
  const step=missionFlow.step;
  if(step>=MISSION_STEPS.length)return;
  const [key,expected,label]=MISSION_STEPS[step];
  try{
    const uid=await nfc(label);
    phase('check',`${label} wird geprüft.`);
    const r=await api('/api/mission/check',{method:'POST',data:{uid,missionId:view?.mission?.id||view?.mission?.missionId}});
    if(r.kind!==expected)throw Error('MISSION_SCAN_MISMATCH');
    missionFlow[key]=uid;if(expected==='MISSION_NODE')missionFlow.lowestCoreEnergy=r.lowestCoreEnergy;missionFlow.step=step+1;
    const next=MISSION_STEPS[missionFlow.step];
    const nextInstruction=next?.[1]==='MISSION_OUT_CORE'&&Number.isFinite(missionFlow.lowestCoreEnergy)?`N-Core mit ${missionFlow.lowestCoreEnergy} E aus dem Ziel-Node entnehmen und scannen`:next?.[3];
    host.innerHTML=`${expected==='MISSION_NODE'?`<div class="code"><span>NODE ÖFFNUNGSCODE</span><b>${esc(r.accessCode)}</b></div><p>Node öffnen, dann Transit-Core und Node-Core gemäß Auftrag tauschen.</p>`:''}<p class="phase-note">${step+1}/3 bestätigt: ${label} erkannt.</p>${next?`<p>Nächster Schritt: ${nextInstruction}.</p><button id="missionNext" class="primary">${nextInstruction.toUpperCase()}</button>`:'<p>Alle drei Scans bestätigt. Noch keine Buchung erfolgt.</p><button id="missionConfirm" class="primary">RESTORE VERBINDLICH ABSCHLIESSEN</button>'}`;
    if(next)$('missionNext').onclick=startMission;else $('missionConfirm').onclick=confirmMission;
    phase('success',next?`Scan bestätigt. ${nextInstruction}.`:'Alle Scans bestätigt. RESTORE kann abgeschlossen werden.');
  }catch(e){
    phase('error',friendly(e));
    host.innerHTML=`<p class="phase-note">Scan nicht abgeschlossen. Du kannst diesen Schritt erneut versuchen.</p><button id="missionRetry" class="primary">${MISSION_STEPS[missionFlow.step][3].toUpperCase()}</button>`;
    $('missionRetry').onclick=startMission;
  }
}

async function confirmMission(){
  try{phase('commit','Auftrag wird atomar gebucht.');const r=await api('/api/mission/confirm',{method:'POST',data:{...missionFlow,missionId:view?.mission?.id||view?.mission?.missionId,operationId:op('MISSION')}});phase('success',`${r.kind||view.mission.kind} abgeschlossen.`);missionFlow=null;await refreshRole({quiet:true});}
  catch(e){phase('error',friendly(e));}
}

async function performCustodyAction(){
 const button=$('custodyAction'); if(!button||button.disabled)return; button.disabled=true;
 try{
  const local=view.actor.role==='LOCAL';
  const carried=view.inventory.cores.filter(c=>c.status==='FIELD');
  if(local&&carried.length!==1)throw Error('LOCAL_CORE_REQUIRED');
  const uid=await nfc(local?'HQ UPLOAD-TAG':'FOP ACCESS CARD');
  const key='nodiv-custody-'+view.actor.id;
  let operationId=sessionStorage.getItem(key);
  if(!operationId){operationId=op(local?'LOCAL-UPLOAD':'UNBOUND-HANDOVER');sessionStorage.setItem(key,operationId);}
  await api(local?'/api/local/hq/upload':'/api/unbound/fop/handover',{method:'POST',data:{uid,operationId,...(local?{coreId:carried[0].id}:{})}});
  sessionStorage.removeItem(key);
  setFeedback('custodyOut',local?'N-Core am HQ gesichert.':'Übergabe bestätigt: '+carried.map(c=>c.energy+' E').join(' + ')+' = '+carried.reduce((n,c)=>n+Number(c.energy||0),0)+' E.');
  await refreshRole({quiet:true});
 }catch(e){setFeedback('custodyOut',friendly(e),true);button.disabled=false;}
}
async function scanCatch(){
  try{
    catchPreview='';const uid=await nfc('PIONEER ACCESS CARD');phase('check','Ziel, Schutz und Catch-Core werden geprüft.');
    const r=await api('/api/catch/preview',{method:'POST',data:{uid}});catchPreview=r.previewId;
    setFeedback('catchOut','Catch ist zulässig. Server hat den Ziel-Core reserviert.');
    $('catchConfirm').hidden=false;phase('success','Catch freigegeben. Noch keine Umbuchung erfolgt.');
  }catch(e){setFeedback('catchOut',friendly(e),true);phase('error',friendly(e));}
}
async function confirmCatch(){
  try{phase('commit','Catch wird atomar gebucht.');const r=await api('/api/catch/confirm',{method:'POST',data:{previewId:catchPreview}});setFeedback('catchOut',`Catch bestätigt // ${r.core.energy} E übernommen.`);$('catchConfirm').hidden=true;phase('success','Catch abgeschlossen.');await refreshRole({quiet:true});}
  catch(e){phase('error',friendly(e));}
}

function closeHq(){hqPanelOpen=false;hqFlow=null;const host=$('hqWork');if(host)host.innerHTML='<p class="phase-note">HQ-Zugang geschlossen. Bei Bedarf erneut öffnen.</p>';phase('idle','HQ-Zugang geschlossen.');}
function hqHtml(hq){
  const points=(hq.points||[]).map(p=>`<div class="hq-point" data-state="${p.state}"><span>${esc(p.bayId)}</span><b>${p.state}</b></div>`).join('');
  const own=(hq.points||[]).some(p=>p.ownReservation);
  return `<div class="hq-state">${points||'<div class="hq-point">KEINE PUNKTE</div>'}</div><p>${own?'Dein Uploadpunkt ist reserviert. Scanne jetzt die reale HQ-NFC-Fläche.':'Normaler Upload ist kostenlos. Secure Approach kostet 150 E und reserviert 05:00 inklusive Catch-Schutz.'}</p><button id="hqSecure" class="secondary" ${hq.available<1||Number(view.securedEnergy??0)<150||own||!view.inventory.cores.some(c=>c.status==='FIELD')?'disabled':''}>SECURE APPROACH // 150 E</button><button id="hqScanBay" class="primary">UPLOADPUNKT NFC SCANNEN</button><button id="hqClose" class="secondary">SCHLIESSEN</button><div id="hqOut" class="feedback"></div>`;
}
async function openHq(){
  if(!view?.inventory?.cores?.some(c=>c.status==='FIELD')){phase('error','Kein persönlicher N-Core für einen HQ-Upload vorhanden.');return;}
  hqPanelOpen=true;
  try{phase('check','HQ-Status wird vom Server geladen.');const hq=await api('/api/hq/state');view.hq=hq;$('hqWork').innerHTML=hqHtml(hq);$('hqSecure').onclick=activateSecure;$('hqScanBay').onclick=claimHq;$('hqClose').onclick=closeHq;phase('success','HQ-Status aktuell.');}
  catch(e){phase('error',friendly(e));}
}
async function activateSecure(){
  if(!view?.inventory?.cores?.some(c=>c.status==='FIELD')||Number(view.securedEnergy??0)<150||Number(view.hq?.available??0)<1){phase('error','Secure Approach derzeit nicht verfügbar.');return;}
  const key='nodiv-v2-secure-request';
  try{
    let requestId=sessionStorage.getItem(key);if(!requestId){requestId='REQ-'+crypto.randomUUID();sessionStorage.setItem(key,requestId);}
    phase('commit','150 E, Schutz und Reservierung werden gemeinsam gebucht.');
    const r=await api('/api/hq/secure',{method:'POST',data:{requestId}});
    sessionStorage.removeItem(key);phase('success',`Secure Approach aktiv // ${fmt(r.expiresAt-view.serverNow)}.`);await refreshRole({quiet:true});await openHq();
  }catch(e){phase('error',friendly(e));}
}
async function claimHq(){
  const claimKey='nodiv-v2-hq-claim-op';
  try{
    const uid=await nfc('HQ UPLOADPUNKT');phase('check','Uploadpunkt wird serverseitig geprüft.');
    let operationId=sessionStorage.getItem(claimKey);if(!operationId){operationId=op('CLAIM');sessionStorage.setItem(claimKey,operationId);}
    const r=await api('/api/hq/claim',{method:'POST',data:{uid,operationId}});sessionStorage.removeItem(claimKey);
    hqFlow={orderId:r.orderId,bayId:r.bayId};await refreshRole({quiet:true});
    const choices=view.inventory.cores.filter(c=>c.status==='FIELD');
    $('hqWork').innerHTML=`<p class="phase-note">${esc(r.bayId)} bestätigt. Wähle 1–3 persönliche N-Cores.</p><div class="choice-list">${choices.map(c=>`<label class="choice"><input type="checkbox" name="hqCore" value="${esc(c.id)}"><span>N-CORE</span><b>${c.energy} E</b></label>`).join('')}</div><p id="hqUploadWarning"></p><button id="hqAuthorize" class="primary">AUSWAHL SERVERSEITIG PRÜFEN</button><div id="hqOut" class="feedback"></div>`;
    document.querySelectorAll('input[name="hqCore"]').forEach(x=>x.onchange=()=>{const n=document.querySelectorAll('input[name="hqCore"]:checked').length;document.querySelectorAll('input[name="hqCore"]:not(:checked)').forEach(y=>y.disabled=n>=3);$('hqUploadWarning').textContent=n===3&&view.actor.capacity===3?'VOLL-UPLOAD // RE-SUPPLY wird im selben Commit zwingend gesichert.':'';});
    $('hqAuthorize').onclick=authorizeHq;phase('success','Uploadpunkt bestätigt. Auswahl treffen.');
  }catch(e){phase('error',friendly(e));}
}
async function authorizeHq(){
  try{
    const coreIds=[...document.querySelectorAll('input[name="hqCore"]:checked')].map(x=>x.value);if(!coreIds.length)throw Error('HQ_UPLOAD_SELECTION_INVALID');
    phase('check','Auswahl und Energie werden aus SQLite geprüft.');const r=await api('/api/hq/authorize',{method:'POST',data:{orderId:hqFlow.orderId,coreIds}});
    hqFlow.coreIds=coreIds;setFeedback('hqOut',`${coreIds.length} Core(s) bestätigt // ${r.energy} E serverseitig ermittelt.`);
    $('hqAuthorize').outerHTML='<button id="hqConfirm" class="primary">UPLOAD VERBINDLICH BESTÄTIGEN</button>';$('hqConfirm').onclick=confirmHq;phase('success','Auswahl bestätigt. Noch keine Energie gebucht.');
  }catch(e){phase('error',friendly(e));}
}
async function confirmHq(){
  const key='nodiv-v2-hq-upload-op';
  try{
    let operationId=sessionStorage.getItem(key);if(!operationId){operationId=op('UPLOAD');sessionStorage.setItem(key,operationId);}
    phase('commit','Core-Besitz, Energie und ggf. RE-SUPPLY werden gemeinsam gebucht.');
    const r=await api('/api/hq/confirm',{method:'POST',data:{orderId:hqFlow.orderId,operationId}});
    sessionStorage.removeItem(key);hqFlow=null;hqPanelOpen=false;
    phase('success',r.mandatoryResupply?`Upload gesichert // ${r.energyCredit} E. RE-SUPPLY ist verbindlich zugewiesen.`:`Upload gesichert // ${r.energyCredit} E.`);
    await refreshRole({quiet:true});
  }catch(e){phase('error',friendly(e));}
}

async function openFopCustody(){
  const out=$('fopCustodyWork');
  if(!out)return;
  try {
    const result=await api('/api/fop/custody');
    const cores=result.cores||[];
    if(!out.isConnected)return;
    const total=cores.reduce((sum,c)=>sum+Number(c.visible_energy||0),0);
    out.className='custody-panel';
    out.replaceChildren();
    const header=document.createElement('div');
    header.className='custody-summary';
    const count=document.createElement('div');
    count.innerHTML='<small>N-CORES IM TRANSPORT</small><b></b>';
    count.querySelector('b').textContent=String(cores.length);
    const energy=document.createElement('div');
    energy.innerHTML='<small>TRANSPORTENERGIE</small><b></b>';
    energy.querySelector('b').textContent=total+' E';
    header.append(count,energy);
    out.append(header);
    if(!cores.length){
      const empty=document.createElement('p');
      empty.className='custody-empty';
      empty.textContent='TRANSPORT LEER · KEINE RÜCKGABE ERFORDERLICH';
      out.append(empty);
      return;
    }
    const slots=document.createElement('div');
    slots.className='custody-slots';
    cores.forEach((core,index)=>{
      const slot=document.createElement('div');
      slot.className='custody-slot';
      const label=document.createElement('small');
      label.textContent='N-CORE '+String(index+1).padStart(2,'0');
      const value=document.createElement('strong');
      value.textContent=core.visible_energy+' E';
      slot.append(label,value);
      slots.append(slot);
    });
    out.append(slots);
    const button=document.createElement('button');
    button.className='primary';
    button.textContent='AM HQ ZURÜCKGEBEN';
    button.onclick=()=>returnFopCustody(cores.map(c=>c.core_id));
    out.append(button);
  } catch(e){
    if(out.isConnected){out.className='feedback error';out.textContent=friendly(e);}
  }
}
async function returnFopCustody(coreIds){
  try {
    const uid=await nfc('HQ UPLOAD-TAG');
    const key='nodiv-fop-return-'+view.actor.id;
    let operationId=sessionStorage.getItem(key);
    if(!operationId){operationId=op('FOP-RETURN');sessionStorage.setItem(key,operationId);}
    await api('/api/fop/custody/return',{method:'POST',data:{uid,operationId,coreIds}});
    sessionStorage.removeItem(key);
    await openFopCustody();
    phase('success','N-Cores am HQ zurückgegeben.');
  } catch(e){setFeedback('fopCustodyWork',friendly(e),true);phase('error',friendly(e));}
}

async function scanFopNode(){
  try{
    fopFlow={coreUids:[]};const uid=await nfc('NODE');phase('check','Node und zulässige FOP-Aktion werden geprüft.');
    const r=await api('/api/fop/scan',{method:'POST',data:{uid}});fopFlow={...fopFlow,nodeId:r.nodeId,action:r.action,mechanicalCode:r.mechanicalCode};
    if(r.action==='DEINSTALL'){
      $('fopWork').innerHTML=`<div class="code"><span>NODE</span><b>${esc(r.nodeId)}</b></div><div class="code"><span>SCHLOSS AUF PRIMARY EINSTELLEN</span><b>${esc(r.mechanicalCode)}</b></div><p>Server bestätigt: 3/3-Node. Deinstallation führt alle drei Cores zurück zur Reserve.</p><button id="fopCommit" class="primary">DEINSTALLATION BESTÄTIGEN</button>`;
      $('fopCommit').onclick=commitFop;phase('success','Deinstallation zulässig. Noch keine Umbuchung.');
    }else{
      const energies=(r.transit||[]).map(x=>x.visible_energy+' E').join(' · ');
      if(r.canRequestLoadout){
        $('fopWork').innerHTML=`<div class="code"><span>NODE</span><b>${esc(r.nodeId)}</b></div><p>Für diesen weiteren Node wird ein neues serverseitiges FOP-Loadout benötigt.</p><button id="fopLoadout" class="primary">3-CORE-LOADOUT ABRUFEN</button><div id="fopProgress" class="feedback"></div>`;
        $('fopLoadout').onclick=requestFopLoadout;phase('success','Node frei. Loadout kann aus der HQ-Reserve zugewiesen werden.');
      }else{
        $('fopWork').innerHTML=`<div class="code"><span>NODE</span><b>${esc(r.nodeId)}</b></div><p>Nach bestätigter Installation wird der feste Schloss-Code ausgegeben. Zuerst exakt drei zugewiesene Transit-Cores scannen.</p><p class="phase-note">LOADOUT // ${esc(energies||'3 zugewiesene Cores')}</p><div id="fopProgress" class="feedback">0/3 bestätigt</div><button id="fopCoreScan" class="primary">N-CORE SCANNEN</button><button id="fopCommit" hidden>INSTALLATION BESTÄTIGEN</button>`;
        $('fopCoreScan').onclick=scanFopCore;$('fopCommit').onclick=commitFop;phase('success','Installation zulässig. Loadout scannen.');
      }
    }
  }catch(e){phase('error',friendly(e));}
}
async function requestFopLoadout(){
  try{
    phase('commit','Drei freie HQ-Cores werden serverseitig als FOP-Transit gebunden.');
    const r=await api('/api/fop/loadout',{method:'POST',data:{nodeId:fopFlow.nodeId}});
    const energies=(r.transit||[]).map(x=>x.visible_energy+' E').join(' · ');
    $('fopWork').innerHTML=`<div class="code"><span>NODE</span><b>${esc(fopFlow.nodeId)}</b></div><p>Der feste Schloss-Code erscheint nach bestätigter Installation.</p><p class="phase-note">NEUES LOADOUT // ${esc(energies)}</p><div id="fopProgress" class="feedback">0/3 bestätigt</div><button id="fopCoreScan" class="primary">N-CORE SCANNEN</button><button id="fopCommit" hidden>INSTALLATION BESTÄTIGEN</button>`;
    $('fopCoreScan').onclick=scanFopCore;$('fopCommit').onclick=commitFop;phase('success','Loadout zugewiesen. Genau diese drei Cores scannen.');
  }catch(e){phase('error',friendly(e));}
}
async function scanFopCore(){
  try{
    const uid=await nfc('FOP TRANSIT-CORE');phase('check','Core wird gegen das FOP-Loadout geprüft.');
    const r=await api('/api/fop/core/check',{method:'POST',data:{uid}});
    if(fopFlow.coreUids.includes(uid))throw Error('DUPLICATE_CORE');
    fopFlow.coreUids.push(uid);$('fopProgress').textContent=`${fopFlow.coreUids.length}/3 bestätigt // zuletzt ${r.energy} E`;
    if(fopFlow.coreUids.length===3){$('fopCoreScan').hidden=true;$('fopCommit').hidden=false;phase('success','3/3 Cores bestätigt. Noch keine Installation gebucht.');}
    else phase('success','Core bestätigt. Nächsten Core scannen.');
  }catch(e){phase('error',friendly(e));}
}
async function commitFop(){
  try{
    phase('commit',`${fopFlow.action} wird atomar gebucht.`);
    const path=fopFlow.action==='INSTALL'?'/api/fop/install':'/api/fop/deinstall';
    const data=fopFlow.action==='INSTALL'?{nodeId:fopFlow.nodeId,coreUids:fopFlow.coreUids,operationId:op('FOP-IN')}:{nodeId:fopFlow.nodeId,operationId:op('FOP-OUT')};
    const result=await api(path,{method:'POST',data});const installed=fopFlow.action==='INSTALL';const nodeId=fopFlow.nodeId;fopFlow=null;await refreshRole({quiet:true});if(installed){$('fopWork').innerHTML=`<div class="code"><span>${esc(nodeId)} // PRIMARY SCHLOSS-CODE</span><b>${esc(result.mechanicalCode)}</b></div><p>Installation bestätigt. Diesen festen Code am Node einstellen.</p>`;}phase('success',`${installed?'INSTALLATION':'DEINSTALLATION'} abgeschlossen.`);
  }catch(e){phase('error',friendly(e));}
}
async function openFopEvac(){
  try{
    phase('check','EVAC-Teamstatus wird geprüft.');const e=await api('/api/evac/state');evacFlow={state:e};
    const host=$('evacFopWork');if(!host)return;
    if(!e.team){
      host.innerHTML='<p>Zwei Pioneer Access Cards scannen. Danach weist der Server dem Team zwei freie EVAC-Nodes zu.</p><button id="evacTeamScan" class="primary">2 PIONEER-KARTEN SCANNEN</button>';
      $('evacTeamScan').onclick=createEvacTeam;phase('success','EVAC bereit. Team noch nicht gebildet.');return;
    }
    const pending=(e.assignments||[]).find(a=>!a.recovered);
    if(!pending){host.innerHTML='<p class="phase-note">Beide Team-Nodes geborgen. Pioneer führen jetzt den Last Secure Upload aus.</p>';phase('success','Team-Recovery abgeschlossen.');return;}
    const cargoHint=(pending.coreEnergies||[]).length?`<br>Erwartete reale Core-Werte: <b>${pending.coreEnergies.map(x=>esc(x+' E')).join(' · ')}</b>`:'';
    host.innerHTML=`<p><b>TEAM ${esc(e.team.id)}</b><br>Nächster Ziel-Node: <b>${esc(pending.node_id)}</b><br>Carrier: ${esc(pending.carrier_id)}${cargoHint}</p><button id="evacRecoverStart" class="primary">NODE-RECOVERY SCANNEN</button><div id="evacFopOut" class="feedback"></div>`;
    evacFlow.teamId=e.team.id;evacFlow.nodeId=pending.node_id;$('evacRecoverStart').onclick=checkEvacRecovery;phase('success','Nächster EVAC-Node bestätigt.');
  }catch(e){phase('error',friendly(e));}
}
async function createEvacTeam(){
  try{
    const pioneerAUid=await nfc('PIONEER 1 ACCESS CARD'),pioneerBUid=await nfc('PIONEER 2 ACCESS CARD');
    phase('check','Team und freie EVAC-Nodes werden serverseitig geprüft.');
    await api('/api/evac/team',{method:'POST',data:{pioneerAUid,pioneerBUid}});phase('success','EVAC-Team gebildet.');await openFopEvac();
  }catch(e){phase('error',friendly(e));}
}
async function checkEvacRecovery(){
  const key='nodiv-v2-evac-recovery-op';
  try{
    const nodeUid=await nfc('EVAC ZIEL-NODE'),coreUids=[];
    for(let i=0;i<3;i++)coreUids.push(await nfc(`NODE N-CORE ${i+1}/3`));
    let operationId=sessionStorage.getItem(key);if(!operationId){operationId=op('EVAC-REC');sessionStorage.setItem(key,operationId);}
    phase('check','Node und 3/3 Cores werden gegen die EVAC-Zuweisung geprüft.');
    const r=await api('/api/evac/recovery/check',{method:'POST',data:{teamId:evacFlow.teamId,nodeUid,coreUids,operationId}});
    evacFlow={...evacFlow,...r};
    $('evacFopOut').innerHTML='<span>4/4 Scans bestätigt. Noch keine Umbuchung.</span><button id="evacRecoverConfirm" class="primary">RECOVERY VERBINDLICH BESTÄTIGEN</button>';
    $('evacRecoverConfirm').onclick=confirmEvacRecovery;phase('success','EVAC-Recovery geprüft. Commit bereit.');
  }catch(e){phase('error',friendly(e));}
}
async function confirmEvacRecovery(){
  try{
    phase('commit','3 N-Cores werden atomar dem zugewiesenen Carrier übergeben.');
    await api('/api/evac/recovery/confirm',{method:'POST',data:{teamId:evacFlow.teamId,nodeId:evacFlow.nodeId,operationId:evacFlow.operationId,scannedCoreUids:evacFlow.scannedCoreUids,proofId:evacFlow.proofId,nfcGrantId:evacFlow.nfcGrantId}});
    sessionStorage.removeItem('nodiv-v2-evac-recovery-op');phase('success','Node-Recovery abgeschlossen.');await refreshRole({quiet:true});await openFopEvac();
  }catch(e){phase('error',friendly(e));}
}
async function openPioneerEvac(){
  try{
    phase('check','Persönlicher EVAC-Auftrag wird geprüft.');const e=await api('/api/evac/state');evacFlow={state:e};
    const host=$('evacPioneerWork');if(!host)return;
    if(!e.team){host.innerHTML='<p class="phase-note">Warte auf Teamzuweisung durch FOP.</p>';phase('success','Noch keine EVAC-Teamzuweisung.');return;}
    if(!e.recovered){host.innerHTML=`<p>Team <b>${esc(e.team.id)}</b><br>Mit dem FOP zum Ziel-Node <b>${esc(e.assignment?.node_id||'—')}</b>.</p>`;phase('success','Node-Recovery steht noch aus.');return;}
    if(e.uploaded){host.innerHTML='<p class="phase-note">FINAL UPLOAD BESTÄTIGT. EVAC-Auftrag abgeschlossen.</p>';phase('success','EVAC Final Upload abgeschlossen.');return;}
    host.innerHTML=`<h4>LAST SECURE UPLOAD POINT</h4><p>Genau einen der drei EVAC-Cores auswählen und anschließend genau diesen Core scannen.</p><div class="choice-list">${(e.cargo||[]).map(c=>`<label class="choice"><input type="radio" name="evacFinalCore" value="${esc(c.id)}"><span>EVAC CORE</span><b>${c.energy} E</b></label>`).join('')}</div><button id="evacFinalScan" class="primary">GEWÄHLTEN CORE SCANNEN</button><div id="evacPioneerOut" class="feedback"></div>`;
    evacFlow.teamId=e.team.id;$('evacFinalScan').onclick=checkEvacFinal;phase('success','EVAC Cargo bereit für Final Upload.');
  }catch(e){phase('error',friendly(e));}
}
async function checkEvacFinal(){
  const key='nodiv-v2-evac-final-op';
  try{
    const chosen=document.querySelector('input[name="evacFinalCore"]:checked')?.value;if(!chosen)throw Error('EVAC_FINAL_CORE_REQUIRED');
    const selectedCoreUid=await nfc('AUSGEWÄHLTEN EVAC-CORE');
    let operationId=sessionStorage.getItem(key);if(!operationId){operationId=op('EVAC-UP');sessionStorage.setItem(key,operationId);}
    phase('check','Ausgewählter Core und EVAC-Cargo werden geprüft.');
    const r=await api('/api/evac/final/check',{method:'POST',data:{teamId:evacFlow.teamId,selectedCoreUid,operationId}});
    if(r.selectedCoreId!==chosen)throw Error('EVAC_FINAL_CORE_SET_MISMATCH');
    evacFlow={...evacFlow,...r};
    $('evacPioneerOut').innerHTML=`<span>${r.selectedEnergy} E als finaler Upload bestätigt. Noch keine Buchung.</span><button id="evacFinalConfirm" class="primary">FINAL UPLOAD BESTÄTIGEN</button>`;
    $('evacFinalConfirm').onclick=confirmEvacFinal;phase('success','Finaler Core bestätigt. Commit bereit.');
  }catch(e){phase('error',friendly(e));}
}
async function confirmEvacFinal(){
  try{
    phase('commit','EVAC Cargo und finale Energie werden atomar gesichert.');
    const r=await api('/api/evac/final/confirm',{method:'POST',data:{teamId:evacFlow.teamId,operationId:evacFlow.operationId,coreIds:evacFlow.coreIds,selectedCoreId:evacFlow.selectedCoreId,proofId:evacFlow.proofId,nfcGrantId:evacFlow.nfcGrantId}});
    sessionStorage.removeItem('nodiv-v2-evac-final-op');phase('success',`Final Upload abgeschlossen // ${r.energy} E gesichert.`);await refreshRole({quiet:true});await openPioneerEvac();
  }catch(e){phase('error',friendly(e));}
}

async function registerFounderHardware(){
  const kind=$('regKind')?.value,target=$('regTarget')?.value||'',energy=Number($('regEnergy')?.value),desktop=!!view?.desktopTest;
  try{
    let id='',actorRole='';
    if(kind==='CARD'){
      if(!target)throw Error('ROLLE_FEHLT');
      if(target.startsWith('AUTO:'))actorRole=target.split(':')[1];else id=target;
    }
    if(kind==='NODE'){if(!target&&!desktop)throw Error('NODE_FEHLT');id=target;}
    if(kind==='HQ')id='HQ-01';
    if(kind==='CORE'&&(!Number.isInteger(energy)||energy<1))throw Error('E_WERT_FEHLT');
    const uid=await nfc(kind==='CARD'?'ACCESS CARD':kind==='CORE'?'N-CORE':kind);
    phase('check','UID erkannt. Zuordnung wird serverseitig geprüft.');
    const result=await api('/api/founder/register',{method:'POST',data:{role:kind,id,uid,...(actorRole?{actorRole}:{}),...(kind==='CORE'?{energy}:{})}});
    const late=result.latePioneer?.assigned?` · Start-Core ${result.latePioneer.coreId} (${result.latePioneer.energy} E) zugewiesen`:result.latePioneer?.reason==='NO_REAL_RESERVE_CORE'?' · keine reale HQ-Reserve für Start-Core vorhanden':'';
    setFeedback('regOut',`Registriert: ${result.actorRole?`${ROLE_LABEL[result.actorRole]} · `:''}${result.id}${kind==='CORE'?` · ${result.energy} E`:''}${late}`);
    phase('success','Hardware eindeutig gespeichert.');await refreshRole({quiet:true});
  }catch(e){setFeedback('regOut',friendly(e),true);phase('error',friendly(e));}
}

async function initializeRealtest(){
  try{phase('commit','Registrierungen werden geprüft und der Testbestand transaktionssicher vorbereitet.');await api('/api/founder/realtest/initialize',{method:'POST'});phase('success','Testevent vorbereitet. Noch nicht im Feldbetrieb.');await refreshRole({quiet:true});}
  catch(e){setFeedback('realtestOut',friendly(e),true);phase('error',friendly(e));}
}
async function startRealtest(){
  try{phase('commit','Feldbetrieb wird aktiviert.');await api('/api/founder/realtest/start',{method:'POST'});phase('success','FIELD ACTIVE. FOP kann jetzt die Nodes installieren.');await refreshRole({quiet:true});}
  catch(e){setFeedback('realtestOut',friendly(e),true);phase('error',friendly(e));}
}
async function initializeDesktopTest(){
  try{phase('commit','Realer Bestand wird für den TESTMODUS vorbereitet. Es werden keine fehlenden Objekte erzeugt.');await api('/api/founder/test/initialize',{method:'POST'});phase('success','Testbestand vorbereitet. Noch nicht im Feldbetrieb.');await refreshRole({quiet:true});}
  catch(e){setFeedback('desktopTestOut',friendly(e),true);phase('error',friendly(e));}
}
async function startDesktopTest(){
  try{phase('commit','TESTSPIEL wird mit genau dem vorbereiteten Bestand aktiviert.');await api('/api/founder/test/start',{method:'POST'});phase('success','TESTMODUS // FIELD ACTIVE');await refreshRole({quiet:true});}
  catch(e){setFeedback('desktopTestOut',friendly(e),true);phase('error',friendly(e));}
}
async function endDesktopTest(){
  try{
    phase('commit','Test wird kontrolliert beendet. Offene Missionen und Transaktionen werden nicht als abgeschlossen ausgegeben.');
    const r=await api('/api/founder/test/end',{method:'POST'});
    setFeedback('desktopTestOut',`TEST_ENDED gespeichert · vorheriger Zustand ${r.snapshot?.stateBefore||'—'}`);
    phase('success','TESTSPIEL BEENDET // KEIN EVAC-ABSCHLUSS');
    await refreshRole({quiet:true});
  }catch(e){setFeedback('desktopTestOut',friendly(e),true);phase('error',friendly(e));}
}

async function assignResupplyMission(){
  try{phase('commit','Freier Slot und HQ-Versorgung werden geprüft.');const r=await api('/api/mission/assign-resupply',{method:'POST'});phase('success',`RE-SUPPLY zugewiesen // ${r.nodeId}.`);await refreshRole({quiet:true});}
  catch(e){phase('error',friendly(e));}
}
async function assignRestoreMission(){
  try{phase('commit','RESTORE-Qualifikation und Ziel werden serverseitig geprüft.');const r=await api('/api/mission/assign-next',{method:'POST'});phase('success',`${r.kind} zugewiesen // ${r.nodeId}.`);await refreshRole({quiet:true});}
  catch(e){phase('error',friendly(e));}
}

async function startFounderEvac(){
  try{phase('commit','EVAC-Start wird gegen alle Server-Guards geprüft.');const r=await api('/api/founder/evac/start',{method:'POST',data:{operationId:op('EVAC-START')}});setFeedback('founderOut','Evakuierung gestartet.');phase('success','EVAC aktiv.');await refreshRole({quiet:true});}
  catch(e){setFeedback('founderOut',friendly(e),true);phase('error',friendly(e));}
}

async function runFounderEvacSupport(){
  try{
    phase('commit','Vier Support-Teams werden über die unveränderten EVAC-Regeln abgearbeitet.');
    const r=await api('/api/founder/evac/support',{method:'POST'});
    setFeedback('evacSupportOut',r.done?'Support vollständig. Founder kann das Event jetzt regulär abschließen.':'Support noch nicht vollständig.',!r.done);
    phase(r.done?'success':'error',r.done?'10/10 Recovery und 10/10 Final Upload bestätigt.':'Support unvollständig.');
    await refreshRole({quiet:true});
  }catch(e){setFeedback('evacSupportOut',friendly(e),true);phase('error',friendly(e));}
}

async function completeFounderEvac(){
  try{phase('commit','Eventabschluss wird gegen alle EVAC-Nachweise geprüft.');const r=await api('/api/founder/evac/complete',{method:'POST',data:{operationId:op('EVAC-COMPLETE')}});setFeedback('founderOut','Event abgeschlossen.');phase('success','MISSION WÜRZBURG // EVENT COMPLETED');await refreshRole({quiet:true});}
  catch(e){setFeedback('founderOut',friendly(e),true);phase('error',friendly(e));}
}

$('btnAuth').onclick=async()=>{
  try{
    const uid=await nfc('ACCESS CARD');phase('check','Identität und Rolle werden serverseitig geprüft.');
    session=await api('/api/session/start',{method:'POST',auth:false,data:{uid}});token=session.token;
    $('auth').hidden=true;$('roleShell').hidden=false;$('btnState').disabled=false;$('btnRestartSave').disabled=false;$('btnRestartCompare').disabled=false;
    await refreshRole({quiet:true});await recoverExchange();phase('success',`${ROLE_LABEL[session.role]} autorisiert.`);
  }catch(e){setFeedback('authOut',friendly(e),true);phase('error',friendly(e));}
};
$('btnLock').onclick=()=>{token='';session=null;view=null;exchange=catchPreview=fopFlow=missionFlow=hqFlow=evacFlow=null;hqPanelOpen=false;$('roleShell').hidden=true;$('auth').hidden=false;phase('idle','');setFeedback('authOut','Interface gesperrt.');};

const BLOCK02_KEY='nodiv-v2-block02-before-v1';
function canonicalState(s){return {eventId:s.eventId,actor:s.actor,personal:(s.personal||[]).map(x=>({core_id:x.core_id,uid:x.uid,visible_energy:x.visible_energy,status:x.status})),nodes:(s.nodes||[]).map(n=>({node_id:n.node_id,state:n.state,cores:(n.cores||[]).map(x=>({core_id:x.core_id,uid:x.uid,visible_energy:x.visible_energy,status:x.status}))})),recent:(s.recent||[]).map(x=>({operation_id:x.operation_id,kind:x.kind,created_at:x.created_at,response:x.response}))};}
async function fingerprint(value){const bytes=new TextEncoder().encode(JSON.stringify(value));const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,16).toUpperCase();}
async function technicalState(){return api('/api/state');}
$('btnState').onclick=async()=>{try{$('stateOut').textContent=JSON.stringify(await technicalState(),null,2)}catch(e){$('stateOut').textContent=friendly(e)}};
$('btnRestartSave').onclick=async()=>{try{const state=canonicalState(await technicalState()),fp=await fingerprint(state);localStorage.setItem(BLOCK02_KEY,JSON.stringify({savedAt:new Date().toISOString(),fingerprint:fp,state}));setFeedback('restartOut',`VORHER gespeichert · ${fp}`);}catch(e){setFeedback('restartOut',friendly(e),true)}};
$('btnRestartCompare').onclick=async()=>{try{const raw=localStorage.getItem(BLOCK02_KEY);if(!raw)throw Error('KEIN_VORHER_STAND_GESPEICHERT');const before=JSON.parse(raw),after=canonicalState(await technicalState()),fp=await fingerprint(after),same=JSON.stringify(before.state)===JSON.stringify(after);setFeedback('restartOut',same?`PASS · Persistenz identisch · ${fp}`:`FAIL · Zustand unterscheidet sich · ${fp}`,!same);}catch(e){setFeedback('restartOut',friendly(e),true)}};
function percentile(sorted,p){return sorted[Math.min(sorted.length-1,Math.max(0,Math.ceil(sorted.length*p)-1))]}
$('btnLatency').onclick=async()=>{const b=$('btnLatency');b.disabled=true;setFeedback('latencyOut','3 Warmups + 25 HTTPS-Roundtrips …');try{for(let i=0;i<3;i++)await api(`/health?warmup=${Date.now()}-${i}`,{auth:false});const values=[];for(let i=0;i<25;i++){const t=performance.now();await api(`/health?block02=${Date.now()}-${i}`,{auth:false});values.push(performance.now()-t);}const sorted=[...values].sort((a,b)=>a-b),avg=values.reduce((a,b)=>a+b,0)/values.length;setFeedback('latencyOut',`25/25 · MIN ${sorted[0].toFixed(1)} ms · Ø ${avg.toFixed(1)} ms · P50 ${percentile(sorted,.5).toFixed(1)} ms · P95 ${percentile(sorted,.95).toFixed(1)} ms · MAX ${sorted.at(-1).toFixed(1)} ms`);}catch(e){setFeedback('latencyOut',friendly(e),true)}finally{b.disabled=false}};

function tickGhost(){const el=$('ghostCountdown');if(!el||!view?.protection?.active)return;const elapsed=Math.floor((Date.now()-ghostSnapshotAt)/1000);el.textContent=fmt(Math.max(0,ghostSnapshotRemaining-elapsed));}
let ghostSnapshotAt=Date.now(),ghostSnapshotRemaining=0;
function tickClock(){$('clock').textContent=new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});}
$('roleContent').addEventListener('input',()=>{$('roleContent').dataset.userEditing='1'});
$('roleContent').addEventListener('change',()=>{$('roleContent').dataset.userEditing='1'});
$('roleContent').addEventListener('focusin',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))$('roleContent').dataset.userEditing='1'});
refreshHealth();tickClock();setInterval(tickClock,15000);setInterval(tickGhost,250);setInterval(refreshHealth,30000);setInterval(()=>{if(token)refreshRole({quiet:true,passive:true})},10000);
