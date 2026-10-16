import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {seedTestDatabase} from '../server/seed.mjs';
import {createV2GameplayRuntime} from '../../server/gameplay-runtime.mjs';
import {createFounderRegistry} from '../server/founder-registry.mjs';
import {createLabApp} from '../server/server.mjs';

test('BLOCK06 representative EVAC reaches normal Founder COMPLETED after physical-team gate',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'nodiv-evac-e2e-'));
  const source=join(dir,'source.sqlite'),target=join(dir,'evac.sqlite');
  const sourceEvent='BLOCK06-REALTEST',eventId='EVAC-REALTEST';
  const previous=process.env.NODIV_UID_FOUNDER_CARD;
  process.env.NODIV_UID_FOUNDER_CARD='04FADE0001';
  let app,src;
  try{
    seedTestDatabase(source,sourceEvent,'registration');
    src=createV2GameplayRuntime(source);
    const reg=createFounderRegistry(src.core.db);
    for(const [id,uid] of [['FOP-TEST','04AA0002'],['P9003','04AA0003'],['P9004','04AA0004']])reg.register({eventId:sourceEvent,role:'CARD',id,uid});
    for(const [id,uid] of [['NODE-001','04BB0001'],['NODE-002','04BB0002']])reg.register({eventId:sourceEvent,role:'NODE',id,uid});
    reg.register({eventId:sourceEvent,role:'HQ',id:'HQ-01',uid:'04CC0001'});
    for(let i=1;i<=12;i++)reg.register({eventId:sourceEvent,role:'CORE',id:'NC-'+String(i).padStart(3,'0'),uid:'04DD'+String(i).padStart(4,'0'),energy:180+i*10});
    src.close();src=null;

    app=createLabApp({mode:'evac',dbPath:target,eventId,sourceDbPath:source,sourceEventId:sourceEvent,host:'127.0.0.1',port:0,sessionTtl:3600,grantTtl:90,exchangeTtl:300,tlsKey:null,tlsCert:null});
    await new Promise((resolve,reject)=>app.server.once('error',reject).listen(0,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+app.server.address().port;
    async function call(path,{method='GET',data,token}={}){
      const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:data?JSON.stringify(data):undefined});
      const j=await r.json();if(!r.ok)throw Error(j.error||'HTTP_'+r.status);return j;
    }
    const login=uid=>call('/api/session/start',{method:'POST',data:{uid}});

    const founder=await login('04FADE0001');
    await call('/api/founder/evac/start',{method:'POST',token:founder.token,data:{operationId:'E2E-EVAC-START'}});
    const fop=await login('04AA0002');
    const team=await call('/api/evac/team',{method:'POST',token:fop.token,data:{pioneerAUid:'04AA0003',pioneerBUid:'04AA0004'}});
    assert.deepEqual(team.assignments.map(x=>x.nodeId),['NODE-001','NODE-002']);

    for(const [i,nodeUid] of [[0,'04BB0001'],[1,'04BB0002']]){
      const assignment=team.assignments[i];
      const snapshot=JSON.parse(app.core.db.prepare('SELECT core_snapshot FROM evac_assignments WHERE event_id=? AND team_id=? AND node_id=?').get(eventId,team.teamId,assignment.nodeId).core_snapshot);
      const operationId='E2E-REC-'+assignment.nodeId;
      const checked=await call('/api/evac/recovery/check',{method:'POST',token:fop.token,data:{teamId:team.teamId,nodeUid,coreUids:snapshot.map(x=>x.uid),operationId}});
      await call('/api/evac/recovery/confirm',{method:'POST',token:fop.token,data:{teamId:team.teamId,nodeId:checked.nodeId,operationId:checked.operationId,scannedCoreUids:checked.scannedCoreUids,proofId:checked.proofId,nfcGrantId:checked.nfcGrantId}});
    }

    for(const [uid,actor] of [['04AA0003','P9003'],['04AA0004','P9004']]){
      const pioneer=await login(uid),state=await call('/api/evac/state',{token:pioneer.token});
      assert.equal(state.recovered,true);assert.equal(state.cargo.length,3);
      const selected=state.cargo[0];
      const selectedUid=app.core.core(eventId,selected.id).uid;
      const operationId='E2E-UP-'+actor;
      const checked=await call('/api/evac/final/check',{method:'POST',token:pioneer.token,data:{teamId:state.team.id,selectedCoreUid:selectedUid,operationId}});
      await call('/api/evac/final/confirm',{method:'POST',token:pioneer.token,data:{teamId:state.team.id,operationId:checked.operationId,coreIds:checked.coreIds,selectedCoreId:checked.selectedCoreId,proofId:checked.proofId,nfcGrantId:checked.nfcGrantId}});
    }

    let fv=await call('/api/role/state',{token:founder.token});
    assert.equal(fv.evacSupport.ready,true);assert.equal(fv.evacSupport.physicalRecoveries,2);assert.equal(fv.evacSupport.physicalUploads,2);
    const support=await call('/api/founder/evac/support',{method:'POST',token:founder.token});
    assert.equal(support.done,true);assert.equal(support.totalRecoveries,10);assert.equal(support.totalUploads,10);
    fv=await call('/api/role/state',{token:founder.token});
    assert.ok(fv.allowedActions.includes('EVAC_COMPLETE'));
    const completed=await call('/api/founder/evac/complete',{method:'POST',token:founder.token,data:{operationId:'E2E-COMPLETE'}});
    assert.equal(completed.completed,true);
    assert.equal(app.core.db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId).state,'COMPLETED');
    assert.equal(app.core.assertIntegrity(eventId).ok,true);
  }finally{
    if(app)await app.close();
    if(src)src.close();
    if(previous===undefined)Reflect.deleteProperty(process.env,'NODIV_UID_FOUNDER_CARD');else process.env.NODIV_UID_FOUNDER_CARD=previous;
    rmSync(dir,{recursive:true,force:true});
  }
});
