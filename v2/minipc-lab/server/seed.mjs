import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {ensureFounderRecovery,founderRecoveryKeyPath} from './founder-recovery.mjs';
import { createV2GameplayRuntime } from '../../server/gameplay-runtime.mjs';
import { installLabSchema, normalizeUid } from './lab-db.mjs';
import { seedEvacRealtestDatabase } from './evac-realtest-fixture.mjs';

export const DEFAULT_UIDS={
  pioneerAccess:'TESTACCESS9003',
  founderAccess:'TESTFOUNDER001',
  fopAccess:'TESTFOP001',
  localAccess:'TESTLOCAL001',
  unboundAccess:'TESTUNBOUND001',
  node:'TESTNODE001',
  node2:'TESTNODE002',
  uploadBay:'TESTUPLOAD001',
  pioneerCore:'TESTCOREP001',
  node1:'TESTCOREN001',node2:'TESTCOREN002',node3:'TESTCOREN003',
  fop1:'TESTCOREF001',fop2:'TESTCOREF002',fop3:'TESTCOREF003'
};
DEFAULT_UIDS.access=DEFAULT_UIDS.pioneerAccess;

function envUid(name,fallback){return normalizeUid(process.env[name]||fallback);}

export function seedTestDatabase(dbPath,eventId='TEST-V2',mode=process.env.NODIV_LAB_MODE||'legacy',sourceDbPath,sourceEventId){
  if(!['legacy','registration','desktop','evac'].includes(mode))throw Error('LAB_MODE_INVALID');
  if(mode==='evac') return seedEvacRealtestDatabase(dbPath,sourceDbPath,eventId,sourceEventId);
  mkdirSync(dirname(dbPath),{recursive:true});
  const runtime=createV2GameplayRuntime(dbPath);
  const core=runtime.core;
  installLabSchema(core.db);
  const exists=core.db.prepare('SELECT 1 FROM events WHERE event_id=?').get(eventId);
  if(!exists){
    if(mode==='desktop'){
      core.seedEvent(eventId,'READY');
      core.seedActor(eventId,'FOUNDER-TEST','FOUNDER',0);
      for(let i=1;i<=15;i++) core.seedNode(eventId,'NODE-'+String(i).padStart(3,'0'),'AVAILABLE');
    }else{
      core.seedEvent(eventId,mode==='registration'?'READY':'FIELD_ACTIVE');
      core.seedActor(eventId,'P9003','PIONEER',1);
      if(mode==='registration') core.seedActor(eventId,'P9004','PIONEER',1);
      core.seedActor(eventId,'FOP-TEST','FOP',0);
      core.seedActor(eventId,'FOUNDER-TEST','FOUNDER',0);
      core.seedActor(eventId,'LOCAL-TEST','LOCAL',1);
      core.seedActor(eventId,'UNBOUND-TEST','UNBOUND',2);
      if(mode==='registration'){
        for(let i=1;i<=10;i++) core.seedNode(eventId,'NODE-'+String(i).padStart(3,'0'),'AVAILABLE');
      }else{
        core.seedNode(eventId,'NODE-001','INSTALLED');
        core.seedNode(eventId,'NODE-002','AVAILABLE');
      }
    }
    if(mode==='legacy'){
    core.seedCore(eventId,{id:'NC-P-001',uid:envUid('NODIV_UID_PIONEER_CORE',DEFAULT_UIDS.pioneerCore),energy:341,ownerType:'PIONEER',ownerId:'P9003',status:'FIELD'});
    core.seedCore(eventId,{id:'NC-N-001',uid:envUid('NODIV_UID_NODE_CORE_1',DEFAULT_UIDS.node1),energy:105,ownerType:'NODE',ownerId:'NODE-001',status:'DEPLOYED'});
    core.seedCore(eventId,{id:'NC-N-002',uid:envUid('NODIV_UID_NODE_CORE_2',DEFAULT_UIDS.node2),energy:401,ownerType:'NODE',ownerId:'NODE-001',status:'DEPLOYED'});
    core.seedCore(eventId,{id:'NC-N-003',uid:envUid('NODIV_UID_NODE_CORE_3',DEFAULT_UIDS.node3),energy:353,ownerType:'NODE',ownerId:'NODE-001',status:'DEPLOYED'});
    core.seedCore(eventId,{id:'NC-F-001',uid:envUid('NODIV_UID_FOP_CORE_1',DEFAULT_UIDS.fop1),energy:210,ownerType:'TRANSIT',ownerId:'FOP-TEST',status:'IN_TRANSIT'});
    core.seedCore(eventId,{id:'NC-F-002',uid:envUid('NODIV_UID_FOP_CORE_2',DEFAULT_UIDS.fop2),energy:220,ownerType:'TRANSIT',ownerId:'FOP-TEST',status:'IN_TRANSIT'});
    core.seedCore(eventId,{id:'NC-F-003',uid:envUid('NODIV_UID_FOP_CORE_3',DEFAULT_UIDS.fop3),energy:230,ownerType:'TRANSIT',ownerId:'FOP-TEST',status:'IN_TRANSIT'});
    }
  }
  if(mode==='registration'||mode==='desktop'){
    // Never treat an ended desktop event as a fresh start. A new event requires
    // an explicit, separately backed-up rollover; preserving historical results.
    const state=core.db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId)?.state;
    const allowed=mode==='desktop'?['READY','INITIALIZED','FIELD_ACTIVE','TEST_ENDED']:['READY','INITIALIZED','FIELD_ACTIVE','COMPLETED'];
    if(!allowed.includes(state))throw Error('REGISTRATION_DATABASE_STATE_INVALID');
    if((mode==='desktop'&&['READY','INITIALIZED','FIELD_ACTIVE'].includes(state))||(mode==='registration'&&['READY','INITIALIZED'].includes(state))){
      if(!core.db.prepare('SELECT 1 FROM hq_upload_bays WHERE event_id=? AND bay_id=?').get(eventId,'HQ-01'))runtime.hq.seedBay(eventId,{id:'HQ-01',uid:'PENDING-HQ-01'});
      const founderUid=normalizeUid(process.env.NODIV_UID_FOUNDER_CARD||'');
      if(!/^[0-9A-F]{8,32}$/.test(founderUid))throw Error('REGISTRATION_FOUNDER_UID_REQUIRED');
      const existing=core.db.prepare('SELECT uid FROM lab_access_cards WHERE event_id=? AND actor_id=?').get(eventId,'FOUNDER-TEST');
      if(!existing){
        core.db.prepare('INSERT INTO lab_access_cards(event_id,uid,actor_id) VALUES (?,?,?)').run(eventId,founderUid,'FOUNDER-TEST');
      }else if(existing.uid!==founderUid){
        // A changed bootstrap UID must not silently replace the identity of an existing event.
        // Preserve all event data and require an explicit recovery procedure instead.
        throw Error('REGISTRATION_FOUNDER_UID_MISMATCH');
      }
      const recovery=ensureFounderRecovery(core.db,{eventId,actorId:'FOUNDER-TEST',keyPath:founderRecoveryKeyPath(dbPath)});
      if(!recovery.ready)console.warn('FOUNDER RECOVERY NICHT BEREIT: '+recovery.reason);
    }
    runtime.close();
    return {dbPath,eventId,created:!exists,mode};
  }
  const cards=[
    ['NODIV_UID_ACCESS_CARD',DEFAULT_UIDS.pioneerAccess,'P9003'],
    ['NODIV_UID_FOUNDER_CARD',DEFAULT_UIDS.founderAccess,'FOUNDER-TEST'],
    ['NODIV_UID_FOP_CARD',DEFAULT_UIDS.fopAccess,'FOP-TEST'],
    ['NODIV_UID_LOCAL_CARD',DEFAULT_UIDS.localAccess,'LOCAL-TEST'],
    ['NODIV_UID_UNBOUND_CARD',DEFAULT_UIDS.unboundAccess,'UNBOUND-TEST']
  ];
  for(const [name,fallback,actor] of cards) core.db.prepare('INSERT OR REPLACE INTO lab_access_cards(event_id,uid,actor_id) VALUES (?,?,?)').run(eventId,envUid(name,fallback),actor);
  core.db.prepare('INSERT OR REPLACE INTO lab_node_tags(event_id,uid,node_id) VALUES (?,?,?)').run(eventId,envUid('NODIV_UID_NODE',DEFAULT_UIDS.node),'NODE-001');
  core.db.prepare('INSERT OR REPLACE INTO lab_node_tags(event_id,uid,node_id) VALUES (?,?,?)').run(eventId,envUid('NODIV_UID_NODE_2',DEFAULT_UIDS.node2),'NODE-002');
  runtime.hq.seedBay(eventId,{id:'HQ-01',uid:envUid('NODIV_UID_UPLOAD_BAY',DEFAULT_UIDS.uploadBay)});
  runtime.close();
  return {dbPath,eventId,created:!exists};
}
