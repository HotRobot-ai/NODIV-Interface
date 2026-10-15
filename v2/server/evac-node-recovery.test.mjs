import test from 'node:test';
import assert from 'node:assert/strict';
import {SqliteGameCore} from './sqlite-core.mjs';
import {createEvacTeamReservations} from './evac-team-reservations.mjs';
import {createEvacNodeRecovery} from './evac-node-recovery.mjs';
import {issueNfcGrant} from './nfc-grants.mjs';
function fixture(){
 const core=new SqliteGameCore();core.seedEvent('E');core.seedActor('E','F','FOP');
 for(const p of ['P1','P2'])core.seedActor('E',p,'PIONEER',3);
 for(const n of ['N1','N2']){core.seedNode('E',n,'INSTALLED');for(let i=0;i<3;i++)core.seedCore('E',{id:n+'C'+i,uid:n+'U'+i,energy:100+i,ownerType:'NODE',ownerId:n});}
 const team=createEvacTeamReservations(core);core.db.prepare("INSERT INTO evac_control VALUES ('E','STARTED')").run();
 team.reserve({eventId:'E',teamId:'T',fopId:'F',pioneerA:'P1',pioneerB:'P2',nodeIds:['N1','N2']});
 const recovery=createEvacNodeRecovery(core,{verifyNfcProof:({nfcProof})=>nfcProof==='SERVER_VERIFIED'});
 const grant=issueNfcGrant(core.db,{eventId:'E',actorId:'F',command:'EVAC_NODE_RECOVERY',targetType:'NODE',targetId:'N1',operationId:'OP1'});
 return {core,recovery:{recover:(args)=>recovery.recover({...args,nfcGrantId:grant.id})},grantId:grant.id};
}
const req={eventId:'E',teamId:'T',nodeId:'N1',scannedNodeId:'N1',fopId:'F',scannedCoreUids:['N1U0','N1U1','N1U2'],operationId:'OP1',nfcProof:'SERVER_VERIFIED'};
test('three cores move to protected transit and node deinstalls',()=>{const {core,recovery}=fixture();try{const r=recovery.recover(req);assert.equal(r.coreIds.length,3);assert.equal(core.db.prepare("SELECT COUNT(*) n FROM cores WHERE owner_type='TRANSIT' AND owner_id='P1' AND status='EVAC_CARGO'").get().n,3);assert.equal(core.db.prepare("SELECT state FROM nodes WHERE node_id='N1'").get().state,'DEINSTALLED');}finally{core.close();}});
test('wrong UID rolls back all ownership changes',()=>{const {core,recovery}=fixture();try{assert.throws(()=>recovery.recover({...req,scannedCoreUids:['N1U0','N1U1','BAD']}),/EVAC_CORE_SCAN_MISMATCH/);assert.equal(core.db.prepare("SELECT COUNT(*) n FROM cores WHERE owner_type='NODE' AND owner_id='N1'").get().n,3);}finally{core.close();}});
test('stale core version denies',()=>{const {core,recovery}=fixture();try{core.db.prepare("UPDATE cores SET version=version+1 WHERE core_id='N1C0'").run();assert.throws(()=>recovery.recover(req),/EVAC_CORE_SNAPSHOT_STALE/);}finally{core.close();}});
test('same operation replays, other operation denied',()=>{const {core,recovery}=fixture();try{recovery.recover(req);assert.equal(recovery.recover(req).replayed,true);assert.throws(()=>recovery.recover({...req,operationId:'OP2'}),/EVAC_RECOVERY_CONFLICT/);assert.equal(core.db.prepare('SELECT COUNT(*) n FROM evac_recoveries').get().n,1);}finally{core.close();}});
test('wrong FOP denied',()=>{const {core,recovery}=fixture();try{assert.throws(()=>recovery.recover({...req,fopId:'P1'}),/EVAC_FOP_DENIED/);}finally{core.close();}});
test('unstarted EVAC denied',()=>{const {core,recovery}=fixture();try{core.db.prepare("UPDATE evac_control SET state='PRE_EVAC_READY'").run();assert.throws(()=>recovery.recover(req),/EVAC_NOT_STARTED/);}finally{core.close();}});
test('duplicate scans denied',()=>{const {core,recovery}=fixture();try{assert.throws(()=>recovery.recover({...req,scannedCoreUids:['N1U0','N1U0','N1U2']}),/EVAC_SCAN_INVALID/);}finally{core.close();}});

test('missing server proof denies before transaction',()=>{const {core,recovery}=fixture();try{assert.throws(()=>recovery.recover({...req,nfcProof:null}),/EVAC_NFC_PROOF_DENIED/);assert.equal(core.db.prepare("SELECT COUNT(*) n FROM cores WHERE owner_type='NODE' AND owner_id='N1'").get().n,3);}finally{core.close();}});
test('recovery without trusted verifier cannot initialize',()=>{const {core}=fixture();try{assert.throws(()=>createEvacNodeRecovery(core),/EVAC_NFC_VERIFIER_REQUIRED/);}finally{core.close();}});

test('grant consumed with successful recovery',()=>{const {core,recovery,grantId}=fixture();try{recovery.recover(req);assert.ok(core.db.prepare('SELECT consumed_at FROM v2_nfc_grants WHERE id=?').get(grantId).consumed_at);}finally{core.close();}});
test('failed recovery rolls back grant consumption',()=>{const {core,recovery,grantId}=fixture();try{assert.throws(()=>recovery.recover({...req,scannedCoreUids:['BAD','N1U1','N1U2']}),/EVAC_CORE_SCAN_MISMATCH/);assert.equal(core.db.prepare('SELECT consumed_at FROM v2_nfc_grants WHERE id=?').get(grantId).consumed_at,null);}finally{core.close();}});
