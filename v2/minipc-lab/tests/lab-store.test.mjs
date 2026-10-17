import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {SqliteGameCore} from '../../server/sqlite-core.mjs';import {createLabStore} from '../server/lab-db.mjs';import {seedTestDatabase,DEFAULT_UIDS} from '../server/seed.mjs';
function fixture(){const dir=mkdtempSync(join(tmpdir(),'nodiv-v2-'));const db=join(dir,'test.sqlite');seedTestDatabase(db);const core=new SqliteGameCore(db);const store=createLabStore(core);return{dir,db,core,store,close(){core.close();rmSync(dir,{recursive:true,force:true})}}}
test('one-core exchange is atomic and replay safe',()=>{const f=fixture();try{const s=f.store.startSession('TEST-V2',DEFAULT_UIDS.access);const session=f.store.session(s.token);const g=f.store.issueNodeGrant(session,DEFAULT_UIDS.node);const prep=f.store.prepareExchange(session,{grantId:g.grantId,count:1});f.store.scanExchangeCore(session,{exchangeId:prep.exchangeId,uid:DEFAULT_UIDS.pioneerCore});f.store.scanExchangeCore(session,{exchangeId:prep.exchangeId,uid:DEFAULT_UIDS.node1});const a=f.store.confirmExchange(session,{exchangeId:prep.exchangeId,accessCode:prep.accessCode});const b=f.store.confirmExchange(session,{exchangeId:prep.exchangeId,accessCode:prep.accessCode});assert.equal(a.replayed,false);assert.equal(b.replayed,true);assert.equal(f.core.db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id='TEST-V2' AND owner_type='NODE' AND owner_id='NODE-001'").get().n,3);assert.equal(f.core.db.prepare("SELECT COUNT(*) n FROM operations WHERE event_id='TEST-V2' AND kind='EXCHANGE'").get().n,1);}finally{f.close()}});
test('wrong access code and wrong UID are denied',()=>{const f=fixture();try{const s=f.store.startSession('TEST-V2',DEFAULT_UIDS.access);const session=f.store.session(s.token);assert.throws(()=>f.store.issueNodeGrant(session,'UNKNOWN'),/NODE_TAG_DENIED/);const g=f.store.issueNodeGrant(session,DEFAULT_UIDS.node);const prep=f.store.prepareExchange(session,{grantId:g.grantId,count:1});f.store.scanExchangeCore(session,{exchangeId:prep.exchangeId,uid:DEFAULT_UIDS.pioneerCore});f.store.scanExchangeCore(session,{exchangeId:prep.exchangeId,uid:DEFAULT_UIDS.node1});assert.throws(()=>f.store.confirmExchange(session,{exchangeId:prep.exchangeId,accessCode:'9999'}),/ACCESS_CODE_DENIED/);}finally{f.close()}});
test('two prepared exchanges cannot double-spend same cores',()=>{const f=fixture();try{const a=f.store.startSession('TEST-V2',DEFAULT_UIDS.access);const b=f.store.startSession('TEST-V2',DEFAULT_UIDS.access);const sa=f.store.session(a.token),sb=f.store.session(b.token);function prep(s){const g=f.store.issueNodeGrant(s,DEFAULT_UIDS.node);const p=f.store.prepareExchange(s,{grantId:g.grantId,count:1});f.store.scanExchangeCore(s,{exchangeId:p.exchangeId,uid:DEFAULT_UIDS.pioneerCore});f.store.scanExchangeCore(s,{exchangeId:p.exchangeId,uid:DEFAULT_UIDS.node1});return p}const pa=prep(sa),pb=prep(sb);f.store.confirmExchange(sa,{exchangeId:pa.exchangeId,accessCode:pa.accessCode});assert.throws(()=>f.store.confirmExchange(sb,{exchangeId:pb.exchangeId,accessCode:pb.accessCode}),/OWNERSHIP_CHANGED/);assert.equal(f.core.db.prepare("SELECT COUNT(*) n FROM operations WHERE event_id='TEST-V2' AND kind='EXCHANGE'").get().n,1);}finally{f.close()}});
test('restart keeps ownership, receipt and audit',()=>{const dir=mkdtempSync(join(tmpdir(),'nodiv-v2-restart-'));const db=join(dir,'test.sqlite');try{seedTestDatabase(db);let core=new SqliteGameCore(db),store=createLabStore(core);const s=store.startSession('TEST-V2',DEFAULT_UIDS.access),session=store.session(s.token),g=store.issueNodeGrant(session,DEFAULT_UIDS.node),prep=store.prepareExchange(session,{grantId:g.grantId,count:1});store.scanExchangeCore(session,{exchangeId:prep.exchangeId,uid:DEFAULT_UIDS.pioneerCore});store.scanExchangeCore(session,{exchangeId:prep.exchangeId,uid:DEFAULT_UIDS.node1});store.confirmExchange(session,{exchangeId:prep.exchangeId,accessCode:prep.accessCode});core.close();core=new SqliteGameCore(db);assert.equal(core.core('TEST-V2','NC-P-001').owner_type,'NODE');assert.equal(core.core('TEST-V2','NC-N-001').owner_type,'PIONEER');assert.equal(core.db.prepare("SELECT COUNT(*) n FROM operations WHERE event_id='TEST-V2' AND kind='EXCHANGE'").get().n,1);assert.equal(core.db.prepare("SELECT COUNT(*) n FROM audit WHERE event_id='TEST-V2'").get().n,2);core.close();}finally{rmSync(dir,{recursive:true,force:true})}});
test('all five roles authenticate, while Exchange remains Pioneer-only',()=>{const f=fixture();try{
  const cases=[[DEFAULT_UIDS.pioneerAccess,'PIONEER'],[DEFAULT_UIDS.founderAccess,'FOUNDER'],[DEFAULT_UIDS.fopAccess,'FOP'],[DEFAULT_UIDS.localAccess,'LOCAL'],[DEFAULT_UIDS.unboundAccess,'UNBOUND']];
  for(const [uid,role] of cases){const login=f.store.startSession('TEST-V2',uid);assert.equal(login.role,role);}
  const fop=f.store.session(f.store.startSession('TEST-V2',DEFAULT_UIDS.fopAccess).token);
  assert.throws(()=>f.store.issueNodeGrant(fop,DEFAULT_UIDS.node),/PIONEER_REQUIRED/);
}finally{f.close()}});

test('two-core Exchange uses one atomic operation and preserves three Node cores',()=>{const f=fixture();try{
  f.core.db.prepare("UPDATE actors SET capacity=2 WHERE event_id='TEST-V2' AND actor_id='P9003'").run();
  f.core.seedCore('TEST-V2',{id:'NC-P-002',uid:'TESTCOREP002',energy:222,ownerType:'PIONEER',ownerId:'P9003',status:'FIELD'});
  const session=f.store.session(f.store.startSession('TEST-V2',DEFAULT_UIDS.pioneerAccess).token);
  const grant=f.store.issueNodeGrant(session,DEFAULT_UIDS.node),prep=f.store.prepareExchange(session,{grantId:grant.grantId,count:2});
  for(const uid of [DEFAULT_UIDS.pioneerCore,'TESTCOREP002',DEFAULT_UIDS.node1,DEFAULT_UIDS.node2])f.store.scanExchangeCore(session,{exchangeId:prep.exchangeId,uid});
  const done=f.store.confirmExchange(session,{exchangeId:prep.exchangeId,accessCode:prep.accessCode});
  assert.equal(done.count,2);assert.equal(done.incomingCoreIds.length,2);assert.equal(done.outgoingCoreIds.length,2);
  assert.equal(f.core.db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id='TEST-V2' AND owner_type='NODE' AND owner_id='NODE-001'").get().n,3);
  assert.equal(f.core.db.prepare("SELECT COUNT(*) n FROM operations WHERE event_id='TEST-V2' AND kind='EXCHANGE'").get().n,1);
}finally{f.close()}});

test('exchange recovery reports persisted scan progress and rejects cross-role access',()=>{const f=fixture();try{
  const session=f.store.session(f.store.startSession('TEST-V2',DEFAULT_UIDS.pioneerAccess).token);
  const grant=f.store.issueNodeGrant(session,DEFAULT_UIDS.node),prep=f.store.prepareExchange(session,{grantId:grant.grantId,count:1});
  assert.deepEqual([f.store.exchangeStatus(session,{exchangeId:prep.exchangeId}).inCount,f.store.exchangeStatus(session,{exchangeId:prep.exchangeId}).outCount],[0,0]);
  f.store.scanExchangeCore(session,{exchangeId:prep.exchangeId,uid:DEFAULT_UIDS.pioneerCore});
  const saved=f.store.exchangeStatus(session,{exchangeId:prep.exchangeId});assert.equal(saved.state,'PREPARED');assert.equal(saved.inCount,1);assert.equal(saved.outCount,0);assert.equal(saved.ready,false);
  const fop=f.store.session(f.store.startSession('TEST-V2',DEFAULT_UIDS.fopAccess).token);
  assert.throws(()=>f.store.exchangeStatus(fop,{exchangeId:prep.exchangeId}),/PIONEER_REQUIRED/);
  f.store.scanExchangeCore(session,{exchangeId:prep.exchangeId,uid:DEFAULT_UIDS.node1});
  assert.equal(f.store.exchangeStatus(session,{exchangeId:prep.exchangeId}).ready,true);
  f.store.confirmExchange(session,{exchangeId:prep.exchangeId,accessCode:prep.accessCode});
  assert.equal(f.store.exchangeStatus(session,{exchangeId:prep.exchangeId}).state,'CONFIRMED');
}finally{f.close()}});
test('exchange recovery reports expiry without extending or committing intent',()=>{const f=fixture();try{
  const session=f.store.session(f.store.startSession('TEST-V2',DEFAULT_UIDS.pioneerAccess).token);
  const grant=f.store.issueNodeGrant(session,DEFAULT_UIDS.node),prep=f.store.prepareExchange(session,{grantId:grant.grantId,count:1});
  f.core.db.prepare('UPDATE lab_exchange_intents SET expires_at=0 WHERE exchange_id=?').run(prep.exchangeId);
  const status=f.store.exchangeStatus(session,{exchangeId:prep.exchangeId});
  assert.equal(status.state,'EXPIRED');assert.equal(status.ready,false);
  assert.throws(()=>f.store.confirmExchange(session,{exchangeId:prep.exchangeId,accessCode:prep.accessCode}),/EXCHANGE_INTENT_EXPIRED/);
  assert.equal(f.core.db.prepare("SELECT COUNT(*) n FROM operations WHERE event_id='TEST-V2' AND kind='EXCHANGE'").get().n,0);
}finally{f.close()}});
