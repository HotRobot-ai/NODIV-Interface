import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,unlinkSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createV2GameplayRuntime} from '../../server/gameplay-runtime.mjs';
import {installLabSchema,tokenHash} from '../server/lab-db.mjs';
import {ensureFounderRecovery,recoverFounderAccess} from '../server/founder-recovery.mjs';

function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'nodiv-founder-recovery-'));
  const dbPath=join(dir,'game.sqlite'),envPath=join(dir,'.env'),keyPath=join(dir,'founder-recovery.key');
  const runtime=createV2GameplayRuntime(dbPath),db=runtime.core.db,eventId='DESKTOP-TEST';
  installLabSchema(db);runtime.core.seedEvent(eventId,'FIELD_ACTIVE');runtime.core.seedActor(eventId,'FOUNDER-TEST','FOUNDER',0);runtime.core.seedActor(eventId,'P0001','PIONEER',1);
  db.prepare('INSERT INTO lab_access_cards(event_id,uid,actor_id) VALUES (?,?,?)').run(eventId,'04AAAABB','FOUNDER-TEST');
  db.prepare('INSERT INTO lab_access_cards(event_id,uid,actor_id) VALUES (?,?,?)').run(eventId,'04CCCCDD','P0001');
  runtime.core.seedNode(eventId,'NODE-001','AVAILABLE');
  db.prepare('INSERT INTO lab_node_tags(event_id,uid,node_id) VALUES (?,?,?)').run(eventId,'04EEEEFF','NODE-001');
  runtime.core.seedCore(eventId,{id:'NC-001',uid:'04111122',energy:341,ownerType:'PIONEER',ownerId:'P0001',status:'FIELD'});
  runtime.hq.seedBay(eventId,{id:'HQ-01',uid:'04333344'});
  writeFileSync(envPath,'NODIV_LAB_MODE=desktop\nNODIV_UID_FOUNDER_CARD=04AAAABB\n');
  const enrolled=ensureFounderRecovery(db,{eventId,keyPath,clock:()=>100});
  return {dir,dbPath,envPath,keyPath,runtime,db,eventId,enrolled,close(){runtime.close();rmSync(dir,{recursive:true,force:true})}};
}

test('recovery replaces only Founder card, preserves live game state and revokes only Founder sessions',()=>{
  const f=fixture();
  try{
    f.db.prepare('INSERT INTO lab_sessions(token_hash,event_id,actor_id,created_at,expires_at) VALUES (?,?,?,?,?)').run(tokenHash('founder'),f.eventId,'FOUNDER-TEST',1,999);
    f.db.prepare('INSERT INTO lab_sessions(token_hash,event_id,actor_id,created_at,expires_at) VALUES (?,?,?,?,?)').run(tokenHash('pioneer'),f.eventId,'P0001',1,999);
    const beforeCore=f.runtime.core.core(f.eventId,'NC-001');
    const r=recoverFounderAccess(f.db,{eventId:f.eventId,newUid:'04BBBBCC',keyPath:f.keyPath,envPath:f.envPath,clock:()=>200});
    assert.equal(r.ok,true);assert.equal(r.sessionsRevoked,true);
    assert.equal(f.db.prepare('SELECT uid FROM lab_access_cards WHERE event_id=? AND actor_id=?').get(f.eventId,'FOUNDER-TEST').uid,'04BBBBCC');
    assert.equal(f.db.prepare('SELECT uid FROM lab_access_cards WHERE event_id=? AND actor_id=?').get(f.eventId,'P0001').uid,'04CCCCDD');
    assert.equal(f.db.prepare('SELECT state FROM events WHERE event_id=?').get(f.eventId).state,'FIELD_ACTIVE');
    assert.deepEqual(f.runtime.core.core(f.eventId,'NC-001'),beforeCore);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM lab_sessions WHERE event_id=? AND actor_id=?').get(f.eventId,'FOUNDER-TEST').n,0);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM lab_sessions WHERE event_id=? AND actor_id=?').get(f.eventId,'P0001').n,1);
    assert.match(readFileSync(f.envPath,'utf8'),/NODIV_UID_FOUNDER_CARD=04BBBBCC/);
    assert.ok(existsSync(f.envPath+'.before-founder-recovery'));
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM lab_founder_recovery_audit WHERE event_id=?').get(f.eventId).n,1);
  }finally{f.close()}
});

