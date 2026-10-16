import test from 'node:test';import assert from 'node:assert/strict';
import {SqliteGameCore} from './sqlite-core.mjs';
import {createEvacTeamReservations} from './evac-team-reservations.mjs';
import {createEvacFinalUpload} from './evac-final-upload.mjs';
import {recordEvacRecoveryDeployments} from './evac-deployments.mjs';
import {issueNfcGrant} from './nfc-grants.mjs';
function fixture(){
 const core=new SqliteGameCore();core.seedEvent('E');core.seedActor('E','F','FOP');for(const p of ['P1','P2'])core.seedActor('E',p,'PIONEER',3);
 for(const n of ['N1','N2']){core.seedNode('E',n,'INSTALLED');for(let i=0;i<3;i++)core.seedCore('E',{id:n+'C'+i,uid:n+'U'+i,energy:100+i,ownerType:'NODE',ownerId:n});}
 const team=createEvacTeamReservations(core);core.db.prepare("INSERT INTO evac_control VALUES ('E','STARTED')").run();team.reserve({eventId:'E',teamId:'T',fopId:'F',pioneerA:'P1',pioneerB:'P2',nodeIds:['N1','N2']});
 core.db.exec("CREATE TABLE evac_recoveries(event_id TEXT,node_id TEXT,carrier_id TEXT)");core.db.prepare('INSERT INTO evac_recoveries VALUES (?,?,?)').run('E','N1','P1');
 for(let i=0;i<3;i++)core.db.prepare("UPDATE cores SET owner_type='TRANSIT',owner_id='P1',status='EVAC_CARGO' WHERE core_id=?").run('N1C'+i);
 core.db.prepare("UPDATE nodes SET state='DEINSTALLED' WHERE event_id='E' AND node_id='N1'").run();
 const upload=createEvacFinalUpload(core,{verifyNfcProof:({nfcProof})=>nfcProof==='VALID'});
 recordEvacRecoveryDeployments(core.db,{eventId:'E',nodeId:'N1',teamId:'T',carrierId:'P1',operationId:'REC-N1',coreIds:['N1C0','N1C1','N1C2']});
 const grant=issueNfcGrant(core.db,{eventId:'E',actorId:'P1',command:'EVAC_FINAL_UPLOAD',targetType:'HQ',targetId:'HQ',operationId:'U'});
 const req={eventId:'E',teamId:'T',carrierId:'P1',operationId:'U',coreIds:['N1C0','N1C1','N1C2'],selectedCoreId:'N1C1',nfcProof:'VALID',nfcGrantId:grant.id};
 return {core,upload,req,grant};
}
test('3 cores to HQ, exactly one selected core credit and one ledger',()=>{const {core,upload,req}=fixture();try{const r=upload.upload(req);assert.equal(r.energy,101);assert.equal(core.balance('E','P1'),101);assert.equal(core.db.prepare("SELECT count(*) n FROM cores WHERE owner_type='HQ' AND status='SECURED'").get().n,3);assert.equal(core.db.prepare('SELECT count(*) n FROM evac_energy_ledger').get().n,1);}finally{core.close();}});
test('replay never double credits',()=>{const {core,upload,req}=fixture();try{upload.upload(req);assert.equal(upload.upload(req).replayed,true);assert.equal(core.balance('E','P1'),101);}finally{core.close();}});
test('wrong core set rejected without mutations',()=>{const {core,upload,req}=fixture();try{assert.throws(()=>upload.upload({...req,coreIds:['N1C0','N1C1','N2C0']}),/EVAC_FINAL_CORE_SET_MISMATCH/);assert.equal(core.balance('E','P1'),0);}finally{core.close();}});
test('missing proof rejected',()=>{const {core,upload,req}=fixture();try{assert.throws(()=>upload.upload({...req,nfcProof:null}),/EVAC_NFC_PROOF_DENIED/);}finally{core.close();}});
test('wrong grant rejects and rolls back',()=>{const {core,upload,req}=fixture();try{assert.throws(()=>upload.upload({...req,nfcGrantId:'INVALID'}),/NFC_GRANT_INVALID_OR_CONSUMED/);assert.equal(core.db.prepare("SELECT count(*) n FROM cores WHERE status='EVAC_CARGO'").get().n,3);}finally{core.close();}});
test('DB failure rolls back consumed grant and ownership',()=>{const {core,upload,req,grant}=fixture();try{core.db.exec("CREATE TRIGGER reject_final BEFORE INSERT ON evac_final_uploads BEGIN SELECT RAISE(ABORT,'FORCED_FAILURE'); END");assert.throws(()=>upload.upload(req),/FORCED_FAILURE/);assert.equal(core.balance('E','P1'),0);assert.equal(core.db.prepare('SELECT consumed_at FROM v2_nfc_grants WHERE id=?').get(grant.id).consumed_at,null);assert.equal(core.db.prepare("SELECT count(*) n FROM cores WHERE status='EVAC_CARGO'").get().n,3);}finally{core.close();}});
