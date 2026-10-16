import {checkEvacCompletionFromSqlite} from './evac-sqlite-gate.mjs';

/** Founder-authorized, single-event, atomic completion. No deployment side effects. */
export function createEvacEventCompletion(core) {
 const db=core?.db;
 if(!db?.prepare) throw Error('EVAC_DB_REQUIRED');
 db.exec(`CREATE TABLE IF NOT EXISTS evac_completion_receipts (
   event_id TEXT PRIMARY KEY, operation_id TEXT NOT NULL, founder_id TEXT NOT NULL,
   completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   UNIQUE(event_id,operation_id)
 )`);
 return {
  complete({eventId,founderId,operationId}) {
   if(![eventId,founderId,operationId].every(x=>typeof x==='string'&&x.trim())) throw Error('EVAC_COMPLETION_CONTEXT_REQUIRED');
   db.exec('BEGIN IMMEDIATE');
   try {
    const prior=db.prepare('SELECT * FROM evac_completion_receipts WHERE event_id=?').get(eventId);
    if(prior){
     if(prior.operation_id!==operationId||prior.founder_id!==founderId)throw Error('EVAC_ALREADY_COMPLETED');
     if(db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId)?.state!=='COMPLETED')throw Error('EVAC_COMPLETION_STATE_MISMATCH');
     db.exec('COMMIT');return {completed:true,replayed:true,eventId,operationId};
    }
    const founder=db.prepare('SELECT role,active FROM actors WHERE event_id=? AND actor_id=?').get(eventId,founderId);
    if(founder?.role!=='FOUNDER'||founder.active!==1)throw Error('EVAC_FOUNDER_REQUIRED');
    const preflight=checkEvacCompletionFromSqlite(db,eventId);
    if(!preflight.eligible){const err=Error('EVAC_COMPLETION_BLOCKED');err.blockers=preflight.blockers;throw err;}
    // Prevent closing while a normal operation remains pending, regardless of type.
    const openMissions=db.prepare("SELECT count(*) AS n FROM missions WHERE event_id=? AND state='ASSIGNED'").get(eventId)?.n;
    const openReservations=db.prepare('SELECT count(*) AS n FROM reservations WHERE event_id=?').get(eventId)?.n;
    if(openMissions||openReservations)throw Error('EVAC_PENDING_OPERATIONS');
    if(db.prepare("UPDATE events SET state='COMPLETED' WHERE event_id=? AND state='FIELD_ACTIVE'").run(eventId).changes!==1)throw Error('EVAC_EVENT_STATE_CHANGED');
    db.prepare('INSERT INTO evac_completion_receipts(event_id,operation_id,founder_id) VALUES (?,?,?)').run(eventId,operationId,founderId);
    db.exec('COMMIT');return {completed:true,replayed:false,eventId,operationId};
   } catch(e){db.exec('ROLLBACK');throw e;}
  }
 };
}
