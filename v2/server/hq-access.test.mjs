import test from 'node:test';
import assert from 'node:assert/strict';
import {createV2GameplayRuntime} from './gameplay-runtime.mjs';

function fixture(){
  let now=1000;
  const runtime=createV2GameplayRuntime(':memory:',{clock:()=>now});
  const c=runtime.core;
  c.seedEvent('E');
  c.seedActor('E','P1','PIONEER',2);
  c.seedActor('E','P2','PIONEER',1);
  c.seedActor('E','L1','LOCAL',1);
  c.seedCore('E',{id:'P1A',uid:'UP1A',energy:200,ownerType:'PIONEER',ownerId:'P1',status:'FIELD'});
  c.seedCore('E',{id:'P1B',uid:'UP1B',energy:300,ownerType:'PIONEER',ownerId:'P1',status:'FIELD'});
  c.seedCore('E',{id:'P2A',uid:'UP2A',energy:250,ownerType:'PIONEER',ownerId:'P2',status:'FIELD'});
  c.db.prepare("UPDATE balances SET secured_energy=500 WHERE event_id='E' AND actor_id='P1'").run();
  c.db.prepare("UPDATE balances SET secured_energy=500 WHERE event_id='E' AND actor_id='P2'").run();
  runtime.hq.seedBay('E',{id:'HQ-01',uid:'BAY1'});
  return {runtime,c,tick:s=>{now+=s}};
}

test('BLOCK05 HQ: Secure Approach debits exactly 150 E, protects Pioneer and replays safely',()=>{
  const f=fixture();
  try{
    const first=f.runtime.hq.activateSecureApproach({eventId:'E',pioneerId:'P1',requestId:'REQ-12345678'});
    assert.equal(first.cost,150);
    assert.equal(first.securedEnergy,350);
    assert.equal(first.ghostUntil,1300);
    assert.equal(f.c.balance('E','P1'),350);
    assert.equal(f.runtime.hq.terminalState({eventId:'E',pioneerId:'P1'}).state,'YELLOW');
    assert.throws(()=>f.runtime.catch.preview({eventId:'E',catcherId:'L1',targetId:'P1'}),/TARGET_PROTECTED/);

    const replay=f.runtime.hq.activateSecureApproach({eventId:'E',pioneerId:'P1',requestId:'REQ-12345678'});
    assert.equal(replay.replayed,true);
    assert.equal(f.c.balance('E','P1'),350);
    assert.equal(f.c.db.prepare("SELECT COUNT(*) n FROM operations WHERE event_id='E' AND kind='SECURE_APPROACH'").get().n,1);
  }finally{f.runtime.close()}
});

test('BLOCK05 HQ: Secure Approach reserves one bay exclusively and expiry releases it',()=>{
  const f=fixture();
  try{
    f.runtime.hq.activateSecureApproach({eventId:'E',pioneerId:'P1',requestId:'REQ-12345678'});
    assert.throws(()=>f.runtime.hq.activateSecureApproach({eventId:'E',pioneerId:'P2',requestId:'REQ-22345678'}),/UPLOAD_POINTS_BUSY/);
    f.tick(301);
    const state=f.runtime.hq.terminalState({eventId:'E',pioneerId:'P2'});
    assert.equal(state.state,'GREEN');
    const second=f.runtime.hq.activateSecureApproach({eventId:'E',pioneerId:'P2',requestId:'REQ-22345678'});
    assert.equal(second.bayId,'HQ-01');
    assert.equal(second.securedEnergy,350);
  }finally{f.runtime.close()}
});

test('BLOCK05 HQ: claim -> authorize -> upload commits on one SQLite truth and frees bay',()=>{
  const f=fixture();
  try{
    f.runtime.hq.activateSecureApproach({eventId:'E',pioneerId:'P1',requestId:'REQ-12345678'});
    const claim=f.runtime.hq.claim({eventId:'E',pioneerId:'P1',bayId:'HQ-01',operationId:'CLAIM-1'});
    assert.equal(claim.state,'CLAIMED');
    const auth=f.runtime.hq.authorize({eventId:'E',pioneerId:'P1',orderId:claim.orderId,coreIds:['P1A','P1B']});
    assert.equal(auth.energy,500);
    const done=f.runtime.hq.confirm({eventId:'E',pioneerId:'P1',orderId:claim.orderId,operationId:'UPLOAD-1'});
    assert.equal(done.energyCredit,500);
    assert.equal(done.securedEnergy,850);
    assert.equal(f.c.core('E','P1A').owner_type,'HQ');
    assert.equal(f.c.core('E','P1B').owner_type,'HQ');
    assert.equal(f.runtime.hq.terminalState({eventId:'E',pioneerId:'P1'}).state,'GREEN');
    assert.equal(f.c.db.prepare("SELECT COUNT(*) n FROM reservations WHERE event_id='E' AND kind='SECURE_APPROACH'").get().n,0);

    const claimReplay=f.runtime.hq.claim({eventId:'E',pioneerId:'P1',bayId:'HQ-01',operationId:'CLAIM-1'});
    assert.equal(claimReplay.replayed,true);
    assert.equal(claimReplay.orderId,claim.orderId);
  }finally{f.runtime.close()}
});

test('BLOCK05 HQ: another Pioneer cannot claim a yellow or red bay',()=>{
  const f=fixture();
  try{
    f.runtime.hq.activateSecureApproach({eventId:'E',pioneerId:'P1',requestId:'REQ-12345678'});
    assert.throws(()=>f.runtime.hq.claim({eventId:'E',pioneerId:'P2',bayId:'HQ-01',operationId:'CLAIM-P2'}),/UPLOAD_POINT_BUSY/);
    f.runtime.hq.claim({eventId:'E',pioneerId:'P1',bayId:'HQ-01',operationId:'CLAIM-P1'});
    assert.throws(()=>f.runtime.hq.claim({eventId:'E',pioneerId:'P2',bayId:'HQ-01',operationId:'CLAIM-P2B'}),/UPLOAD_POINT_BUSY/);
  }finally{f.runtime.close()}
});
