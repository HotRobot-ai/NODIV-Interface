import http from 'node:http';
import https from 'node:https';
import { readFileSync, existsSync, createReadStream } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { createV2GameplayRuntime } from '../../server/gameplay-runtime.mjs';
import { createLabStore, normalizeUid } from './lab-db.mjs';
import { seedTestDatabase } from './seed.mjs';
import { labConfig } from './config.mjs';
import { createLabEvacNfc } from './evac-lab-nfc.mjs';
import { createFounderRegistry } from './founder-registry.mjs';
import { createDesktopTest } from './desktop-test.mjs';

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const CLIENT=join(ROOT,'client');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
function json(res,status,data){const body=JSON.stringify(data);res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','content-length':Buffer.byteLength(body),'x-content-type-options':'nosniff'});res.end(body);}
async function body(req){let raw='';for await(const c of req){raw+=c;if(raw.length>64*1024)throw Error('BODY_TOO_LARGE');}return raw?JSON.parse(raw):{};}
function bearer(req){const h=req.headers.authorization||'';return h.startsWith('Bearer ')?h.slice(7):'';}
function errCode(e){return e?.code||e?.message||'INTERNAL_ERROR';}
function statusFor(code){
  if(code==='NO_SESSION')return 401;
  if(/BUSY|COOLDOWN|LOCKED|PROTECTED|CONFLICT|OWNERSHIP_CHANGED|IDEMPOTENCY|RESERVED|FULL|BLOCKED|CHANGED/.test(code))return 409;
  if(/DENIED|UNKNOWN|REQUIRED|INVALID|INCOMPLETE|EXPIRED|NOT_|REQUIRES|MISMATCH|FIELD_ACTIVE/.test(code))return 400;
  return 500;
}
function serveStatic(req,res){
  const url=new URL(req.url,'http://local'); let path=url.pathname==='/'?'/index.html':url.pathname;
  path=normalize(path).replace(/^(\.\.[/\\])+/, ''); const full=join(CLIENT,path);
  if(!full.startsWith(CLIENT)||!existsSync(full)){json(res,404,{ok:false,error:'NOT_FOUND'});return;}
  res.writeHead(200,{'content-type':MIME[extname(full)]||'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff'});createReadStream(full).pipe(res);
}
function requireRole(session,...roles){if(!roles.includes(session.role))throw Error('ROLE_DENIED');}
function activeMission(db,eventId,actorId,now){
  return db.prepare("SELECT * FROM missions WHERE event_id=? AND actor_id=? AND state='ASSIGNED' AND expires_at>? AND kind IN ('RESTORE_1','RESTORE_2','RESUPPLY') ORDER BY expires_at,mission_id LIMIT 1").get(eventId,actorId,now);
}
function lowestNodeCore(db,eventId,nodeId){
  return db.prepare("SELECT core_id,uid,visible_energy,status FROM cores WHERE event_id=? AND owner_type='NODE' AND owner_id=? ORDER BY visible_energy ASC,core_id ASC LIMIT 1").get(eventId,nodeId);
}

function createBlock06Realtest(core,mode){
  const db=core.db;
  db.exec(`CREATE TABLE IF NOT EXISTS lab_block06_setup (
    event_id TEXT PRIMARY KEY,
    plan_json TEXT NOT NULL,
    initialized_at INTEGER NOT NULL,
    started_at INTEGER
  )`);
  const required=[['FOUNDER-TEST','FOUNDER'],['FOP-TEST','FOP'],['P9003','PIONEER'],['P9004','PIONEER'],['LOCAL-TEST','LOCAL'],['UNBOUND-TEST','UNBOUND']];
  const requireMode=()=>{if(!['registration','desktop'].includes(mode))throw Error('REALTEST_REGISTRATION_MODE_REQUIRED')};
  const receipt=eventId=>{
    const r=db.prepare('SELECT * FROM lab_block06_setup WHERE event_id=?').get(eventId);
    if(!r)return null;
    try{return {...r,plan:JSON.parse(r.plan_json)}}catch{throw Error('REALTEST_SETUP_CORRUPT')}
  };
  const makePlan=eventId=>{
    const cores=db.prepare("SELECT core_id,visible_energy FROM cores WHERE event_id=? AND owner_type='HQ' AND owner_id='HQ' AND status='RESERVE' ORDER BY visible_energy DESC,core_id").all(eventId);
    if(cores.length<12)return null;
    const c=cores.slice(0,12);
    return {restoreReserve:c.slice(0,3).map(x=>x.core_id),p9004:{coreId:c[3].core_id,energy:c[3].visible_energy},p9003:{coreId:c[4].core_id,energy:c[4].visible_energy},fop:c.slice(5,11).map(x=>x.core_id),fopEnergies:c.slice(5,11).map(x=>x.visible_energy),resupply:c[11].core_id};
  };
  function status(eventId){
    requireMode();
    const event=db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId);if(!event)throw Error('EVENT_UNKNOWN');
    const blockers=[];
    for(const [id,role] of required){
      const a=db.prepare('SELECT role,active FROM actors WHERE event_id=? AND actor_id=?').get(eventId,id);
      const card=db.prepare('SELECT 1 FROM lab_access_cards WHERE event_id=? AND actor_id=?').get(eventId,id);
      if(a?.role!==role||a.active!==1||!card)blockers.push('CARD_REQUIRED:'+id);
    }
    for(const id of ['NODE-001','NODE-002','NODE-003','NODE-004']){
      const n=db.prepare('SELECT n.state,t.uid FROM nodes n LEFT JOIN lab_node_tags t ON t.event_id=n.event_id AND t.node_id=n.node_id WHERE n.event_id=? AND n.node_id=?').get(eventId,id);
      if(!n?.uid)blockers.push('NODE_REQUIRED:'+id);
      if(event.state==='READY'&&n?.state!=='AVAILABLE')blockers.push('NODE_NOT_AVAILABLE:'+id);
    }
    const hq=db.prepare("SELECT uid,active FROM hq_upload_bays WHERE event_id=? AND bay_id='HQ-01'").get(eventId);
    if(!hq?.uid||String(hq.uid).startsWith('PENDING-')||hq.active!==1)blockers.push('HQ_REQUIRED');
    const coreCount=db.prepare('SELECT COUNT(*) n FROM cores WHERE event_id=?').get(eventId).n;
    const hqCount=db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id=? AND owner_type='HQ' AND owner_id='HQ' AND status='RESERVE'").get(eventId).n;
    let plan=receipt(eventId)?.plan||null;
    if(event.state==='READY'){
      if(coreCount<12||hqCount<12)blockers.push('TWELVE_CORES_REQUIRED');
      if(db.prepare('SELECT 1 FROM operations WHERE event_id=? LIMIT 1').get(eventId))blockers.push('FRESH_EVENT_REQUIRED');
      plan=makePlan(eventId);
      if(plan&&Math.max(...plan.fopEnergies)<150)blockers.push('SECURE_APPROACH_150E_NOT_POSSIBLE');
    }
    if(event.state==='INITIALIZED'&&!plan)blockers.push('SETUP_RECEIPT_MISSING');
    return {eventState:event.state,blockers:[...new Set(blockers)],canInitialize:event.state==='READY'&&!blockers.length,canStart:event.state==='INITIALIZED'&&!blockers.length,counts:{cards:6-blockers.filter(x=>x.startsWith('CARD_REQUIRED:')).length,nodes:4-blockers.filter(x=>x.startsWith('NODE_REQUIRED:')).length,cores:coreCount,hq:hq?.uid&&!String(hq.uid).startsWith('PENDING-')?1:0},plan};
  }
  function initialize(eventId,founderId){
    requireMode();
    const prior=receipt(eventId);if(prior)return {eventId,status:'INITIALIZED',replayed:true,plan:prior.plan};
    const s=status(eventId);if(!s.canInitialize){const e=Error('REALTEST_PREFLIGHT_BLOCKED');e.blockers=s.blockers;throw e}
    const founder=db.prepare('SELECT role,active FROM actors WHERE event_id=? AND actor_id=?').get(eventId,founderId);if(founder?.role!=='FOUNDER'||founder.active!==1)throw Error('REALTEST_FOUNDER_REQUIRED');
    const plan=makePlan(eventId);
    db.exec('BEGIN IMMEDIATE');
    try{
      const move=(id,type,owner,status)=>{
        if(db.prepare("UPDATE cores SET owner_type=?,owner_id=?,status=?,version=version+1 WHERE event_id=? AND core_id=? AND owner_type='HQ' AND owner_id='HQ' AND status='RESERVE'").run(type,owner,status,eventId,id).changes!==1)throw Error('REALTEST_CORE_CHANGED');
      };
      move(plan.p9003.coreId,'PIONEER','P9003','FIELD');move(plan.p9004.coreId,'PIONEER','P9004','FIELD');
      for(const id of plan.fop)move(id,'TRANSIT','FOP-TEST','IN_TRANSIT');
      if(db.prepare("UPDATE events SET state='INITIALIZED' WHERE event_id=? AND state='READY'").run(eventId).changes!==1)throw Error('REALTEST_STATE_CHANGED');
      db.prepare('INSERT INTO lab_block06_setup(event_id,plan_json,initialized_at) VALUES (?,?,?)').run(eventId,JSON.stringify(plan),core.clock());
      core.assertIntegrity(eventId);db.exec('COMMIT');
      return {eventId,status:'INITIALIZED',replayed:false,plan};
    }catch(e){db.exec('ROLLBACK');throw e}
  }
  function start(eventId){
    requireMode();const s=status(eventId);if(!s.canStart){const e=Error('REALTEST_START_BLOCKED');e.blockers=s.blockers;throw e}
    db.exec('BEGIN IMMEDIATE');
    try{
      if(db.prepare("UPDATE events SET state='FIELD_ACTIVE' WHERE event_id=? AND state='INITIALIZED'").run(eventId).changes!==1)throw Error('REALTEST_STATE_CHANGED');
      db.prepare('UPDATE lab_block06_setup SET started_at=? WHERE event_id=?').run(core.clock(),eventId);
      core.assertIntegrity(eventId);db.exec('COMMIT');return {eventId,status:'FIELD_ACTIVE'};
    }catch(e){db.exec('ROLLBACK');throw e}
  }
  const phase=(eventId,actorId)=>{
    const a=db.prepare('SELECT role,capacity FROM actors WHERE event_id=? AND actor_id=?').get(eventId,actorId);
    if(a?.role!=='PIONEER')return null;
    if(a.capacity===1)return db.prepare("SELECT 1 FROM operations WHERE event_id=? AND actor_id=? AND kind='EXCHANGE' LIMIT 1").get(eventId,actorId)?1:null;
    if(a.capacity===2){
      const r1=db.prepare("SELECT rowid FROM operations WHERE event_id=? AND actor_id=? AND kind='RESTORE_1' ORDER BY rowid DESC LIMIT 1").get(eventId,actorId);if(!r1)return null;
      const xs=db.prepare("SELECT response_json FROM operations WHERE event_id=? AND actor_id=? AND kind='EXCHANGE' AND rowid>?").all(eventId,actorId,r1.rowid);
      return xs.some(x=>{try{return JSON.parse(x.response_json)?.moved?.length===4}catch{return false}})?2:null;
    }
    return null;
  };
  function restoreStatus(eventId,actorId){
    requireMode();
    if(db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId)?.state!=='FIELD_ACTIVE')return {eligible:false};
    if(activeMission(db,eventId,actorId,core.clock()))return {eligible:false};
    const p=phase(eventId,actorId);if(!p)return {eligible:false};
    const setup=receipt(eventId),reserved=setup?.plan?.resupply||'';
    const cargo=db.prepare("SELECT core_id,visible_energy FROM cores WHERE event_id=? AND owner_type='HQ' AND owner_id='HQ' AND status='RESERVE' AND core_id<>? ORDER BY visible_energy ASC,core_id").all(eventId,reserved);
    const locks=new Set(core.enforceNodeLocks?db.prepare("SELECT node_id FROM actor_node_locks WHERE event_id=? AND actor_id=? AND until_epoch>?").all(eventId,actorId,core.clock()).map(x=>x.node_id):[]);
    const candidates=[];
    for(const n of db.prepare("SELECT node_id FROM nodes WHERE event_id=? AND state='INSTALLED' ORDER BY node_id").all(eventId)){
      if(locks.has(n.node_id)||!isKnownNode(db,eventId,actorId,n.node_id))continue;
      if(db.prepare("SELECT 1 FROM missions WHERE event_id=? AND node_id=? AND state='ASSIGNED' AND expires_at>? LIMIT 1").get(eventId,n.node_id,core.clock()))continue;
      const cs=db.prepare("SELECT core_id,visible_energy,status FROM cores WHERE event_id=? AND owner_type='NODE' AND owner_id=? ORDER BY visible_energy ASC,core_id").all(eventId,n.node_id);
      if(cs.length!==3||cs.some(coreRow=>coreRow.status!=='DEPLOYED'))continue;
      const total=cs.reduce((sum,coreRow)=>sum+coreRow.visible_energy,0);
      for(const cargoRow of cargo){const projected=total-cs[0].visible_energy+cargoRow.visible_energy;if(projected>=450)candidates.push({nodeId:n.node_id,cargoId:cargoRow.core_id,energy:cargoRow.visible_energy,projected,stable:projected>=600})}
    }
    candidates.sort((a,b)=>Number(b.stable)-Number(a.stable)||a.energy-b.energy||a.nodeId.localeCompare(b.nodeId));
    return candidates[0]?{eligible:true,phase:p,kind:`RESTORE_${p}`,candidate:candidates[0]}:{eligible:false};
  }
  function assignRestore(eventId,actorId){
    requireMode();core.recoverExpiredMissions(eventId);
    const existing=activeMission(db,eventId,actorId,core.clock());if(existing)return {missionId:existing.mission_id,kind:existing.kind,nodeId:existing.node_id,coreId:existing.core_id,replayed:true};
    const s=restoreStatus(eventId,actorId);if(!s.eligible)throw Error('RESTORE_ASSIGNMENT_UNAVAILABLE');
    const missionId=`LAB-${s.kind}-${actorId}-${core.clock()}`,expires=core.clock()+1800;
    db.exec('BEGIN IMMEDIATE');
    try{
      const fresh=restoreStatus(eventId,actorId);if(!fresh.eligible||fresh.kind!==s.kind||fresh.candidate.cargoId!==s.candidate.cargoId||fresh.candidate.nodeId!==s.candidate.nodeId)throw Error('RESTORE_ASSIGNMENT_CHANGED');
      if(db.prepare("UPDATE cores SET owner_type='TRANSIT',owner_id=?,status='IN_TRANSIT',version=version+1 WHERE event_id=? AND core_id=? AND owner_type='HQ' AND owner_id='HQ' AND status='RESERVE'").run(actorId,eventId,s.candidate.cargoId).changes!==1)throw Error('RESTORE_CARGO_CONFLICT');
      db.prepare("INSERT INTO missions(event_id,mission_id,actor_id,kind,node_id,core_id,state,expires_at) VALUES (?,?,?,?,?,?,'ASSIGNED',?)").run(eventId,missionId,actorId,s.kind,s.candidate.nodeId,s.candidate.cargoId,expires);
      core.assertIntegrity(eventId);db.exec('COMMIT');
      return {missionId,kind:s.kind,nodeId:s.candidate.nodeId,coreId:s.candidate.cargoId,replayed:false};
    }catch(e){db.exec('ROLLBACK');throw e}
  }
  function fopLoadoutStatus(eventId,fopId,nodeId){
    requireMode();
    if(db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId)?.state!=='FIELD_ACTIVE')throw Error('EVENT_NOT_FIELD_ACTIVE');
    const actor=db.prepare('SELECT role,active FROM actors WHERE event_id=? AND actor_id=?').get(eventId,fopId);
    if(actor?.role!=='FOP'||actor.active!==1)throw Error('ROLE_DENIED');
    const node=db.prepare('SELECT state FROM nodes WHERE event_id=? AND node_id=?').get(eventId,nodeId);
    if(!node||node.state==='INSTALLED')throw Error('INSTALL_NODE_UNAVAILABLE');
    if(!db.prepare('SELECT 1 FROM lab_node_tags WHERE event_id=? AND node_id=?').get(eventId,nodeId))throw Error('NODE_TAG_REQUIRED');
    const transit=db.prepare("SELECT core_id,visible_energy FROM cores WHERE event_id=? AND owner_type='TRANSIT' AND owner_id=? AND status='IN_TRANSIT' ORDER BY visible_energy DESC,core_id").all(eventId,fopId);
    return {nodeId,transit,needsAssignment:transit.length<3};
  }
  function assignFopLoadout(eventId,fopId,nodeId){
    const current=fopLoadoutStatus(eventId,fopId,nodeId);
    if(current.transit.length>=3)return {...current,replayed:true};
    if(current.transit.length!==0)throw Error('FOP_LOADOUT_PARTIAL_STATE');
    const setup=receipt(eventId);
    if(mode==='registration'&&!setup)throw Error('SETUP_RECEIPT_MISSING');
    const protectedIds=new Set();
    if(mode==='registration'&&setup){
      for(const id of [...(setup.plan.restoreReserve||[]),setup.plan.resupply].filter(Boolean))protectedIds.add(id);
    }
    for(const m of db.prepare("SELECT core_id FROM missions WHERE event_id=? AND state='ASSIGNED' AND expires_at>?").all(eventId,core.clock()))protectedIds.add(m.core_id);
    const candidates=db.prepare("SELECT core_id,visible_energy FROM cores WHERE event_id=? AND owner_type='HQ' AND owner_id='HQ' AND status='RESERVE' ORDER BY core_id").all(eventId).filter(x=>!protectedIds.has(x.core_id));
    if(candidates.length<3)throw Error('FOP_LOADOUT_UNAVAILABLE');
    const chosen=candidates.slice(0,3);
    db.exec('BEGIN IMMEDIATE');
    try{
      for(const x of chosen){
        if(db.prepare("UPDATE cores SET owner_type='TRANSIT',owner_id=?,status='IN_TRANSIT',version=version+1 WHERE event_id=? AND core_id=? AND owner_type='HQ' AND owner_id='HQ' AND status='RESERVE'").run(fopId,eventId,x.core_id).changes!==1)throw Error('FOP_LOADOUT_CONFLICT');
      }
      core.assertIntegrity(eventId);db.exec('COMMIT');
      return {nodeId,transit:chosen,needsAssignment:false,replayed:false};
    }catch(e){db.exec('ROLLBACK');throw e}
  }
  return {status,initialize,start,restoreStatus,assignRestore,fopLoadoutStatus,assignFopLoadout};
}

