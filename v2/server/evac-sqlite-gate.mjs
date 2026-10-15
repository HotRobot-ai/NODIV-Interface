/** Read-only EVAC gate. Fail closed until authoritative EVAC tables are migrated. */
export function checkEvacCompletionFromSqlite(db,eventId){
 if(!db||typeof db.prepare!=='function'||typeof eventId!=='string'||!eventId)throw Error('EVAC_DB_CONTEXT_REQUIRED');
 const required=['evac_start_nodes','evac_teams','evac_assignments','evac_recoveries','evac_final_uploads','evac_receipts','evac_deployments','evac_energy_ledger'];
 const found=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
 const missing=required.filter(name=>!found.has(name));
 if(missing.length)return {eligible:false,blockers:['EVAC_AUTHORITATIVE_SCHEMA_MISSING'],missing};
 return {eligible:false,blockers:['EVAC_SQLITE_SNAPSHOT_MAPPER_NOT_IMPLEMENTED'],missing:[]};
}
