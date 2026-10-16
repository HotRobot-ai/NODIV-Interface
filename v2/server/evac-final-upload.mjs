import {installEvacDeployments,deliverEvacDeployments} from './evac-deployments.mjs';
import {installNfcGrantSchema,consumeNfcGrant} from './nfc-grants.mjs';

// Dedicated EVAC route; normal HQ_UPLOAD must never accept EVAC_CARGO.
export function createEvacFinalUpload(core,{verifyNfcProof}={}) {
 if(typeof verifyNfcProof!=='function')throw Error('EVAC_NFC_VERIFIER_REQUIRED');
 const db=core?.db;if(!db?.prepare)throw Error('EVAC_CORE_REQUIRED');
 installNfcGrantSchema(db);
 installEvacDeployments(db);
 db.exec(`CREATE TABLE IF NOT EXISTS evac_final_uploads(event_id TEXT NOT NULL,carrier_id TEXT NOT NULL,team_id TEXT NOT NULL,node_id TEXT NOT NULL,operation_id TEXT NOT NULL,selected_core_id TEXT NOT NULL,energy INTEGER NOT NULL,core_ids_json TEXT NOT NULL,PRIMARY KEY(event_id,carrier_id),UNIQUE(event_id,operation_id));
 CREATE TABLE IF NOT EXISTS evac_energy_ledger(event_id TEXT NOT NULL,operation_id TEXT NOT NULL,actor_id TEXT NOT NULL,energy INTEGER NOT NULL,PRIMARY KEY(event_id,operation_id));`);
 return {upload({eventId,teamId,carrierId,operationId,coreIds,selectedCoreId,nfcProof,nfcGrantId}){
  if(![eventId,teamId,carrierId,operationId,selectedCoreId].every(v=>typeof v==='string'&&v)||!Array.isArray(coreIds)||coreIds.length!==3||new Set(coreIds).size!==3||!coreIds.includes(selectedCoreId))throw Error('EVAC_FINAL_INVALID');
  if(!nfcProof||!nfcGrantId||verifyNfcProof({eventId,teamId,carrierId,operationId,coreIds,selectedCoreId,nfcProof})!==true)throw Error('EVAC_NFC_PROOF_DENIED');
  db.exec('BEGIN IMMEDIATE');
  try {
   if(db.prepare('SELECT state FROM evac_control WHERE event_id=?').get(eventId)?.state!=='STARTED')throw Error('EVAC_NOT_STARTED');
   const a=db.prepare('SELECT * FROM evac_assignments WHERE event_id=? AND team_id=? AND carrier_id=?').get(eventId,teamId,carrierId);
   if(!a)throw Error('EVAC_CARRIER_NOT_ASSIGNED');
   const ids=JSON.stringify([...coreIds].sort());
   const prior=db.prepare('SELECT * FROM evac_final_uploads WHERE event_id=? AND carrier_id=?').get(eventId,carrierId);
   if(prior){
    if(prior.operation_id!==operationId||prior.team_id!==teamId||prior.selected_core_id!==selectedCoreId||prior.core_ids_json!==ids)throw Error('EVAC_FINAL_CONFLICT');
    db.exec('COMMIT');return {eventId,carrierId,energy:prior.energy,replayed:true};
   }
   if(!db.prepare('SELECT 1 FROM evac_recoveries WHERE event_id=? AND node_id=? AND carrier_id=?').get(eventId,a.node_id,carrierId))throw Error('EVAC_NODE_NOT_RECOVERED');
   const expected=JSON.parse(a.core_snapshot).map(c=>c.core_id).sort();
   if(ids!==JSON.stringify(expected))throw Error('EVAC_FINAL_CORE_SET_MISMATCH');
   const cargo=db.prepare("SELECT core_id,visible_energy FROM cores WHERE event_id=? AND owner_type='TRANSIT' AND owner_id=? AND status='EVAC_CARGO' ORDER BY core_id").all(eventId,carrierId);
   if(cargo.length!==3||JSON.stringify(cargo.map(c=>c.core_id))!==ids)throw Error('EVAC_CARGO_OWNERSHIP_CHANGED');
   const energy=cargo.find(c=>c.core_id===selectedCoreId)?.visible_energy;
   if(!Number.isSafeInteger(energy)||energy<=0)throw Error('EVAC_FINAL_ENERGY_INVALID');
   consumeNfcGrant(db,{id:nfcGrantId,eventId,actorId:carrierId,command:'EVAC_FINAL_UPLOAD',targetType:'HQ',targetId:'HQ',operationId});
   for(const c of cargo){
    const changed=db.prepare("UPDATE cores SET owner_type='HQ',owner_id='HQ',status='SECURED',version=version+1 WHERE event_id=? AND core_id=? AND owner_type='TRANSIT' AND owner_id=? AND status='EVAC_CARGO'").run(eventId,c.core_id,carrierId);
    if(changed.changes!==1)throw Error('EVAC_CARGO_OWNERSHIP_CHANGED');
   }
   deliverEvacDeployments(db,{eventId,nodeId:a.node_id,teamId,carrierId,operationId,coreIds:cargo.map(c=>c.core_id)});
   if(db.prepare('UPDATE balances SET secured_energy=secured_energy+? WHERE event_id=? AND actor_id=?').run(energy,eventId,carrierId).changes!==1)throw Error('EVAC_BALANCE_MISSING');
   db.prepare('INSERT INTO evac_energy_ledger(event_id,operation_id,actor_id,energy) VALUES (?,?,?,?)').run(eventId,operationId,carrierId,energy);
   db.prepare('INSERT INTO evac_final_uploads(event_id,carrier_id,team_id,node_id,operation_id,selected_core_id,energy,core_ids_json) VALUES (?,?,?,?,?,?,?,?)').run(eventId,carrierId,teamId,a.node_id,operationId,selectedCoreId,energy,ids);
   db.exec('COMMIT');return {eventId,carrierId,energy,coreIds:expected,replayed:false};
  }catch(e){db.exec('ROLLBACK');throw e;}
 }};
}