function resupplyOffer(db,eventId,actorId,now,enforceNodeLocks=false){
 const a=db.prepare("SELECT capacity FROM actors WHERE event_id=? AND actor_id=? AND role='PIONEER'").get(eventId,actorId);
 const used=db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id=? AND owner_type='PIONEER' AND owner_id=? AND status='FIELD'").get(eventId,actorId).n;
 const busy=activeMission(db,eventId,actorId,now);
 const mandatory=used===0,capacity=a?.capacity||0;
 if(!a||used>=capacity||busy)return {eligible:false,mandatory,used,capacity,reason:busy?'ACTIVE_MISSION':'NO_FREE_SLOT'};
 const locks=new Set(enforceNodeLocks?db.prepare("SELECT node_id FROM actor_node_locks WHERE event_id=? AND actor_id=? AND until_epoch>?").all(eventId,actorId,now).map(x=>x.node_id):[]);
 const reservations=db.prepare("SELECT payload_json FROM reservations WHERE event_id=? AND expires_at>?").all(eventId,now).map(x=>JSON.parse(x.payload_json));
 const blockedNodes=new Set(reservations.flatMap(x=>[x.nodeId,x.node_id,...(Array.isArray(x.nodeIds)?x.nodeIds:[])]));
 const blockedCores=new Set(reservations.flatMap(x=>[x.coreId,x.core_id,...(Array.isArray(x.coreIds)?x.coreIds:[])]));
 const nodes=db.prepare("SELECT node_id FROM nodes WHERE event_id=? AND state='INSTALLED' ORDER BY node_id").all(eventId);
 let availableNode=false;
 for(const node of nodes){
  if(!isKnownNode(db,eventId,actorId,node.node_id)||locks.has(node.node_id)||blockedNodes.has(node.node_id)||db.prepare("SELECT 1 FROM missions WHERE event_id=? AND node_id=? AND state='ASSIGNED' AND expires_at>?").get(eventId,node.node_id,now))continue;
  const cs=db.prepare("SELECT core_id,status FROM cores WHERE event_id=? AND owner_type='NODE' AND owner_id=?").all(eventId,node.node_id);
  if(cs.length===3&&cs.every(c=>c.status==='DEPLOYED'&&!blockedCores.has(c.core_id))){availableNode=true;break;}
 }
 const reserve=db.prepare("SELECT core_id FROM cores WHERE event_id=? AND owner_type='HQ' AND owner_id='HQ' AND status='RESERVE'").all(eventId).some(c=>!blockedCores.has(c.core_id));
 return {eligible:availableNode&&reserve,mandatory,used,capacity,reason:!availableNode?'NO_KNOWN_AVAILABLE_NODE':!reserve?'NO_HQ_RESERVE':null};
}
function isKnownNode(db,eventId,actorId,nodeId){return !!db.prepare('SELECT 1 FROM pioneer_known_nodes WHERE event_id=? AND actor_id=? AND node_id=?').get(eventId,actorId,nodeId)}
function assignResupply(core,eventId,actorId){
 core.recoverExpiredMissions(eventId);
 const db=core.db,now=core.clock();
 db.exec('BEGIN IMMEDIATE');
 try{
  const offer=resupplyOffer(db,eventId,actorId,now,core.enforceNodeLocks);
  if(!offer.eligible)throw Error(offer.reason||'RESUPPLY_NOT_ELIGIBLE');
  const locks=new Set(core.enforceNodeLocks?db.prepare("SELECT node_id FROM actor_node_locks WHERE event_id=? AND actor_id=? AND until_epoch>?").all(eventId,actorId,now).map(x=>x.node_id):[]);
  const reservations=db.prepare("SELECT payload_json FROM reservations WHERE event_id=? AND expires_at>?").all(eventId,now).map(x=>JSON.parse(x.payload_json));
  const blockedNodes=new Set(reservations.flatMap(x=>[x.nodeId,x.node_id,...(Array.isArray(x.nodeIds)?x.nodeIds:[])]));
  const blockedCores=new Set(reservations.flatMap(x=>[x.coreId,x.core_id,...(Array.isArray(x.coreIds)?x.coreIds:[])]));
  const nodes=db.prepare("SELECT node_id FROM nodes WHERE event_id=? AND state='INSTALLED' ORDER BY node_id").all(eventId);
  let target;
  for(const node of nodes){
   if(!isKnownNode(db,eventId,actorId,node.node_id)||locks.has(node.node_id)||blockedNodes.has(node.node_id)||db.prepare("SELECT 1 FROM missions WHERE event_id=? AND node_id=? AND state='ASSIGNED' AND expires_at>?").get(eventId,node.node_id,now))continue;
   const cs=db.prepare("SELECT core_id,visible_energy,status FROM cores WHERE event_id=? AND owner_type='NODE' AND owner_id=? ORDER BY visible_energy,core_id").all(eventId,node.node_id);
   if(cs.length!==3||cs.some(c=>c.status!=='DEPLOYED'||blockedCores.has(c.core_id)))continue;
   if(!target||cs[0].visible_energy<target.out.visible_energy)target={nodeId:node.node_id,out:cs[0]};
  }
  const reserve=db.prepare("SELECT core_id,visible_energy FROM cores WHERE event_id=? AND owner_type='HQ' AND owner_id='HQ' AND status='RESERVE' ORDER BY visible_energy,core_id").all(eventId).filter(x=>!blockedCores.has(x.core_id));
  const cargo=target&&(reserve.find(x=>x.visible_energy>=target.out.visible_energy)||reserve[reserve.length-1]);
  if(!cargo)throw Error('RESUPPLY_ASSIGNMENT_UNAVAILABLE');
  const id='RS-LAB-'+randomUUID();
  if(db.prepare("UPDATE cores SET owner_type='TRANSIT',owner_id=?,status='IN_TRANSIT',version=version+1 WHERE event_id=? AND core_id=? AND owner_type='HQ' AND owner_id='HQ' AND status='RESERVE'").run(actorId,eventId,cargo.core_id).changes!==1)throw Error('RESUPPLY_CARGO_CONFLICT');
  db.prepare("INSERT INTO missions(event_id,mission_id,actor_id,kind,node_id,core_id,state,expires_at) VALUES (?,?,?,?,?,?,'ASSIGNED',?)").run(eventId,id,actorId,'RESUPPLY',target.nodeId,cargo.core_id,now+1800);
  core.assertIntegrity(eventId);db.exec('COMMIT');return {missionId:id,kind:'RESUPPLY',nodeId:target.nodeId};
 }catch(e){db.exec('ROLLBACK');throw e}
}

