const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function ui(){
 class Element{
  constructor(){this.textContent='';this.children=[];this.hidden=false;this.disabled=false;this.dataset={};this.value=''}
  replaceChildren(){this.children=[]}
  appendChild(child){this.children.push(child)}
 }
 const elements={};for(const id of ['fopInstallProgress','fopInstallCores','fopInstallScan','fopInstallConfirm','fopProgressBar','fopDeploymentNode','fopLoadoutEnergy','fopLoadoutState','fopOperationStatus','fopInstallControls','fopPrimaryPanel','fopScanProgress','fopInstallActions','fopInstallCode','fopDeploymentComplete','fopInstallCancel','fopInstallOrder','fopNodeId','fopCodeValue','fopInstallHint'])elements['#'+id]=new Element();
 const listeners={},document={querySelector:id=>elements[id]||null,createElement:()=>new Element()};
 const ctx={document,console,AbortController,setTimeout,clearTimeout,URLSearchParams,emitNodiv(){},window:{addEventListener:(name,fn)=>listeners[name]=fn}};
 ctx.window.NDEFReader=ctx.NDEFReader=class{async scan(){ctx.reader=this}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('app/js/identity.js','utf8').replace(/^import .*\n/gm,'').replace('export async function','async function'),ctx);
 vm.runInContext("sessionToken='test'",ctx);
 const assigned=[{id:'NC-017',energy:175},{id:'NC-034',energy:246},{id:'NC-089',energy:281}];let scanned=[];
 ctx.apiRequest=async p=>{
  if(p.action==='nodeinstallconfirm')return {ok:true,action:true,status:'NODE_INSTALLED',node:{id:'NODE-002'},count:3,totalEnergy:702,nodeState:'STABLE'};
  if(p.action==='nodeinstallcancel'){scanned=[];return {ok:true,action:true,status:'INSTALLATION_CANCELLED'}}
  if(p.action==='nodeinstallorder')scanned=[];
  if(p.action==='nodeinstallscan'){
   if(!assigned.some(c=>c.id===p.uid))return {ok:false,error:'CORE NOT ASSIGNED TO NODE-002'};
   scanned.push(p.uid);
  }
  return {ok:true,action:true,status:p.action==='nodeinstallorder'?'NODE_INSTALL_ORDER':'INSTALL_CORE_SCANNED',installation:'order',node:{id:'NODE-002',code:'0427'},loadout:assigned.map(c=>({...c,scanned:scanned.includes(c.id)})),count:scanned.length,canConfirm:scanned.length===3,totalEnergy:702,nodeState:'STABLE',instruction:'PRIMARY einstellen und zugewiesene Cores scannen.'};
 };
 return {elements,listeners,ctx,async order(){elements['#fopNodeId'].value='NODE-002';await listeners['nodiv-fop-install-order']()},async scan(uid){await listeners['nodiv-fop-install-scan']();await ctx.reader.onreading({serialNumber:uid})}};
}
test('FOP shows assigned IDs/energy, unordered progress, foreign rejection and 3/3 confirmation gate',async()=>{
 const f=ui(),e=f.elements;await f.order();assert.equal(e['#fopCodeValue'].textContent,'0427');assert.equal(e['#fopInstallProgress'].textContent,'0/3');assert.equal(e['#fopInstallConfirm'].disabled,true);assert.equal(e['#fopNodeId'].disabled,true);
 assert.equal(e['#fopLoadoutEnergy'].textContent,'702 E');assert.equal(e['#fopLoadoutState'].textContent,'STABLE');assert.equal(e['#fopInstallCores'].children.length,3);
 assert.deepEqual(e['#fopInstallCores'].children[0].children.map(el=>el.textContent),['NC-017','175 E','AWAITING SCAN']);
 await f.scan('NC-999');assert.match(e['#fopInstallHint'].textContent,/CORE NOT ASSIGNED TO NODE-002/);assert.equal(e['#fopInstallProgress'].textContent,'0/3');
 for(const [i,id] of ['NC-089','NC-017','NC-034'].entries()){await f.scan(id);assert.equal(e['#fopInstallProgress'].textContent,(i+1)+'/3');assert.equal(e['#fopInstallConfirm'].disabled,i!==2)}
 assert.ok(e['#fopInstallCores'].children.every(el=>el.className.includes('verified')));
});
test('FOP completion hides PRIMARY/input/actions and renders separated compact summary',async()=>{
 const f=ui(),e=f.elements;await f.order();for(const id of ['NC-089','NC-017','NC-034'])await f.scan(id);await f.listeners['nodiv-fop-install-confirm']();
 assert.equal(e['#fopDeploymentComplete'].textContent,'DEPLOYMENT COMPLETE // NODE-002 // 3/3 // 702 E // STABLE');assert.equal(e['#fopDeploymentComplete'].hidden,false);
 for(const id of ['#fopInstallControls','#fopPrimaryPanel','#fopScanProgress','#fopInstallActions','#fopInstallCode'])assert.equal(e[id].hidden,true);
 assert.equal(e['#fopInstallConfirm'].disabled,true);assert.equal(e['#fopCodeValue'].textContent,'0427');assert.equal(e['#fopOperationStatus'].textContent,'COMPLETE');
});
test('FOP abort resets slots and enables Node selection after server acknowledgement',async()=>{
 const f=ui(),e=f.elements;await f.order();await f.scan('NC-017');await f.listeners['nodiv-fop-install-cancel']();assert.equal(e['#fopInstallCores'].children.length,0);assert.equal(e['#fopInstallCode'].hidden,true);assert.equal(e['#fopNodeId'].disabled,false);assert.equal(e['#fopInstallConfirm'].disabled,true);assert.match(e['#fopInstallHint'].textContent,/freigegeben/);
});
