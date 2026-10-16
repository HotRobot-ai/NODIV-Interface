import {createHash, randomUUID} from 'node:crypto';
import {GameError} from './sqlite-core.mjs';

const COST=150;
const TTL_SECONDS=300;
const UPLOAD_TTL_SECONDS=300;

function hash(value){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}

export function createHqAccess(core,{upload}={}){
  if(typeof upload!=='function') throw new Error('HQ_UPLOAD_HANDLER_REQUIRED');
  const db=core.db;
  db.exec(`
    CREATE TABLE IF NOT EXISTS hq_upload_bays (
      event_id TEXT NOT NULL,
      bay_id TEXT NOT NULL,
      uid TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
      PRIMARY KEY(event_id,bay_id),
      UNIQUE(event_id,uid)
    );
    CREATE TABLE IF NOT EXISTS hq_upload_orders (
      event_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      bay_id TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('CLAIMED','AUTHORIZED','COMPLETED')),
      core_ids_json TEXT NOT NULL DEFAULT '[]',
      expires_at INTEGER NOT NULL,
      operation_id TEXT,
      upload_operation_id TEXT,
      PRIMARY KEY(event_id,order_id),
      UNIQUE(event_id,operation_id)
    );
    CREATE TABLE IF NOT EXISTS catch_ghost (
      event_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      until_epoch INTEGER NOT NULL,
      PRIMARY KEY(event_id,actor_id)
    );
  `);
  const hqCols=db.prepare('PRAGMA table_info(hq_upload_orders)').all().map(x=>x.name);
  if(!hqCols.includes('upload_operation_id'))db.exec('ALTER TABLE hq_upload_orders ADD COLUMN upload_operation_id TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_hq_upload_orders_upload_op ON hq_upload_orders(event_id,upload_operation_id) WHERE upload_operation_id IS NOT NULL');

  function assertPioneer(eventId,pioneerId){
    const event=db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId);
    if(!event||event.state!=='FIELD_ACTIVE') throw new GameError('EVENT_NOT_FIELD_ACTIVE');
    const actor=db.prepare('SELECT role,active FROM actors WHERE event_id=? AND actor_id=?').get(eventId,pioneerId);
    if(!actor||actor.active!==1||actor.role!=='PIONEER') throw new GameError('PIONEER_REQUIRED');
  }

  function bays(eventId){
    return db.prepare('SELECT bay_id,uid FROM hq_upload_bays WHERE event_id=? AND active=1 ORDER BY bay_id').all(eventId);
  }

  function secureReservation(eventId,bayId){
    const rows=db.prepare("SELECT reservation_id,actor_id,expires_at,payload_json FROM reservations WHERE event_id=? AND kind='SECURE_APPROACH' AND expires_at>? ORDER BY expires_at,reservation_id").all(eventId,core.clock());
    for(const row of rows){
      let payload; try{payload=JSON.parse(row.payload_json)}catch{throw new GameError('RESERVATION_UNVERIFIABLE')}
      if(payload?.bayId===bayId) return row;
    }
    return null;
  }

  function activeOrder(eventId,bayId){
    return db.prepare("SELECT * FROM hq_upload_orders WHERE event_id=? AND bay_id=? AND state IN ('CLAIMED','AUTHORIZED') AND expires_at>? ORDER BY expires_at,order_id LIMIT 1").get(eventId,bayId,core.clock());
  }

  function terminalState({eventId,pioneerId}){
    assertPioneer(eventId,pioneerId);
    const points=bays(eventId).map(bay=>{
      const order=activeOrder(eventId,bay.bay_id);
      if(order) return {bayId:bay.bay_id,uid:bay.uid,state:'RED',ownReservation:order.actor_id===pioneerId,expiresAt:order.expires_at};
      const reservation=secureReservation(eventId,bay.bay_id);
      if(reservation) return {bayId:bay.bay_id,uid:bay.uid,state:'YELLOW',ownReservation:reservation.actor_id===pioneerId,expiresAt:reservation.expires_at};
      return {bayId:bay.bay_id,uid:bay.uid,state:'GREEN',ownReservation:false,expiresAt:null};
    });
    const selected=points.find(p=>p.ownReservation)||points.find(p=>p.state==='GREEN')||points[0]||null;
    return {state:selected?.state||'GREEN',selected,points,available:points.filter(p=>p.state==='GREEN').length,total:points.length};
  }

  function seedBay(eventId,{id,uid,active=true}){
    if(!eventId||!id||!uid) throw new GameError('UPLOAD_BAY_REQUIRED');
    db.prepare('INSERT INTO hq_upload_bays(event_id,bay_id,uid,active) VALUES (?,?,?,?) ON CONFLICT(event_id,bay_id) DO UPDATE SET uid=excluded.uid,active=excluded.active').run(eventId,id,String(uid).trim().toUpperCase(),active?1:0);
  }

  function activateSecureApproach({eventId,pioneerId,requestId}){
    if(!eventId||!pioneerId||!/^[A-Za-z0-9_-]{8,100}$/.test(String(requestId||''))) throw new GameError('SECURE_APPROACH_REQUEST_REQUIRED');
    const operationId='SAP-'+requestId;
    const payloadHash=hash({eventId,pioneerId,requestId});
    db.exec('BEGIN IMMEDIATE');
    try{
      const prior=db.prepare("SELECT actor_id,payload_hash,response_json FROM operations WHERE event_id=? AND operation_id=? AND kind='SECURE_APPROACH'").get(eventId,operationId);
      if(prior){
        if(prior.actor_id!==pioneerId||prior.payload_hash!==payloadHash) throw new GameError('IDEMPOTENCY_CONFLICT');
        db.exec('COMMIT');
        return {...JSON.parse(prior.response_json),replayed:true};
      }
      assertPioneer(eventId,pioneerId);
      const point=bays(eventId).find(b=>!activeOrder(eventId,b.bay_id)&&!secureReservation(eventId,b.bay_id));
      if(!point) throw new GameError('UPLOAD_POINTS_BUSY');
      const balance=db.prepare('SELECT secured_energy FROM balances WHERE event_id=? AND actor_id=?').get(eventId,pioneerId)?.secured_energy;
      if(!Number.isSafeInteger(balance)||balance<COST) throw new GameError('INSUFFICIENT_SECURED_ENERGY');
      const expiresAt=core.clock()+TTL_SECONDS;
      const currentGhost=db.prepare('SELECT until_epoch FROM catch_ghost WHERE event_id=? AND actor_id=?').get(eventId,pioneerId)?.until_epoch||0;
      const ghostUntil=Math.max(currentGhost,expiresAt);
      const reservationId='SAP-'+randomUUID();
      const newBalance=balance-COST;
      if(db.prepare('UPDATE balances SET secured_energy=? WHERE event_id=? AND actor_id=? AND secured_energy=?').run(newBalance,eventId,pioneerId,balance).changes!==1) throw new GameError('BALANCE_CONFLICT');
      db.prepare('INSERT INTO catch_ghost(event_id,actor_id,until_epoch) VALUES (?,?,?) ON CONFLICT(event_id,actor_id) DO UPDATE SET until_epoch=MAX(catch_ghost.until_epoch,excluded.until_epoch)').run(eventId,pioneerId,ghostUntil);
      db.prepare("INSERT INTO reservations(event_id,reservation_id,kind,actor_id,expires_at,payload_json) VALUES (?,?,?,?,?,?)").run(eventId,reservationId,'SECURE_APPROACH',pioneerId,expiresAt,JSON.stringify({bayId:point.bay_id,requestId}));
      const receipt={ok:true,status:'SECURE_APPROACH_ACTIVE',reservationId,bayId:point.bay_id,expiresAt,ghostUntil,securedEnergy:newBalance,cost:COST,replayed:false};
      db.prepare("INSERT INTO operations(event_id,operation_id,actor_id,kind,payload_hash,response_json) VALUES (?,?,?,?,?,?)").run(eventId,operationId,pioneerId,'SECURE_APPROACH',payloadHash,JSON.stringify(receipt));
      db.prepare('INSERT INTO audit(event_id,operation_id,seq,energy_delta) VALUES (?,?,0,?)').run(eventId,operationId,-COST);
      db.exec('COMMIT');
      return receipt;
    }catch(error){db.exec('ROLLBACK');throw error}
  }

  function claim({eventId,pioneerId,bayId,operationId}){
    if(!eventId||!pioneerId||!bayId||!operationId) throw new GameError('HQ_UPLOAD_CLAIM_REQUIRED');
    db.exec('BEGIN IMMEDIATE');
    try{
      assertPioneer(eventId,pioneerId);
      const bay=db.prepare('SELECT bay_id,active FROM hq_upload_bays WHERE event_id=? AND bay_id=?').get(eventId,bayId);
      if(!bay||bay.active!==1) throw new GameError('UPLOAD_POINT_INVALID');
      const prior=db.prepare('SELECT * FROM hq_upload_orders WHERE event_id=? AND operation_id=?').get(eventId,operationId);
      if(prior){
        if(prior.actor_id!==pioneerId||prior.bay_id!==bayId) throw new GameError('IDEMPOTENCY_CONFLICT');
        db.exec('COMMIT'); return {ok:true,orderId:prior.order_id,bayId,state:prior.state,expiresAt:prior.expires_at,replayed:true};
      }
      const order=activeOrder(eventId,bayId);
      if(order&&order.actor_id!==pioneerId) throw new GameError('UPLOAD_POINT_BUSY');
      const reservation=secureReservation(eventId,bayId);
      if(reservation&&reservation.actor_id!==pioneerId) throw new GameError('UPLOAD_POINT_BUSY');
      if(order&&order.actor_id===pioneerId){db.exec('COMMIT');return {ok:true,orderId:order.order_id,bayId,state:order.state,expiresAt:order.expires_at,replayed:true};}
      const orderId='UPL-'+randomUUID();
      const expiresAt=reservation?.actor_id===pioneerId?reservation.expires_at:core.clock()+UPLOAD_TTL_SECONDS;
      db.prepare('INSERT INTO hq_upload_orders(event_id,order_id,actor_id,bay_id,state,core_ids_json,expires_at,operation_id) VALUES (?,?,?,?,?,?,?,?)')
        .run(eventId,orderId,pioneerId,bayId,'CLAIMED','[]',expiresAt,operationId);
      db.exec('COMMIT'); return {ok:true,orderId,bayId,state:'CLAIMED',expiresAt,replayed:false};
    }catch(error){db.exec('ROLLBACK');throw error}
  }

  function authorize({eventId,pioneerId,orderId,coreIds}){
    if(!eventId||!pioneerId||!orderId||!Array.isArray(coreIds)||coreIds.length<1||coreIds.length>3||new Set(coreIds).size!==coreIds.length) throw new GameError('HQ_UPLOAD_SELECTION_INVALID');
    db.exec('BEGIN IMMEDIATE');
    try{
      assertPioneer(eventId,pioneerId);
      const order=db.prepare('SELECT * FROM hq_upload_orders WHERE event_id=? AND order_id=?').get(eventId,orderId);
      if(!order||order.actor_id!==pioneerId||order.expires_at<=core.clock()||order.state==='COMPLETED') throw new GameError('HQ_UPLOAD_ORDER_INVALID');
      const selected=coreIds.map(id=>{
        const c=db.prepare('SELECT core_id,visible_energy,actual_energy,owner_type,owner_id,status FROM cores WHERE event_id=? AND core_id=?').get(eventId,id);
        if(!c||c.owner_type!=='PIONEER'||c.owner_id!==pioneerId||c.status!=='FIELD') throw new GameError('UPLOAD_CORE_NOT_OWNED');
        return c;
      });
      db.prepare("UPDATE hq_upload_orders SET state='AUTHORIZED',core_ids_json=? WHERE event_id=? AND order_id=?").run(JSON.stringify(coreIds),eventId,orderId);
      db.exec('COMMIT');
      return {ok:true,orderId,bayId:order.bay_id,state:'AUTHORIZED',cores:selected.map(c=>({id:c.core_id,energy:c.visible_energy})),energy:selected.reduce((s,c)=>s+c.actual_energy,0),expiresAt:order.expires_at};
    }catch(error){db.exec('ROLLBACK');throw error}
  }

  function confirm({eventId,pioneerId,orderId,operationId}){
    if(!eventId||!pioneerId||!orderId||!operationId) throw new GameError('HQ_UPLOAD_CONFIRM_REQUIRED');
    const order=db.prepare('SELECT * FROM hq_upload_orders WHERE event_id=? AND order_id=?').get(eventId,orderId);
    if(!order||order.actor_id!==pioneerId) throw new GameError('HQ_UPLOAD_ORDER_INVALID');
    if(order.state==='COMPLETED'&&order.upload_operation_id!==operationId)throw new GameError('HQ_UPLOAD_ALREADY_COMPLETED');
    if(order.state!=='COMPLETED'&&(order.expires_at<=core.clock()||order.state!=='AUTHORIZED')) throw new GameError('HQ_UPLOAD_ORDER_INVALID');
    const coreIds=JSON.parse(order.core_ids_json||'[]');
    const result=upload({eventId,operationId,pioneerId,coreIds},(tx,{replay})=>{
      const current=tx.prepare('SELECT actor_id,state,core_ids_json,upload_operation_id FROM hq_upload_orders WHERE event_id=? AND order_id=?').get(eventId,orderId);
      if(!current||current.actor_id!==pioneerId||current.core_ids_json!==JSON.stringify(coreIds)) throw new GameError('HQ_UPLOAD_ORDER_INVALID');
      if(replay){
        if(current.state!=='COMPLETED'||current.upload_operation_id!==operationId)throw new GameError('HQ_UPLOAD_REPLAY_SCOPE_DENIED');
        return;
      }
      if(current.state!=='AUTHORIZED') throw new GameError('HQ_UPLOAD_ORDER_INVALID');
      tx.prepare("UPDATE hq_upload_orders SET state='COMPLETED',upload_operation_id=? WHERE event_id=? AND order_id=?").run(operationId,eventId,orderId);
      const reservations=tx.prepare("SELECT reservation_id,payload_json FROM reservations WHERE event_id=? AND kind='SECURE_APPROACH' AND actor_id=?").all(eventId,pioneerId);
      for(const reservation of reservations){
        let payload=null; try{payload=JSON.parse(reservation.payload_json)}catch{}
        if(payload?.bayId===order.bay_id) tx.prepare('DELETE FROM reservations WHERE event_id=? AND reservation_id=?').run(eventId,reservation.reservation_id);
      }
    });
    const balance=db.prepare('SELECT secured_energy FROM balances WHERE event_id=? AND actor_id=?').get(eventId,pioneerId)?.secured_energy||0;
    return {...result,orderId,bayId:order.bay_id,securedEnergy:balance};
  }

  return {seedBay,terminalState,activateSecureApproach,claim,authorize,confirm};
}

export const HQ_ACCESS_RULES={secureApproachCost:COST,secureApproachSeconds:TTL_SECONDS,uploadOrderSeconds:UPLOAD_TTL_SECONDS};
