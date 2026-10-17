import {normalizeUid} from './lab-db.mjs';

const ROLES=new Set(['FOUNDER','FOP','PIONEER','LOCAL','UNBOUND']);
const DYNAMIC_ROLES=new Set(['FOP','PIONEER','LOCAL','UNBOUND']);
const CAPACITY={FOUNDER:0,FOP:0,PIONEER:1,LOCAL:1,UNBOUND:2};
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
    const cards=db.prepare("SELECT c.actor_id id,a.role,c.uid FROM lab_access_cards c JOIN actors a ON a.event_id=c.event_id AND a.actor_id=c.actor_id WHERE c.event_id=? ORDER BY CASE a.role WHEN 'FOUNDER' THEN 0 WHEN 'FOP' THEN 1 WHEN 'PIONEER' THEN 2 WHEN 'LOCAL' THEN 3 ELSE 4 END,c.actor_id").all(eventId);
    const nodes=db.prepare('SELECT t.node_id id,t.uid,n.state FROM lab_node_tags t JOIN nodes n ON n.event_id=t.event_id AND n.node_id=t.node_id WHERE t.event_id=? ORDER BY t.node_id').all(eventId);
    const cores=db.prepare('SELECT core_id id,uid,visible_energy energy,status,owner_type ownerType,owner_id ownerId FROM cores WHERE event_id=? ORDER BY core_id').all(eventId);
    const hq=db.prepare("SELECT bay_id id,uid,active FROM hq_upload_bays WHERE event_id=? AND uid NOT LIKE 'PENDING-%' ORDER BY bay_id").all(eventId);
    return {cards,nodes,cores,hq};
  }
  return {
    register:(data)=>{
      db.exec('BEGIN IMMEDIATE');
      try{const result=register(data);db.exec('COMMIT');return result}
      catch(e){db.exec('ROLLBACK');throw e}
    },
    list
  };
}
