const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('app/js/identity.js','utf8').replace(/^[ \t]*import\s*\{[^}]*\}\s*from\s*(['"])[^'"\r\n]+\1[ \t]*;?[ \t]*(?:\r?\n|$)/gm,'').replace('export async function','async function');
function harness(){
 const elements=Object.fromEntries(['identityBtn','msg','bootView','pioneerScan'].map(id=>['#'+id,{disabled:false,hidden:false,textContent:'',title:'',dataset:{}}])),listeners={},readers=[],scripts=[],timers=new Map(),routes=[];let nextTimer=0,failScan=false;
 const ctx={console,AbortController,URLSearchParams,emitNodiv(){},routeIdentity:identity=>routes.push(identity),setInterval:()=>0,setTimeout:(fn,ms)=>{const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}}};
 ctx.window={addEventListener:(name,fn)=>(listeners[name]||=[]).push(fn),dispatchEvent(){}};
 ctx.document={querySelector:id=>elements[id]||null,addEventListener(){},createElement:()=>({removed:false,remove(){this.removed=true;}}),body:{appendChild(script){scripts.push(script);}}};
 ctx.window.NDEFReader=ctx.NDEFReader=class{constructor(){readers.push(this);}async scan({signal}={}){this.signal=signal;if(failScan){failScan=false;throw Error('NFC PERMISSION DENIED');}}};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 const respond=(index,data)=>{const callback=new URL(scripts[index].src).searchParams.get('callback');ctx.window[callback](data);};
 return {ctx,elements,readers,scripts,timers,routes,listeners,respond,failScan(){failScan=true;},async event(type,event={}){for(const listener of listeners[type]||[])await listener(event);},async tick(){await Promise.resolve();await Promise.resolve();},fire(ms){for(const [id,timer] of [...timers])if(timer.ms===ms){timers.delete(id);timer.fn();}},token(){return vm.runInContext('sessionToken',ctx);},setToken(value='authenticated'){vm.runInContext('sessionToken='+JSON.stringify(value),ctx);}};
}
test('NFC login owns one Reader, aborts before authentication and starts exactly one Session despite duplicate events/clicks',async()=>{
 const h=harness();await h.ctx.startIdentity();await h.ctx.startIdentity();assert.equal(h.readers.length,1);assert.equal(h.readers[0].signal.aborted,false);
 const handler=h.readers[0].onreading,pending=handler({serialNumber:' carduid '});await handler({serialNumber:'carduid'});await h.ctx.startIdentity();assert.equal(h.readers.length,1);assert.equal(h.scripts.length,1);assert.equal(h.readers[0].signal.aborted,true);assert.equal(h.readers[0].onreading,null);
 h.respond(0,{ok:true,authenticated:true,role:'PIONEER',identity:'P003'});await h.tick();assert.equal(h.scripts.length,2);assert.equal(new URL(h.scripts[1].src).searchParams.get('action'),'sessionstart');
 h.respond(1,{session:true,token:'new-session'});await pending;await handler({serialNumber:'another'});await h.ctx.startIdentity();assert.equal(h.scripts.length,2);assert.equal(h.routes.length,1);assert.equal(h.token(),'new-session');assert.equal(h.elements['#bootView'].hidden,true);
 await h.event('nodiv-pioneer-scan');assert.equal(h.readers.length,2);assert.equal(h.readers.filter(reader=>!reader.signal.aborted).length,1);
});
test('NFC login invalid UID/read error/permission failure end the Reader and allow a fresh attempt without reload',async()=>{
 for(const uid of ['', '  ', 'undefined','NULL',null,123]){const h=harness();await h.ctx.startIdentity();await h.readers[0].onreading({serialNumber:uid});assert.equal(h.scripts.length,0);assert.equal(h.readers[0].signal.aborted,true);assert.equal(h.elements['#identityBtn'].disabled,false);assert.match(h.elements['#msg'].textContent,/UID/);await h.ctx.startIdentity();assert.equal(h.readers.length,2);}
 const h=harness();await h.ctx.startIdentity();h.readers[0].onreadingerror();assert.equal(h.readers[0].signal.aborted,true);assert.equal(h.elements['#identityBtn'].disabled,false);h.failScan();await h.ctx.startIdentity();assert.equal(h.readers[1].signal.aborted,true);assert.match(h.elements['#msg'].textContent,/PERMISSION/);await h.ctx.startIdentity();assert.equal(h.readers.length,3);
});
test('NFC pagehide cancels Login and late identify response cannot start a Session or route the old attempt',async()=>{
 const h=harness();await h.ctx.startIdentity();const pending=h.readers[0].onreading({serialNumber:'card'});await h.event('pagehide');assert.equal(h.readers[0].signal.aborted,true);h.respond(0,{ok:true,authenticated:true});await pending;assert.equal(h.scripts.length,1);assert.equal(h.routes.length,0);assert.equal(h.token(),'');await h.ctx.startIdentity();assert.equal(h.readers.length,2);
});
test('NFC Pioneer invalid UID stays inside handler, resets scan state and can immediately rescan',async()=>{
 for(const uid of ['', ' ', 'undefined','null',null,42]){const h=harness();h.setToken();await h.event('nodiv-pioneer-scan');const handler=h.readers[0].onreading;await handler({serialNumber:uid});assert.equal(h.readers[0].signal.aborted,true);assert.equal(h.scripts.length,0);assert.equal(h.elements['#pioneerScan'].dataset.scanActive,'0');assert.equal(h.elements['#pioneerScan'].disabled,false);assert.match(h.elements['#pioneerScan'].textContent,/UID/);await h.event('nodiv-pioneer-scan');assert.equal(h.readers.length,2);await handler({serialNumber:'late-old'});assert.equal(h.scripts.length,0);}
});
test('NFC Pioneer blocks same operation overlap, aborts on read error/scan rejection and pagehide ignores old response',async()=>{
 const h=harness();h.setToken();await h.event('nodiv-pioneer-scan');await h.event('nodiv-pioneer-scan');assert.equal(h.readers.length,1);h.readers[0].onreadingerror();assert.equal(h.readers[0].signal.aborted,true);h.failScan();await h.event('nodiv-pioneer-scan');assert.equal(h.readers[1].signal.aborted,true);assert.equal(h.elements['#pioneerScan'].dataset.scanActive,'0');
 await h.event('nodiv-pioneer-scan');const handler=h.readers[2].onreading,pending=handler({serialNumber:'nodeuid'});await handler({serialNumber:'nodeuid'});assert.equal(h.scripts.length,1);assert.equal(h.readers[2].signal.aborted,true);await h.event('pagehide');h.respond(0,{ok:true,session:true,object:{type:'NODE',id:'NODE-001'},decision:{allowed:true}});await pending;assert.equal(h.elements['#pioneerScan'].textContent,'NFC // JETZT SCANNEN');assert.equal(h.elements['#pioneerScan'].dataset.scanActive,'0');await h.event('nodiv-pioneer-scan');assert.equal(h.readers.length,4);
});
test('API accepts a 20-second response, settles once and cleans JSONP callback/script without retry',async()=>{
 const h=harness(),promise=h.ctx.apiRequest({action:'evacuationfinalconfirm',token:'session',scan:'durable-proof'});assert.equal(h.scripts.length,1);assert.equal([...h.timers.values()][0].ms,30000);h.fire(10000);h.fire(20000);
 const name=new URL(h.scripts[0].src).searchParams.get('callback'),callback=h.ctx.window[name];callback({ok:true,receipt:'final'});assert.equal((await promise).receipt,'final');callback({ok:true,receipt:'late'});assert.equal(h.scripts.length,1);assert.equal(h.scripts[0].removed,true);assert.equal(h.ctx.window[name],undefined);assert.equal(h.timers.size,0);
});
test('API timeout is an unknown Server result; late responses/error events never apply a second result or retry a transaction',async()=>{
 const h=harness(),promise=h.ctx.apiRequest({action:'uploadconfirm',upload:'existing-order'}),name=new URL(h.scripts[0].src).searchParams.get('callback'),original=h.ctx.window[name],onerror=h.scripts[0].onerror;let resolved=0;promise.then(()=>resolved++,()=>{});const rejected=assert.rejects(promise,/TIMEOUT.*Serverstatus unklar.*Status neu laden/);h.fire(30000);await rejected;
 assert.equal(h.scripts[0].removed,true);assert.equal(h.scripts.length,1);assert.doesNotThrow(()=>h.ctx.window[name]({ok:true}));original({ok:true});onerror();await h.tick();assert.equal(resolved,0);assert.equal(h.scripts.length,1);h.fire(120000);assert.equal(h.ctx.window[name],undefined);assert.equal(h.timers.size,0);
});
test('API callback identities cannot collide; late timeout response cannot settle a newer request',async()=>{
 const h=harness(),one=h.ctx.apiRequest({action:'exchangeconfirm',exchange:'existing'}),name1=new URL(h.scripts[0].src).searchParams.get('callback'),rejected=assert.rejects(one,/TIMEOUT/);h.fire(30000);await rejected;const two=h.ctx.apiRequest({action:'exchangestate'}),name2=new URL(h.scripts[1].src).searchParams.get('callback');assert.notEqual(name1,name2);h.ctx.window[name1]({ok:true,status:'old'});h.respond(1,{ok:true,status:'current'});assert.equal((await two).status,'current');assert.equal(h.scripts.length,2);
});
test('NFC authentication timeout cannot install a late Session; retry requires a fresh physical card scan',async()=>{
 const h=harness();await h.ctx.startIdentity();const pending=h.readers[0].onreading({serialNumber:'card'});h.respond(0,{ok:true,authenticated:true,role:'PIONEER'});await h.tick();const name=new URL(h.scripts[1].src).searchParams.get('callback');h.fire(30000);await pending;assert.equal(h.token(),'');assert.equal(h.routes.length,0);assert.equal(h.elements['#identityBtn'].disabled,false);h.ctx.window[name]({session:true,token:'late-token'});assert.equal(h.token(),'');await h.ctx.startIdentity();assert.equal(h.readers.length,2);assert.equal(h.scripts.length,2);
});
test('NFC declined authentication/session aborts and requires a fresh Reader; no hidden retry',async()=>{
 for(const failAt of ['identify','sessionstart']){const h=harness();await h.ctx.startIdentity();const pending=h.readers[0].onreading({serialNumber:'card'});h.respond(0,failAt==='identify'?{ok:false,error:'ACCESS DENIED'}:{ok:true,authenticated:true});if(failAt==='sessionstart'){await h.tick();h.respond(1,{session:false,status:'SESSION DENIED'});}await pending;assert.equal(h.token(),'');assert.equal(h.routes.length,0);assert.equal(h.readers[0].signal.aborted,true);assert.equal(h.elements['#identityBtn'].disabled,false);assert.equal(h.scripts.length,failAt==='identify'?1:2);await h.ctx.startIdentity();assert.equal(h.readers.length,2);}
});
test('NFC Pioneer transport failure resets the Reader/button and never automatically repeats gameplayroute',async()=>{
 const h=harness();h.setToken();await h.event('nodiv-pioneer-scan');const pending=h.readers[0].onreading({serialNumber:'nodeuid'});h.scripts[0].onerror();await pending;assert.match(h.elements['#pioneerScan'].textContent,/Serverstatus unklar/);assert.equal(h.readers[0].signal.aborted,true);assert.equal(h.elements['#pioneerScan'].dataset.scanActive,'0');assert.equal(h.elements['#pioneerScan'].disabled,false);assert.equal(h.scripts.length,1);await h.event('nodiv-pioneer-scan');assert.equal(h.readers.length,2);assert.equal(h.scripts.length,1);
});
