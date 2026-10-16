/** Read-only, fail-closed evidence reconciliation. Never creates deployment proofs. */
export function inspectEvacDeploymentEvidence(db,eventId){
 if(!db?.prepare||!eventId)throw Error('EVAC_DB_CONTEXT_REQUIRED');
 const table=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name));
 const needed=['evac_original_nodes','evac_assignments','evac_recoveries','evac_final_uploads','evac_energy_ledger','cores','evac_deployments'];
 const missing=needed.filter(t=>!table.has(t));
 if(missing.length)return {complete:false,blockers:['EVAC_EVIDENCE_SCHEMA_MISSING'],missing};
 const assignments=db.prepare('SELECT team_id,node_id,carrier_id,core_snapshot FROM evac_assignments WHERE event_id=?').all(eventId);
 const recoveries=db.prepare('SELECT team_id,node_id,carrier_id FROM evac_recoveries WHERE event_id=?').all(eventId);
 const uploads=db.prepare('SELECT team_id,node_id,carrier_id,operation_id,core_ids_json,selected_core_id,energy FROM evac_final_uploads WHERE event_id=?').all(eventId);
 const ledger=db.prepare('SELECT operation_id,actor_id,energy FROM evac_energy_ledger WHERE event_id=?').all(eventId);
 const originals=db.prepare('SELECT node_id FROM evac_original_nodes WHERE event_id=?').all(eventId).map(x=>x.node_id);
 const blockers=[];
 if(originals.length!==10||new Set(originals).size!==10||assignments.length!==10||new Set(assignments.map(x=>x.node_id)).size!==10||assignments.some(x=>!originals.includes(x.node_id)))blockers.push('EVAC_DEPLOYMENT_MANIFEST_INVALID');
 if(recoveries.length!==10||uploads.length!==10||ledger.length!==10)blockers.push('EVAC_DEPLOYMENT_COUNTS_INVALID');
 for(const a of assignments){
  const tag=a.team_id+':'+a.node_id;
  let snapshot;
  try{snapshot=JSON.parse(a.core_snapshot);}catch{blockers.push('EVAC_DEPLOYMENT_SNAPSHOT_INVALID:'+tag);continue;}
  if(!Array.isArray(snapshot)||snapshot.length!==3||new Set(snapshot.map(c=>c.core_id)).size!==3||snapshot.some(c=>!c.core_id||!Number.isSafeInteger(c.visible_energy))) {blockers.push('EVAC_DEPLOYMENT_SNAPSHOT_INVALID:'+tag);continue;}
  if(recoveries.filter(r=>r.team_id===a.team_id&&r.node_id===a.node_id&&r.carrier_id===a.carrier_id).length!==1)blockers.push('EVAC_DEPLOYMENT_RECOVERY_MISSING:'+tag);
  const matching=uploads.filter(u=>u.team_id===a.team_id&&u.node_id===a.node_id&&u.carrier_id===a.carrier_id);
  if(matching.length!==1){blockers.push('EVAC_DEPLOYMENT_UPLOAD_MISSING:'+tag);continue;}
  const u=matching[0];let ids;
  try{ids=JSON.parse(u.core_ids_json);}catch{ids=null;}
  if(!Array.isArray(ids)||ids.length!==3||JSON.stringify([...ids].sort())!==JSON.stringify(snapshot.map(c=>c.core_id).sort())||!snapshot.some(c=>c.core_id===u.selected_core_id&&c.visible_energy===u.energy))blockers.push('EVAC_DEPLOYMENT_CORE_MISMATCH:'+tag);
  if(ledger.filter(l=>l.operation_id===u.operation_id&&l.actor_id===u.carrier_id&&l.energy===u.energy).length!==1)blockers.push('EVAC_DEPLOYMENT_LEDGER_MISMATCH:'+tag);
  const deployments=db.prepare('SELECT core_id,state,team_id,carrier_id,recovery_operation_id,upload_operation_id FROM evac_deployments WHERE event_id=? AND node_id=?').all(eventId,a.node_id);
  const recovery=recoveries.find(r=>r.team_id===a.team_id&&r.node_id===a.node_id&&r.carrier_id===a.carrier_id);
  const recoveryOp=db.prepare('SELECT operation_id FROM evac_recoveries WHERE event_id=? AND node_id=?').get(eventId,a.node_id)?.operation_id;
  if(!recovery||deployments.length!==3||snapshot.some(c=>!deployments.some(d=>d.core_id===c.core_id&&d.state==='DELIVERED'&&d.team_id===a.team_id&&d.carrier_id===a.carrier_id&&d.recovery_operation_id===recoveryOp&&d.upload_operation_id===u.operation_id)))blockers.push('EVAC_DEPLOYMENT_PROVENANCE_INVALID:'+tag);
  const secured=db.prepare("SELECT core_id,owner_type,owner_id,status FROM cores WHERE event_id=? AND core_id IN (?,?,?)").all(eventId,...snapshot.map(c=>c.core_id));
  if(secured.length!==3||secured.some(c=>c.owner_type!=='HQ'||c.owner_id!=='HQ'||c.status!=='SECURED'))blockers.push('EVAC_DEPLOYMENT_CARGO_NOT_SECURED:'+tag);
 }
 // Recovery/final receipts prove business transitions, but not independent deployment
 // provenance, NFC binding, or atomic per-core deployment state transitions.
 return {complete:blockers.length===0,blockers:[...new Set(blockers)],assignments:assignments.length,recoveries:recoveries.length,uploads:uploads.length};
}
