import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLabApp} from '../server/server.mjs';

async function startApp(dbPath,eventId){
  const app=createLabApp({mode:'desktop',dbPath,eventId,host:'127.0.0.1',port:0,sessionTtl:3600,grantTtl:90,exchangeTtl:300,tlsKey:null,tlsCert:null});
  await new Promise((resolve,reject)=>app.server.once('error',reject).listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  async function call(path,{method='GET',data,token}={}){
    const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:data?JSON.stringify(data):undefined});
    const j=await r.json();
    if(!r.ok){const e=Error(j.error||'HTTP_'+r.status);Object.assign(e,j);throw e}
    return j;
  }
  return {app,call,login:uid=>call('/api/session/start',{method:'POST',data:{uid}})};
}

test('BLOCK07 desktop: incomplete real stock can start, end early and survive restart without synthetic hardware',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'nodiv-b07-incomplete-')),dbPath=join(dir,'desktop.sqlite'),eventId='B07-INCOMPLETE';
  const previous=process.env.NODIV_UID_FOUNDER_CARD;
  process.env.NODIV_UID_FOUNDER_CARD='04FADE0701';
  let fx;
  try{
    fx=await startApp(dbPath,eventId);
    const db=fx.app.core.db;
    assert.equal(db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId).state,'READY');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM actors WHERE event_id=?').get(eventId).n,1);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM cores WHERE event_id=?').get(eventId).n,0);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM lab_access_cards WHERE event_id=?').get(eventId).n,1);

    const founder=await fx.login('04FADE0701');
    const register=data=>fx.call('/api/founder/register',{method:'POST',token:founder.token,data});
    const pioneer=await register({role:'CARD',actorRole:'PIONEER',uid:'04AA0701'});
    assert.equal(pioneer.actorRole,'PIONEER');
    const node=await register({role:'NODE',uid:'04BB0701'});
    assert.equal(node.id,'NODE-001');
    const core=await register({role:'CORE',uid:'04CC0701',energy:341});
    assert.equal(core.id,'NC-001');

    let status=await fx.call('/api/founder/test/status',{token:founder.token});
    assert.equal(status.canInitialize,true);
    assert.equal(status.counts.cards,2);
    assert.equal(status.counts.nodes,1);
    assert.equal(status.counts.cores,1);
    assert.equal(status.playable.find(x=>x.code==='FOP_NODE').available,false);
    assert.equal(status.playable.find(x=>x.code==='CATCH').available,false);

    const initialized=await fx.call('/api/founder/test/initialize',{method:'POST',token:founder.token});
    assert.equal(initialized.status,'INITIALIZED');
    assert.equal(initialized.plan.pioneerAssignments.length,1);
    assert.equal(initialized.plan.fopAssignments.length,0);
    assert.equal(db.prepare("SELECT owner_id FROM cores WHERE event_id=? AND core_id='NC-001'").get(eventId).owner_id,pioneer.id);

    const started=await fx.call('/api/founder/test/start',{method:'POST',token:founder.token});
    assert.equal(started.status,'FIELD_ACTIVE');
    const p=await fx.login('04AA0701');
    const pv=await fx.call('/api/role/state',{token:p.token});
    assert.equal(pv.event.state,'FIELD_ACTIVE');
    assert.equal(pv.inventory.used,1);

    const ended=await fx.call('/api/founder/test/end',{method:'POST',token:founder.token});
    assert.equal(ended.status,'TEST_ENDED');
    assert.equal(ended.snapshot.stateBefore,'FIELD_ACTIVE');
    assert.equal(db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId).state,'TEST_ENDED');
    assert.equal(db.prepare("SELECT COUNT(*) n FROM events WHERE event_id=? AND state='COMPLETED'").get(eventId).n,0);
    const evac=db.prepare('SELECT state FROM evac_control WHERE event_id=?').get(eventId);
    const completion=db.prepare('SELECT COUNT(*) n FROM evac_completion_receipts WHERE event_id=?').get(eventId).n;
    assert.ok(!evac||evac.state!=='COMPLETED');
    assert.equal(completion,0);

    await fx.app.close();fx=null;
    fx=await startApp(dbPath,eventId);
    assert.equal(fx.app.core.db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId).state,'TEST_ENDED');
    assert.equal(fx.app.core.db.prepare('SELECT COUNT(*) n FROM actors WHERE event_id=?').get(eventId).n,2);
    assert.equal(fx.app.core.db.prepare('SELECT COUNT(*) n FROM cores WHERE event_id=?').get(eventId).n,1);
    const founder2=await fx.login('04FADE0701');
    status=await fx.call('/api/founder/test/status',{token:founder2.token});
    assert.equal(status.ended,true);
    assert.equal(status.canEnd,false);
    assert.equal(status.endSnapshot.stateBefore,'FIELD_ACTIVE');
    assert.equal(fx.app.core.assertIntegrity(eventId).ok,true);
  }finally{
    if(fx)await fx.app.close();
    if(previous===undefined)Reflect.deleteProperty(process.env,'NODIV_UID_FOUNDER_CARD');else process.env.NODIV_UID_FOUNDER_CARD=previous;
    rmSync(dir,{recursive:true,force:true});
  }
});

