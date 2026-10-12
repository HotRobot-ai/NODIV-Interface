'use strict';
// EVENT-SHUTDOWN-02: source-level regression guards. Run: node --test tests/event-shutdown-02.test.cjs
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const backend=fs.readFileSync(path.join(__dirname,'..','Code.js'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'..','app','js','identity.js'),'utf8');
const section=(source,start,end)=>{const a=source.indexOf(start);assert.ok(a>=0,start+' missing');const b=source.indexOf(end,a+start.length);assert.ok(b>a,end+' missing');return source.slice(a,b);};
const shutdown=section(backend,'function shutdownFieldEvent(e) {','function ',);
test('Founder-only shutdown with exact event binding',()=>{
 assert.match(shutdown,/actor\.role\s*!==\s*'FOUNDER'/);
 assert.match(shutdown,/EVENT_MISMATCH/);
 assert.match(shutdown,/CLOSE_WITH_EXCEPTIONS:/);
 assert.match(shutdown,/SHUTDOWN_CONFIRMATION_REQUIRED/);
});
test('regular shutdown remains blocked by unresolved inventory',()=>{
 assert.match(shutdown,/if\(blockers\.length&&!force\)/);
 assert.match(shutdown,/DEINSTALLATION_NOT_CONFIRMED/);
 assert.match(shutdown,/NODE-OWNED CORE/);
});
test('HQ reserve is not classified as stranded inventory',()=>{
 assert.match(shutdown,/owner!=='NODIV_RESERVE'/);
 assert.match(shutdown,/strandedCores/);
});
test('open restore and resupply operations are audited',()=>{
 assert.match(shutdown,/pendingRestores=liveRestores\(\)/);
 assert.match(shutdown,/pendingReSupplies=liveReSupplies\(\)/);
 assert.match(shutdown,/pendingRestores:pendingRestores\.map/);
 assert.match(shutdown,/pendingReSupplies:pendingReSupplies\.map/);
});
test('exception close writes an audit entry without transferring core ownership',()=>{
 assert.match(shutdown,/FIELD_EVENT_SHUTDOWN_EXCEPTIONS/);
 assert.doesNotMatch(shutdown,/transferCoreOwnership\(/);
});
test('Founder UI requires interactive confirmation before exceptional retry',()=>{
 const handler=section(ui,"window.addEventListener('nodiv-founder-event-shutdown'","let fopInstallation=");
 assert.match(handler,/window\.confirm\(/);
 assert.match(handler,/mode:'WITH_EXCEPTIONS'/);
 assert.match(handler,/confirm:'CLOSE_WITH_EXCEPTIONS:'/);
});