export function createLabApp(config=labConfig()){
  seedTestDatabase(config.dbPath,config.eventId,config.mode,config.sourceDbPath,config.sourceEventId);
  let labEvacNfc=null;
  const runtime=createV2GameplayRuntime(config.dbPath,{
    verifyRecoveryNfcProof:ctx=>labEvacNfc?.verifyRecovery(ctx)===true,
    verifyUploadNfcProof:ctx=>labEvacNfc?.verifyUpload(ctx)===true,
    enforceNodeLocks:!['desktop','registration'].includes(config.mode)
  });
  const core=runtime.core;
  core.db.exec('CREATE TABLE IF NOT EXISTS pioneer_known_nodes (event_id TEXT NOT NULL, actor_id TEXT NOT NULL, node_id TEXT NOT NULL, discovered_at INTEGER NOT NULL, PRIMARY KEY(event_id,actor_id,node_id))');
  function rememberNode(eventId,actorId,nodeId){core.db.prepare('INSERT OR IGNORE INTO pioneer_known_nodes(event_id,actor_id,node_id,discovered_at) VALUES (?,?,?,?)').run(eventId,actorId,nodeId,core.clock())}

  labEvacNfc=createLabEvacNfc(core);
  const store=createLabStore(core,{sessionTtl:config.sessionTtl,grantTtl:config.grantTtl,exchangeTtl:config.exchangeTtl});
  const founderRegistry=createFounderRegistry(core.db,{mode:config.mode});
  const realtest=createBlock06Realtest(core,config.mode);
  const desktopTest=createDesktopTest(core,config.mode);

  function evacSupportState(eventId){
    if(config.mode!=='evac')return null;
    const physical=core.db.prepare("SELECT team_id FROM evac_teams WHERE event_id=? AND fop_id='FOP-TEST'").get(eventId);
    const physicalRecoveries=physical?core.db.prepare('SELECT COUNT(*) n FROM evac_recoveries WHERE event_id=? AND team_id=?').get(eventId,physical.team_id).n:0;
    const physicalUploads=physical?core.db.prepare('SELECT COUNT(*) n FROM evac_final_uploads WHERE event_id=? AND team_id=?').get(eventId,physical.team_id).n:0;
    const totalRecoveries=core.db.prepare('SELECT COUNT(*) n FROM evac_recoveries WHERE event_id=?').get(eventId).n;
    const totalUploads=core.db.prepare('SELECT COUNT(*) n FROM evac_final_uploads WHERE event_id=?').get(eventId).n;
    return {physicalTeamId:physical?.team_id||null,physicalRecoveries,physicalUploads,totalRecoveries,totalUploads,ready:physicalRecoveries===2&&physicalUploads===2&&totalUploads<10,done:totalRecoveries===10&&totalUploads===10};
  }

  function runEvacSupport(eventId){
    if(config.mode!=='evac')throw Error('EVAC_SUPPORT_MODE_REQUIRED');
    if(!runtime.evac.flow)throw Error('EVAC_NFC_VERIFIER_REQUIRED');
    const state=evacSupportState(eventId);
    if(!state?.physicalTeamId||state.physicalRecoveries!==2||state.physicalUploads!==2)throw Error('EVAC_PHYSICAL_ACCEPTANCE_REQUIRED');
    const teams=[
      ['SUPPORT-2','FOP-E2','P-E3','P-E4','NODE-003','NODE-004'],
      ['SUPPORT-3','FOP-E3','P-E5','P-E6','NODE-005','NODE-006'],
      ['SUPPORT-4','FOP-E4','P-E7','P-E8','NODE-007','NODE-008'],
      ['SUPPORT-5','FOP-E5','P-E9','P-E10','NODE-009','NODE-010']
    ];
    for(const [teamId,fopId,pioneerA,pioneerB,nodeA,nodeB] of teams){
      let team=core.db.prepare('SELECT * FROM evac_teams WHERE event_id=? AND team_id=?').get(eventId,teamId);
      if(!team){
        runtime.evac.teams.reserve({eventId,teamId,fopId,pioneerA,pioneerB,nodeIds:[nodeA,nodeB]});
        team=core.db.prepare('SELECT * FROM evac_teams WHERE event_id=? AND team_id=?').get(eventId,teamId);
      }
      const assignments=core.db.prepare('SELECT * FROM evac_assignments WHERE event_id=? AND team_id=? ORDER BY sequence').all(eventId,teamId);
      for(const a of assignments){
        let recovery=core.db.prepare('SELECT * FROM evac_recoveries WHERE event_id=? AND node_id=?').get(eventId,a.node_id);
        if(!recovery){
          const snapshot=JSON.parse(a.core_snapshot),operationId='SUPPORT-REC-'+a.node_id;
          const proof=labEvacNfc.issue({eventId,actorId:fopId,command:'EVAC_NODE_RECOVERY',targetType:'NODE',targetId:a.node_id,operationId});
          runtime.evac.flow.recover({eventId,teamId,nodeId:a.node_id,fopId,scannedNodeId:a.node_id,scannedCoreUids:snapshot.map(x=>x.uid),operationId,nfcProof:{id:proof.proofId},nfcGrantId:proof.nfcGrantId});
          recovery=core.db.prepare('SELECT * FROM evac_recoveries WHERE event_id=? AND node_id=?').get(eventId,a.node_id);
        }
        if(!core.db.prepare('SELECT 1 FROM evac_final_uploads WHERE event_id=? AND carrier_id=?').get(eventId,a.carrier_id)){
          const cargo=core.db.prepare("SELECT core_id FROM cores WHERE event_id=? AND owner_type='TRANSIT' AND owner_id=? AND status='EVAC_CARGO' ORDER BY core_id").all(eventId,a.carrier_id).map(x=>x.core_id);
          if(cargo.length!==3)throw Error('EVAC_SUPPORT_CARGO_INVALID');
          const operationId='SUPPORT-UP-'+a.carrier_id;
          const proof=labEvacNfc.issue({eventId,actorId:a.carrier_id,command:'EVAC_FINAL_UPLOAD',targetType:'HQ',targetId:'HQ',operationId});
          runtime.evac.flow.upload({eventId,teamId,carrierId:a.carrier_id,operationId,coreIds:cargo,selectedCoreId:cargo[0],nfcProof:{id:proof.proofId},nfcGrantId:proof.nfcGrantId});
        }
      }
    }
    const after=evacSupportState(eventId);
    core.assertIntegrity(eventId);
    return after;
  }
  const handler=async(req,res)=>{
    const started=performance.now();
    try{
      const u=new URL(req.url,'http://local');
      if(req.method==='GET'&&u.pathname==='/health') return json(res,200,{ok:true,service:'NODIV-V2-MINIPC-LAB',mode:config.mode,eventId:config.eventId,db:'sqlite',uptimeSec:Math.round(process.uptime()),secure:req.socket.encrypted===true});
      if(req.method==='GET'&&u.pathname==='/api/state'){const s=store.session(bearer(req));return json(res,200,{ok:true,...store.state(s)});}
      if(req.method==='GET'&&u.pathname==='/api/role/state'){
        const s=store.session(bearer(req)),view=runtime.roles.view({eventId:s.event_id,actorId:s.actor_id});
        if(config.mode==='registration'&&s.role==='FOUNDER'){
          view.hardware=founderRegistry.list(s.event_id);
          view.realtest=realtest.status(s.event_id);
          if(view.event.state==='READY')view.nextAction={code:'REALTEST_PREFLIGHT',label:view.realtest.canInitialize?'EVENT VORBEREITEN':'HARDWARE VERVOLLSTÄNDIGEN',detail:view.realtest.canInitialize?'Registrierung vollständig. Initialisierung kann gesichert werden.':'Registriere die noch fehlenden Access Cards, Nodes, N-Cores und den HQ-Tag.'};
          if(view.event.state==='INITIALIZED')view.nextAction={code:'REALTEST_START',label:view.realtest.canStart?'EVENT STARTEN':'START BLOCKIERT',detail:view.realtest.canStart?'Vorbereitung gespeichert. Feldbetrieb kann aktiviert werden.':'Start ist noch blockiert. Prüfe die Hardwareübersicht und den gespeicherten Teststand.'};
        }
        if(config.mode==='desktop'&&s.role==='FOP'){
          const registered=core.db.prepare("SELECT n.state,COUNT(*) count FROM lab_node_tags t JOIN nodes n ON n.event_id=t.event_id AND n.node_id=t.node_id WHERE t.event_id=? GROUP BY n.state").all(s.event_id);
          const actual=Object.fromEntries(registered.map(x=>[x.state,x.count]));
          view.nodes={available:actual.AVAILABLE||0,installed:actual.INSTALLED||0,total:registered.reduce((sum,x)=>sum+x.count,0)};
        }
        if(config.mode==='desktop'&&s.role==='FOUNDER'){
          view.hardware=founderRegistry.list(s.event_id);
          view.desktopTest=desktopTest.status(s.event_id);
          if(view.event.state==='READY')view.nextAction={code:'DESKTOP_TEST_PREP',label:'TESTSPIEL VORBEREITEN',detail:'Der aktuelle reale Hardwarebestand wird verwendet. Fehlende Rollen oder Hardware werden nicht erfunden.'};
          if(view.event.state==='INITIALIZED')view.nextAction={code:'DESKTOP_TEST_START',label:'TESTSPIEL STARTEN',detail:'Der vorbereitete Bestand kann jetzt in den Feldbetrieb wechseln.'};
          if(view.event.state==='FIELD_ACTIVE')view.nextAction={code:'DESKTOP_TEST_ACTIVE',label:'TESTSPIEL LÄUFT',detail:'Nutze die registrierten Rolleninterfaces oder beende den Test kontrolliert.'};
          if(view.event.state==='TEST_ENDED')view.nextAction={code:'DESKTOP_TEST_ENDED',label:'TESTSPIEL BEENDET',detail:'Der tatsächliche Endzustand wurde gespeichert. Es wurde kein EVAC-Abschluss erzeugt.'};
        }
        if(['registration','desktop'].includes(config.mode)&&s.role==='PIONEER'&&!view.mission&&view.event.state==='FIELD_ACTIVE'){view.resupplyDispatch=resupplyOffer(core.db,s.event_id,s.actor_id,core.clock(),core.enforceNodeLocks);view.restoreDispatch=realtest.restoreStatus(s.event_id,s.actor_id);if(view.restoreDispatch.eligible)view.nextAction={code:'RESTORE_ASSIGN',label:'SYSTEMAUFTRAG ABRUFEN',detail:`RESTORE #${view.restoreDispatch.phase} ist freigeschaltet.`};}
        if(config.mode==='evac'&&s.role==='FOUNDER')view.evacSupport=evacSupportState(s.event_id);
        return json(res,200,{ok:true,...view});
      }
      if(req.method==='POST'&&u.pathname==='/api/session/start'){const b=await body(req);const s=store.startSession(config.eventId,b.uid);return json(res,200,{ok:true,...s});}

      // Existing BLOCK 01/02 Exchange path retained; now supports 1..3 server-authorized cores.
      if(req.method==='POST'&&u.pathname==='/api/scan'){
        const s=store.session(bearer(req)),b=await body(req);
        if(b.exchangeId){const result=store.scanExchangeCore(s,{exchangeId:b.exchangeId,uid:b.uid});return json(res,200,{ok:true,...result});}
        const result=store.issueNodeGrant(s,b.uid);if(s.role==='PIONEER'&&result.nodeId)rememberNode(s.event_id,s.actor_id,result.nodeId);return json(res,200,{ok:true,purpose:'EXCHANGE_NODE',...result});
      }
      if(req.method==='GET'&&u.pathname==='/api/exchange/status'){const s=store.session(bearer(req));return json(res,200,{ok:true,...store.exchangeStatus(s,{exchangeId:u.searchParams.get('exchangeId')})});}
      if(req.method==='POST'&&u.pathname==='/api/exchange/prepare'){const s=store.session(bearer(req)),b=await body(req);return json(res,200,{ok:true,...store.prepareExchange(s,b)});}
      if(req.method==='POST'&&u.pathname==='/api/exchange/confirm'){const s=store.session(bearer(req)),b=await body(req);return json(res,200,store.confirmExchange(s,b));}

      // Local / Unbound: physical Pioneer Access Card scan -> server preview -> explicit commit.
      if(req.method==='POST'&&u.pathname==='/api/catch/preview'){
        const s=store.session(bearer(req));requireRole(s,'LOCAL','UNBOUND');const b=await body(req),target=store.accessTarget(s,b.uid);
        if(target.role!=='PIONEER')throw Error('CATCH_TARGET_INVALID');
        const result=runtime.catch.preview({eventId:s.event_id,catcherId:s.actor_id,targetId:target.actor_id});
        return json(res,200,{ok:true,...result});
      }
      if(req.method==='POST'&&u.pathname==='/api/catch/confirm'){
        const s=store.session(bearer(req));requireRole(s,'LOCAL','UNBOUND');const b=await body(req);
        return json(res,200,{ok:true,...runtime.catch.confirm({eventId:s.event_id,previewId:b.previewId,catcherId:s.actor_id})});
      }

      // Pioneer HQ: authoritative terminal state, optional Secure Approach, physical bay claim and upload.
      if(req.method==='GET'&&u.pathname==='/api/hq/state'){
        const s=store.session(bearer(req));requireRole(s,'PIONEER');
        return json(res,200,{ok:true,...runtime.hq.terminalState({eventId:s.event_id,pioneerId:s.actor_id})});
      }
      if(req.method==='POST'&&u.pathname==='/api/hq/secure'){
        const s=store.session(bearer(req));requireRole(s,'PIONEER');const b=await body(req);
        return json(res,200,runtime.hq.activateSecureApproach({eventId:s.event_id,pioneerId:s.actor_id,requestId:b.requestId}));
      }
      if(req.method==='POST'&&u.pathname==='/api/hq/claim'){
        const s=store.session(bearer(req));requireRole(s,'PIONEER');const b=await body(req),bay=store.uploadBayTarget(s,b.uid);
        return json(res,200,runtime.hq.claim({eventId:s.event_id,pioneerId:s.actor_id,bayId:bay.bay_id,operationId:b.operationId||('CLAIM-'+randomUUID())}));
      }
      if(req.method==='POST'&&u.pathname==='/api/hq/authorize'){
        const s=store.session(bearer(req));requireRole(s,'PIONEER');const b=await body(req);
        return json(res,200,runtime.hq.authorize({eventId:s.event_id,pioneerId:s.actor_id,orderId:b.orderId,coreIds:b.coreIds}));
      }
      if(req.method==='POST'&&u.pathname==='/api/hq/confirm'){
        const s=store.session(bearer(req));requireRole(s,'PIONEER');const b=await body(req);
        return json(res,200,runtime.hq.confirm({eventId:s.event_id,pioneerId:s.actor_id,orderId:b.orderId,operationId:b.operationId||('UPLOAD-'+randomUUID())}));
      }

      // FOP: Node scan is read-only; all ownership changes are revalidated by the shared runtime.
      if(req.method==='POST'&&u.pathname==='/api/fop/scan'){
        const s=store.session(bearer(req));requireRole(s,'FOP');const b=await body(req),node=store.nodeTarget(s,b.uid);
        const cores=core.db.prepare("SELECT core_id,visible_energy,status FROM cores WHERE event_id=? AND owner_type='NODE' AND owner_id=? ORDER BY core_id").all(s.event_id,node.node_id);
        const action=node.state==='INSTALLED'?'DEINSTALL':'INSTALL';
        const transit=action==='INSTALL'?core.db.prepare("SELECT core_id,visible_energy FROM cores WHERE event_id=? AND owner_type='TRANSIT' AND owner_id=? AND status='IN_TRANSIT' ORDER BY visible_energy DESC,core_id").all(s.event_id,s.actor_id):[];
        return json(res,200,{ok:true,nodeId:node.node_id,state:node.state,action,mechanicalCode:action==='DEINSTALL'?store.fopPrimaryCode(s,node.node_id):null,coreCount:cores.length,transit,canRequestLoadout:['registration','desktop'].includes(config.mode)&&action==='INSTALL'&&transit.length<3});
      }
      if(req.method==='POST'&&u.pathname==='/api/fop/loadout'){
        const s=store.session(bearer(req));requireRole(s,'FOP');const b=await body(req);
        return json(res,200,{ok:true,...realtest.assignFopLoadout(s.event_id,s.actor_id,b.nodeId)});
      }
      if(req.method==='POST'&&u.pathname==='/api/fop/core/check'){
        const s=store.session(bearer(req));requireRole(s,'FOP');const b=await body(req),c=store.coreTarget(s,b.uid);
        if(c.owner_type!=='TRANSIT'||c.owner_id!==s.actor_id||c.status!=='IN_TRANSIT')throw Error('INSTALL_CARGO_INVALID');
        return json(res,200,{ok:true,coreId:c.core_id,energy:c.visible_energy});
      }
      if(req.method==='POST'&&u.pathname==='/api/fop/install'){
        const s=store.session(bearer(req));requireRole(s,'FOP');const b=await body(req);
        if(!Array.isArray(b.coreUids)||b.coreUids.length!==3)throw Error('FOP_THREE_CORES_REQUIRED');
        const ids=b.coreUids.map(uid=>store.coreTarget(s,uid)).map(c=>{if(c.owner_type!=='TRANSIT'||c.owner_id!==s.actor_id||c.status!=='IN_TRANSIT')throw Error('INSTALL_CARGO_INVALID');return c.core_id;});
        const installed=runtime.fop.install({eventId:s.event_id,operationId:b.operationId||('FOP-IN-'+randomUUID()),fopId:s.actor_id,nodeId:b.nodeId,coreIds:ids});
        return json(res,200,{...installed,mechanicalCode:store.fopPrimaryCode(s,b.nodeId)});
      }
      if(req.method==='POST'&&u.pathname==='/api/fop/deinstall'){
        const s=store.session(bearer(req));requireRole(s,'FOP');const b=await body(req);
        return json(res,200,runtime.fop.deinstall({eventId:s.event_id,operationId:b.operationId||('FOP-OUT-'+randomUUID()),fopId:s.actor_id,nodeId:b.nodeId}));
      }

      // Pioneer RESTORE / RE-SUPPLY: scan values never choose the rule outcome.
      if(req.method==='POST'&&u.pathname==='/api/mission/check'){
        const s=store.session(bearer(req));requireRole(s,'PIONEER');const b=await body(req),mission=activeMission(core.db,s.event_id,s.actor_id,runtime.core.clock());
        if(!mission)throw Error('MISSION_NOT_ASSIGNED');
        const uid=normalizeUid(b.uid),node=core.db.prepare('SELECT node_id FROM lab_node_tags WHERE event_id=? AND uid=?').get(s.event_id,uid);
        if(node){
          if(node.node_id!==mission.node_id)throw Error('MISSION_NODE_MISMATCH');
          const lowest=lowestNodeCore(core.db,s.event_id,mission.node_id);
          return json(res,200,{ok:true,kind:'MISSION_NODE',nodeId:node.node_id,lowestCoreEnergy:lowest?.visible_energy??null});
        }
        const scanned=store.coreTarget(s,uid);
        if(scanned.core_id===mission.core_id)return json(res,200,{ok:true,kind:'MISSION_CARGO',coreId:scanned.core_id,energy:scanned.visible_energy});
        const low=lowestNodeCore(core.db,s.event_id,mission.node_id);
        if(scanned.core_id===low?.core_id)return json(res,200,{ok:true,kind:'MISSION_OUT_CORE',coreId:scanned.core_id,energy:scanned.visible_energy});
        throw Error('MISSION_CORE_MISMATCH');
      }
      if(req.method==='POST'&&u.pathname==='/api/mission/confirm'){
        const s=store.session(bearer(req));requireRole(s,'PIONEER');const b=await body(req),mission=activeMission(core.db,s.event_id,s.actor_id,runtime.core.clock());
        if(!mission)throw Error('MISSION_NOT_ASSIGNED');
        const node=store.nodeTarget(s,b.nodeUid),cargo=store.coreTarget(s,b.cargoUid),out=store.coreTarget(s,b.outUid),low=lowestNodeCore(core.db,s.event_id,mission.node_id);
        if(node.node_id!==mission.node_id||cargo.core_id!==mission.core_id||out.core_id!==low?.core_id)throw Error('MISSION_SCAN_MISMATCH');
        if(mission.kind==='RESUPPLY')return json(res,200,runtime.resupply({eventId:s.event_id,operationId:b.operationId||('RS-'+randomUUID()),pioneerId:s.actor_id,missionId:mission.mission_id,outCoreId:out.core_id}));
        const phase=mission.kind==='RESTORE_2'?2:mission.kind==='RESTORE_1'?1:0;if(!phase)throw Error('MISSION_KIND_INVALID');
        return json(res,200,runtime.restore({eventId:s.event_id,operationId:b.operationId||('REST-'+randomUUID()),pioneerId:s.actor_id,nodeId:node.node_id,cargoCoreId:cargo.core_id,outCoreId:out.core_id,phase,missionId:mission.mission_id}));
      }

      // EVAC Lab adapter: browser scans are accepted only in this isolated Lab.
      // Production EVAC modules still require their original single-use NFC grant.
      if(req.method==='GET'&&u.pathname==='/api/evac/state'){
        const s=store.session(bearer(req));
        const state=core.db.prepare('SELECT state FROM evac_control WHERE event_id=?').get(s.event_id)?.state||null;
        if(s.role==='FOP'){
          const team=core.db.prepare('SELECT * FROM evac_teams WHERE event_id=? AND fop_id=?').get(s.event_id,s.actor_id)||null;
          const assignments=team?core.db.prepare('SELECT sequence,node_id,carrier_id,core_snapshot FROM evac_assignments WHERE event_id=? AND team_id=? ORDER BY sequence').all(s.event_id,team.team_id).map(a=>{let snapshot=[];try{snapshot=JSON.parse(a.core_snapshot||'[]')}catch{}return {sequence:a.sequence,node_id:a.node_id,carrier_id:a.carrier_id,coreEnergies:snapshot.map(c=>c.visible_energy),recovered:!!core.db.prepare('SELECT 1 FROM evac_recoveries WHERE event_id=? AND node_id=?').get(s.event_id,a.node_id)}}):[];
          return json(res,200,{ok:true,state,role:'FOP',team:team?{id:team.team_id,pioneers:[team.pioneer_a,team.pioneer_b]}:null,assignments});
        }
        if(s.role==='PIONEER'){
          const team=core.db.prepare('SELECT * FROM evac_teams WHERE event_id=? AND (pioneer_a=? OR pioneer_b=?)').get(s.event_id,s.actor_id,s.actor_id)||null;
          const assignment=team?core.db.prepare('SELECT sequence,node_id,carrier_id FROM evac_assignments WHERE event_id=? AND team_id=? AND carrier_id=?').get(s.event_id,team.team_id,s.actor_id):null;
          const recovered=assignment?!!core.db.prepare('SELECT 1 FROM evac_recoveries WHERE event_id=? AND node_id=? AND carrier_id=?').get(s.event_id,assignment.node_id,s.actor_id):false;
          const uploaded=assignment?!!core.db.prepare('SELECT 1 FROM evac_final_uploads WHERE event_id=? AND carrier_id=?').get(s.event_id,s.actor_id):false;
          const cargo=recovered&&!uploaded?core.db.prepare("SELECT core_id,uid,visible_energy FROM cores WHERE event_id=? AND owner_type='TRANSIT' AND owner_id=? AND status='EVAC_CARGO' ORDER BY core_id").all(s.event_id,s.actor_id).map(c=>({id:c.core_id,energy:c.visible_energy})):[];
          return json(res,200,{ok:true,state,role:'PIONEER',team:team?{id:team.team_id,fopId:team.fop_id}:null,assignment,recovered,uploaded,cargo});
        }
        return json(res,200,{ok:true,state,role:s.role});
      }
      if(req.method==='POST'&&u.pathname==='/api/evac/team'){
        const s=store.session(bearer(req));requireRole(s,'FOP');const b=await body(req);
        const a=store.accessTarget(s,b.pioneerAUid),p=store.accessTarget(s,b.pioneerBUid);
        if(a.role!=='PIONEER'||p.role!=='PIONEER'||a.actor_id===p.actor_id)throw Error('EVAC_TEAM_INVALID');
        const nodes=core.db.prepare(`SELECT o.node_id FROM evac_original_nodes o JOIN nodes n ON n.event_id=o.event_id AND n.node_id=o.node_id
          LEFT JOIN evac_assignments a ON a.event_id=o.event_id AND a.node_id=o.node_id
          WHERE o.event_id=? AND n.state='INSTALLED' AND a.node_id IS NULL ORDER BY o.node_id LIMIT 2`).all(s.event_id).map(x=>x.node_id);
        if(nodes.length!==2)throw Error('EVAC_NODE_UNAVAILABLE');
        return json(res,200,{ok:true,...runtime.evac.teams.reserve({eventId:s.event_id,fopId:s.actor_id,pioneerA:a.actor_id,pioneerB:p.actor_id,nodeIds:nodes})});
      }
      if(req.method==='POST'&&u.pathname==='/api/evac/recovery/check'){
        const s=store.session(bearer(req));requireRole(s,'FOP');const b=await body(req);
        if(!Array.isArray(b.coreUids)||b.coreUids.length!==3||new Set(b.coreUids.map(normalizeUid)).size!==3)throw Error('EVAC_SCAN_INVALID');
        const node=store.nodeTarget(s,b.nodeUid),assignment=core.db.prepare('SELECT * FROM evac_assignments WHERE event_id=? AND team_id=? AND node_id=?').get(s.event_id,b.teamId,node.node_id);
        if(!assignment)throw Error('EVAC_NODE_NOT_RESERVED');
        const snapshot=JSON.parse(assignment.core_snapshot),scanned=b.coreUids.map(uid=>store.coreTarget(s,uid));
        if(scanned.some(c=>c.owner_type!=='NODE'||c.owner_id!==node.node_id)||snapshot.some(c=>!scanned.some(x=>x.core_id===c.core_id)))throw Error('EVAC_CORE_SCAN_MISMATCH');
        const operationId=b.operationId||('EVAC-REC-'+randomUUID());
        const proof=labEvacNfc.issue({eventId:s.event_id,actorId:s.actor_id,command:'EVAC_NODE_RECOVERY',targetType:'NODE',targetId:node.node_id,operationId});
        return json(res,200,{ok:true,teamId:b.teamId,nodeId:node.node_id,operationId,scannedCoreUids:scanned.map(c=>normalizeUid(core.db.prepare('SELECT uid FROM cores WHERE event_id=? AND core_id=?').get(s.event_id,c.core_id).uid)),...proof});
      }
      if(req.method==='POST'&&u.pathname==='/api/evac/recovery/confirm'){
        const s=store.session(bearer(req));requireRole(s,'FOP');const b=await body(req);
        if(!runtime.evac.flow)throw Error('EVAC_NFC_VERIFIER_REQUIRED');
        return json(res,200,{ok:true,...runtime.evac.flow.recover({eventId:s.event_id,teamId:b.teamId,nodeId:b.nodeId,fopId:s.actor_id,scannedNodeId:b.nodeId,scannedCoreUids:b.scannedCoreUids,operationId:b.operationId,nfcProof:{id:b.proofId},nfcGrantId:b.nfcGrantId})});
      }
      if(req.method==='POST'&&u.pathname==='/api/evac/final/check'){
        const s=store.session(bearer(req));requireRole(s,'PIONEER');const b=await body(req);
        const team=core.db.prepare('SELECT * FROM evac_teams WHERE event_id=? AND team_id=? AND (pioneer_a=? OR pioneer_b=?)').get(s.event_id,b.teamId,s.actor_id,s.actor_id);
        if(!team)throw Error('EVAC_CARRIER_NOT_ASSIGNED');
        const cargo=core.db.prepare("SELECT core_id,uid,visible_energy FROM cores WHERE event_id=? AND owner_type='TRANSIT' AND owner_id=? AND status='EVAC_CARGO' ORDER BY core_id").all(s.event_id,s.actor_id);
        if(cargo.length!==3)throw Error('EVAC_CARGO_OWNERSHIP_CHANGED');
        const uid=normalizeUid(b.selectedCoreUid),selected=cargo.find(c=>normalizeUid(c.uid)===uid);if(!selected)throw Error('EVAC_FINAL_CORE_SET_MISMATCH');
        const operationId=b.operationId||('EVAC-UP-'+randomUUID()),proof=labEvacNfc.issue({eventId:s.event_id,actorId:s.actor_id,command:'EVAC_FINAL_UPLOAD',targetType:'HQ',targetId:'HQ',operationId});
        return json(res,200,{ok:true,teamId:b.teamId,operationId,coreIds:cargo.map(c=>c.core_id),selectedCoreId:selected.core_id,selectedEnergy:selected.visible_energy,...proof});
      }
      if(req.method==='POST'&&u.pathname==='/api/evac/final/confirm'){
        const s=store.session(bearer(req));requireRole(s,'PIONEER');const b=await body(req);
        if(!runtime.evac.flow)throw Error('EVAC_NFC_VERIFIER_REQUIRED');
        return json(res,200,{ok:true,...runtime.evac.flow.upload({eventId:s.event_id,teamId:b.teamId,carrierId:s.actor_id,operationId:b.operationId,coreIds:b.coreIds,selectedCoreId:b.selectedCoreId,nfcProof:{id:b.proofId},nfcGrantId:b.nfcGrantId})});
      }

      if(req.method==='POST'&&u.pathname==='/api/founder/register'){
        const s=store.session(bearer(req));requireRole(s,'FOUNDER');const b=await body(req);
        const registered=founderRegistry.register({eventId:s.event_id,...b});
        const latePioneer=config.mode==='desktop'&&registered.kind==='CARD'&&registered.actorRole==='PIONEER'
          ?desktopTest.attachLatePioneer(s.event_id,registered.id):null;
        return json(res,200,{ok:true,...registered,...(latePioneer?{latePioneer}:{})});
      }

      if(req.method==='GET'&&u.pathname==='/api/founder/realtest/status'){
        const s=store.session(bearer(req));requireRole(s,'FOUNDER');return json(res,200,{ok:true,...realtest.status(s.event_id)});
      }
      if(req.method==='POST'&&u.pathname==='/api/founder/realtest/initialize'){
        const s=store.session(bearer(req));requireRole(s,'FOUNDER');return json(res,200,{ok:true,...realtest.initialize(s.event_id,s.actor_id)});
      }
      if(req.method==='POST'&&u.pathname==='/api/founder/realtest/start'){
        const s=store.session(bearer(req));requireRole(s,'FOUNDER');return json(res,200,{ok:true,...realtest.start(s.event_id)});
      }

      if(req.method==='GET'&&u.pathname==='/api/founder/test/status'){
        const s=store.session(bearer(req));requireRole(s,'FOUNDER');return json(res,200,{ok:true,...desktopTest.status(s.event_id)});
      }
      if(req.method==='POST'&&u.pathname==='/api/founder/test/initialize'){
        const s=store.session(bearer(req));requireRole(s,'FOUNDER');return json(res,200,{ok:true,...desktopTest.initialize(s.event_id,s.actor_id)});
      }
      if(req.method==='POST'&&u.pathname==='/api/founder/test/start'){
        const s=store.session(bearer(req));requireRole(s,'FOUNDER');return json(res,200,{ok:true,...desktopTest.start(s.event_id)});
      }
      if(req.method==='POST'&&u.pathname==='/api/founder/test/end'){
        const s=store.session(bearer(req));requireRole(s,'FOUNDER');return json(res,200,{ok:true,...desktopTest.end(s.event_id,s.actor_id)});
      }
      if(req.method==='POST'&&u.pathname==='/api/mission/assign-resupply'){const session=store.session(bearer(req));requireRole(session,'PIONEER');if(!['registration','desktop'].includes(config.mode))throw Error('MODE_DENIED');return json(res,200,{ok:true,...assignResupply(core,session.event_id,session.actor_id)});}
      if(req.method==='POST'&&u.pathname==='/api/mission/assign-next'){
        const s=store.session(bearer(req));requireRole(s,'PIONEER');return json(res,200,{ok:true,...realtest.assignRestore(s.event_id,s.actor_id)});
      }

      // Founder EVAC remains the existing authoritative EVAC path; Block06 test initialization above is Lab-only.
      if(req.method==='POST'&&u.pathname==='/api/founder/evac/start'){
        const s=store.session(bearer(req));requireRole(s,'FOUNDER');const b=await body(req);
        return json(res,200,{ok:true,...runtime.evac.start.start({eventId:s.event_id,founderId:s.actor_id,operationId:b.operationId||('EVAC-START-'+randomUUID())})});
      }

      if(req.method==='POST'&&u.pathname==='/api/founder/evac/support'){
        const s=store.session(bearer(req));requireRole(s,'FOUNDER');
        return json(res,200,{ok:true,...runEvacSupport(s.event_id)});
      }

      if(req.method==='POST'&&u.pathname==='/api/founder/evac/complete'){
        const s=store.session(bearer(req));requireRole(s,'FOUNDER');const b=await body(req);
        return json(res,200,{ok:true,...runtime.evac.completion.complete({eventId:s.event_id,founderId:s.actor_id,operationId:b.operationId||('EVAC-COMPLETE-'+randomUUID())})});
      }

      if(req.method==='POST'&&u.pathname==='/api/lab/normalize-uid'){const b=await body(req);return json(res,200,{ok:true,uid:normalizeUid(b.uid)});}
      if(u.pathname.startsWith('/api/'))return json(res,404,{ok:false,error:'API_NOT_FOUND'});
      if(req.method==='GET')return serveStatic(req,res);
      return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'});
    }catch(e){const code=errCode(e);json(res,statusFor(code),{ok:false,error:code,...(e?.blockers?{blockers:e.blockers}:{})});}
    finally{const ms=performance.now()-started;if(req.url.startsWith('/api/')||req.url==='/health')console.log(JSON.stringify({ts:new Date().toISOString(),method:req.method,path:req.url,status:res.statusCode,ms:Number(ms.toFixed(2))}));}
  };
  const tls=config.tlsKey&&config.tlsCert;
  const server=tls?https.createServer({key:readFileSync(config.tlsKey),cert:readFileSync(config.tlsCert)},handler):http.createServer(handler);
  server.keepAliveTimeout=5000;
  return {server,core,runtime,store,config,close:()=>new Promise(resolve=>server.close(()=>{runtime.close();resolve();}))};
}

export async function startLab(config=labConfig()){
  const app=createLabApp(config);
  await new Promise((resolve,reject)=>app.server.once('error',reject).listen(config.port,config.host,resolve));
  const proto=config.tlsKey&&config.tlsCert?'https':'http';
  console.log(`NODIV V2 LAB ready: ${proto}://${config.host}:${config.port}`);
  if(proto==='http') console.log('TEST ONLY: Web NFC requires HTTPS. Use Tailscale Serve or a trusted local certificate before real phone NFC.');
  return app;
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url) startLab().catch(e=>{console.error(e);process.exitCode=1;});
