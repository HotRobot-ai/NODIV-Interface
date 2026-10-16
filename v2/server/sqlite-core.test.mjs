import test from 'node:test';
import assert from 'node:assert/strict';
import {SqliteGameCore} from './sqlite-core.mjs';
function setup(){const g=new SqliteGameCore();g.seedEvent('E1');g.seedActor('E1','P1','PIONEER',1);g.seedActor('E1','F1','FOP');g.seedActor('E1','FO','FOUNDER');g.seedNode('E1','N1','INSTALLED');for(let i=1;i<=3;i++)g.seedCore('E1',{id:'N'+i,uid:'UN'+i,energy:100,ownerType:'NODE',ownerId:'N1',status:'DEPLOYED'});g.seedCore('E1',{id:'P',uid:'UP',energy:150,ownerType:'PIONEER',ownerId:'P1'});return g;}
const move=(id,fromType,fromId,toType,toId)=>({id,fromType,fromId,toType,toId,status:toType==='NODE'?'DEPLOYED':toType==='PIONEER'?'FIELD':toType==='HQ'?'RESERVE':undefined});
function qualifyRestore(g,phase,missionId,coreId,nodeId='N1'){
 const add=(id,kind,moved)=>g.db.prepare("INSERT INTO operations(event_id,operation_id,actor_id,kind,payload_hash,response_json) VALUES ('E1',?,'P1',?,?,?)").run(id,kind,id,JSON.stringify({ok:true,moved}));
 if(phase===1)add('QX-'+missionId,'EXCHANGE',['A','B']);
 else{add('QR1-'+missionId,'RESTORE_1',['A','B']);add('QX2-'+missionId,'EXCHANGE',['A','B','C','D'])}
 g.seedMission('E1',{id:missionId,actorId:'P1',kind:'RESTORE_'+phase,nodeId,coreId,expiresAt:g.clock()+1000});
}
test('exchange atomic, node stays at 3, replay once',()=>{const g=setup();const op={eventId:'E1',operationId:'x1',actorId:'P1',kind:'EXCHANGE',moves:[move('P','PIONEER','P1','NODE','N1'),move('N1','NODE','N1','PIONEER','P1')]};assert.equal(g.run(op).replayed,false);assert.equal(g.run(op).replayed,true);assert.equal(g.core('E1','P').owner_type,'NODE');assert.equal(g.db.prepare('SELECT COUNT(*) n FROM audit').get().n,2);g.close();});
test('rollback prevents partial exchange',()=>{const g=setup();assert.throws(()=>g.run({eventId:'E1',operationId:'x2',actorId:'P1',kind:'EXCHANGE',moves:[move('P','PIONEER','P1','NODE','N1')]}),/EXCHANGE_INVALID_SHAPE/);assert.equal(g.core('E1','P').owner_type,'PIONEER');assert.equal(g.db.prepare('SELECT COUNT(*) n FROM operations').get().n,0);g.close();});
test('upload ownership and energy credit atomic, replay no double credit',()=>{const g=setup();const op={eventId:'E1',operationId:'u1',actorId:'P1',kind:'HQ_UPLOAD',moves:[move('P','PIONEER','P1','HQ','HQ')],energyCredit:150};g.run(op);g.run(op);assert.equal(g.balance('E1','P1'),150);assert.equal(g.core('E1','P').owner_type,'HQ');g.close();});
test('idempotency conflict, wrong owner and role denied',()=>{const g=setup();const op={eventId:'E1',operationId:'u1',actorId:'P1',kind:'HQ_UPLOAD',moves:[move('P','PIONEER','P1','HQ','HQ')],energyCredit:150};g.run(op);assert.throws(()=>g.run({...op,energyCredit:200}),/IDEMPOTENCY_CONFLICT/);assert.throws(()=>g.run({...op,operationId:'u2'}),/OWNERSHIP_CHANGED/);assert.throws(()=>g.run({eventId:'E1',operationId:'u3',actorId:'F1',kind:'HQ_UPLOAD'}),/ROLE_DENIED/);g.close();});
test('duplicate UID and Core rejected',()=>{const g=setup();assert.throws(()=>g.seedCore('E1',{id:'OTHER',uid:'UP',energy:1,ownerType:'HQ',ownerId:'HQ'}),/UNIQUE/);assert.throws(()=>g.run({eventId:'E1',operationId:'x3',actorId:'P1',kind:'EXCHANGE',moves:[move('P','PIONEER','P1','HQ','HQ'),move('P','PIONEER','P1','HQ','HQ')]}),/DUPLICATE_CORE/);g.close();});
test('cross-event isolation',()=>{const g=setup();g.seedEvent('E2');g.seedActor('E2','P1','PIONEER',1);g.seedCore('E2',{id:'P',uid:'UP',energy:200,ownerType:'PIONEER',ownerId:'P1'});g.run({eventId:'E2',operationId:'u1',actorId:'P1',kind:'HQ_UPLOAD',moves:[move('P','PIONEER','P1','HQ','HQ')],energyCredit:200});assert.equal(g.core('E1','P').owner_type,'PIONEER');assert.equal(g.balance('E1','P1'),0);g.close();});
test('restore #1 moves displaced core and increases capacity together',()=>{const g=setup();g.seedCore('E1',{id:'H',uid:'UH',energy:400,ownerType:'TRANSIT',ownerId:'P1',status:'IN_TRANSIT'});qualifyRestore(g,1,'MR1','H');g.run({eventId:'E1',operationId:'r1',actorId:'P1',kind:'RESTORE_1',missionId:'MR1',moves:[move('H','TRANSIT','P1','NODE','N1'),move('N1','NODE','N1','PIONEER','P1')],capacityChange:1});assert.equal(g.db.prepare("SELECT capacity FROM actors WHERE event_id='E1' AND actor_id='P1'").get().capacity,2);assert.equal(g.core('E1','N1').owner_id,'P1');g.close();});

