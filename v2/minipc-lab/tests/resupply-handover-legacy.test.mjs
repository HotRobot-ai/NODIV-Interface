import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLabApp} from '../server/server.mjs';
import {DEFAULT_UIDS} from '../server/seed.mjs';

test('legacy assigned RE-SUPPLY without handover row is migrated, blocked at HQ, then persists after approval',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'nodiv-rs-legacy-'));
 const eventId='RS-LEGACY';
 const founderUid='04FADE0099';
 const prior=process.env.NODIV_UID_FOUNDER_CARD;
 process.env.NODIV_UID_FOUNDER_CARD=founderUid;
 const app=createLabApp({mode:'registration',dbPath:join(dir,'game.sqlite'),eventId,host:'127.0.0.1',port:0,sessionTtl:3600,grantTtl:90,exchangeTtl:300,tlsKey:null,tlsCert:null});
 try{
  const db=app.core.db;
  db.prepare("UPDATE events SET state='FIELD_ACTIVE' WHERE event_id=?").run(eventId);
  for(const [uid,actor] of [[DEFAULT_UIDS.pioneerAccess,'P9003'],[DEFAULT_UIDS.fopAccess,'FOP-TEST']])db.prepare('INSERT OR REPLACE INTO lab_access_cards(event_id,uid,actor_id) VALUES (?,?,?)').run(eventId,uid,actor);
  db.prepare("UPDATE actors SET capacity=1 WHERE event_id=? AND actor_id='P9003'").run(eventId);
  db.prepare("UPDATE nodes SET state='INSTALLED' WHERE event_id=? AND node_id='NODE-001'").run(eventId);
  db.prepare("INSERT INTO pioneer_known_nodes(event_id,actor_id,node_id,discovered_at) VALUES (?,?,?,?)").run(eventId,'P9003','NODE-001',Math.floor(Date.now()/1000));
  db.prepare('INSERT OR REPLACE INTO lab_node_tags(event_id,uid,node_id) VALUES (?,?,?)').run(eventId,DEFAULT_UIDS.node,'NODE-001');
  let n=0;
  for(const energy of [100,150,200]){n++;app.core.seedCore(eventId,{id:'LEG-N-'+n,uid:'LEGNODE'+n,energy,ownerType:'NODE',ownerId:'NODE-001',status:'DEPLOYED'});}
  app.core.seedCore(eventId,{id:'LEG-HQ',uid:'LEGHQ1',energy:240,ownerType:'HQ',ownerId:'HQ',status:'RESERVE'});
  await new Promise((resolve,reject)=>app.server.once('error',reject).listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  async function call(path,{token,data}={}){
   const response=await fetch(base+path,{method:data?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:data?JSON.stringify(data):undefined});
   const result=await response.json();
   if(!response.ok)throw Error(result.error);
   return result;
  }
  const pioneer=await call('/api/session/start',{data:{uid:DEFAULT_UIDS.pioneerAccess}});
  const fop=await call('/api/session/start',{data:{uid:DEFAULT_UIDS.fopAccess}});
  await call('/api/mission/assign-resupply',{token:pioneer.token,data:{count:1}});
  const mission=db.prepare("SELECT mission_id,core_id FROM missions WHERE event_id=? AND actor_id='P9003' AND kind='RESUPPLY' AND state='ASSIGNED'").get(eventId);
  assert.ok(db.prepare('SELECT 1 FROM lab_resupply_handover WHERE event_id=? AND mission_id=?').get(eventId,mission.mission_id));

  // Emulate a persisted assignment created before the HQ handover table existed.
  db.prepare('DELETE FROM lab_resupply_handover WHERE event_id=? AND mission_id=?').run(eventId,mission.mission_id);
  assert.equal(db.prepare('SELECT 1 FROM lab_resupply_handover WHERE event_id=? AND mission_id=?').get(eventId,mission.mission_id),undefined);

  let state=await call('/api/role/state',{token:pioneer.token});
  assert.equal(state.assignedMissions.length,1);
  assert.equal(state.assignedMissions[0].handoverRequired,true);
  assert.equal(state.assignedMissions[0].handoverConfirmed,false);
  assert.equal(state.nextAction.code,'RESUPPLY_HQ_HANDOVER');
  assert.match(state.nextAction.label,/HQ-ÜBERGABE/);
  const migrated=db.prepare('SELECT confirmed_at FROM lab_resupply_handover WHERE event_id=? AND mission_id=?').get(eventId,mission.mission_id);
  assert.ok(migrated);
  assert.equal(migrated.confirmed_at,null);

  const assignedUid=db.prepare('SELECT uid FROM cores WHERE event_id=? AND core_id=?').get(eventId,mission.core_id).uid;
  await assert.rejects(()=>call('/api/mission/hq-handover',{token:pioneer.token,data:{missionId:mission.mission_id,authorizerToken:fop.token,authorizerUid:DEFAULT_UIDS.fopAccess,uid:'LEGNODE1'}}),/RESUPPLY_CARGO_CONFLICT/);
  const approved=await call('/api/mission/hq-handover',{token:pioneer.token,data:{missionId:mission.mission_id,authorizerToken:fop.token,authorizerUid:DEFAULT_UIDS.fopAccess,uid:assignedUid}});
  assert.equal(approved.confirmed,true);

  // A new Pioneer session represents a browser reload/re-entry against the same saved game.
  const reloaded=await call('/api/session/start',{data:{uid:DEFAULT_UIDS.pioneerAccess}});
  state=await call('/api/role/state',{token:reloaded.token});
  assert.equal(state.assignedMissions[0].handoverRequired,true);
  assert.equal(state.assignedMissions[0].handoverConfirmed,true);
  assert.equal(state.nextAction.code,'RESUPPLY');
  assert.equal(app.core.assertIntegrity(eventId).ok,true);
 }finally{await app.close();if(prior===undefined)delete process.env.NODIV_UID_FOUNDER_CARD;else process.env.NODIV_UID_FOUNDER_CARD=prior;rmSync(dir,{recursive:true,force:true});}
});
