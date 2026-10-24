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
    const j=await r.json().catch(()=>({}));
    if(!r.ok){const e=Error(j.error||'HTTP_'+r.status);Object.assign(e,j);throw e}
    return j;
  }
  async function text(path,token){
    const r=await fetch(base+path,{headers:{authorization:'Bearer '+token}});
    const body=await r.text();if(!r.ok)throw Error(body);return {body,type:r.headers.get('content-type')||''};
  }
  return {app,base,call,text,login:uid=>call('/api/session/start',{method:'POST',data:{uid}})};
}

test('INITIAL DEPLOYMENT: complete two-Pioneer start, negative guards, restart recovery, first Exchange and report',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'nodiv-initial-deployment-')),dbPath=join(dir,'desktop.sqlite'),eventId='IDP-FLOW';
  const founderUid='04FADE1001',prior=process.env.NODIV_UID_FOUNDER_CARD;
  process.env.NODIV_UID_FOUNDER_CARD=founderUid;
  let fx;
  try{
    fx=await startApp(dbPath,eventId);
    let founder=await fx.login(founderUid);
    const createPlayer=data=>fx.call('/api/founder/player',{method:'POST',token:founder.token,data});
    const register=data=>fx.call('/api/founder/register',{method:'POST',token:founder.token,data});

    const fopPlayer=await createPlayer({realName:'Franz Operator',role:'FOP',callsign:'ANCHOR'});
    const p1Player=await createPlayer({realName:'Anna Pioneer',role:'PIONEER',callsign:'VECTOR'});
    const p2Player=await createPlayer({realName:'Ben Pioneer',role:'PIONEER'});
    const localPlayer=await createPlayer({realName:'Lena Local',role:'LOCAL',callsign:'SCOUT'});
    assert.equal(p1Player.callsign,'VECTOR');
    assert.ok(p2Player.callsign);
    assert.notEqual(p2Player.callsign,'VECTOR');

    const fopCard='04AA1001',p1Card='04AA1002',p2Card='04AA1003',localCard='04AA1004';
    await register({role:'CARD',id:fopPlayer.id,uid:fopCard});
    await register({role:'CARD',id:p1Player.id,uid:p1Card});
    await register({role:'CARD',id:p2Player.id,uid:p2Card});
    await register({role:'CARD',id:localPlayer.id,uid:localCard});
    const node1=await register({role:'NODE',uid:'04BB1001'});
    const node2=await register({role:'NODE',uid:'04BB1002'});
    const node3=await register({role:'NODE',uid:'04BB1003'});

    const cores=[];
    for(let i=0;i<10;i++){
      const uid='04CC'+String(1100+i).padStart(4,'0'),energy=120+i*31;
      cores.push(await register({role:'CORE',uid,energy}));
    }

    await assert.rejects(
      fx.call('/api/founder/deployment/configure',{method:'POST',token:founder.token,data:{teamId:'TEAM-01',fopId:fopPlayer.id,pioneerA:p1Player.id,pioneerB:p1Player.id,nodeA:node1.id,nodeB:node2.id,coreIdsA:cores.slice(0,3).map(x=>x.id),coreIdsB:cores.slice(3,6).map(x=>x.id)}}),
      /INITIAL_TEAM_ROLES_INVALID/
    );
    await assert.rejects(
      fx.call('/api/founder/deployment/configure',{method:'POST',token:founder.token,data:{teamId:'TEAM-01',fopId:fopPlayer.id,pioneerA:p1Player.id,pioneerB:p2Player.id,nodeA:node1.id,nodeB:node2.id,coreIdsA:cores.slice(0,3).map(x=>x.id),coreIdsB:[cores[2].id,cores[4].id,cores[5].id]}}),
      /INITIAL_CORE_DUPLICATE/
    );

    let configured=await fx.call('/api/founder/deployment/configure',{method:'POST',token:founder.token,data:{
      teamId:'TEAM-01',fopId:fopPlayer.id,pioneerA:p1Player.id,pioneerB:p2Player.id,nodeA:node1.id,nodeB:node2.id,
      coreIdsA:cores.slice(0,3).map(x=>x.id),coreIdsB:cores.slice(3,6).map(x=>x.id)
    }});
    assert.equal(configured.configured,true);
    assert.equal(configured.canPrepare,true);
    assert.equal(configured.teams[0].assignments.length,6);

    await fx.call('/api/founder/deployment/prepare',{method:'POST',token:founder.token});
    const db=fx.app.core.db;
    assert.equal(db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId).state,'INITIALIZED');
    assert.equal(db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id=? AND owner_type='PIONEER' AND owner_id=? AND status='FIELD'").get(eventId,p1Player.id).n,1);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id=? AND owner_type='PIONEER' AND owner_id=? AND status='FIELD'").get(eventId,p2Player.id).n,1);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id=? AND owner_type='TRANSIT' AND owner_id=? AND status='DEPLOYMENT_TRANSIT'").get(eventId,p1Player.id).n,3);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id=? AND owner_type='TRANSIT' AND owner_id=? AND status='DEPLOYMENT_TRANSIT'").get(eventId,p2Player.id).n,3);

    await fx.call('/api/founder/deployment/start',{method:'POST',token:founder.token});
    assert.equal(db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId).state,'FIELD_ACTIVE');

    let pioneer1=await fx.login(p1Card),pioneer2=await fx.login(p2Card),fop=await fx.login(fopCard),local=await fx.login(localCard);
    let p1View=await fx.call('/api/role/state',{token:pioneer1.token});
    assert.equal(p1View.actor.callsign,'VECTOR');
    assert.equal(p1View.initialDeployment.teamId,'TEAM-01');
    assert.equal(p1View.initialDeployment.released,false);
    assert.equal('nodeId' in p1View.initialDeployment,false);
    await assert.rejects(fx.call('/api/scan',{method:'POST',token:pioneer1.token,data:{uid:node1.uid}}),/INITIAL_DEPLOYMENT_LOCKED/);
    await assert.rejects(fx.call('/api/fop/deployment/confirm-pioneer',{method:'POST',token:fop.token,data:{uid:localCard}}),/INITIAL_PIONEER_INVALID/);

    let confirm=await fx.call('/api/fop/deployment/confirm-pioneer',{method:'POST',token:fop.token,data:{uid:p1Card}});
    assert.equal(confirm.confirmed,1);
    const duplicate=await fx.call('/api/fop/deployment/confirm-pioneer',{method:'POST',token:fop.token,data:{uid:p1Card}});
    assert.equal(duplicate.replayed,true);
    confirm=await fx.call('/api/fop/deployment/confirm-pioneer',{method:'POST',token:fop.token,data:{uid:p2Card}});
    assert.equal(confirm.teamActivated,true);
    await assert.rejects(fx.call('/api/fop/loadout',{method:'POST',token:fop.token,data:{nodeId:node1.id}}),/INITIAL_DIRECT_HQ_LOADOUT_BLOCKED/);

    const uidById=new Map(cores.map(x=>[x.id,x.uid]));
    const setA=cores.slice(0,3).map(x=>x.uid),setB=cores.slice(3,6).map(x=>x.uid);
    await assert.rejects(fx.call('/api/fop/deployment/handover',{method:'POST',token:fop.token,data:{pioneerUid:p1Card,coreUids:[setA[0],setA[1],setB[0]]}}),/INITIAL_HANDOVER_CORE_MISMATCH/);
    await fx.call('/api/fop/deployment/handover',{method:'POST',token:fop.token,data:{pioneerUid:p1Card,coreUids:setA}});
    await fx.call('/api/fop/deployment/handover',{method:'POST',token:fop.token,data:{pioneerUid:p2Card,coreUids:setB}});
    assert.equal(db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id=? AND owner_type='TRANSIT' AND owner_id=? AND status='IN_TRANSIT'").get(eventId,fopPlayer.id).n,6);

    await assert.rejects(fx.call('/api/fop/scan',{method:'POST',token:fop.token,data:{uid:node3.uid}}),/INITIAL_NODE_NOT_ASSIGNED/);
    const scan1=await fx.call('/api/fop/scan',{method:'POST',token:fop.token,data:{uid:node1.uid}});
    assert.equal(scan1.initialDeployment,true);
    assert.equal(scan1.transit.length,3);
    assert.deepEqual(new Set(scan1.transit.map(x=>x.core_id)),new Set(cores.slice(0,3).map(x=>x.id)));
    await assert.rejects(fx.call('/api/fop/install',{method:'POST',token:fop.token,data:{nodeId:node1.id,coreUids:setB,operationId:'IDP-WRONG-INSTALL'}}),/INITIAL_INSTALL_CORE_MISMATCH/);
    const installed1=await fx.call('/api/fop/install',{method:'POST',token:fop.token,data:{nodeId:node1.id,coreUids:setA,operationId:'IDP-INSTALL-1'}});
    assert.match(installed1.mechanicalCode,/^\d{4}$/);

    // Simulate the narrow crash window after authoritative INSTALL but before its lab marker.
    db.prepare('UPDATE lab_initial_core_assignments SET installed_at=NULL WHERE event_id=? AND node_id=?').run(eventId,node1.id);
    await fx.app.close();fx=null;
    fx=await startApp(dbPath,eventId);
    founder=await fx.login(founderUid);pioneer1=await fx.login(p1Card);pioneer2=await fx.login(p2Card);fop=await fx.login(fopCard);local=await fx.login(localCard);
    p1View=await fx.call('/api/role/state',{token:pioneer1.token});
    assert.equal(p1View.initialDeployment.nodeReady,true);
    assert.equal(fx.app.core.db.prepare('SELECT COUNT(*) n FROM lab_initial_core_assignments WHERE event_id=? AND node_id=? AND installed_at IS NOT NULL').get(eventId,node1.id).n,3);

    await assert.rejects(fx.call('/api/pioneer/deployment/activate',{method:'POST',token:pioneer2.token,data:{uid:node1.uid}}),/INITIAL_PIONEER_NODE_MISMATCH/);
    const act1=await fx.call('/api/pioneer/deployment/activate',{method:'POST',token:pioneer1.token,data:{uid:node1.uid}});
    assert.equal(act1.released,false);
    await assert.rejects(fx.call('/api/scan',{method:'POST',token:pioneer1.token,data:{uid:node1.uid}}),/INITIAL_DEPLOYMENT_LOCKED/);

    const scan2=await fx.call('/api/fop/scan',{method:'POST',token:fop.token,data:{uid:node2.uid}});
    assert.equal(scan2.transit.length,3);
    await fx.call('/api/fop/install',{method:'POST',token:fop.token,data:{nodeId:node2.id,coreUids:setB,operationId:'IDP-INSTALL-2'}});
    const act2=await fx.call('/api/pioneer/deployment/activate',{method:'POST',token:pioneer2.token,data:{uid:node2.uid}});
    assert.equal(act2.released,true);

    p1View=await fx.call('/api/role/state',{token:pioneer1.token});
    assert.equal(p1View.initialDeployment.released,true);
    assert.equal(p1View.inventory.used,1);

    const personal=fx.app.core.db.prepare("SELECT uid FROM cores WHERE event_id=? AND owner_type='PIONEER' AND owner_id=? AND status='FIELD' LIMIT 1").get(eventId,p1Player.id);
    const nodeCore=fx.app.core.db.prepare("SELECT uid FROM cores WHERE event_id=? AND owner_type='NODE' AND owner_id=? AND status='DEPLOYED' ORDER BY core_id LIMIT 1").get(eventId,node1.id);
    const grant=await fx.call('/api/scan',{method:'POST',token:pioneer1.token,data:{uid:node1.uid}});
    const prepared=await fx.call('/api/exchange/prepare',{method:'POST',token:pioneer1.token,data:{grantId:grant.grantId,count:1}});
    await fx.call('/api/scan',{method:'POST',token:pioneer1.token,data:{exchangeId:prepared.exchangeId,uid:personal.uid}});
    const ready=await fx.call('/api/scan',{method:'POST',token:pioneer1.token,data:{exchangeId:prepared.exchangeId,uid:nodeCore.uid}});
    assert.equal(ready.ready,true);
    const exchanged=await fx.call('/api/exchange/confirm',{method:'POST',token:pioneer1.token,data:{exchangeId:prepared.exchangeId,accessCode:prepared.accessCode}});
    assert.equal(exchanged.count,1);
    assert.equal(fx.app.core.assertIntegrity(eventId).ok,true);

    const ended=await fx.call('/api/founder/test/end',{method:'POST',token:founder.token});
    assert.equal(ended.status,'TEST_ENDED');
    await fx.call('/api/test/feedback',{method:'POST',token:pioneer1.token,data:{clarity:5,usability:4,scanning:4,atmosphere:5,suggestion:'Rendezvous war klar.'}});
    const html=await fx.text('/api/founder/test/report?format=html',founder.token);
    assert.match(html.type,/text\/html/);
    assert.match(html.body,/Team TEAM-01/);
    assert.match(html.body,/Spielerfeedback/);
    assert.match(html.body,/VECTOR/);
    const csv=await fx.text('/api/founder/test/report?format=csv',founder.token);
    assert.match(csv.type,/text\/csv/);
    assert.match(csv.body,/feedback/);
    assert.match(csv.body,/EXCHANGE/);
  }finally{
    if(fx)await fx.app.close();
    if(prior===undefined)Reflect.deleteProperty(process.env,'NODIV_UID_FOUNDER_CARD');else process.env.NODIV_UID_FOUNDER_CARD=prior;
    rmSync(dir,{recursive:true,force:true});
  }
});