test('forged upload credit is rejected and rolled back',()=>{const g=setup();assert.throws(()=>g.run({eventId:'E1',operationId:'fraud',actorId:'P1',kind:'HQ_UPLOAD',moves:[move('P','PIONEER','P1','HQ','HQ')],energyCredit:999999}),/UPLOAD_CREDIT_MISMATCH/);assert.equal(g.balance('E1','P1'),0);assert.equal(g.core('E1','P').owner_type,'PIONEER');g.close();});
test('upload cannot transfer someone else core',()=>{const g=setup();g.seedActor('E1','P2','PIONEER',1);assert.throws(()=>g.run({eventId:'E1',operationId:'fraud2',actorId:'P2',kind:'HQ_UPLOAD',moves:[move('P','PIONEER','P1','HQ','HQ')],energyCredit:150}),/UPLOAD_INVALID_ROUTE/);g.close();});
test('exchange rejects unauthorized HQ transfer',()=>{const g=setup();assert.throws(()=>g.run({eventId:'E1',operationId:'fraud3',actorId:'P1',kind:'EXCHANGE',moves:[move('P','PIONEER','P1','HQ','HQ'),move('N1','NODE','N1','PIONEER','P1')]}),/EXCHANGE_INVALID_ROUTE/);g.close();});
test('unfinished actions fail closed',()=>{const g=setup();assert.throws(()=>g.run({eventId:'E1',operationId:'fraud4',actorId:'FO',kind:'SHUTDOWN',eventState:'COMPLETED'}),/ACTION_NOT_IMPLEMENTED/);g.close();});

test('restore #1 cannot displace a higher-energy node core',()=>{const g=setup();g.seedCore('E1',{id:'H',uid:'UH',energy:400,ownerType:'TRANSIT',ownerId:'P1',status:'IN_TRANSIT'});qualifyRestore(g,1,'MR1','H');assert.throws(()=>g.run({eventId:'E1',operationId:'bad-low',actorId:'P1',kind:'RESTORE_1',missionId:'MR1',moves:[move('H','TRANSIT','P1','NODE','N1'),move('N2','NODE','N1','PIONEER','P1')],capacityChange:1}),/RESTORE_MUST_DISPLACE_LOWEST/);assert.equal(g.core('E1','H').owner_type,'TRANSIT');g.close();});
test('restore #1 rejects unavailable node without mutating ownership',()=>{const g=setup();g.seedNode('E1','N2','AVAILABLE');g.seedCore('E1',{id:'H',uid:'UH',energy:400,ownerType:'TRANSIT',ownerId:'P1'});assert.throws(()=>g.run({eventId:'E1',operationId:'bad-node',actorId:'P1',kind:'RESTORE_1',moves:[move('H','TRANSIT','P1','NODE','N2'),move('N1','NODE','N2','PIONEER','P1')],capacityChange:1}),/NODE_NOT_INSTALLED/);assert.equal(g.core('E1','H').owner_type,'TRANSIT');g.close();});
test('restore #1 rejects a transit core assigned to another pioneer',()=>{const g=setup();g.seedActor('E1','P2','PIONEER',1);g.seedCore('E1',{id:'H',uid:'UH',energy:400,ownerType:'TRANSIT',ownerId:'P2',status:'IN_TRANSIT'});qualifyRestore(g,1,'MR1','H');assert.throws(()=>g.run({eventId:'E1',operationId:'bad-transit',actorId:'P1',kind:'RESTORE_1',missionId:'MR1',moves:[move('H','TRANSIT','P1','NODE','N1'),move('N1','NODE','N1','PIONEER','P1')],capacityChange:1}),/RESTORE_TRANSIT_NOT_ASSIGNED/);g.close();});


