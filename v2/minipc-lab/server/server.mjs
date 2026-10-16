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

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const CLIENT=join(ROOT,'client');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
function json(res,status,data){const body=JSON.stringify(data);res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','content-length':Buffer.byteLength(body),'x-content-type-options':'nosniff'});res.end(body);}
async function body(req){let raw='';for await(const c of req){raw+=c;if(raw.length>64*1024)throw Error('BODY_TOO_LARGE');}return raw?JSON.parse(raw):{};}
function bearer(req){const h=req.headers.authorization||'';return h.startsWith('Bearer ')?h.slice(7):'';}
function errCode(e){return e?.code||e?.message||'INTERNAL_ERROR';}
function statusFor(code){
  if(code==='NO_SESSION')return 401;
  if(/BUSY|COOLDOWN|LOCKED|PROTECTED|CONFLICT|OWNERSHIP_CHANGED|IDEMPOTENCY|RESERVED|FULL/.test(code))return 409;
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

export function createLabApp(config=labConfig()){
  seedTestDatabase(config.dbPath,config.eventId);
  let labEvacNfc=null;
  const runtime=createV2GameplayRuntime(config.dbPath,{
    verifyRecoveryNfcProof:ctx=>labEvacNfc?.verifyRecovery(ctx)===true,
    verifyUploadNfcProof:ctx=>labEvacNfc?.verifyUpload(ctx)===true
  });
  const core=runtime.core;
  labEvacNfc=createLabEvacNfc(core);
  const store=createLabStore(core,{sessionTtl:config.sessionTtl,grantTtl:config.grantTtl,exchangeTtl:config.exchangeTtl});
  const founderRegistry=createFounderRegistry(core.db);
  const handler=async(req,res)=>{
    const started=performance.now();
    try{
      const u=new URL(req.url,'http://local');
      if(req.method==='GET'&&u.pathname==='/health') return json(res,200,{ok:true,service:'NODIV-V2-MINIPC-LAB',eventId:config.eventId,db:'sqlite',uptimeSec:Math.round(process.uptime()),secure:req.socket.encrypted===true});
      if(req.method==='GET'&&u.pathname==='/api/state'){const s=store.session(bearer(req));return json(res,200,{ok:true,...store.state(s)});}
      if(req.method==='GET'&&u.pathname==='/api/role/state'){const s=store.session(bearer(req));return json(res,200,{ok:true,...runtime.roles.view({eventId:s.event_id,actorId:s.actor_id})});}
      if(req.method==='POST'&&u.pathname==='/api/session/start'){const b=await body(req);const s=store.startSession(config.eventId,b.uid);return json(res,200,{ok:true,...s});}

      // Existing BLOCK 01/02 Exchange path retained; now supports 1..3 server-authorized cores.
      if(req.method==='POST'&&u.pathname==='/api/scan'){
        const s=store.session(bearer(req)),b=await body(req);
        if(b.exchangeId){const result=store.scanExchangeCore(s,{exchangeId:b.exchangeId,uid:b.uid});return json(res,200,{ok:true,...result});}
        const result=store.issueNodeGrant(s,b.uid);return json(res,200,{ok:true,purpose:'EXCHANGE_NODE',...result});
      }
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
        return json(res,200,{ok:true,nodeId:node.node_id,state:node.state,action,coreCount:cores.length});
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
        return json(res,200,runtime.fop.install({eventId:s.event_id,operationId:b.operationId||('FOP-IN-'+randomUUID()),fopId:s.actor_id,nodeId:b.nodeId,coreIds:ids}));
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
          return json(res,200,{ok:true,kind:'MISSION_NODE',nodeId:node.node_id});
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
          const assignments=team?core.db.prepare('SELECT sequence,node_id,carrier_id FROM evac_assignments WHERE event_id=? AND team_id=? ORDER BY sequence').all(s.event_id,team.team_id).map(a=>({...a,recovered:!!core.db.prepare('SELECT 1 FROM evac_recoveries WHERE event_id=? AND node_id=?').get(s.event_id,a.node_id)})):[];
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
        return json(res,200,{ok:true,...founderRegistry.register({eventId:s.event_id,...b})});
      }

      // Founder only. No event initialization/deployment endpoint exists in this Lab.
      if(req.method==='POST'&&u.pathname==='/api/founder/evac/start'){
        const s=store.session(bearer(req));requireRole(s,'FOUNDER');const b=await body(req);
        return json(res,200,{ok:true,...runtime.evac.start.start({eventId:s.event_id,founderId:s.actor_id,operationId:b.operationId||('EVAC-START-'+randomUUID())})});
      }

      if(req.method==='POST'&&u.pathname==='/api/founder/evac/complete'){
        const s=store.session(bearer(req));requireRole(s,'FOUNDER');const b=await body(req);
        return json(res,200,{ok:true,...runtime.evac.completion.complete({eventId:s.event_id,founderId:s.actor_id,operationId:b.operationId||('EVAC-COMPLETE-'+randomUUID())})});
      }

      if(req.method==='POST'&&u.pathname==='/api/lab/normalize-uid'){const b=await body(req);return json(res,200,{ok:true,uid:normalizeUid(b.uid)});}
      if(u.pathname.startsWith('/api/'))return json(res,404,{ok:false,error:'API_NOT_FOUND'});
      if(req.method==='GET')return serveStatic(req,res);
      return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'});
    }catch(e){const code=errCode(e);json(res,statusFor(code),{ok:false,error:code});}
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
