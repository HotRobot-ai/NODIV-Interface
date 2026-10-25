import {GameError} from './sqlite-core.mjs';
import {checkEvacCompletionFromSqlite} from './evac-sqlite-gate.mjs';

function tableExists(db,name){return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)}
function iso(epoch){return Number.isFinite(epoch)?new Date(epoch*1000).toISOString():null}

export function createRoleViews(runtime){
  const core=runtime.core,db=core.db;

  function common(eventId,actorId){
    const event=db.prepare('SELECT event_id,state FROM events WHERE event_id=?').get(eventId);
    if(!event) throw new GameError('EVENT_UNKNOWN');
    const actor=db.prepare('SELECT actor_id,role,capacity,active FROM actors WHERE event_id=? AND actor_id=?').get(eventId,actorId);
    if(!actor||actor.active!==1) throw new GameError('ACTOR_DENIED');
    const balance=db.prepare('SELECT secured_energy FROM balances WHERE event_id=? AND actor_id=?').get(eventId,actorId)?.secured_energy||0;
    const evac=tableExists(db,'evac_control')?db.prepare('SELECT state FROM evac_control WHERE event_id=?').get(eventId)?.state||null:null;
    return {event:{id:event.event_id,state:event.state,evacState:evac},actor:{id:actor.actor_id,role:actor.role,capacity:actor.capacity},securedEnergy:balance,serverNow:core.clock()};
  }

  function protection(eventId,actorId){
    if(!tableExists(db,'catch_ghost')) return {active:false,until:null,remainingSeconds:0};
    const until=db.prepare('SELECT until_epoch FROM catch_ghost WHERE event_id=? AND actor_id=?').get(eventId,actorId)?.until_epoch||0;
    return {active:until>core.clock(),until:until?iso(until):null,remainingSeconds:Math.max(0,until-core.clock())};
  }

  function personal(eventId,actorId){
    return db.prepare("SELECT core_id,visible_energy,status FROM cores WHERE event_id=? AND owner_type='PIONEER' AND owner_id=? ORDER BY visible_energy DESC,core_id").all(eventId,actorId)
      .map(c=>({id:c.core_id,energy:c.visible_energy,status:c.status}));
  }

  function activeMission(eventId,actorId){
    const m=db.prepare("SELECT mission_id,kind,node_id,core_id,expires_at FROM missions WHERE event_id=? AND actor_id=? AND state='ASSIGNED' AND expires_at>? AND kind IN ('RESTORE_1','RESTORE_2','RESUPPLY') ORDER BY expires_at,mission_id LIMIT 1").get(eventId,actorId,core.clock());
    if(!m) return null;
    const cargo=db.prepare('SELECT visible_energy,status,owner_type,owner_id FROM cores WHERE event_id=? AND core_id=?').get(eventId,m.core_id);
    return {id:m.mission_id,kind:m.kind,nodeId:m.node_id,expiresAt:iso(m.expires_at),remainingSeconds:Math.max(0,m.expires_at-core.clock()),cargo:cargo?{id:m.core_id,energy:cargo.visible_energy,status:cargo.status}:null};
  }

  function pioneer(eventId,actorId,base){
    const inv=personal(eventId,actorId),mission=activeMission(eventId,actorId),protect=protection(eventId,actorId);
    const transit=db.prepare("SELECT core_id,visible_energy,status FROM cores WHERE event_id=? AND owner_type='TRANSIT' AND owner_id=? ORDER BY core_id").all(eventId,actorId)
      .map(c=>({id:c.core_id,energy:c.visible_energy,status:c.status}));
    const cooldowns=db.prepare("SELECT node_id,until_epoch FROM node_cooldowns WHERE event_id=? AND kind='EXCHANGE' AND until_epoch>? ORDER BY until_epoch").all(eventId,core.clock())
      .map(x=>({nodeId:x.node_id,until:iso(x.until_epoch),remainingSeconds:x.until_epoch-core.clock()}));
    const locks=db.prepare("SELECT node_id,until_epoch FROM actor_node_locks WHERE event_id=? AND actor_id=? AND kind='RESTORE' AND until_epoch>? ORDER BY until_epoch").all(eventId,actorId,core.clock())
      .map(x=>({nodeId:x.node_id,until:iso(x.until_epoch),remainingSeconds:x.until_epoch-core.clock()}));
    let hq={state:'UNAVAILABLE',points:[],available:0,total:0};
    try{hq=runtime.hq.terminalState({eventId,pioneerId:actorId})}catch(error){if(error.code!=='EVENT_NOT_FIELD_ACTIVE'&&error.code!=='PIONEER_REQUIRED')throw error}
    let next;
    if(base.event.evacState==='STARTED') next={code:'EVAC',label:'EVAKUIERUNG FORTSETZEN',detail:'Nur der EVAC-Endablauf ist jetzt relevant.'};
    else if(mission?.kind==='RESUPPLY') next={code:'RESUPPLY',label:'RE-SUPPLY AUSFÜHREN',detail:'Transit-Core zum zugewiesenen Node bringen.'};
    else if(mission?.kind==='RESTORE_1'||mission?.kind==='RESTORE_2') next={code:'RESTORE',label:mission.kind.replace('_',' #'),detail:'Ziel-Node und Missionscargo serverseitig zugewiesen.'};
    else if(inv.length===0) next={code:'HQ',label:'HQ // RE-SUPPLY PRÜFEN',detail:'Kein persönlicher N-Core verfügbar.'};
    else next={code:'SCAN_NODE',label:'NODE SCANNEN',detail:'NODIV prüft danach die zulässige Aktion.'};
    return {...base,inventory:{used:inv.filter(c=>c.status==='FIELD').length,capacity:base.actor.capacity,energy:inv.filter(c=>c.status==='FIELD').reduce((s,c)=>s+c.energy,0),cores:inv},transit,mission,protection:protect,cooldowns,restoreLocks:locks,hq,nextAction:next};
  }

  function catcher(eventId,actorId,base){
    const inv=personal(eventId,actorId),protect=protection(eventId,actorId);
    const next=base.event.evacState==='STARTED'
      ? {code:'WAIT',label:'CATCH GESPERRT',detail:'Während EVAC sind normale Catch-Aktionen eingefroren.'}
      : {code:'CATCH',label:'PIONEER ACCESS CARD SCANNEN',detail:'Der Server prüft Ziel, Schutz und Kapazität.'};
    return {...base,inventory:{used:inv.filter(c=>c.status==='FIELD').length,capacity:base.actor.capacity,cores:inv},protection:protect,nextAction:next};
  }

  function fop(eventId,actorId,base){
    const nodes=db.prepare("SELECT node_id,state FROM nodes WHERE event_id=? ORDER BY node_id").all(eventId);
    const transit=db.prepare("SELECT core_id,visible_energy,status FROM cores WHERE event_id=? AND owner_type='TRANSIT' AND owner_id=? ORDER BY core_id").all(eventId,actorId).map(c=>({id:c.core_id,energy:c.visible_energy,status:c.status}));
    const evacVisible=base.event.evacState==='STARTED';
    const next=evacVisible
      ? {code:'EVAC',label:'EVAKUIERUNG FORTSETZEN',detail:'EVAC-Steuerung ist jetzt freigegeben.'}
      : {code:'NODE_OPS',label:'NODE-AUFTRAG AUSFÜHREN',detail:'Node scannen und serverseitig zulässige Installation oder Deinstallation ausführen.'};
    return {...base,nodes:{available:nodes.filter(n=>n.state!=='INSTALLED').length,installed:nodes.filter(n=>n.state==='INSTALLED').length,total:nodes.length},transit,evacVisible,nextAction:next};
  }

  function founder(eventId,actorId,base){
    const nodes=db.prepare("SELECT state,COUNT(*) count FROM nodes WHERE event_id=? GROUP BY state").all(eventId);
    const roles=db.prepare("SELECT role,COUNT(*) count FROM actors WHERE event_id=? AND active=1 GROUP BY role").all(eventId);
    const cores=db.prepare("SELECT owner_type,status,COUNT(*) count FROM cores WHERE event_id=? GROUP BY owner_type,status").all(eventId);
    const allowed=[];
    if(base.event.evacState==='PRE_EVAC_READY') allowed.push('EVAC_START');
    if(base.event.evacState==='STARTED'){
      let completeReady=false;
      try{
        const gate=checkEvacCompletionFromSqlite(db,eventId);
        const pendingMissions=db.prepare("SELECT COUNT(*) n FROM missions WHERE event_id=? AND state='ASSIGNED' AND expires_at>?").get(eventId,core.clock())?.n||0;
        const pendingReservations=db.prepare("SELECT COUNT(*) n FROM reservations WHERE event_id=? AND expires_at>?").get(eventId,core.clock())?.n||0;
        completeReady=gate.eligible&&pendingMissions===0&&pendingReservations===0;
      }catch{}
      allowed.push(completeReady?'EVAC_COMPLETE':'EVAC_MONITOR');
    }
    let next={code:'MONITOR',label:'EVENTSTATUS PRÜFEN',detail:'Nur serverseitig zulässige Founder-Aktionen werden angeboten.'};
    if(allowed[0]==='EVAC_START') next={code:'EVAC_START',label:'EVAKUIERUNG STARTEN',detail:'Alle Startbedingungen sind serverseitig erfüllt.'};
    if(allowed[0]==='EVAC_MONITOR') next={code:'EVAC_MONITOR',label:'EVAKUIERUNG ÜBERWACHEN',detail:'Der Abschluss bleibt gesperrt, bis alle EVAC-Nachweise vollständig sind.'};
    if(allowed[0]==='EVAC_COMPLETE') next={code:'EVAC_COMPLETE',label:'EVENT ABSCHLIESSEN',detail:'Alle EVAC-Nachweise sind vollständig. Founder-Abschluss ist freigegeben.'};
    return {...base,overview:{nodes,roles,cores},allowedActions:allowed,nextAction:next};
  }

  function view({eventId,actorId}){
    const base=common(eventId,actorId);
    if(base.actor.role==='PIONEER') return pioneer(eventId,actorId,base);
    if(base.actor.role==='LOCAL'||base.actor.role==='UNBOUND') return catcher(eventId,actorId,base);
    if(base.actor.role==='FOP') return fop(eventId,actorId,base);
    if(base.actor.role==='FOUNDER') return founder(eventId,actorId,base);
    throw new GameError('ROLE_DENIED');
  }

  return {view};
}