test('restore #2 gives the lowest node core to the Pioneer and fills the third slot atomically',()=>{
 const g=setup();g.db.prepare("UPDATE actors SET capacity=2 WHERE event_id='E1' AND actor_id='P1'").run();
 g.seedCore('E1',{id:'H',uid:'UH',energy:450,ownerType:'TRANSIT',ownerId:'P1',status:'IN_TRANSIT'});qualifyRestore(g,2,'MR2','H');
 const op={eventId:'E1',operationId:'r2',actorId:'P1',kind:'RESTORE_2',missionId:'MR2',moves:[move('H','TRANSIT','P1','NODE','N1'),move('N1','NODE','N1','PIONEER','P1')],capacityChange:1};
 assert.equal(g.run(op).replayed,false);assert.equal(g.run(op).replayed,true);
 assert.equal(g.core('E1','N1').owner_type,'PIONEER');assert.equal(g.core('E1','N1').owner_id,'P1');assert.equal(g.core('E1','H').owner_id,'N1');
 assert.equal(g.db.prepare("SELECT capacity FROM actors WHERE actor_id='P1'").get().capacity,3);g.close();
});
test('restore #2 rejects incorrect Pioneer progression without mutations',()=>{
 const g=setup();g.seedCore('E1',{id:'H',uid:'UH',energy:450,ownerType:'TRANSIT',ownerId:'P1'});
 assert.throws(()=>g.run({eventId:'E1',operationId:'r2bad',actorId:'P1',kind:'RESTORE_2',moves:[move('H','TRANSIT','P1','NODE','N1'),move('N1','NODE','N1','PIONEER','P1')],capacityChange:1}),/RESTORE_2_INVALID_SHAPE/);
 assert.equal(g.core('E1','H').owner_type,'TRANSIT');g.close();
});
test('restore #2 rejects a higher-energy displaced core',()=>{
 const g=setup();g.db.prepare("UPDATE actors SET capacity=2 WHERE actor_id='P1'").run();g.seedCore('E1',{id:'H',uid:'UH',energy:450,ownerType:'TRANSIT',ownerId:'P1',status:'IN_TRANSIT'});qualifyRestore(g,2,'MR2','H');
 assert.throws(()=>g.run({eventId:'E1',operationId:'r2wrong',actorId:'P1',kind:'RESTORE_2',missionId:'MR2',moves:[move('H','TRANSIT','P1','NODE','N1'),move('N2','NODE','N1','PIONEER','P1')],capacityChange:1}),/RESTORE_MUST_DISPLACE_LOWEST/);
 assert.equal(g.core('E1','H').owner_type,'TRANSIT');g.close();
});


