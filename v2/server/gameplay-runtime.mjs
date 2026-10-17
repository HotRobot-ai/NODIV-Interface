import {randomUUID} from 'node:crypto';
import {SqliteGameCore, GameError} from './sqlite-core.mjs';
import {CatchTransaction} from './catch-transaction.mjs';
import {createEvacTeamReservations} from './evac-team-reservations.mjs';
import {createEvacFlowIntegration} from './evac-flow-integration.mjs';
import {createEvacEventCompletion} from './evac-event-completion.mjs';
import {createEvacFounderStart} from './evac-founder-start.mjs';
import {createHqAccess} from './hq-access.mjs';
import {createRoleViews} from './role-views.mjs';

const requiredStrings=(values,code)=>{if(values.some(v=>typeof v!=='string'||!v.trim()))throw new GameError(code);};
const uniqueStrings=(values,code)=>{if(!Array.isArray(values)||!values.length||values.some(v=>typeof v!=='string'||!v.trim())||new Set(values).size!==values.length)throw new GameError(code);};
const move=(id,fromType,fromId,toType,toId,status)=>({id,fromType,fromId,toType,toId,status});

/**
 * BLOCK 03 composition root. It deliberately contains no HTTP/UI logic.
 * Every ownership-changing normal action uses one SqliteGameCore instance;
 * Catch and EVAC receive that exact same instance and therefore the same DB.
 */
