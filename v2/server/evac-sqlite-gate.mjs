import {inspectEvacDeploymentEvidence} from './evac-deployment-evidence.mjs';
/** Conservative, read-only EVAC completion preflight. Never changes event state. */
export function checkEvacCompletionFromSqlite(db,eventId) {
 if (!db?.prepare || typeof eventId!=='string' || !eventId) throw Error('EVAC_DB_CONTEXT_REQUIRED');
 const required=['events','nodes','cores','evac_control','evac_original_nodes','evac_teams','evac_assignments','evac_recoveries','evac_final_uploads','evac_energy_ledger','evac_receipts','evac_deployments'];
 const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
 const missing=required.filter(t=>!tables.has(t));
 if(missing.length)return {eligible:false,blockers:['EVAC_AUTHORITATIVE_SCHEMA_MISSING'],missing};
 const cols=t=>new Set(db.prepare('PRAGMA table_info('+t+')').all().map(c=>c.name));
 const contract={evac_control:['event_id','state'],evac_original_nodes:['event_id','node_id'],evac_teams:['event_id','team_id','fop_id','pioneer_a','pioneer_b'],evac_assignments:['event_id','team_id','node_id','carrier_id','core_snapshot'],evac_recoveries:['event_id','team_id','node_id','carrier_id'],evac_final_uploads:['event_id','team_id','carrier_id','node_id','operation_id','core_ids_json','selected_core_id','energy'],evac_receipts:['event_id','team_id','receipt_type','operation_id'],evac_deployments:['event_id','node_id','core_id','team_id','carrier_id','state','recovery_operation_id','upload_operation_id'],evac_energy_ledger:['event_id','operation_id','actor_id','energy']};
 const missingColumns=Object.entries(contract).flatMap(([t,cs])=>cs.filter(c=>!cols(t).has(c)).map(c=>t+'.'+c));
 if(missingColumns.length)return {eligible:false,blockers:['EVAC_AUTHORITATIVE_SCHEMA_INCOMPATIBLE'],missingColumns};
 const blockers=[];
 const event=db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId);
 if(event?.state!=='FIELD_ACTIVE')blockers.push('EVAC_EVENT_NOT_FIELD_ACTIVE');
 if(db.prepare('SELECT state FROM evac_control WHERE event_id=?').get(eventId)?.state!=='STARTED')blockers.push('EVAC_NOT_STARTED');
 const originals=db.prepare('SELECT node_id FROM evac_original_nodes WHERE event_id=?').all(eventId).map(x=>x.node_id);
 const teams=db.prepare('SELECT * FROM evac_teams WHERE event_id=?').all(eventId);
 const assignments=db.prepare('SELECT * FROM evac_assignments WHERE event_id=?').all(eventId);
 const recovered=db.prepare('SELECT * FROM evac_recoveries WHERE event_id=?').all(eventId);
 const finals=db.prepare('SELECT * FROM evac_final_uploads WHERE event_id=?').all(eventId);
 const ledger=db.prepare('SELECT * FROM evac_energy_ledger WHERE event_id=?').all(eventId);
 const receipts=db.prepare('SELECT * FROM evac_receipts WHERE event_id=?').all(eventId);
 const deploymentEvidence=inspectEvacDeploymentEvidence(db,eventId);
 const members=teams.flatMap(t=>[t.fop_id,t.pioneer_a,t.pioneer_b]);
 if(originals.length!==10||new Set(originals).size!==10||teams.length!==5||members.length!==15||new Set(members).size!==15||assignments.length!==10||new Set(assignments.map(a=>a.node_id)).size!==10||assignments.some(a=>!originals.includes(a.node_id)))blockers.push('EVAC_MANIFEST_INVALID');
 const nodes=db.prepare('SELECT node_id,state FROM nodes WHERE event_id=?').all(eventId);
 if(nodes.some(n=>n.state==='INSTALLED')||originals.some(id=>nodes.find(n=>n.node_id===id)?.state!=='DEINSTALLED'))blockers.push('EVAC_NODES_NOT_WITHDRAWN');
 if(db.prepare("SELECT 1 FROM cores WHERE event_id=? AND (owner_type='NODE' OR status='EVAC_CARGO') LIMIT 1").get(eventId))blockers.push('EVAC_CARGO_REMAINS');
 for(const team of teams){
  const a=assignments.filter(x=>x.team_id===team.team_id);
  const r=recovered.filter(x=>x.team_id===team.team_id);
  const f=finals.filter(x=>x.team_id===team.team_id);
  if(a.length!==2||r.length!==2||f.length!==2||a.some(x=>!r.some(y=>y.node_id===x.node_id&&y.carrier_id===x.carrier_id))||receipts.filter(x=>x.team_id===team.team_id&&x.receipt_type==='TEAM_COMPLETE').length!==1||receipts.filter(x=>x.team_id===team.team_id&&x.receipt_type==='WITHDRAWAL').length!==1)blockers.push('EVAC_TEAM_INCOMPLETE:'+team.team_id);
  for(const x of a){
   const fin=f.find(z=>z.carrier_id===x.carrier_id&&z.node_id===x.node_id);
   const snapshot=JSON.parse(x.core_snapshot);
   if(!fin||JSON.stringify([...JSON.parse(fin.core_ids_json)].sort())!==JSON.stringify(snapshot.map(c=>c.core_id).sort())||!snapshot.some(c=>c.core_id===fin.selected_core_id&&c.visible_energy===fin.energy)||ledger.filter(l=>l.operation_id===fin.operation_id&&l.actor_id===fin.carrier_id&&l.energy===fin.energy).length!==1){blockers.push('EVAC_FINAL_INVALID:'+x.carrier_id);continue;}
   const cargo=db.prepare('SELECT core_id,owner_type,status FROM cores WHERE event_id=? AND core_id IN (?,?,?)').all(eventId,...snapshot.map(c=>c.core_id));
   if(cargo.length!==3||cargo.some(c=>c.owner_type!=='HQ'||c.status!=='SECURED'))blockers.push('EVAC_CARGO_NOT_SECURED:'+x.carrier_id);
  }
 }
 if(finals.length!==10||ledger.length!==10||recovered.length!==10)blockers.push('EVAC_RECEIPT_COUNTS_INVALID');
 if(!deploymentEvidence.complete)blockers.push(...deploymentEvidence.blockers);
 // A positive result is only a read-only eligibility assessment; caller must separately
 // enforce trusted NFC provenance and atomically persist event completion.
 return {eligible:blockers.length===0,blockers:[...new Set(blockers)]};
}