test('BLOCK07 desktop: Founder + FOP + Pioneer + one Node runs shared install/exchange and late roles use only real reserve',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'nodiv-b07-flow-')),dbPath=join(dir,'desktop.sqlite'),eventId='B07-FLOW';
  const previous=process.env.NODIV_UID_FOUNDER_CARD;
  process.env.NODIV_UID_FOUNDER_CARD='04FADE0702';
  let fx;
  try{
    fx=await startApp(dbPath,eventId);
    const founder=await fx.login('04FADE0702');
    const register=data=>fx.call('/api/founder/register',{method:'POST',token:founder.token,data});
    const fopReg=await register({role:'CARD',actorRole:'FOP',uid:'04AA0710'});
    const pioneerReg=await register({role:'CARD',actorRole:'PIONEER',uid:'04AA0711'});
    const nodeReg=await register({role:'NODE',uid:'04BB0710'});
    await register({role:'HQ',id:'HQ-01',uid:'04DD0710'});
    for(const [uid,energy] of [['04CC0711',400],['04CC0712',350],['04CC0713',300],['04CC0714',250]])await register({role:'CORE',uid,energy});

    const init=await fx.call('/api/founder/test/initialize',{method:'POST',token:founder.token});
    assert.equal(init.plan.pioneerAssignments.length,1);
    assert.equal(init.plan.fopAssignments.length,3);
    assert.equal(init.plan.pioneerAssignments[0].actorId,pioneerReg.id);
    assert.equal(init.plan.fopAssignments.every(x=>x.actorId===fopReg.id),true);
    let status=await fx.call('/api/founder/test/status',{token:founder.token});
    assert.equal(status.playable.find(x=>x.code==='EXCHANGE').available,true);
    assert.equal(status.playable.find(x=>x.code==='CATCH').available,false);
    await fx.call('/api/founder/test/start',{method:'POST',token:founder.token});

    const fop=await fx.login('04AA0710');
    const fopView=await fx.call('/api/role/state',{token:fop.token});
    assert.deepEqual(fopView.nodes,{available:1,installed:0,total:1});
    const scan=await fx.call('/api/fop/scan',{method:'POST',token:fop.token,data:{uid:'04BB0710'}});
    assert.equal(scan.nodeId,nodeReg.id);
    assert.equal(scan.action,'INSTALL');
    const fopCores=fx.app.core.db.prepare("SELECT uid FROM cores WHERE event_id=? AND owner_type='TRANSIT' AND owner_id=? ORDER BY core_id").all(eventId,fopReg.id).map(x=>x.uid);
    assert.equal(fopCores.length,3);
    await fx.call('/api/fop/install',{method:'POST',token:fop.token,data:{nodeId:nodeReg.id,coreUids:fopCores,operationId:'B07-INSTALL-1'}});
    assert.equal(fx.app.core.db.prepare('SELECT state FROM nodes WHERE event_id=? AND node_id=?').get(eventId,nodeReg.id).state,'INSTALLED');

    const pioneer=await fx.login('04AA0711');
    const personal=fx.app.core.db.prepare("SELECT uid FROM cores WHERE event_id=? AND owner_type='PIONEER' AND owner_id=? AND status='FIELD'").get(eventId,pioneerReg.id);
    const nodeCore=fx.app.core.db.prepare("SELECT uid FROM cores WHERE event_id=? AND owner_type='NODE' AND owner_id=? AND status='DEPLOYED' ORDER BY core_id LIMIT 1").get(eventId,nodeReg.id);
    const grant=await fx.call('/api/scan',{method:'POST',token:pioneer.token,data:{uid:'04BB0710'}});
    const prepared=await fx.call('/api/exchange/prepare',{method:'POST',token:pioneer.token,data:{grantId:grant.grantId,count:1}});
    await fx.call('/api/scan',{method:'POST',token:pioneer.token,data:{exchangeId:prepared.exchangeId,uid:personal.uid}});
    const ready=await fx.call('/api/scan',{method:'POST',token:pioneer.token,data:{exchangeId:prepared.exchangeId,uid:nodeCore.uid}});
    assert.equal(ready.ready,true);
    const exchanged=await fx.call('/api/exchange/confirm',{method:'POST',token:pioneer.token,data:{exchangeId:prepared.exchangeId,accessCode:prepared.accessCode}});
    assert.equal(exchanged.count,1);

    const local=await register({role:'CARD',actorRole:'LOCAL',uid:'04AA0712'});
    assert.equal(local.actorRole,'LOCAL');
    status=await fx.call('/api/founder/test/status',{token:founder.token});
    assert.equal(status.counts.roles.LOCAL,1);
    assert.equal(status.playable.find(x=>x.code==='CATCH').available,true);

    await register({role:'CORE',uid:'04CC0715',energy:222});
    await register({role:'CORE',uid:'04CC0716',energy:180});
    const late=await register({role:'CARD',actorRole:'PIONEER',uid:'04AA0713'});
    assert.equal(late.latePioneer.assigned,true);
    assert.equal(late.latePioneer.energy,222);
    assert.equal(fx.app.core.db.prepare('SELECT owner_id FROM cores WHERE event_id=? AND core_id=?').get(eventId,late.latePioneer.coreId).owner_id,late.id);

    const restore=await fx.call('/api/mission/assign-next',{method:'POST',token:pioneer.token});
    assert.equal(restore.kind,'RESTORE_1');
    assert.equal(fx.app.core.db.prepare('SELECT state FROM missions WHERE event_id=? AND mission_id=?').get(eventId,restore.missionId).state,'ASSIGNED');

    const ended=await fx.call('/api/founder/test/end',{method:'POST',token:founder.token});
    assert.equal(ended.status,'TEST_ENDED');
    assert.equal(fx.app.core.db.prepare('SELECT state FROM missions WHERE event_id=? AND mission_id=?').get(eventId,restore.missionId).state,'ASSIGNED');
    assert.equal(fx.app.core.db.prepare('SELECT COUNT(*) n FROM operations WHERE event_id=? AND kind=?').get(eventId,'EXCHANGE').n,1);
    assert.equal(fx.app.core.db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId).state,'TEST_ENDED');
    assert.equal(fx.app.core.assertIntegrity(eventId).ok,true);
  }finally{
    if(fx)await fx.app.close();
    if(previous===undefined)Reflect.deleteProperty(process.env,'NODIV_UID_FOUNDER_CARD');else process.env.NODIV_UID_FOUNDER_CARD=previous;
    rmSync(dir,{recursive:true,force:true});
  }
});


