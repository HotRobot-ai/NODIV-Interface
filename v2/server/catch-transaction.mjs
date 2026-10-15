import {createHash, randomUUID} from 'node:crypto';
import {GameError} from './sqlite-core.mjs';

// Isolated V2 domain service. Caller must authenticate actor and verify NFC proof at API boundary.
export class CatchTransaction {
 constructor(core){
  this.core=core;
  core.db.exec(`CREATE TABLE IF NOT EXISTS catch_ghost(event_id TEXT NOT NULL,actor_id TEXT NOT NULL,until_epoch INTEGER NOT NULL,PRIMARY KEY(event_id,actor_id));
CREATE TABLE IF NOT EXISTS catch_previews(event_id TEXT NOT NULL,preview_id TEXT NOT NULL,catcher_id TEXT NOT NULL,target_id TEXT NOT NULL,core_id TEXT NOT NULL,inventory_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,PRIMARY KEY(event_id,preview_id));`);
 }
 inventory(db,eventId,id){return db.prepare("SELECT core_id,owner_type,owner_id,status,version,visible_energy FROM cores WHERE event_id=? AND owner_type='PIONEER' AND owner_id=? ORDER BY core_id").all(eventId,id)}
 snapshot(db,eventId,catcher,target){return createHash('sha256').update(JSON.stringify([this.inventory(db,eventId,catcher),this.inventory(db,eventId,target)])).digest('hex')}
 check(db,eventId,catcherId,targetId){
  const event=db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId);
  if(event?.state!=='FIELD_ACTIVE')throw new GameError('EVENT_NOT_FIELD_ACTIVE');
  const catcher=db.prepare('SELECT * FROM actors WHERE event_id=? AND actor_id=?').get(eventId,catcherId);
  const target=db.prepare('SELECT * FROM actors WHERE event_id=? AND actor_id=?').get(eventId,targetId);
  if(!catcher?.active||!['LOCAL','UNBOUND'].includes(catcher.role))throw new GameError('CATCH_ACCESS_DENIED');
  if(!target?.active||target.role!=='PIONEER'||targetId===catcherId)throw new GameError('CATCH_TARGET_INVALID');
  const ghost=db.prepare('SELECT until_epoch FROM catch_ghost WHERE event_id=? AND actor_id=?').get(eventId,targetId);
  if(ghost?.until_epoch>this.core.clock())throw new GameError('TARGET_PROTECTED');
  if(this.inventory(db,eventId,catcherId).filter(c=>c.status!=='IN_TRANSIT').length>=catcher.capacity)throw new GameError('CATCHER_CAPACITY_FULL');
  // A mission-assigned core must never be silently stolen by Catch.
  const reserved=new Set(db.prepare("SELECT core_id FROM missions WHERE event_id=? AND state='ASSIGNED' AND expires_at>? AND core_id IS NOT NULL").all(eventId,this.core.clock()).map(r=>r.core_id));
  // Active reservation records are shared with other game actions. Refuse
  // unknown reservation payloads rather than stealing a reserved Core.
  const reservations=db.prepare('SELECT kind,actor_id,payload_json FROM reservations WHERE event_id=? AND expires_at>?').all(eventId,this.core.clock());
  for(const reservation of reservations){
   let payload;
   try{payload=JSON.parse(reservation.payload_json)}catch{throw new GameError('CATCH_RESERVATION_UNVERIFIABLE')}
   if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new GameError('CATCH_RESERVATION_UNVERIFIABLE');
   if(reservation.actor_id===catcherId && /EXCHANGE/i.test(reservation.kind))throw new GameError('CATCHER_EXCHANGE_RESERVED');
   // Do not partially accept malformed multi-core reservations: one unknown
   // entry could otherwise be the very Core selected for Catch.
   if(payload.coreIds!==undefined&&!Array.isArray(payload.coreIds))throw new GameError('CATCH_RESERVATION_UNVERIFIABLE');
   const ids=[payload.coreId,payload.core_id,...(payload.coreIds||[])].filter(id=>id!==undefined);
   if(ids.some(id=>typeof id!=='string'||!id.trim()))throw new GameError('CATCH_RESERVATION_UNVERIFIABLE');
   if(ids.length)ids.forEach(id=>reserved.add(id));
   else if(/EXCHANGE|RESTORE|INSTALL|DEPLOY/i.test(reservation.kind))throw new GameError('CATCH_RESERVATION_UNVERIFIABLE');
  }
  const eligible=this.inventory(db,eventId,targetId).filter(c=>c.status==='FIELD'&&!reserved.has(c.core_id)).sort((a,b)=>b.visible_energy-a.visible_energy||a.core_id.localeCompare(b.core_id));
  if(!eligible.length)throw new GameError('NO_CATCHABLE_CORE');
  return eligible[0];
 }
 preview({eventId,catcherId,targetId}){
  const db=this.core.db;db.exec('BEGIN IMMEDIATE');try{
   const core=this.check(db,eventId,catcherId,targetId),previewId='CAT-'+randomUUID(),expiresAt=this.core.clock()+300;
   db.prepare('INSERT INTO catch_previews VALUES (?,?,?,?,?,?,?)').run(eventId,previewId,catcherId,targetId,core.core_id,this.snapshot(db,eventId,catcherId,targetId),expiresAt);
   db.exec('COMMIT');return {previewId,expiresAt,targetId};
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 confirm({eventId,previewId,catcherId},transactionHook=null){
  const db=this.core.db;db.exec('BEGIN IMMEDIATE');try{
   const prior=db.prepare('SELECT response_json,actor_id FROM operations WHERE event_id=? AND operation_id=? AND kind=?').get(eventId,previewId,'CATCH');
   if(prior){if(prior.actor_id!==catcherId)throw new GameError('CATCH_SESSION_MISMATCH');if(transactionHook)transactionHook(db,{replay:true});db.exec('COMMIT');return {...JSON.parse(prior.response_json),replayed:true};}
   const p=db.prepare('SELECT * FROM catch_previews WHERE event_id=? AND preview_id=?').get(eventId,previewId);
   if(!p||p.catcher_id!==catcherId)throw new GameError('CATCH_SESSION_MISMATCH');
   if(p.expires_at<=this.core.clock())throw new GameError('CATCH_EXPIRED');
   const core=this.check(db,eventId,catcherId,p.target_id);
   if(core.core_id!==p.core_id||this.snapshot(db,eventId,catcherId,p.target_id)!==p.inventory_hash)throw new GameError('CATCH_SNAPSHOT_CHANGED');
   const transfer=db.prepare("UPDATE cores SET owner_id=?,version=version+1 WHERE event_id=? AND core_id=? AND owner_type='PIONEER' AND owner_id=? AND status='FIELD'").run(catcherId,eventId,core.core_id,p.target_id);
   if(transfer.changes!==1)throw new GameError('CATCH_TRANSFER_CONFLICT');
   const ghostUntil=this.core.clock()+300;
   db.prepare('INSERT INTO catch_ghost(event_id,actor_id,until_epoch) VALUES (?,?,?) ON CONFLICT(event_id,actor_id) DO UPDATE SET until_epoch=excluded.until_epoch').run(eventId,p.target_id,ghostUntil);
   const receipt={status:'CATCH_COMPLETE',catchId:previewId,target:p.target_id,core:{id:core.core_id,energy:core.visible_energy},ghostUntil:new Date(ghostUntil*1000).toISOString(),replayed:false};
   const hash=createHash('sha256').update(JSON.stringify({eventId,previewId,catcherId})).digest('hex');
   db.prepare("INSERT INTO operations(event_id,operation_id,actor_id,kind,payload_hash,response_json) VALUES (?,?,?,'CATCH',?,?)").run(eventId,previewId,catcherId,hash,JSON.stringify(receipt));
   db.prepare('INSERT INTO audit(event_id,operation_id,seq,core_id,from_type,from_id,to_type,to_id,energy_delta) VALUES (?,?,1,?,?,?,?,?,0)').run(eventId,previewId,core.core_id,'PIONEER',p.target_id,'PIONEER',catcherId);
   if(transactionHook)transactionHook(db,{replay:false});db.exec('COMMIT');return receipt;
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
}
