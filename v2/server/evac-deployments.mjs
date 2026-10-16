/** Per-core, event-scoped EVAC deployment provenance. Only called within the
 * owning recovery/upload transaction; never commits independently. */
export function installEvacDeployments(db){
 db.exec(`CREATE TABLE IF NOT EXISTS evac_deployments (
 event_id TEXT NOT NULL, node_id TEXT NOT NULL, core_id TEXT NOT NULL,
 team_id TEXT NOT NULL, carrier_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('IN_TRANSIT','DELIVERED')),
 recovery_operation_id TEXT NOT NULL, upload_operation_id TEXT,
 PRIMARY KEY(event_id,node_id,core_id), UNIQUE(event_id,core_id)
 )`);
}
export function recordEvacRecoveryDeployments(db,{eventId,nodeId,teamId,carrierId,operationId,coreIds}){
 for(const coreId of coreIds){
  db.prepare(`INSERT INTO evac_deployments(event_id,node_id,core_id,team_id,carrier_id,state,recovery_operation_id)
    VALUES (?,?,?,?,?,'IN_TRANSIT',?)`).run(eventId,nodeId,coreId,teamId,carrierId,operationId);
 }
}
export function deliverEvacDeployments(db,{eventId,nodeId,teamId,carrierId,operationId,coreIds}){
 for(const coreId of coreIds){
  const result=db.prepare(`UPDATE evac_deployments SET state='DELIVERED',upload_operation_id=?
    WHERE event_id=? AND node_id=? AND core_id=? AND team_id=? AND carrier_id=? AND state='IN_TRANSIT' AND upload_operation_id IS NULL`)
   .run(operationId,eventId,nodeId,coreId,teamId,carrierId);
  if(result.changes!==1)throw Error('EVAC_DEPLOYMENT_TRANSITION_INVALID');
 }
}
