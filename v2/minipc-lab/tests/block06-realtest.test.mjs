import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLabApp} from '../server/server.mjs';

async function startApp(dbPath,eventId){
  const app=createLabApp({mode:'registration',dbPath,eventId,host:'127.0.0.1',port:0,sessionTtl:3600,grantTtl:90,exchangeTtl:300,tlsKey:null,tlsCert:null});
  await new Promise((resolve,reject)=>app.server.once('error',reject).listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  async function call(path,{method='GET',data,token}={}){
    const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:data?JSON.stringify(data):undefined});
    const j=await r.json();if(!r.ok){const e=Error(j.error||'HTTP_'+r.status);e.blockers=j.blockers;throw e}return j;
  }
  return {app,call,login:uid=>call('/api/session/start',{method:'POST',data:{uid}})};
}

test('BLOCK06 registration flow persists start and exposes RESTORE only after qualification',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'nodiv-b06-real-')),dbPath=join(dir,'block06.sqlite'),eventId='B06-REAL';
  const previous=process.env.NODIV_UID_FOUNDER_CARD;
  process.env.NODIV_UID_FOUNDER_CARD='04FADE0001';
  let fx;
  try{
    fx=await startApp(dbPath,eventId);
    const founder=await fx.login('04FADE0001');
    const register=(role,id,uid,energy)=>fx.call('/api/founder/register',{method:'POST',token:founder.token,data:{role,id,uid,...(energy?{energy}:{})}});
    for(const [id,uid] of [['FOP-TEST','04AA0002'],['P9003','04AA0003'],['P9004','04AA0004'],['LOCAL-TEST','04AA0005'],['UNBOUND-TEST','04AA0006']])await register('CARD',id,uid);
    for(const [id,uid] of [['NODE-001','04BB0001'],['NODE-002','04BB0002'],['NODE-003','04BB0003'],['NODE-004','04BB0004']])await register('NODE',id,uid);
    await register('HQ','HQ-01','04CC0001');
    const energies=[500,480,460,400,350,330,310,290,270,250,230,210];
    for(let i=0;i<12;i++)await register('CORE','NC-'+String(i+1).padStart(3,'0'),'04DD'+String(i+1).padStart(4,'0'),energies[i]);

    let fv=await fx.call('/api/role/state',{token:founder.token});
    assert.equal(fv.event.state,'READY');assert.equal(fv.realtest.canInitialize,true);assert.equal(fv.realtest.counts.cards,6);assert.equal(fv.realtest.counts.cores,12);
    const initialized=await fx.call('/api/founder/realtest/initialize',{method:'POST',token:founder.token});
    assert.equal(initialized.status,'INITIALIZED');assert.equal(initialized.plan.p9004.energy,400);assert.equal(initialized.plan.fop.length,6);
    await assert.rejects(()=>register('CORE','NC-099','04DD0099',199),/REGISTRATION_PHASE_DENIED/);
    const started=await fx.call('/api/founder/realtest/start',{method:'POST',token:founder.token});assert.equal(started.status,'FIELD_ACTIVE');

    const p3=await fx.login('04AA0003');
    let pv=await fx.call('/api/role/state',{token:p3.token});assert.equal(pv.restoreDispatch.eligible,false);
    const plan=initialized.plan;
    const fop=await fx.login('04AA0002');
    const first3=plan.fop.slice(0,3).map(id=>fx.app.core.core(eventId,id).uid);
    const next3=plan.fop.slice(3,6).map(id=>fx.app.core.core(eventId,id).uid);
    await fx.call('/api/fop/install',{method:'POST',token:fop.token,data:{nodeId:'NODE-001',coreUids:first3,operationId:'B06-IN-1'}});
    await fx.call('/api/fop/install',{method:'POST',token:fop.token,data:{nodeId:'NODE-002',coreUids:next3,operationId:'B06-IN-2'}});
    await fx.call('/api/fop/deinstall',{method:'POST',token:fop.token,data:{nodeId:'NODE-002',operationId:'B06-OUT-2'}});
    const loadout=await fx.call('/api/fop/loadout',{method:'POST',token:fop.token,data:{nodeId:'NODE-003'}});
    assert.equal(loadout.transit.length,3);
    assert.equal(fx.app.core.core(eventId,plan.resupply).owner_type,'HQ');
    for(const id of plan.restoreReserve)assert.equal(fx.app.core.core(eventId,id).owner_type,'HQ');
    const loadoutUids=loadout.transit.map(x=>fx.app.core.core(eventId,x.core_id).uid);
    await fx.call('/api/fop/install',{method:'POST',token:fop.token,data:{nodeId:'NODE-003',coreUids:loadoutUids,operationId:'B06-IN-3'}});
    const take=fx.app.core.db.prepare("SELECT core_id FROM cores WHERE event_id=? AND owner_type='NODE' AND owner_id='NODE-001' ORDER BY core_id LIMIT 1").get(eventId).core_id;
    await fx.call('/api/scan',{method:'POST',token:p3.token,data:{uid:'04BB0001'}});
    fx.app.runtime.exchange({eventId,operationId:'B06-X1',pioneerId:'P9003',nodeId:'NODE-001',gives:[plan.p9003.coreId],takes:[take]});
    pv=await fx.call('/api/role/state',{token:p3.token});assert.equal(pv.restoreDispatch.eligible,true);assert.equal(pv.restoreDispatch.phase,1);
    const mission=await fx.call('/api/mission/assign-next',{method:'POST',token:p3.token});
    assert.equal(mission.kind,'RESTORE_1');
    const active=fx.app.core.db.prepare("SELECT * FROM missions WHERE event_id=? AND actor_id='P9003' AND state='ASSIGNED'").get(eventId);
    assert.equal(active.core_id,mission.coreId);assert.equal(fx.app.core.core(eventId,mission.coreId).owner_type,'TRANSIT');

    await fx.app.close();fx=null;
    fx=await startApp(dbPath,eventId);
    assert.equal(fx.app.core.db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId).state,'FIELD_ACTIVE');
    assert.equal(fx.app.core.db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id=?").get(eventId).n,12);
    assert.equal(fx.app.core.assertIntegrity(eventId).ok,true);
  }finally{
    if(fx)await fx.app.close();
    if(previous===undefined)Reflect.deleteProperty(process.env,'NODIV_UID_FOUNDER_CARD');else process.env.NODIV_UID_FOUNDER_CARD=previous;
    rmSync(dir,{recursive:true,force:true});
  }
});