export function createV2GameplayRuntime(path=':memory:', {
  clock=()=>Math.floor(Date.now()/1000),
  verifyRecoveryNfcProof,
  verifyUploadNfcProof,
}={}) {
  const core=new SqliteGameCore(path,clock);
  // Durable startup recovery: expired mission cargo returns to HQ before gameplay resumes.
  for(const e of core.db.prepare("SELECT event_id FROM events WHERE state='FIELD_ACTIVE'").all()) core.recoverExpiredMissions(e.event_id);
  const catchTransaction=new CatchTransaction(core);
  const evacTeams=createEvacTeamReservations(core);
  const evacCompletion=createEvacEventCompletion(core);
  const evacStart=createEvacFounderStart(core);
  const evacFlow=(typeof verifyRecoveryNfcProof==='function'&&typeof verifyUploadNfcProof==='function')
    ? createEvacFlowIntegration(core,{verifyRecoveryNfcProof,verifyUploadNfcProof})
    : null;

  function exchange({eventId,operationId,pioneerId,nodeId,gives,takes}){
    requiredStrings([eventId,operationId,pioneerId,nodeId],'EXCHANGE_CONTEXT_REQUIRED');
    uniqueStrings(gives,'EXCHANGE_CORES_REQUIRED');uniqueStrings(takes,'EXCHANGE_CORES_REQUIRED');
    if(gives.length!==takes.length||gives.length>3||new Set([...gives,...takes]).size!==gives.length+takes.length)throw new GameError('EXCHANGE_CORES_INVALID');
    return core.run({eventId,operationId,actorId:pioneerId,kind:'EXCHANGE',moves:[
      ...gives.map(id=>move(id,'PIONEER',pioneerId,'NODE',nodeId,'DEPLOYED')),
      ...takes.map(id=>move(id,'NODE',nodeId,'PIONEER',pioneerId,'FIELD')),
    ]});
  }

  function restore({eventId,operationId,pioneerId,nodeId,cargoCoreId,outCoreId,phase,missionId}){
    requiredStrings([eventId,operationId,pioneerId,nodeId,cargoCoreId,outCoreId,missionId],'RESTORE_CONTEXT_REQUIRED');
    if(![1,2].includes(phase))throw new GameError('RESTORE_PHASE_INVALID');
    // Both RESTORE phases advance the Pioneer by one carried Core.
    // #1 fills slot 2; #2 fills slot 3. Capacity is increased in the same transaction.
    const outgoing=move(outCoreId,'NODE',nodeId,'PIONEER',pioneerId,'FIELD');
    return core.run({eventId,operationId,actorId:pioneerId,kind:`RESTORE_${phase}`,missionId,capacityChange:1,moves:[
      move(cargoCoreId,'TRANSIT',pioneerId,'NODE',nodeId,'DEPLOYED'),outgoing,
    ]});
  }

  function selectMandatoryResupply(db,eventId,pioneerId){
    const now=core.clock();
    const activeMission=db.prepare("SELECT mission_id FROM missions WHERE event_id=? AND actor_id=? AND state='ASSIGNED' AND expires_at>? LIMIT 1").get(eventId,pioneerId,now);
    if(activeMission)throw new GameError('RESUPPLY_ASSIGNMENT_CONFLICT');
    const reservations=db.prepare('SELECT payload_json FROM reservations WHERE event_id=? AND expires_at>?').all(eventId,now);
    const reservedNodes=new Set(),reservedCores=new Set();
    for(const row of reservations){
      let p;try{p=JSON.parse(row.payload_json)}catch{throw new GameError('RESERVATION_UNVERIFIABLE')}
      if(!p||typeof p!=='object'||Array.isArray(p))throw new GameError('RESERVATION_UNVERIFIABLE');
      for(const id of [p.nodeId,p.node_id,...(Array.isArray(p.nodeIds)?p.nodeIds:[])])if(typeof id==='string'&&id)reservedNodes.add(id);
      for(const id of [p.coreId,p.core_id,...(Array.isArray(p.coreIds)?p.coreIds:[])])if(typeof id==='string'&&id)reservedCores.add(id);
    }
    const locked=new Set(db.prepare("SELECT node_id FROM actor_node_locks WHERE event_id=? AND actor_id=? AND until_epoch>?").all(eventId,pioneerId,now).map(x=>x.node_id));
    const candidates=[];
    for(const node of db.prepare("SELECT node_id FROM nodes WHERE event_id=? AND state='INSTALLED' ORDER BY node_id").all(eventId)){
      if(locked.has(node.node_id)||reservedNodes.has(node.node_id))continue;
      if(db.prepare("SELECT 1 FROM missions WHERE event_id=? AND node_id=? AND state='ASSIGNED' AND expires_at>? LIMIT 1").get(eventId,node.node_id,now))continue;
      const cores=db.prepare("SELECT core_id,visible_energy,status FROM cores WHERE event_id=? AND owner_type='NODE' AND owner_id=? ORDER BY visible_energy ASC,core_id ASC").all(eventId,node.node_id);
      if(cores.length!==3||cores.some(c=>c.status!=='DEPLOYED'||reservedCores.has(c.core_id)))continue;
      candidates.push({nodeId:node.node_id,out:cores[0]});
    }
    if(!candidates.length)throw new GameError('RESUPPLY_ASSIGNMENT_UNAVAILABLE');
    candidates.sort((a,b)=>a.out.visible_energy-b.out.visible_energy||a.nodeId.localeCompare(b.nodeId));
    const last=db.prepare("SELECT node_id FROM missions WHERE event_id=? AND kind='RESUPPLY' AND state='COMPLETED' ORDER BY rowid DESC LIMIT 1").get(eventId);
    const target=candidates.length>1&&last?candidates.find(c=>c.nodeId!==last.node_id)||candidates[0]:candidates[0];
    const reserve=db.prepare("SELECT core_id,visible_energy FROM cores WHERE event_id=? AND owner_type='HQ' AND owner_id='HQ' AND status='RESERVE' ORDER BY visible_energy ASC,core_id ASC").all(eventId).filter(c=>!reservedCores.has(c.core_id));
    if(!reserve.length)throw new GameError('RESUPPLY_ASSIGNMENT_UNAVAILABLE');
    const cargo=reserve.find(c=>c.visible_energy>=target.out.visible_energy)||[...reserve].sort((a,b)=>b.visible_energy-a.visible_energy||a.core_id.localeCompare(b.core_id))[0];
    return {target,cargo};
  }

  function upload({eventId,operationId,pioneerId,coreIds},transactionHook=null){
    requiredStrings([eventId,operationId,pioneerId],'UPLOAD_CONTEXT_REQUIRED');uniqueStrings(coreIds,'UPLOAD_CORES_REQUIRED');
    if(coreIds.length>3)throw new GameError('UPLOAD_CORES_INVALID');
    const actor=core.db.prepare('SELECT role,capacity FROM actors WHERE event_id=? AND actor_id=?').get(eventId,pioneerId);
    const ownedBefore=core.db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id=? AND owner_type='PIONEER' AND owner_id=? AND status='FIELD'").get(eventId,pioneerId).n;
    const mandatoryFullUpload=actor?.role==='PIONEER'&&ownedBefore===coreIds.length;
    let energyCredit=0,mandatoryResupply=null;
    const moves=coreIds.map(id=>{
      const c=core.core(eventId,id);
      if(!c)throw new GameError('UPLOAD_CORE_NOT_OWNED');
      if(!Number.isSafeInteger(c.actual_energy)||c.actual_energy<=0)throw new GameError('UPLOAD_ENERGY_INVALID');
      energyCredit+=c.actual_energy;
      return move(id,'PIONEER',pioneerId,'HQ','HQ','SECURED');
    });
    const missionId='RS-'+operationId;
    const hook=(db,{replay})=>{
      if(mandatoryFullUpload){
        if(replay){
          const mission=db.prepare('SELECT mission_id,node_id,core_id,expires_at,state FROM missions WHERE event_id=? AND mission_id=?').get(eventId,missionId);
          if(!mission)throw new GameError('RESUPPLY_RECEIPT_MISSING');
          mandatoryResupply=mission;
        }else{
          const personal=db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id=? AND owner_type='PIONEER' AND owner_id=? AND status='FIELD'").get(eventId,pioneerId).n;
          if(personal!==0)throw new GameError('FULL_UPLOAD_REQUIRES_EMPTY_INVENTORY');
          const {target,cargo}=selectMandatoryResupply(db,eventId,pioneerId);
          const expiresAt=core.clock()+1800;
          const changed=db.prepare("UPDATE cores SET owner_type='TRANSIT',owner_id=?,status='IN_TRANSIT',version=version+1 WHERE event_id=? AND core_id=? AND owner_type='HQ' AND owner_id='HQ' AND status='RESERVE'").run(pioneerId,eventId,cargo.core_id);
          if(changed.changes!==1)throw new GameError('RESUPPLY_CARGO_CONFLICT');
          db.prepare("INSERT INTO missions(event_id,mission_id,actor_id,kind,node_id,core_id,state,expires_at) VALUES (?,?,?,?,?,?,?,?)").run(eventId,missionId,pioneerId,'RESUPPLY',target.nodeId,cargo.core_id,'ASSIGNED',expiresAt);
          core.assertIntegrity(eventId);
          mandatoryResupply={mission_id:missionId,node_id:target.nodeId,core_id:cargo.core_id,expires_at:expiresAt,state:'ASSIGNED'};
        }
      }
      if(transactionHook)transactionHook(db,{replay});
    };
    const result=core.run({eventId,operationId,actorId:pioneerId,kind:'HQ_UPLOAD',moves,energyCredit},hook);
    return mandatoryResupply?{...result,mandatoryResupply:{id:mandatoryResupply.mission_id,nodeId:mandatoryResupply.node_id,coreId:mandatoryResupply.core_id,expiresAt:mandatoryResupply.expires_at}}:result;
  }

  function resupply({eventId,operationId,pioneerId,missionId,outCoreId}){
    requiredStrings([eventId,operationId,pioneerId,missionId,outCoreId],'RESUPPLY_CONTEXT_REQUIRED');
    const mission=core.db.prepare('SELECT * FROM missions WHERE event_id=? AND mission_id=?').get(eventId,missionId);
    if(!mission)throw new GameError('RESUPPLY_MISSION_DENIED');
    return core.run({eventId,operationId,actorId:pioneerId,kind:'RESUPPLY',missionId,moves:[
      move(mission.core_id,'TRANSIT',pioneerId,'NODE',mission.node_id,'DEPLOYED'),
      move(outCoreId,'NODE',mission.node_id,'PIONEER',pioneerId,'FIELD'),
    ]});
  }

  function fopInstall({eventId,operationId,fopId,nodeId,coreIds}){
    requiredStrings([eventId,operationId,fopId,nodeId],'FOP_CONTEXT_REQUIRED');uniqueStrings(coreIds,'FOP_CORES_REQUIRED');
    if(coreIds.length!==3)throw new GameError('FOP_THREE_CORES_REQUIRED');
    return core.run({eventId,operationId,actorId:fopId,kind:'INSTALL',moves:coreIds.map(id=>move(id,'TRANSIT',fopId,'NODE',nodeId,'DEPLOYED')),nodeChanges:[{id:nodeId,state:'INSTALLED'}]});
  }

  function fopDeinstall({eventId,operationId,fopId,nodeId}){
    requiredStrings([eventId,operationId,fopId,nodeId],'FOP_CONTEXT_REQUIRED');
    const coreIds=core.db.prepare("SELECT core_id FROM cores WHERE event_id=? AND owner_type='NODE' AND owner_id=? ORDER BY core_id").all(eventId,nodeId).map(r=>r.core_id);
    if(coreIds.length!==3)throw new GameError('FOP_THREE_CORES_REQUIRED');
    return core.run({eventId,operationId,actorId:fopId,kind:'DEINSTALL',moves:coreIds.map(id=>move(id,'NODE',nodeId,'HQ','HQ','RESERVE')),nodeChanges:[{id:nodeId,state:'DEINSTALLED'}]});
  }

  const hq=createHqAccess(core,{upload});
  const roles=createRoleViews({core,hq});

  return {
    core,
    exchange,restore,upload,resupply,hq,roles,
    fop:{install:fopInstall,deinstall:fopDeinstall},
    catch:catchTransaction,
    evac:{start:evacStart,teams:evacTeams,flow:evacFlow,completion:evacCompletion},
    maintenance:{recoverExpiredMissions:(eventId)=>core.recoverExpiredMissions(eventId),assertIntegrity:(eventId)=>core.assertIntegrity(eventId)},
    close:()=>core.close(),
  };
}
