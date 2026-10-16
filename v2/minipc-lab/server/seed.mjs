import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SqliteGameCore } from '../../server/sqlite-core.mjs';
import { installLabSchema, normalizeUid } from './lab-db.mjs';

export const DEFAULT_UIDS={
  access: 'TESTACCESS9003',
  node: 'TESTNODE001',
  pioneerCore: 'TESTCOREP001',
  node1:'TESTCOREN001',node2:'TESTCOREN002',node3:'TESTCOREN003'
};

function envUid(name,fallback){return normalizeUid(process.env[name]||fallback);}

export function seedTestDatabase(dbPath,eventId='TEST-V2'){
  mkdirSync(dirname(dbPath),{recursive:true});
  const core=new SqliteGameCore(dbPath);
  installLabSchema(core.db);
  const exists=core.db.prepare('SELECT 1 FROM events WHERE event_id=?').get(eventId);
  if(!exists){
    core.seedEvent(eventId,'FIELD_ACTIVE');
    core.seedActor(eventId,'P9003','PIONEER',1);
    core.seedActor(eventId,'FOP-TEST','FOP',0);
    core.seedActor(eventId,'FOUNDER-TEST','FOUNDER',0);
    core.seedNode(eventId,'NODE-001','INSTALLED');
    core.seedCore(eventId,{id:'NC-P-001',uid:envUid('NODIV_UID_PIONEER_CORE',DEFAULT_UIDS.pioneerCore),energy:341,ownerType:'PIONEER',ownerId:'P9003',status:'FIELD'});
    core.seedCore(eventId,{id:'NC-N-001',uid:envUid('NODIV_UID_NODE_CORE_1',DEFAULT_UIDS.node1),energy:105,ownerType:'NODE',ownerId:'NODE-001',status:'DEPLOYED'});
    core.seedCore(eventId,{id:'NC-N-002',uid:envUid('NODIV_UID_NODE_CORE_2',DEFAULT_UIDS.node2),energy:401,ownerType:'NODE',ownerId:'NODE-001',status:'DEPLOYED'});
    core.seedCore(eventId,{id:'NC-N-003',uid:envUid('NODIV_UID_NODE_CORE_3',DEFAULT_UIDS.node3),energy:353,ownerType:'NODE',ownerId:'NODE-001',status:'DEPLOYED'});
  }
  core.db.prepare('INSERT OR REPLACE INTO lab_access_cards(event_id,uid,actor_id) VALUES (?,?,?)').run(eventId,envUid('NODIV_UID_ACCESS_CARD',DEFAULT_UIDS.access),'P9003');
  core.db.prepare('INSERT OR REPLACE INTO lab_node_tags(event_id,uid,node_id) VALUES (?,?,?)').run(eventId,envUid('NODIV_UID_NODE',DEFAULT_UIDS.node),'NODE-001');
  core.close();
  return {dbPath,eventId,created:!exists};
}