test('resupply replaces lowest node core, keeps node 3/3 and completes mission atomically',()=>{
 const g=setup();g.seedCore('E1',{id:'T',uid:'UT',energy:220,ownerType:'TRANSIT',ownerId:'P1',status:'IN_TRANSIT'});
 g.clock=()=>1000;g.seedMission('E1',{id:'M1',actorId:'P1',nodeId:'N1',coreId:'T',expiresAt:2000});
 g.db.prepare("UPDATE cores SET owner_type='HQ',owner_id='HQ',status='SECURED' WHERE core_id='P'").run();
 const op={eventId:'E1',operationId:'s1',actorId:'P1',kind:'RESUPPLY',missionId:'M1',moves:[
  {...move('T','TRANSIT','P1','NODE','N1'),status:'DEPLOYED'},
  {...move('N1','NODE','N1','PIONEER','P1'),status:'FIELD'}
 ]};
 assert.equal(g.run(op).replayed,false);assert.equal(g.run(op).replayed,true);
 assert.equal(g.core('E1','T').owner_type,'NODE');assert.equal(g.core('E1','N1').owner_id,'P1');
 assert.equal(g.db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id='E1' AND owner_type='NODE' AND owner_id='N1'").get().n,3);
 assert.equal(g.db.prepare("SELECT state FROM missions WHERE mission_id='M1'").get().state,'COMPLETED');g.close();
});
test('resupply rejects missing mission without transferring core',()=>{
 const g=setup();g.seedCore('E1',{id:'T',uid:'UT',energy:220,ownerType:'TRANSIT',ownerId:'P1',status:'IN_TRANSIT'});
 assert.throws(()=>g.run({eventId:'E1',operationId:'s2',actorId:'P1',kind:'RESUPPLY',missionId:'MISSING',moves:[
  {...move('T','TRANSIT','P1','NODE','N1'),status:'DEPLOYED'},
  {...move('N1','NODE','N1','PIONEER','P1'),status:'FIELD'}
 ]}),/RESUPPLY_MISSION_DENIED/);
 assert.equal(g.core('E1','T').owner_type,'TRANSIT');g.close();
});
test('resupply rejects wrong transit core, non-lowest output and expired mission',()=>{
 const g=setup();g.seedCore('E1',{id:'T',uid:'UT',energy:220,ownerType:'TRANSIT',ownerId:'P1',status:'IN_TRANSIT'});
 g.seedCore('E1',{id:'T2',uid:'UT2',energy:230,ownerType:'TRANSIT',ownerId:'P1',status:'IN_TRANSIT'});
 g.db.prepare("UPDATE cores SET visible_energy=100 WHERE core_id='N1'").run();g.db.prepare("UPDATE cores SET visible_energy=200 WHERE core_id='N2'").run();g.db.prepare("UPDATE cores SET visible_energy=300 WHERE core_id='N3'").run();
 g.clock=()=>1000;g.seedMission('E1',{id:'M1',actorId:'P1',nodeId:'N1',coreId:'T',expiresAt:2000});
 const base={eventId:'E1',actorId:'P1',kind:'RESUPPLY',missionId:'M1'};
 assert.throws(()=>g.run({...base,operationId:'s3',moves:[{...move('T2','TRANSIT','P1','NODE','N1'),status:'DEPLOYED'},{...move('N1','NODE','N1','PIONEER','P1'),status:'FIELD'}]}),/RESUPPLY_INVALID_ROUTE/);
 assert.throws(()=>g.run({...base,operationId:'s3b',moves:[{...move('T','TRANSIT','P1','NODE','N1'),status:'DEPLOYED'},{...move('N2','NODE','N1','PIONEER','P1'),status:'FIELD'}]}),/RESUPPLY_MUST_DISPLACE_LOWEST/);
 g.clock=()=>2000;assert.throws(()=>g.run({...base,operationId:'s4',moves:[{...move('T','TRANSIT','P1','NODE','N1'),status:'DEPLOYED'},{...move('N1','NODE','N1','PIONEER','P1'),status:'FIELD'}]}),/RESUPPLY_MISSION_DENIED/);
 assert.equal(g.db.prepare("SELECT state FROM missions WHERE mission_id='M1'").get().state,'ASSIGNED');g.close();
});
test('resupply requires empty personal inventory and rolls back mission completion',()=>{
 const g=setup();g.seedCore('E1',{id:'T',uid:'UT',energy:220,ownerType:'TRANSIT',ownerId:'P1',status:'IN_TRANSIT'});
 g.clock=()=>1000;g.seedMission('E1',{id:'M1',actorId:'P1',nodeId:'N1',coreId:'T',expiresAt:2000});
 assert.throws(()=>g.run({eventId:'E1',operationId:'s5',actorId:'P1',kind:'RESUPPLY',missionId:'M1',moves:[{...move('T','TRANSIT','P1','NODE','N1'),status:'DEPLOYED'},{...move('N1','NODE','N1','PIONEER','P1'),status:'FIELD'}]}),/RESUPPLY_REQUIRES_EMPTY_INVENTORY/);
 assert.equal(g.core('E1','T').owner_type,'TRANSIT');assert.equal(g.db.prepare("SELECT state FROM missions WHERE mission_id='M1'").get().state,'ASSIGNED');g.close();
});
test('resupply cannot bypass server expiry using forged client time',()=>{
 const g=setup();g.seedCore('E1',{id:'T',uid:'UT',energy:220,ownerType:'TRANSIT',ownerId:'P1',status:'IN_TRANSIT'});
 g.seedMission('E1',{id:'M1',actorId:'P1',nodeId:'N1',coreId:'T',expiresAt:2000});g.clock=()=>2001;
 assert.throws(()=>g.run({eventId:'E1',operationId:'clock-forgery',actorId:'P1',kind:'RESUPPLY',missionId:'M1',now:1000,moves:[{...move('T','TRANSIT','P1','NODE','N1'),status:'DEPLOYED'},{...move('N1','NODE','N1','PIONEER','P1'),status:'FIELD'}]}),/RESUPPLY_MISSION_DENIED/);
 assert.equal(g.core('E1','T').owner_type,'TRANSIT');g.close();
});

test('FOP install and deinstall are three-core atomic node operations',()=>{
 const g=setup();g.seedNode('E1','N2','AVAILABLE');
 for(let i=1;i<=3;i++)g.seedCore('E1',{id:'I'+i,uid:'UI'+i,energy:200+i,ownerType:'TRANSIT',ownerId:'F1',status:'IN_TRANSIT'});
 const install={eventId:'E1',operationId:'fi',actorId:'F1',kind:'INSTALL',moves:[1,2,3].map(i=>({...move('I'+i,'TRANSIT','F1','NODE','N2'),status:'DEPLOYED'})),nodeChanges:[{id:'N2',state:'INSTALLED'}]};
 assert.equal(g.run(install).replayed,false);assert.equal(g.run(install).replayed,true);assert.equal(g.db.prepare("SELECT COUNT(*) n FROM cores WHERE owner_type='NODE' AND owner_id='N2'").get().n,3);
 const deinstall={eventId:'E1',operationId:'fd',actorId:'F1',kind:'DEINSTALL',moves:[1,2,3].map(i=>({...move('I'+i,'NODE','N2','HQ','HQ'),status:'RESERVE'})),nodeChanges:[{id:'N2',state:'DEINSTALLED'}]};
 g.run(deinstall);assert.equal(g.db.prepare("SELECT COUNT(*) n FROM cores WHERE owner_type='NODE' AND owner_id='N2'").get().n,0);assert.equal(g.db.prepare("SELECT state FROM nodes WHERE node_id='N2'").get().state,'DEINSTALLED');g.close();
});
test('FOP install rollback leaves node empty on invalid cargo',()=>{
 const g=setup();g.seedNode('E1','N2','AVAILABLE');
 g.seedCore('E1',{id:'I1',uid:'UI1',energy:201,ownerType:'TRANSIT',ownerId:'F1',status:'IN_TRANSIT'});g.seedCore('E1',{id:'I2',uid:'UI2',energy:202,ownerType:'TRANSIT',ownerId:'F1',status:'IN_TRANSIT'});g.seedCore('E1',{id:'I3',uid:'UI3',energy:203,ownerType:'TRANSIT',ownerId:'OTHER',status:'IN_TRANSIT'});
 assert.throws(()=>g.run({eventId:'E1',operationId:'fibad',actorId:'F1',kind:'INSTALL',moves:[1,2,3].map(i=>({...move('I'+i,'TRANSIT','F1','NODE','N2'),status:'DEPLOYED'})),nodeChanges:[{id:'N2',state:'INSTALLED'}]}),/INSTALL_INVALID_ROUTE|INSTALL_CARGO_INVALID|OWNERSHIP_CHANGED/);
 assert.equal(g.db.prepare("SELECT COUNT(*) n FROM cores WHERE owner_type='NODE' AND owner_id='N2'").get().n,0);assert.equal(g.db.prepare("SELECT state FROM nodes WHERE node_id='N2'").get().state,'AVAILABLE');g.close();
});
