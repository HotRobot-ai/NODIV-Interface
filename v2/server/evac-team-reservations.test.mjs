import test from 'node:test';
import assert from 'node:assert/strict';
import {SqliteGameCore} from './sqlite-core.mjs';
import {createEvacTeamReservations} from './evac-team-reservations.mjs';

function fixture() {
 const core=new SqliteGameCore();
 core.seedEvent('E');
 core.seedActor('E','F1','FOP');
 core.seedActor('E','F2','FOP');
 for(const p of ['P1','P2','P3']) core.seedActor('E',p,'PIONEER',3);
 for(const n of ['N1','N2','N3']) {
  core.seedNode('E',n,'INSTALLED');
  for(let i=0;i<3;i++)core.seedCore('E',{id:n+'C'+i,uid:n+'U'+i,energy:100+i,ownerType:'NODE',ownerId:n});
 }
 const service=createEvacTeamReservations(core);
 core.db.prepare("INSERT INTO evac_control(event_id,state) VALUES ('E','STARTED')").run();
 return {core,service};
}
const req={eventId:'E',teamId:'T1',fopId:'F1',pioneerA:'P1',pioneerB:'P2',nodeIds:['N1','N2']};
test('reserves two three-core snapshots atomically',()=>{
 const {core,service}=fixture();
 try{
  const result=service.reserve(req);
  assert.equal(result.assignments.length,2);
  assert.equal(result.assignments[0].cores.length,3);
  assert.equal(core.db.prepare('SELECT COUNT(*) n FROM evac_assignments').get().n,2);
 }finally{core.close();}
});
test('duplicate member or node cannot be assigned twice',()=>{
 const {core,service}=fixture();
 try{
  service.reserve(req);
  assert.throws(()=>service.reserve({...req,teamId:'T2',fopId:'F2',pioneerA:'P3',pioneerB:'P1',nodeIds:['N2','N3']}),/EVAC_MEMBER_ALREADY_ASSIGNED/);
  assert.equal(core.db.prepare('SELECT COUNT(*) n FROM evac_teams').get().n,1);
 }finally{core.close();}
});
test('invalid node state rolls back team creation',()=>{
 const {core,service}=fixture();
 try{
  core.db.prepare("UPDATE nodes SET state='AVAILABLE' WHERE node_id='N2'").run();
  assert.throws(()=>service.reserve(req),/EVAC_NODE_UNAVAILABLE/);
  assert.equal(core.db.prepare('SELECT COUNT(*) n FROM evac_teams').get().n,0);
 }finally{core.close();}
});
test('role and active status enforced',()=>{
 const {core,service}=fixture();
 try{
  core.db.prepare("UPDATE actors SET active=0 WHERE actor_id='P2'").run();
  assert.throws(()=>service.reserve(req),/EVAC_MEMBER_DENIED/);
 }finally{core.close();}
});
test('non-field event rejected',()=>{
 const {core,service}=fixture();
 try{
  core.db.prepare("UPDATE events SET state='READY' WHERE event_id='E'").run();
  assert.throws(()=>service.reserve(req),/EVAC_EVENT_INVALID/);
 }finally{core.close();}
});

test('Founder start must be persisted before team assignment',()=>{
 const {core,service}=fixture();
 try{
  core.db.prepare("UPDATE evac_control SET state='PRE_EVAC_READY' WHERE event_id='E'").run();
  assert.throws(()=>service.reserve(req),/EVAC_NOT_STARTED/);
  assert.equal(core.db.prepare('SELECT COUNT(*) n FROM evac_teams').get().n,0);
 }finally{core.close();}
});
