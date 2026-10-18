import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLabApp} from '../server/server.mjs';
import {DEFAULT_UIDS} from '../server/seed.mjs';

test('two RE-SUPPLY assignments require separate Founder/FOP handovers and persist',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'nodiv-rs-double-'));
 const eventId='RS-DOUBLE';
 const app=createLabApp({mode:'registration',dbPath:join(dir,'game.sqlite'),eventId,host:'127.0.0.1',port:0,sessionTtl:3600,grantTtl:90,exchangeTtl:300,tlsKey:null,tlsCert:null});
 try{
  const db=app.core.db;
  db.prepare("UPDATE events SET state='FIELD_ACTIVE' WHERE event_id=?").run(eventId);
  db.prepare("UPDATE actors SET capacity=3 WHERE event_id=? AND actor_id='P9003'").run(eventId);
  for(const nodeId of ['NODE-001','NODE-002']){
   db.prepare("UPDATE nodes SET state='INSTALLED' WHERE event_id=? AND node_id=?").run(eventId,nodeId);
   db.prepare("INSERT INTO pioneer_known_nodes(event_id,actor_id,node_id) VALUES (?,?,?)").run(eventId,'P9003',nodeId);
  }
  let n=0;
  for(const nodeId of ['NODE-001','NODE-002']){
   for(const energy of [100,150,200]){
    n++;
    app.core.seedCore(eventId,{id:'RS-N-'+n,uid:'RSNODE'+n,energy,ownerType:'NODE',ownerId:nodeId,status:'DEPLOYED'});
   }
  }
  for(const energy of [240,260]){n++;app.core.seedCore(eventId,{id:'RS-H-'+n,uid:'RSHQ'+n,energy,ownerType:'HQ',ownerId:'HQ',status:'RESERVE'});}
  await new Promise((resolve,reject)=>app.server.once('error',reject).listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  async function call(path,{token,data}={}){
   const response=await fetch(base+path,{method:data?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:data?JSON.stringify(data):undefined});
   const result=await response.json();
   if(!response.ok)throw Error(result.error);
   return result;
  }
  const pioneer=await call('/api/session/start',{data:{uid:DEFAULT_UIDS.pioneerAccess}});
  const founder=await call('/api/session/start',{data:{uid:DEFAULT_UIDS.founderAccess}});
  const fop=await call('/api/session/start',{data:{uid:DEFAULT_UIDS.fopAccess}});
  const offer=await call('/api/role/state',{token:pioneer.token});
  assert.equal(offer.resupplyDispatch.maxCount,2);
  const assigned=await call('/api/mission/assign-resupply',{token:pioneer.token,data:{count:2}});
  assert.equal(assigned.assignments.length,2);
  assert.equal(new Set(assigned.assignments.map(m=>m.nodeId)).size,2);
  let state=await call('/api/role/state',{token:pioneer.token});
  assert.equal(state.assignedMissions.length,2);
  assert.ok(state.assignedMissions.every(m=>m.handoverRequired&&!m.handoverConfirmed));
  const missions=db.prepare("SELECT mission_id,core_id FROM missions WHERE event_id=? AND actor_id='P9003' AND kind='RESUPPLY'").all(eventId);
  const coreUid=id=>db.prepare('SELECT uid FROM cores WHERE event_id=? AND core_id=?').get(eventId,id).uid;
  const payload=(m,auth,uid)=>({missionId:m.mission_id,authorizerToken:auth.token,authorizerUid:uid,uid:coreUid(m.core_id)});
  await assert.rejects(()=>call('/api/mission/hq-handover',{token:pioneer.token,data:payload(missions[0],pioneer,DEFAULT_UIDS.pioneerAccess)}),/RESUPPLY_AUTHORIZER_DENIED/);
  await assert.rejects(()=>call('/api/mission/hq-handover',{token:pioneer.token,data:payload(missions[0],founder,DEFAULT_UIDS.fopAccess)}),/RESUPPLY_AUTHORIZER_CARD_MISMATCH/);
  await call('/api/mission/hq-handover',{token:pioneer.token,data:payload(missions[0],founder,DEFAULT_UIDS.founderAccess)});
  state=await call('/api/role/state',{token:pioneer.token});
  assert.equal(state.assignedMissions.filter(m=>m.handoverConfirmed).length,1);
  await call('/api/mission/hq-handover',{token:pioneer.token,data:payload(missions[1],fop,DEFAULT_UIDS.fopAccess)});
  state=await call('/api/role/state',{token:pioneer.token});
  assert.ok(state.assignedMissions.every(m=>m.handoverConfirmed));
  assert.equal(app.core.assertIntegrity(eventId).ok,true);
 }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});