test('BLOCK07 Founder bootstrap UID is retained across restart and mismatches cannot silently change existing identity',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'nodiv-b07-founder-uid-')),dbPath=join(dir,'desktop.sqlite'),eventId='B07-FOUNDER-UID';
  const previous=process.env.NODIV_UID_FOUNDER_CARD;
  let fx;
  try{
    process.env.NODIV_UID_FOUNDER_CARD='04FADE0711';
    fx=await startApp(dbPath,eventId);
    assert.equal((await fx.login('04FADE0711')).role,'FOUNDER');
    assert.equal(fx.app.core.db.prepare("SELECT uid FROM lab_access_cards WHERE event_id=? AND actor_id='FOUNDER-TEST'").get(eventId).uid,'04FADE0711');
    await fx.app.close();fx=null;
    fx=await startApp(dbPath,eventId);
    assert.equal((await fx.login('04FADE0711')).role,'FOUNDER');
    await fx.app.close();fx=null;
    process.env.NODIV_UID_FOUNDER_CARD='04FADE0712';
    await assert.rejects(startApp(dbPath,eventId),/REGISTRATION_FOUNDER_UID_MISMATCH/);
    process.env.NODIV_UID_FOUNDER_CARD='04FADE0711';
    fx=await startApp(dbPath,eventId);
    assert.equal((await fx.login('04FADE0711')).role,'FOUNDER');
    assert.equal(fx.app.core.db.prepare("SELECT COUNT(*) n FROM lab_access_cards WHERE event_id=?").get(eventId).n,1);
  }finally{
    if(fx)await fx.app.close();
    if(previous===undefined)Reflect.deleteProperty(process.env,'NODIV_UID_FOUNDER_CARD');else process.env.NODIV_UID_FOUNDER_CARD=previous;
    rmSync(dir,{recursive:true,force:true});
  }
});
