import test from 'node:test';
import assert from 'node:assert/strict';
import {createV2GameplayRuntime} from './gameplay-runtime.mjs';

function fixture(){
  let now=1000;
  const runtime=createV2GameplayRuntime(':memory:',{clock:()=>now});
  const c=runtime.core;
  c.seedEvent('E');
  c.seedActor('E','FO','FOUNDER',0);
  c.seedActor('E','F1','FOP',0);
  c.seedActor('E','P1','PIONEER',2);
  c.seedActor('E','L1','LOCAL',1);
  c.seedActor('E','U1','UNBOUND',2);
  c.seedNode('E','N1','INSTALLED');
  c.seedNode('E','N2','AVAILABLE');
  for(const [id,energy] of [['N1A',100],['N1B',200],['N1C',300]]) c.seedCore('E',{id,uid:'U'+id,energy,ownerType:'NODE',ownerId:'N1',status:'DEPLOYED'});
  c.seedCore('E',{id:'P1A',uid:'UP1A',energy:341,ownerType:'PIONEER',ownerId:'P1',status:'FIELD'});
  c.seedCore('E',{id:'P1B',uid:'UP1B',energy:222,ownerType:'PIONEER',ownerId:'P1',status:'FIELD'});
  c.seedCore('E',{id:'FC',uid:'UFC',energy:250,ownerType:'TRANSIT',ownerId:'F1',status:'IN_TRANSIT'});
  runtime.hq.seedBay('E',{id:'HQ-01',uid:'BAY1'});
  return {runtime,c,tick:s=>{now+=s}};
}

test('BLOCK05 roles: Pioneer view is server-derived and shows capacity, energy and one next action',()=>{
  const f=fixture();
  try{
    const v=f.runtime.roles.view({eventId:'E',actorId:'P1'});
    assert.equal(v.actor.role,'PIONEER');
    assert.equal(v.inventory.used,2);
    assert.equal(v.inventory.capacity,2);
    assert.equal(v.inventory.energy,563);
    assert.equal(v.nextAction.code,'SCAN_NODE');
    assert.equal(v.hq.state,'GREEN');
    assert.equal(Object.hasOwn(v,'nodes'),false);
  }finally{f.runtime.close()}
});

test('BLOCK05 roles: Local and Unbound expose Catch guidance without NODIV internals',()=>{
  const f=fixture();
  try{
    for(const actorId of ['L1','U1']){
      const v=f.runtime.roles.view({eventId:'E',actorId});
      assert.ok(['LOCAL','UNBOUND'].includes(v.actor.role));
      assert.equal(v.nextAction.code,'CATCH');
      assert.equal(Object.hasOwn(v,'nodes'),false);
      assert.equal(Object.hasOwn(v,'hq'),false);
      assert.equal(Object.hasOwn(v,'mission'),false);
      assert.deepEqual(Object.keys(v.inventory).sort(),['capacity','cores','used']);
       assert.ok(Array.isArray(v.inventory.cores));
       assert.ok(v.inventory.cores.every(c=>Object.keys(c).sort().join(',')==='energy,id,status'));
    }
  }finally{f.runtime.close()}
});

test('BLOCK05 roles: FOP EVAC controls remain hidden until EVAC is actually STARTED',()=>{
  const f=fixture();
  try{
    let v=f.runtime.roles.view({eventId:'E',actorId:'F1'});
    assert.equal(v.evacVisible,false);
    assert.equal(v.nextAction.code,'NODE_OPS');

    f.c.db.prepare("INSERT INTO evac_control(event_id,state) VALUES ('E','STARTED')").run();
    v=f.runtime.roles.view({eventId:'E',actorId:'F1'});
    assert.equal(v.evacVisible,true);
    assert.equal(v.nextAction.code,'EVAC');
  }finally{f.runtime.close()}
});

test('BLOCK05 roles: Pioneer switches to EVAC-only next action when EVAC starts',()=>{
  const f=fixture();
  try{
    f.c.db.prepare("INSERT INTO evac_control(event_id,state) VALUES ('E','STARTED')").run();
    const v=f.runtime.roles.view({eventId:'E',actorId:'P1'});
    assert.equal(v.nextAction.code,'EVAC');
  }finally{f.runtime.close()}
});

test('BLOCK05 roles: Founder receives aggregates and only backend-valid EVAC start action',()=>{
  const f=fixture();
  try{
    let v=f.runtime.roles.view({eventId:'E',actorId:'FO'});
    assert.equal(v.actor.role,'FOUNDER');
    assert.deepEqual(v.allowedActions,[]);
    assert.equal(v.nextAction.code,'MONITOR');

    f.c.db.prepare("INSERT INTO evac_control(event_id,state) VALUES ('E','PRE_EVAC_READY')").run();
    v=f.runtime.roles.view({eventId:'E',actorId:'FO'});
    assert.deepEqual(v.allowedActions,['EVAC_START']);
    assert.equal(v.nextAction.code,'EVAC_START');
  }finally{f.runtime.close()}
});

test('BLOCK05 roles: active RESTORE mission outranks normal Pioneer Node scan',()=>{
  const f=fixture();
  try{
    f.c.seedCore('E',{id:'R1',uid:'UR1',energy:450,ownerType:'TRANSIT',ownerId:'P1',status:'IN_TRANSIT'});
    f.c.seedMission('E',{id:'M1',actorId:'P1',kind:'RESTORE_1',nodeId:'N1',coreId:'R1',expiresAt:1300});
    const v=f.runtime.roles.view({eventId:'E',actorId:'P1'});
    assert.equal(v.nextAction.code,'RESTORE');
    assert.equal(v.mission.kind,'RESTORE_1');
    assert.equal(v.transit[0].status,'IN_TRANSIT');
  }finally{f.runtime.close()}
});
