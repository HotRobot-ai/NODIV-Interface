import test from 'node:test';
import assert from 'node:assert/strict';
import {SqliteGameCore} from './sqlite-core.mjs';
import {createEvacTeamReservations} from './evac-team-reservations.mjs';
import {createEvacFlowIntegration} from './evac-flow-integration.mjs';
import {issueNfcGrant} from './nfc-grants.mjs';
function setup(){
 const core=new SqliteGameCore();core.seedEvent('E');core.seedActor('E','F','FOP');
 for(const p of ['P1','P2'])core.seedActor('E',p,'PIONEER',3);
 for(const n of ['N1','N2']){core.seedNode('E',n,'INSTALLED');for(let i=0;i<3;i++)core.seedCore('E',{id:n+'C'+i,uid:n+'U'+i,energy:101+i,actualEnergy:900+i,ownerType:'NODE',ownerId:n});}
 const teams=createEvacTeamReservations(core);core.db.prepare("INSERT INTO evac_control VALUES ('E','STARTED')").run();
 teams.reserve({eventId:'E',teamId:'T',fopId:'F',pioneerA:'P1',pioneerB:'P2',nodeIds:['N1','N2']});
 const flow=createEvacFlowIntegration(core,{verifyRecoveryNfcProof:()=>true,verifyUploadNfcProof:()=>true});
 function grant(actorId,command,targetType,targetId,operationId){return issueNfcGrant(core.db,{eventId:'E',actorId,command,targetType,targetId,operationId}).id;}
 function recover(n){const operationId='R'+n;return flow.recover({eventId:'E',teamId:'T',nodeId:n,fopId:'F',scannedNodeId:n,scannedCoreUids:[0,1,2].map(i=>n+'U'+i),operationId,nfcProof:'TEST',nfcGrantId:grant('F','EVAC_NODE_RECOVERY','NODE',n,operationId)});}
 function upload(n,p){const operationId='U'+n;return flow.upload({eventId:'E',teamId:'T',carrierId:p,operationId,coreIds:[0,1,2].map(i=>n+'C'+i),selectedCoreId:n+'C1',nfcProof:'TEST',nfcGrantId:grant(p,'EVAC_FINAL_UPLOAD','HQ','HQ',operationId)});}
 return {core,flow,recover,upload};
}
test('real recovery -> team complete -> both uploads -> withdrawal; visible credit',()=>{const x=setup();try{
 assert.equal(x.recover('N1').receipts.teamComplete,false);
 assert.equal(x.recover('N2').receipts.teamComplete,true);
 assert.equal(x.upload('N1','P1').receipts.withdrawal,false);
 assert.equal(x.upload('N2','P2').receipts.withdrawal,true);
 assert.equal(x.core.balance('E','P1'),102);assert.equal(x.core.balance('E','P2'),102);
 assert.deepEqual(x.core.db.prepare('SELECT receipt_type FROM evac_receipts ORDER BY receipt_type').all().map(r=>r.receipt_type),['TEAM_COMPLETE','WITHDRAWAL']);
 assert.equal(x.core.db.prepare("SELECT count(*) n FROM cores WHERE status='SECURED'").get().n,6);
 assert.equal(x.core.db.prepare('SELECT count(*) n FROM evac_energy_ledger').get().n,2);
}finally{x.core.close()}});
test('replays do not duplicate receipts or credits',()=>{const x=setup();try{
 x.recover('N1');x.recover('N2');x.upload('N1','P1');x.upload('N2','P2');
 assert.equal(x.flow.reconcileTeam('E','T').withdrawal,true);
 assert.equal(x.flow.reconcileTeam('E','T').withdrawal,true);
 assert.equal(x.core.db.prepare('SELECT count(*) n FROM evac_receipts').get().n,2);
 assert.equal(x.core.balance('E','P1'),102);
}finally{x.core.close()}});
test('cannot withdraw after only one final upload',()=>{const x=setup();try{
 x.recover('N1');x.recover('N2');x.upload('N1','P1');
 assert.equal(x.flow.reconcileTeam('E','T').withdrawal,false);
 assert.equal(x.core.db.prepare("SELECT count(*) n FROM evac_receipts WHERE receipt_type='WITHDRAWAL'").get().n,0);
}finally{x.core.close()}});
