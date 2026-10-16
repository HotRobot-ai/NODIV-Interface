import {randomUUID} from 'node:crypto';
import {installNfcGrantSchema,issueNfcGrant} from '../../server/nfc-grants.mjs';

export function createLabEvacNfc(core,{now=()=>Date.now(),ttlMs=30000}={}){
  const db=core.db;
  installNfcGrantSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS lab_evac_nfc_proofs(
    proof_id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    command TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );`);

  function issue({eventId,actorId,command,targetType,targetId,operationId}){
    const proofId='LABPROOF-'+randomUUID(),timestamp=now(),expiresAt=timestamp+ttlMs;
    db.exec('BEGIN IMMEDIATE');
    try{
      db.prepare('INSERT INTO lab_evac_nfc_proofs(proof_id,event_id,actor_id,command,target_type,target_id,operation_id,expires_at) VALUES (?,?,?,?,?,?,?,?)')
        .run(proofId,eventId,actorId,command,targetType,targetId,operationId,expiresAt);
      const grant=issueNfcGrant(db,{eventId,actorId,command,targetType,targetId,operationId,now:timestamp,ttlMs});
      db.exec('COMMIT');
      return {proofId,nfcGrantId:grant.id,expiresAt};
    }catch(error){db.exec('ROLLBACK');throw error}
  }

  function valid(proof,{eventId,actorId,command,targetType,targetId,operationId}){
    const id=proof?.id;if(typeof id!=='string'||!id)return false;
    const row=db.prepare('SELECT * FROM lab_evac_nfc_proofs WHERE proof_id=?').get(id);
    return !!row&&row.event_id===eventId&&row.actor_id===actorId&&row.command===command&&row.target_type===targetType&&row.target_id===targetId&&row.operation_id===operationId&&row.expires_at>=now();
  }

  return {
    issue,
    verifyRecovery({eventId,nodeId,fopId,operationId,nfcProof}){
      return valid(nfcProof,{eventId,actorId:fopId,command:'EVAC_NODE_RECOVERY',targetType:'NODE',targetId:nodeId,operationId});
    },
    verifyUpload({eventId,carrierId,operationId,nfcProof}){
      return valid(nfcProof,{eventId,actorId:carrierId,command:'EVAC_FINAL_UPLOAD',targetType:'HQ',targetId:'HQ',operationId});
    }
  };
}
