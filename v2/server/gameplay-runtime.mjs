import {SqliteGameCore, GameError} from './sqlite-core.mjs';
import {CatchTransaction} from './catch-transaction.mjs';
import {createEvacTeamReservations} from './evac-team-reservations.mjs';
import {createEvacFlowIntegration} from './evac-flow-integration.mjs';
import {createEvacEventCompletion} from './evac-event-completion.mjs';
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
    const outgoing=phase===1
      ? move(outCoreId,'NODE',nodeId,'PIONEER',pioneerId,'FIELD')
      : move(outCoreId,'NODE',nodeId,'HQ','HQ','RESERVE');
    return core.run({eventId,operationId,actorId:pioneerId,kind:`RESTORE_${phase}`,missionId,capacityChange:1,moves:[
      move(cargoCoreId,'TRANSIT',pioneerId,'NODE',nodeId,'DEPLOYED'),outgoing,
    ]});
  }

  function upload({eventId,operationId,pioneerId,coreIds},transactionHook=null){
    requiredStrings([eventId,operationId,pioneerId],'UPLOAD_CONTEXT_REQUIRED');uniqueStrings(coreIds,'UPLOAD_CORES_REQUIRED');
    if(coreIds.length>3)throw new GameError('UPLOAD_CORES_INVALID');
    let energyCredit=0;
    const moves=coreIds.map(id=>{
      const c=core.core(eventId,id);
      if(!c||c.owner_type!=='PIONEER'||c.owner_id!==pioneerId||c.status!=='FIELD')throw new GameError('UPLOAD_CORE_NOT_OWNED');
      if(!Number.isSafeInteger(c.actual_energy)||c.actual_energy<=0)throw new GameError('UPLOAD_ENERGY_INVALID');
      energyCredit+=c.actual_energy;
      return move(id,'PIONEER',pioneerId,'HQ','HQ','SECURED');
    });
    return core.run({eventId,operationId,actorId:pioneerId,kind:'HQ_UPLOAD',moves,energyCredit},transactionHook);
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
    evac:{teams:evacTeams,flow:evacFlow,completion:evacCompletion},
    maintenance:{recoverExpiredMissions:(eventId)=>core.recoverExpiredMissions(eventId),assertIntegrity:(eventId)=>core.assertIntegrity(eventId)},
    close:()=>core.close(),
  };
}
