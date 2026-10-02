import {emitNodiv} from './motion.js';
const ROLE_META={
 PIONEER:{label:'PIONEER',accent:'CYAN FIELD CHANNEL'},
 LOCAL:{label:'LOCAL',accent:'RESTRICTED FIELD CHANNEL'},
 UNBOUND:{label:'UNBOUND',accent:'COMPROMISED NETWORK CHANNEL'},
 FOP:{label:'FIELD OPERATOR',accent:'OPERATIONS CHANNEL'},
 FOUNDER:{label:'FOUNDER',accent:'ROOT // SYSTEM CONTROL'}
};
export function normalizeRole(role){const r=String(role||'').trim().toUpperCase();return ROLE_META[r]?r:null}
export function routeIdentity(identity){
 const role=normalizeRole(identity?.role);
 if(!role) throw new Error('ROLE_NOT_SUPPORTED');
 const app=document.querySelector('#app'); app.dataset.role=role;
 emitNodiv('ROLE_ENTER',{target:'#roleView',role});
 renderRoleView(role,identity);
}
function slot(value,locked=false){return `<div class="core-slot ${locked?'locked':''}"><span class="slot-orbit"></span><div><small>${locked?'LOCKED':'N-CORE'}</small><strong>${locked?'—':(value??'EMPTY')}</strong></div></div>`}
function renderRoleView(role,id){
 const host=document.querySelector('#roleView'),m=ROLE_META[role];
 const secured=Number(id.securedEnergy||0);
 let body='';
 if(role==='PIONEER') body=`<section class="role-metric"><span>SECURED ENERGY</span><b>${secured} E</b></section><div class="slots">${slot(id.core1||'341 E')}${slot(null,true)}${slot(null,true)}</div><button class="role-action" type="button">NODE INTERFACE</button>`;
 if(role==='LOCAL') body=`<section class="role-metric"><span>SECURED ENERGY</span><b>${secured} E</b></section><div class="hunt"><span>PIONEERS CAUGHT</span><b>${id.caughtUnique||0} / 10</b></div><div class="slots one">${slot(id.core1||'EMPTY')}</div><button class="role-action" type="button">OPEN CATCH</button>`;
 if(role==='UNBOUND') body=`<section class="role-metric"><span>SECURED ENERGY</span><b>${secured} E</b></section><div class="hunt"><span>PIONEERS CAUGHT</span><b>${id.caughtUnique||0} / 10</b></div><div class="slots two">${slot(id.core1||'341 E')}${slot(id.core2||'EMPTY')}</div><button class="role-action" type="button">OPEN CATCH</button><div class="network-pulse">NETWORK ACTIVITY // LISTENING</div>`;
 if(role==='FOUNDER') body=`<section class="founder-console"><nav class="command-tabs"><button class="active" data-command-tab="command">COMMAND</button><button data-command-tab="live">LIVE OPS</button><button data-command-tab="system">SYSTEM</button><button data-command-tab="archive">ARCHIVE</button></nav><div class="command-panel active" data-command-panel="command"><div class="command-stage"><div class="command-gridlines"></div><div class="command-stage-top"><span>NODIV // COMMAND NETWORK</span><b>FOUNDER AUTHORITY</b></div><div class="command-core"><div class="command-radar"><i></i><i></i><i></i><span></span><em>CMD</em></div><div class="command-readout"><small>OPERATIONAL CONTROL</small><h3>COMMAND<br>ONLINE</h3><p>Founder link authenticated.</p><div class="signal-line"><span></span><span></span><span></span><span></span><span></span></div></div></div><div class="command-stage-foot"><span>WÜRZBURG SECTOR</span><span>LINK // SECURE</span></div></div><div class="attention-strip"><span class="attention-dot"></span><div><small>COMMAND ANALYSIS</small><b id="commandAnalysis">ASSESSING OPERATIONAL STATE</b></div><span class="attention-code">01</span></div><div class="command-grid"><article><small>PREPARATION</small><strong>REGISTRATION</strong><div class="micro-line"></div><p>Participant workflow connects here when registration data is available.</p></article><article><small>OPEN TASKS</small><strong>AWAITING TASK ENGINE</strong><div class="micro-line"></div><p>No synthetic tasks. Only verified operational state will appear here.</p></article></div><div class="ai-support"><div class="ai-mark">AI</div><div><span>COMMAND SUPPORT</span><p>Analysis channel standing by. Advisory only // Founder retains command authority.</p></div></div></div><div class="command-panel" data-command-panel="live"><div class="placeholder-visual"><div class="node-orbit"><i></i><i></i><i></i><i></i><i></i><i></i></div><small>LIVE OPERATIONS</small><strong>TACTICAL FEED READY FOR DATA</strong><p>No simulated live events are shown.</p></div></div><div class="command-panel" data-command-panel="system"><div class="root-status"><span>ROOT ACCESS</span><b>SYSTEM CONTROL</b></div><div id="founderOverview" class="founder-overview"><div><span>NODES</span><b>— / 15</b></div><div><span>N-CORES</span><b>— / 200</b></div><div><span>UPLOAD HQ</span><b>—</b></div><div><span>UPLOAD FOP</span><b>—</b></div></div><button class="role-action" id="registerAntenna" type="button">REGISTER NODE ANTENNA</button><button class="role-action secondary" id="registerCoreAntenna" type="button">REGISTER N-CORE ANTENNA</button><button class="role-action secondary" id="registerUploadHQ" type="button">REGISTER UPLOAD HQ</button><button class="role-action secondary" id="registerUploadFOP" type="button">REGISTER UPLOAD FOP</button><div class="founder-note">ROOT PROVISIONING // UID DUPLICATES ARE REJECTED SYSTEM-WIDE.</div></div><div class="command-panel" data-command-panel="archive"><div class="placeholder-visual archive-mark"><small>ARCHIVE</small><strong>EVENT HISTORY</strong><p>Audit trail and post-event analysis will live here.</p></div></div></section>`;
 if(role==='FOP') body=`<section class="role-metric"><span>OPERATIONS STATUS</span><b>ACTIVE</b></section><button class="role-action" type="button">FIELD OPERATIONS</button>`;
 host.innerHTML=`<header class="role-head"><div><small>${m.accent}</small><h2>${id.identity||'—'}</h2><p>${m.label}</p></div><i class="role-sigil"></i></header>${body}<button class="role-exit" type="button">LOCK INTERFACE</button>`;
 host.hidden=false;
 host.querySelector('.role-exit').addEventListener('click',()=>location.reload());
 if(role==='FOUNDER') window.dispatchEvent(new CustomEvent('nodiv-founder-status'));
 if(role==='FOUNDER'){host.querySelectorAll('[data-command-tab]').forEach(tab=>tab.addEventListener('click',()=>{host.querySelectorAll('[data-command-tab]').forEach(x=>x.classList.toggle('active',x===tab));host.querySelectorAll('[data-command-panel]').forEach(p=>p.classList.toggle('active',p.dataset.commandPanel===tab.dataset.commandTab));if(tab.dataset.commandTab==='system')window.dispatchEvent(new CustomEvent('nodiv-founder-status'));}));}
 const antenna=host.querySelector('#registerAntenna'); if(antenna) antenna.addEventListener('click',()=>window.dispatchEvent(new CustomEvent('nodiv-founder-register-antenna')));
 const coreAntenna=host.querySelector('#registerCoreAntenna'); if(coreAntenna) coreAntenna.addEventListener('click',()=>window.dispatchEvent(new CustomEvent('nodiv-founder-register-core')));
 ['HQ','FOP'].forEach(kind=>{const b=host.querySelector('#registerUpload'+kind);if(b)b.addEventListener('click',()=>window.dispatchEvent(new CustomEvent('nodiv-founder-register-upload',{detail:{type:'UPLOAD_'+kind}}))) });
 host.querySelectorAll('.role-action:not(#registerAntenna)').forEach(b=>b.addEventListener('click',()=>{b.classList.add('nd-pop');setTimeout(()=>b.classList.remove('nd-pop'),450)}));
}
