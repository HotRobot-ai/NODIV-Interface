import {createEvacNodeRecovery} from './evac-node-recovery.mjs';
import {createEvacFinalUpload} from './evac-final-upload.mjs';
import {createEvacTeamReceipts} from './evac-team-receipts.mjs';

/** EVAC workflow adapter. Each domain operation commits independently.
 * Receipt reconciliation is repeatable and must not disguise a committed recovery/upload.
 * This is NOT an event-completion or production NFC-verifier implementation.
 */
export function createEvacFlowIntegration(core, {verifyRecoveryNfcProof, verifyUploadNfcProof}={}) {
 const recovery=createEvacNodeRecovery(core,{verifyNfcProof:verifyRecoveryNfcProof});
 const final=createEvacFinalUpload(core,{verifyNfcProof:verifyUploadNfcProof});
 const receipts=createEvacTeamReceipts(core);
 function reconcileTeam(eventId,teamId){
  const db=core.db;
  const team=db.prepare('SELECT team_id FROM evac_teams WHERE event_id=? AND team_id=?').get(eventId,teamId);
  if(!team)throw Error('EVAC_TEAM_MISSING');
  const assignments=db.prepare('SELECT node_id,carrier_id FROM evac_assignments WHERE event_id=? AND team_id=?').all(eventId,teamId);
  if(assignments.length!==2)return {teamComplete:false,withdrawal:false};
  const recoveries=db.prepare('SELECT node_id,carrier_id FROM evac_recoveries WHERE event_id=? AND team_id=?').all(eventId,teamId);
  const matches=(rows)=>rows.length===2&&assignments.every(a=>rows.some(r=>r.node_id===a.node_id&&r.carrier_id===a.carrier_id));
  if(!matches(recoveries))return {teamComplete:false,withdrawal:false};
  receipts.record({eventId,teamId,receiptType:'TEAM_COMPLETE',operationId:`EVAC:TEAM_COMPLETE:${teamId}`});
  const uploads=db.prepare('SELECT node_id,carrier_id FROM evac_final_uploads WHERE event_id=? AND team_id=?').all(eventId,teamId);
  if(!matches(uploads))return {teamComplete:true,withdrawal:false};
  receipts.record({eventId,teamId,receiptType:'WITHDRAWAL',operationId:`EVAC:WITHDRAWAL:${teamId}`});
  return {teamComplete:true,withdrawal:true};
 }
 function withReceiptReconciliation(result,eventId,teamId){
  try{return {...result,receipts:reconcileTeam(eventId,teamId)};}
  catch(e){return {...result,receiptReconciliationPending:true,receiptError:e.message};}
 }
 return {
  recover(args){const result=recovery.recover(args);return withReceiptReconciliation(result,args.eventId,args.teamId);},
  upload(args){const result=final.upload(args);return withReceiptReconciliation(result,args.eventId,args.teamId);},
  reconcileTeam,
 };
}
