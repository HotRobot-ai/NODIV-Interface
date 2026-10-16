/** Read verified EVAC recovery/final rows; issue exactly-once team receipts. */
export function createEvacTeamReceipts(core){
 const db=core?.db;if(!db?.prepare)throw Error('EVAC_CORE_REQUIRED');
 db.exec(`CREATE TABLE IF NOT EXISTS evac_receipts(event_id TEXT NOT NULL,team_id TEXT NOT NULL,receipt_type TEXT NOT NULL CHECK(receipt_type IN ('TEAM_COMPLETE','WITHDRAWAL')),operation_id TEXT NOT NULL,PRIMARY KEY(event_id,team_id,receipt_type),UNIQUE(event_id,operation_id));`);
 return {record({eventId,teamId,receiptType,operationId}){
  if(!eventId||!teamId||!operationId||!['TEAM_COMPLETE','WITHDRAWAL'].includes(receiptType))throw Error('EVAC_RECEIPT_INVALID');
  db.exec('BEGIN IMMEDIATE');try{
   if(db.prepare('SELECT state FROM evac_control WHERE event_id=?').get(eventId)?.state!=='STARTED')throw Error('EVAC_NOT_STARTED');
   const team=db.prepare('SELECT * FROM evac_teams WHERE event_id=? AND team_id=?').get(eventId,teamId);
   if(!team)throw Error('EVAC_TEAM_MISSING');
   const prior=db.prepare('SELECT operation_id FROM evac_receipts WHERE event_id=? AND team_id=? AND receipt_type=?').get(eventId,teamId,receiptType);
   if(prior){if(prior.operation_id!==operationId)throw Error('EVAC_RECEIPT_CONFLICT');db.exec('COMMIT');return {replayed:true};}
   const a=db.prepare('SELECT node_id,carrier_id FROM evac_assignments WHERE event_id=? AND team_id=?').all(eventId,teamId);
   if(a.length!==2||new Set(a.map(x=>x.carrier_id)).size!==2||!a.every(x=>[team.pioneer_a,team.pioneer_b].includes(x.carrier_id)))throw Error('EVAC_TEAM_ASSIGNMENTS_INCOMPLETE');
   const r=db.prepare('SELECT node_id,carrier_id FROM evac_recoveries WHERE event_id=? AND team_id=?').all(eventId,teamId);
   if(r.length!==2||a.some(x=>!r.some(y=>y.node_id===x.node_id&&y.carrier_id===x.carrier_id)))throw Error('EVAC_TEAM_RECOVERIES_INCOMPLETE');
   if(receiptType==='WITHDRAWAL'){
    if(!db.prepare("SELECT 1 FROM evac_receipts WHERE event_id=? AND team_id=? AND receipt_type='TEAM_COMPLETE'").get(eventId,teamId))throw Error('EVAC_TEAM_COMPLETE_REQUIRED');
    const f=db.prepare('SELECT node_id,carrier_id FROM evac_final_uploads WHERE event_id=? AND team_id=?').all(eventId,teamId);
    if(f.length!==2||a.some(x=>!f.some(y=>y.node_id===x.node_id&&y.carrier_id===x.carrier_id)))throw Error('EVAC_FINALS_INCOMPLETE');
   }
   db.prepare('INSERT INTO evac_receipts VALUES (?,?,?,?)').run(eventId,teamId,receiptType,operationId);
   db.exec('COMMIT');return {replayed:false};
  }catch(e){db.exec('ROLLBACK');throw e;}
 }};
}