test('duplicate hardware UID and config mismatch are write-free',()=>{
  for(const kind of ['card','node','core','hq','config']){
    const f=fixture();
    try{
      const before=f.db.prepare('SELECT uid FROM lab_access_cards WHERE event_id=? AND actor_id=?').get(f.eventId,'FOUNDER-TEST').uid;
      if(kind==='config')writeFileSync(f.envPath,'NODIV_LAB_MODE=desktop\nNODIV_UID_FOUNDER_CARD=04DEAD00\n');
      const uid={card:'04CCCCDD',node:'04EEEEFF',core:'04111122',hq:'04333344',config:'04BBBBCC'}[kind];
      assert.throws(()=>recoverFounderAccess(f.db,{eventId:f.eventId,newUid:uid,keyPath:f.keyPath,envPath:f.envPath}),/DUPLICATE|CONFIG_MISMATCH/);
      assert.equal(f.db.prepare('SELECT uid FROM lab_access_cards WHERE event_id=? AND actor_id=?').get(f.eventId,'FOUNDER-TEST').uid,before);
      assert.equal(f.db.prepare('SELECT COUNT(*) n FROM lab_founder_recovery_audit').get().n,0);
    }finally{f.close()}
  }
});

test('missing or tampered recovery key never creates a replacement authority',()=>{
  for(const kind of ['missing','tampered']){
    const f=fixture();
    try{
      if(kind==='missing')unlinkSync(f.keyPath); else writeFileSync(f.keyPath,'wrong-key');
      const status=ensureFounderRecovery(f.db,{eventId:f.eventId,keyPath:f.keyPath});
      assert.equal(status.ready,false);
      assert.equal(status.reason,kind==='missing'?'FOUNDER_RECOVERY_KEY_MISSING':'FOUNDER_RECOVERY_KEY_INVALID');
      if(kind==='missing')assert.equal(existsSync(f.keyPath),false);
      assert.throws(()=>recoverFounderAccess(f.db,{eventId:f.eventId,newUid:'04BBBBCC',keyPath:f.keyPath,envPath:f.envPath}),/KEY_MISSING|KEY_INVALID/);
    }finally{f.close()}
  }
});

test('recovery enrollment is stable and never rotates silently',()=>{
  const f=fixture();
  try{
    assert.equal(f.enrolled.created,true);
    const key=readFileSync(f.keyPath,'utf8');
    const second=ensureFounderRecovery(f.db,{eventId:f.eventId,keyPath:f.keyPath,clock:()=>999});
    assert.equal(second.created,false);assert.equal(second.ready,true);
    assert.equal(readFileSync(f.keyPath,'utf8'),key);
    assert.equal(f.db.prepare('SELECT created_at FROM lab_founder_recovery WHERE event_id=?').get(f.eventId).created_at,100);
  }finally{f.close()}
});

test('orphaned key from another event does not block startup or claim recovery authority',()=>{
  const f=fixture();
  try{
    const original=readFileSync(f.keyPath,'utf8');
    const newEvent='DESKTOP-TEST-002';
    f.runtime.core.seedEvent(newEvent,'READY');
    f.runtime.core.seedActor(newEvent,'FOUNDER-TEST','FOUNDER',0);
    f.db.prepare('INSERT INTO lab_access_cards(event_id,uid,actor_id) VALUES (?,?,?)').run(newEvent,'04AAAABB','FOUNDER-TEST');
    const result=ensureFounderRecovery(f.db,{eventId:newEvent,keyPath:f.keyPath});
    assert.deepEqual(result,{ready:false,created:false,reason:'FOUNDER_RECOVERY_UNCLAIMED_KEY_PRESENT'});
    assert.equal(readFileSync(f.keyPath,'utf8'),original);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM lab_founder_recovery WHERE event_id=?').get(newEvent).n,0);
    assert.equal(ensureFounderRecovery(f.db,{eventId:f.eventId,keyPath:f.keyPath}).ready,true);
  }finally{f.close()}
});
