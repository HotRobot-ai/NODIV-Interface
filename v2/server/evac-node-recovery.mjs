import {installNfcGrantSchema, consumeNfcGrant} from './nfc-grants.mjs';
/**
 * EVAC FOP node recovery: one installed reserved node, three exact NFC-scanned
 * cores, atomic transfer to protected pioneer cargo. No partial recovery.
 */
export function createEvacNodeRecovery(core, {verifyNfcProof} = {}) {
 if(typeof verifyNfcProof !== 'function') throw Error('EVAC_NFC_VERIFIER_REQUIRED');
 const db=core?.db;
 if(!db?.prepare)throw Error('EVAC_CORE_REQUIRED');
 installNfcGrantSchema(db);
 db.exec(`CREATE TABLE IF NOT EXISTS evac_recoveries (
 event_id TEXT NOT NULL, node_id TEXT NOT NULL, team_id TEXT NOT NULL,
 carrier_id TEXT NOT NULL, fop_id TEXT NOT NULL, operation_id TEXT NOT NULL,
 PRIMARY KEY(event_id,node_id), UNIQUE(event_id,operation_id),
 FOREIGN KEY(event_id,team_id) REFERENCES evac_teams(event_id,team_id))`);
 return {
  recover({eventId,teamId,nodeId,fopId,scannedNodeId,scannedCoreUids,operationId,nfcProof,nfcGrantId}) {
   if(!eventId||!teamId||!nodeId||!fopId||!operationId||scannedNodeId!==nodeId||
      !Array.isArray(scannedCoreUids)||scannedCoreUids.length!==3||
      new Set(scannedCoreUids).size!==3)throw Error('EVAC_SCAN_INVALID');
   // The verifier is a trusted server-side adapter. Client-supplied UID strings alone
   // never authorize a recovery. A production adapter must validate scan provenance,
   // actor/session binding, node/core tags, expiration and one-time proof consumption.
   if(!nfcProof || !nfcGrantId || verifyNfcProof({eventId,teamId,nodeId,fopId,scannedNodeId,scannedCoreUids,operationId,nfcProof}) !== true)
    throw Error('EVAC_NFC_PROOF_DENIED');
   db.exec('BEGIN IMMEDIATE');
   try {
    if(db.prepare('SELECT state FROM evac_control WHERE event_id=?').get(eventId)?.state!=='STARTED')throw Error('EVAC_NOT_STARTED');
    const team=db.prepare('SELECT * FROM evac_teams WHERE event_id=? AND team_id=?').get(eventId,teamId);
    if(!team||team.fop_id!==fopId)throw Error('EVAC_FOP_DENIED');
    const assignment=db.prepare('SELECT * FROM evac_assignments WHERE event_id=? AND team_id=? AND node_id=?').get(eventId,teamId,nodeId);
    if(!assignment)throw Error('EVAC_NODE_NOT_RESERVED');
    const prior=db.prepare('SELECT * FROM evac_recoveries WHERE event_id=? AND node_id=?').get(eventId,nodeId);
    if(prior){
     if(prior.operation_id!==operationId||prior.fop_id!==fopId)throw Error('EVAC_RECOVERY_CONFLICT');
     db.exec('COMMIT');return {eventId,nodeId,carrierId:prior.carrier_id,replayed:true};
    }
    consumeNfcGrant(db,{id:nfcGrantId,eventId,actorId:fopId,command:'EVAC_NODE_RECOVERY',targetType:'NODE',targetId:nodeId,operationId});
    if(db.prepare("SELECT state FROM nodes WHERE event_id=? AND node_id=?").get(eventId,nodeId)?.state!=='INSTALLED')throw Error('EVAC_NODE_NOT_INSTALLED');
    const snapshot=JSON.parse(assignment.core_snapshot);
    const current=db.prepare("SELECT core_id,uid,version FROM cores WHERE event_id=? AND owner_type='NODE' AND owner_id=? ORDER BY core_id").all(eventId,nodeId);
    if(current.length!==3||snapshot.length!==3||current.some((c,i)=>c.core_id!==snapshot[i].core_id||c.uid!==snapshot[i].uid||c.version!==snapshot[i].version))throw Error('EVAC_CORE_SNAPSHOT_STALE');
    if(current.some(c=>!scannedCoreUids.includes(c.uid)))throw Error('EVAC_CORE_SCAN_MISMATCH');
    const carrier=db.prepare("SELECT role,active FROM actors WHERE event_id=? AND actor_id=?").get(eventId,assignment.carrier_id);
    if(carrier?.role!=='PIONEER'||carrier.active!==1)throw Error('EVAC_CARRIER_DENIED');
    if(db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id=? AND owner_type='TRANSIT' AND owner_id=?").get(eventId,assignment.carrier_id).n)throw Error('EVAC_CARRIER_TRANSIT_CONFLICT');
    if(db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id=? AND owner_type='PIONEER' AND owner_id=? AND status='EVAC_CARGO'").get(eventId,assignment.carrier_id).n)throw Error('EVAC_CARRIER_ALREADY_LOADED');
    for(const c of current) {
     const changed=db.prepare("UPDATE cores SET owner_type='TRANSIT',owner_id=?,status='EVAC_CARGO',version=version+1 WHERE event_id=? AND core_id=? AND owner_type='NODE' AND owner_id=? AND version=?").run(assignment.carrier_id,eventId,c.core_id,nodeId,c.version);
     if(changed.changes!==1)throw Error('EVAC_OWNERSHIP_CHANGED');
    }
    db.prepare("UPDATE nodes SET state='DEINSTALLED' WHERE event_id=? AND node_id=?").run(eventId,nodeId);
    db.prepare('INSERT INTO evac_recoveries(event_id,node_id,team_id,carrier_id,fop_id,operation_id) VALUES (?,?,?,?,?,?)').run(eventId,nodeId,teamId,assignment.carrier_id,fopId,operationId);
    db.exec('COMMIT');
    return {eventId,nodeId,carrierId:assignment.carrier_id,coreIds:current.map(c=>c.core_id),replayed:false};
   }catch(e){db.exec('ROLLBACK');throw e;}
  }
 };
}
