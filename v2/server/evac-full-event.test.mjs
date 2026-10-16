import test from 'node:test';
import assert from 'node:assert/strict';
import {SqliteGameCore} from './sqlite-core.mjs';
import {createEvacTeamReservations} from './evac-team-reservations.mjs';
import {createEvacFlowIntegration} from './evac-flow-integration.mjs';
import {issueNfcGrant} from './nfc-grants.mjs';
import {checkEvacCompletionFromSqlite} from './evac-sqlite-gate.mjs';
import {createEvacEventCompletion} from './evac-event-completion.mjs';

test('five teams, ten nodes, thirty cores: all recovered, uploaded, credited; gate accepts completed evidence',()=>{
 const core=new SqliteGameCore();
 try {
  core.seedEvent('E');core.seedActor('E','FOUNDER','FOUNDER');core.db.prepare("UPDATE events SET state='FIELD_ACTIVE' WHERE event_id='E'").run();
  core.db.exec('CREATE TABLE IF NOT EXISTS evac_original_nodes(event_id TEXT,node_id TEXT,PRIMARY KEY(event_id,node_id))');
  const reservations=createEvacTeamReservations(core);
  core.db.prepare("INSERT INTO evac_control VALUES ('E','STARTED')").run();
  const flow=createEvacFlowIntegration(core,{verifyRecoveryNfcProof:()=>true,verifyUploadNfcProof:()=>true});
  const grant=(actor,command,targetType,targetId,op)=>issueNfcGrant(core.db,{eventId:'E',actorId:actor,command,targetType,targetId,operationId:op}).id;
  for(let t=1;t<=5;t++){
   const f='F'+t,p='P'+t+'A',q='P'+t+'B',nodes=['N'+t+'A','N'+t+'B'];
   core.seedActor('E',f,'FOP');core.seedActor('E',p,'PIONEER',3);core.seedActor('E',q,'PIONEER',3);
   for(const n of nodes){core.seedNode('E',n,'INSTALLED');core.db.prepare('INSERT INTO evac_original_nodes VALUES (?,?)').run('E',n);for(let i=0;i<3;i++)core.seedCore('E',{id:n+'C'+i,uid:n+'U'+i,energy:101+i,actualEnergy:900+i,ownerType:'NODE',ownerId:n});}
   reservations.reserve({eventId:'E',teamId:'T'+t,fopId:f,pioneerA:p,pioneerB:q,nodeIds:nodes});
   for(const n of nodes){const op='R'+n;flow.recover({eventId:'E',teamId:'T'+t,nodeId:n,fopId:f,scannedNodeId:n,scannedCoreUids:[0,1,2].map(i=>n+'U'+i),operationId:op,nfcProof:'TEST',nfcGrantId:grant(f,'EVAC_NODE_RECOVERY','NODE',n,op)});}
   for(const [j,n] of nodes.entries()){const actor=j===0?p:q,op='U'+n;flow.upload({eventId:'E',teamId:'T'+t,carrierId:actor,operationId:op,coreIds:[0,1,2].map(i=>n+'C'+i),selectedCoreId:n+'C1',nfcProof:'TEST',nfcGrantId:grant(actor,'EVAC_FINAL_UPLOAD','HQ','HQ',op)});assert.equal(core.balance('E',actor),102);}
  }
  const count=(table)=>core.db.prepare('SELECT count(*) AS n FROM '+table).get().n;
  assert.equal(count('evac_teams'),5);assert.equal(count('evac_assignments'),10);assert.equal(count('evac_recoveries'),10);assert.equal(count('evac_final_uploads'),10);assert.equal(count('evac_energy_ledger'),10);assert.equal(count('evac_receipts'),10);
  assert.equal(core.db.prepare("SELECT count(*) AS n FROM cores WHERE status='SECURED'").get().n,30);
  assert.equal(core.db.prepare("SELECT count(*) AS n FROM cores WHERE owner_type='NODE' OR status='EVAC_CARGO'").get().n,0);
  const result=checkEvacCompletionFromSqlite(core.db,'E');assert.equal(result.eligible,true,JSON.stringify(result.blockers));
  const completion=createEvacEventCompletion(core);
  const first=completion.complete({eventId:'E',founderId:'FOUNDER',operationId:'CLOSE-1'});
  assert.equal(first.completed,true);assert.equal(first.replayed,false);
  assert.equal(core.db.prepare("SELECT state FROM events WHERE event_id='E'").get().state,'COMPLETED');
  assert.equal(completion.complete({eventId:'E',founderId:'FOUNDER',operationId:'CLOSE-1'}).replayed,true);
  assert.throws(()=>completion.complete({eventId:'E',founderId:'FOUNDER',operationId:'CLOSE-2'}),/EVAC_ALREADY_COMPLETED/);
  assert.equal(core.db.prepare('SELECT count(*) n FROM evac_completion_receipts').get().n,1);
  core.db.prepare("UPDATE evac_deployments SET state='IN_TRANSIT' WHERE event_id='E' AND core_id='N1AC0'").run();
  const tampered=checkEvacCompletionFromSqlite(core.db,'E');assert.equal(tampered.eligible,false);assert.ok(tampered.blockers.some(b=>b.startsWith('EVAC_DEPLOYMENT_PROVENANCE_INVALID')));
 }finally{core.close()}
});
test('deployment provenance cannot be forged by missing table',()=>{const core=new SqliteGameCore();try{const r=checkEvacCompletionFromSqlite(core.db,'E');assert.equal(r.eligible,false);}finally{core.close()}});
