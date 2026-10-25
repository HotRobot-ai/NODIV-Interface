import {normalizeUid} from './lab-db.mjs';

const ROLES=new Set(['FOUNDER','FOP','PIONEER','LOCAL','UNBOUND']);
const DYNAMIC_ROLES=new Set(['FOP','PIONEER','LOCAL','UNBOUND']);
const CAPACITY={FOUNDER:0,FOP:0,PIONEER:1,LOCAL:1,UNBOUND:2};
const CALLSIGNS=['VECTOR','PULSE','NOVA','ECHO','ORBIT','RIFT','FLUX','AURORA','NEXUS','ION','VANTA','PHOTON','CIPHER','BEACON','DRIFT','HALO'];
function cleanName(value){const x=String(value||'').trim().replace(/\s+/g,' ');if(x.length<2||x.length>80)reject('PLAYER_NAME_INVALID');return x}
function cleanCallsign(value){const x=String(value||'').trim().toUpperCase().replace(/\s+/g,' ');if(!x)return '';if(x.length<2||x.length>24||!/^[A-Z0-9ÄÖÜ -]+$/.test(x))reject('PLAYER_CALLSIGN_INVALID');return x}
const ID=/^[A-Z0-9][A-Z0-9_-]{1,39}$/;
function reject(code){throw Error(code)}
function nextActorId(db,eventId,role){
  const prefix={FOP:'FOP-',PIONEER:'P',LOCAL:'LOCAL-',UNBOUND:'UNBOUND-'}[role];
  const width=role==='PIONEER'?4:3;
  for(let i=1;i<=9999;i++){
    const id=prefix+String(i).padStart(width,'0');
    if(!db.prepare('SELECT 1 FROM actors WHERE event_id=? AND actor_id=?').get(eventId,id))return id;
  }
  reject('REGISTRATION_ACTOR_CAPACITY_EXHAUSTED');
}
function nextCoreId(db,eventId){
  for(let i=1;i<=9999;i++){
    const id='NC-'+String(i).padStart(3,'0');
    if(!db.prepare('SELECT 1 FROM cores WHERE event_id=? AND core_id=?').get(eventId,id))return id;
  }
  reject('REGISTRATION_CORE_CAPACITY_EXHAUSTED');
}
function nextNodeId(db,eventId){
  const row=db.prepare(`
    SELECT n.node_id
    FROM nodes n
    LEFT JOIN lab_node_tags t ON t.event_id=n.event_id AND t.node_id=n.node_id
    WHERE n.event_id=? AND n.state='AVAILABLE' AND t.node_id IS NULL
    ORDER BY n.node_id
    LIMIT 1
  `).get(eventId);
  if(!row)reject('REGISTRATION_NODE_CAPACITY_EXHAUSTED');
  return row.node_id;
}
export function createFounderRegistry(db,{mode='registration'}={}){
  const desktop=mode==='desktop';
  db.exec(`
    CREATE TABLE IF NOT EXISTS lab_player_profiles(
      event_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      real_name TEXT NOT NULL,
      callsign TEXT NOT NULL COLLATE NOCASE,
      callsign_source TEXT NOT NULL DEFAULT 'CUSTOM',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(event_id,actor_id),
      UNIQUE(event_id,callsign)
    );
  `);
  const now=()=>Math.floor(Date.now()/1000);
  function uniqueCallsign(eventId,requested=''){
    const desired=cleanCallsign(requested);
    if(desired){
      if(db.prepare('SELECT 1 FROM lab_player_profiles WHERE event_id=? AND callsign=? COLLATE NOCASE').get(eventId,desired))reject('PLAYER_CALLSIGN_DUPLICATE');
      return {callsign:desired,source:'CUSTOM'};
    }
    for(const base of CALLSIGNS){
      if(!db.prepare('SELECT 1 FROM lab_player_profiles WHERE event_id=? AND callsign=? COLLATE NOCASE').get(eventId,base))return {callsign:base,source:'AUTO'};
    }
    for(let i=2;i<1000;i++)for(const base of CALLSIGNS){const candidate=base+'-'+String(i).padStart(2,'0');if(!db.prepare('SELECT 1 FROM lab_player_profiles WHERE event_id=? AND callsign=? COLLATE NOCASE').get(eventId,candidate))return {callsign:candidate,source:'AUTO'};}
    reject('PLAYER_CALLSIGN_CAPACITY_EXHAUSTED');
  }
  function createPlayer({eventId,role,realName,callsign=''}){
    if(!desktop)reject('PLAYER_MANAGEMENT_DESKTOP_ONLY');
    if(db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId)?.state!=='READY')reject('PLAYER_MANAGEMENT_PHASE_DENIED');
    const resolved=String(role||'').trim().toUpperCase();if(!DYNAMIC_ROLES.has(resolved))reject('PLAYER_ROLE_INVALID');
    const name=cleanName(realName), cs=uniqueCallsign(eventId,callsign), actorId=nextActorId(db,eventId,resolved);
    db.exec('BEGIN IMMEDIATE');
    try{
      db.prepare('INSERT INTO actors(event_id,actor_id,role,capacity) VALUES (?,?,?,?)').run(eventId,actorId,resolved,CAPACITY[resolved]);
      db.prepare('INSERT INTO balances(event_id,actor_id) VALUES (?,?)').run(eventId,actorId);
      db.prepare('INSERT INTO lab_player_profiles(event_id,actor_id,real_name,callsign,callsign_source,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(eventId,actorId,name,cs.callsign,cs.source,now(),now());
      db.exec('COMMIT');return {id:actorId,role:resolved,realName:name,callsign:cs.callsign,callsignSource:cs.source,cardAssigned:false};
    }catch(e){db.exec('ROLLBACK');throw e}
  }
  function updatePlayer({eventId,actorId,role,realName,callsign}){
    if(!desktop)reject('PLAYER_MANAGEMENT_DESKTOP_ONLY');
    if(db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId)?.state!=='READY')reject('PLAYER_MANAGEMENT_PHASE_DENIED');
    const current=db.prepare('SELECT role FROM actors WHERE event_id=? AND actor_id=? AND active=1').get(eventId,actorId);if(!current||!DYNAMIC_ROLES.has(current.role))reject('PLAYER_UNKNOWN');
    if(db.prepare('SELECT 1 FROM lab_initial_teams WHERE event_id=? AND (fop_id=? OR pioneer_a_id=? OR pioneer_b_id=?) LIMIT 1').get(eventId,actorId,actorId,actorId))reject('PLAYER_ALREADY_ASSIGNED');
    const p=db.prepare('SELECT real_name,callsign,callsign_source FROM lab_player_profiles WHERE event_id=? AND actor_id=?').get(eventId,actorId);if(!p)reject('PLAYER_PROFILE_MISSING');
    const resolved=role?String(role).trim().toUpperCase():current.role;if(!DYNAMIC_ROLES.has(resolved))reject('PLAYER_ROLE_INVALID');
    const name=realName===undefined?p.real_name:cleanName(realName);
    let cs={callsign:p.callsign,source:p.callsign_source};
    if(callsign!==undefined&&cleanCallsign(callsign)!==p.callsign){
      const wanted=cleanCallsign(callsign);
      if(!wanted)cs=uniqueCallsign(eventId,'');else{
        if(db.prepare('SELECT 1 FROM lab_player_profiles WHERE event_id=? AND callsign=? COLLATE NOCASE AND actor_id<>?').get(eventId,wanted,actorId))reject('PLAYER_CALLSIGN_DUPLICATE');
        cs={callsign:wanted,source:'CUSTOM'};
      }
    }
    db.exec('BEGIN IMMEDIATE');
    try{
      db.prepare('UPDATE actors SET role=?,capacity=? WHERE event_id=? AND actor_id=?').run(resolved,CAPACITY[resolved],eventId,actorId);
      db.prepare('UPDATE lab_player_profiles SET real_name=?,callsign=?,callsign_source=?,updated_at=? WHERE event_id=? AND actor_id=?').run(name,cs.callsign,cs.source,now(),eventId,actorId);
      db.exec('COMMIT');return {id:actorId,role:resolved,realName:name,callsign:cs.callsign,callsignSource:cs.source,cardAssigned:!!db.prepare('SELECT 1 FROM lab_access_cards WHERE event_id=? AND actor_id=?').get(eventId,actorId)};
    }catch(e){db.exec('ROLLBACK');throw e}
  }
  function register({eventId,role,uid,id,energy,actorRole}){
    const tag=normalizeUid(uid);
    if(!/^[0-9A-F]{8,32}$/.test(tag))reject('REGISTRATION_INVALID');
    const event=db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId);
    const allowedStates=desktop?['READY','INITIALIZED','FIELD_ACTIVE']:['READY'];
    if(!event||!allowedStates.includes(event.state))reject('REGISTRATION_PHASE_DENIED');
    if(!desktop&&db.prepare('SELECT 1 FROM operations WHERE event_id=? LIMIT 1').get(eventId))reject('REGISTRATION_EVENT_USED');

    const kind=String(role||'').toUpperCase();
    if(!['CARD','NODE','CORE','HQ'].includes(kind))reject('REGISTRATION_INVALID');
    if(kind==='CORE'&&(!Number.isInteger(energy)||energy<1||energy>9999))reject('REGISTRATION_ENERGY_INVALID');
    const existing=[
      db.prepare('SELECT 1 FROM lab_access_cards WHERE event_id=? AND uid=?').get(eventId,tag),
      db.prepare('SELECT 1 FROM lab_node_tags WHERE event_id=? AND uid=?').get(eventId,tag),
      db.prepare('SELECT 1 FROM cores WHERE event_id=? AND uid=?').get(eventId,tag),
      db.prepare('SELECT 1 FROM hq_upload_bays WHERE event_id=? AND uid=?').get(eventId,tag)
    ];
    if(existing.some(Boolean))reject('REGISTRATION_UID_DUPLICATE');

    let key=String(id||'').trim().toUpperCase();
    let resolvedActorRole=String(actorRole||'').trim().toUpperCase();
    if(kind==='CORE'&&!key)key=nextCoreId(db,eventId);
    if(kind==='NODE'&&!key&&desktop)key=nextNodeId(db,eventId);
    if(kind==='CARD'&&!key){
      if(!DYNAMIC_ROLES.has(resolvedActorRole))reject('REGISTRATION_ROLE_REQUIRED');
      key=nextActorId(db,eventId,resolvedActorRole);
    }
    if(!ID.test(key))reject('REGISTRATION_INVALID');
    if(kind==='CARD'&&key==='FOUNDER-TEST')reject('REGISTRATION_FOUNDER_BOOTSTRAP_PROTECTED');

    if(kind==='CARD'){
      let actor=db.prepare('SELECT role FROM actors WHERE event_id=? AND actor_id=?').get(eventId,key);
      if(!actor){
        if(!DYNAMIC_ROLES.has(resolvedActorRole))reject('REGISTRATION_ACTOR_UNKNOWN');
        db.prepare('INSERT INTO actors(event_id,actor_id,role,capacity) VALUES (?,?,?,?)').run(eventId,key,resolvedActorRole,CAPACITY[resolvedActorRole]);
        db.prepare('INSERT INTO balances(event_id,actor_id) VALUES (?,?)').run(eventId,key);
        actor={role:resolvedActorRole};
      }
      if(!ROLES.has(actor.role))reject('REGISTRATION_ACTOR_UNKNOWN');
      if(resolvedActorRole&&actor.role!==resolvedActorRole)reject('REGISTRATION_ROLE_MISMATCH');
      if(db.prepare('SELECT 1 FROM lab_access_cards WHERE event_id=? AND actor_id=?').get(eventId,key))reject('REGISTRATION_TARGET_DUPLICATE');
      db.prepare('INSERT INTO lab_access_cards(event_id,uid,actor_id) VALUES (?,?,?)').run(eventId,tag,key);
      resolvedActorRole=actor.role;
    }else if(kind==='NODE'){
      if(!db.prepare('SELECT 1 FROM nodes WHERE event_id=? AND node_id=? AND state=?').get(eventId,key,'AVAILABLE'))reject('REGISTRATION_NODE_UNAVAILABLE');
      if(db.prepare('SELECT 1 FROM lab_node_tags WHERE event_id=? AND node_id=?').get(eventId,key))reject('REGISTRATION_TARGET_DUPLICATE');
      db.prepare('INSERT INTO lab_node_tags(event_id,uid,node_id) VALUES (?,?,?)').run(eventId,tag,key);
    }else if(kind==='CORE'){
      if(db.prepare('SELECT 1 FROM cores WHERE event_id=? AND core_id=?').get(eventId,key))reject('REGISTRATION_TARGET_DUPLICATE');
      db.prepare("INSERT INTO cores(event_id,core_id,uid,visible_energy,actual_energy,owner_type,owner_id,status) VALUES (?,?,?,?,?,'HQ','HQ','RESERVE')").run(eventId,key,tag,energy,energy);
    }else{
      if(!db.prepare('SELECT 1 FROM hq_upload_bays WHERE event_id=? AND bay_id=?').get(eventId,key))reject('REGISTRATION_HQ_UNKNOWN');
      const bay=db.prepare('SELECT uid FROM hq_upload_bays WHERE event_id=? AND bay_id=?').get(eventId,key);
      if(bay.uid && !String(bay.uid).startsWith('PENDING-'))reject('REGISTRATION_TARGET_DUPLICATE');
      db.prepare('UPDATE hq_upload_bays SET uid=? WHERE event_id=? AND bay_id=?').run(tag,eventId,key);
    }
    return {kind,id:key,uid:tag,...(kind==='CORE'?{energy}:{}),...(kind==='CARD'?{actorRole:resolvedActorRole}:{})};
  }
  function list(eventId){
    const cards=db.prepare("SELECT c.actor_id id,a.role,c.uid,p.real_name realName,p.callsign FROM lab_access_cards c JOIN actors a ON a.event_id=c.event_id AND a.actor_id=c.actor_id LEFT JOIN lab_player_profiles p ON p.event_id=c.event_id AND p.actor_id=c.actor_id WHERE c.event_id=? ORDER BY CASE a.role WHEN 'FOUNDER' THEN 0 WHEN 'FOP' THEN 1 WHEN 'PIONEER' THEN 2 WHEN 'LOCAL' THEN 3 ELSE 4 END,c.actor_id").all(eventId);
    const players=db.prepare("SELECT a.actor_id id,a.role,p.real_name realName,p.callsign,p.callsign_source callsignSource,CASE WHEN c.actor_id IS NULL THEN 0 ELSE 1 END cardAssigned FROM actors a JOIN lab_player_profiles p ON p.event_id=a.event_id AND p.actor_id=a.actor_id LEFT JOIN lab_access_cards c ON c.event_id=a.event_id AND c.actor_id=a.actor_id WHERE a.event_id=? AND a.active=1 ORDER BY p.real_name,a.actor_id").all(eventId).map(x=>({...x,cardAssigned:!!x.cardAssigned}));
    const nodes=db.prepare('SELECT t.node_id id,t.uid,n.state FROM lab_node_tags t JOIN nodes n ON n.event_id=t.event_id AND n.node_id=t.node_id WHERE t.event_id=? ORDER BY t.node_id').all(eventId);
    const cores=db.prepare('SELECT core_id id,uid,visible_energy energy,status,owner_type ownerType,owner_id ownerId FROM cores WHERE event_id=? ORDER BY core_id').all(eventId);
    const hq=db.prepare("SELECT bay_id id,uid,active FROM hq_upload_bays WHERE event_id=? AND uid NOT LIKE 'PENDING-%' ORDER BY bay_id").all(eventId);
    return {cards,players,nodes,cores,hq};
  }
  function getProfile(eventId,actorId){return db.prepare('SELECT real_name realName,callsign,callsign_source callsignSource FROM lab_player_profiles WHERE event_id=? AND actor_id=?').get(eventId,actorId)||null}
  return {
    createPlayer,
    updatePlayer,
    getProfile,
    register:(data)=>{
      db.exec('BEGIN IMMEDIATE');
      try{const result=register(data);db.exec('COMMIT');return result}
      catch(e){db.exec('ROLLBACK');throw e}
    },
    list
  };
}
