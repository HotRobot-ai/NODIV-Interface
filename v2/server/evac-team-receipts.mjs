/** Read verified EVAC recovery/final rows; issue exactly-once team receipts. */
export function createEvacTeamReceipts(core){
 const db=core?.db;if(!db?.prepare)throw Error('EVAC_CORE_REQUIRED');
 db.exec(`CREATE TABLE IF NOT EXISTS evac_receipts (
 event_id TEXT NOT NULL, team_id TEXT NOT NULL, receipt_type TEXT NOT NULL
 CHECK(receipt_type IN ('TEAM_COMPLETE','WITHDRAWAL')),
 operation_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(event_id,team_id,receipt_type), UNIQUE(event_id,operation_id)
 )`);
 return {
  record({eventId,teamId,receiptType,operationId}){
   if(!eventId||!teamId||!operationId||!['TEAM_COMPLETE','WITHDRAWAL'].includes(receiptType))throw Error('EVAC_RECEIPT_INVALID');
   db.exec('BEGIN IMMEDIATE');
   try{
    const team=db.prepare('SELECT 1 FROM evac_teams WHERE event_id=? AND team_id=?').get(eventId,teamId);
    if(!team)throw Error('EVAC_TEAM_MISSING');
    const assignments=db.prepare('SELECT node_id,carrier_id FROM evac_assignments WHERE event_id=? AND team_id=?').all(eventId,teamId);
    if(assignments.length!==2)throw Error('EVAC_ASSIGNMENTS_INCOMPLETE');
    const table=receiptType==='TEAM_COMPLETE'?'evac_recoveries':'evac_final_uploads';
    const evidence=db.prepare(`SELECT node_id,carrier_id FROM ${table} WHERE event_id=? AND team_id=?`).all(eventId,teamId);
    if(evidence.length!==2||!assignments.every(a=>evidence.some(e=>e.node_id===a.node_id&&e.carrier_id===a.carrier_id)))throw Error('EVAC_RECEIPT_EVIDENCE_INCOMPLETE');
    if(receiptType==='WITHDRAWAL'&&!db.prepare("SELECT 1 FROM evac_receipts WHERE event_id=? AND team_id=? AND receipt_type='TEAM_COMPLETE'").get(eventId,teamId))throw Error('EVAC_TEAM_RECEIPT_REQUIRED');
    const prior=db.prepare('SELECT operation_id FROM evac_receipts WHERE event_id=? AND team_id=? AND receipt_type=?').get(eventId,teamId,receiptType);
    if(prior){
     if(prior.operation_id!==operationId)throw Error('EVAC_RECEIPT_CONFLICT');
     db.exec('COMMIT');return {eventId,teamId,receiptType,replayed:true};
    }
    db.prepare('INSERT INTO evac_receipts(event_id,team_id,receipt_type,operation_id) VALUES (?,?,?,?)').run(eventId,teamId,receiptType,operationId);
    db.exec('COMMIT');return {eventId,teamId,receiptType,replayed:false};
   }catch(e){db.exec('ROLLBACK');throw e}
  }
 };
}
