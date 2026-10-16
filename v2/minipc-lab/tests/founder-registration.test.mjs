import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {seedTestDatabase} from '../server/seed.mjs';
import {createV2GameplayRuntime} from '../../server/gameplay-runtime.mjs';
import {createFounderRegistry} from '../server/founder-registry.mjs';

test('registration lab: READY, empty N-Cores, persisted enrollment, no duplicate UIDs',()=>{
 const dir=mkdtempSync(join(tmpdir(),'nodiv-reg-')),dbPath=join(dir,'reg.sqlite'),eventId='REG-TEST';
 try{
  seedTestDatabase(dbPath,eventId,'registration');
  let rt=createV2GameplayRuntime(dbPath),db=rt.core.db;
  assert.equal(db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId).state,'READY');
  assert.equal(db.prepare('SELECT count(*) n FROM cores').get().n,0);
  assert.equal(db.prepare('SELECT count(*) n FROM lab_access_cards').get().n,1);
  const registry=createFounderRegistry(db);
  const first=registry.register({eventId,role:'CORE',id:'NC-001',uid:'04:AA:BB:CC',energy:341});
  assert.equal(first.energy,341);
  assert.throws(()=>registry.register({eventId,role:'CORE',id:'NC-002',uid:'04AABBCC',energy:250}),/REGISTRATION_UID_DUPLICATE/);
  assert.throws(()=>registry.register({eventId,role:'CORE',id:'NC-001',uid:'04AABBCE',energy:250}),/REGISTRATION_TARGET_DUPLICATE/);
  assert.throws(()=>registry.register({eventId,role:'CORE',id:'NC-003',uid:'04AABBCF',energy:0}),/REGISTRATION_ENERGY_INVALID/);
  assert.throws(()=>registry.register({eventId,role:'CARD',id:'FOUNDER-TEST',uid:'04AABBD0'}),/REGISTRATION_FOUNDER_BOOTSTRAP_PROTECTED/);
  registry.register({eventId,role:'CARD',id:'P9003',uid:'04AABBD1'});
  registry.register({eventId,role:'NODE',id:'NODE-001',uid:'04AABBD2'});
  registry.register({eventId,role:'HQ',id:'HQ-01',uid:'04AABBD3'});
  assert.equal(db.prepare('SELECT uid FROM hq_upload_bays WHERE event_id=?').get(eventId).uid,'04AABBD3');
  rt.close();
  seedTestDatabase(dbPath,eventId,'registration');
  rt=createV2GameplayRuntime(dbPath);db=rt.core.db;
  assert.equal(db.prepare('SELECT visible_energy FROM cores WHERE core_id=?').get('NC-001').visible_energy,341);
  assert.equal(db.prepare('SELECT uid FROM hq_upload_bays WHERE event_id=?').get(eventId).uid,'04AABBD3');
  assert.equal(db.prepare('SELECT count(*) n FROM lab_access_cards').get().n,2);
  rt.close();
 }finally{rmSync(dir,{recursive:true,force:true})}
});
