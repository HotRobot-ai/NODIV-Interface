import {normalizeUid} from './lab-db.mjs';

const ROLES=new Set(['FOUNDER','FOP','PIONEER','LOCAL','UNBOUND']);
const ID=/^[A-Z0-9][A-Z0-9_-]{1,39}$/;
function reject(code){throw Error(code)}
export function createFounderRegistry(db){
  function register({eventId,role,uid,id,energy}){
    const tag=normalizeUid(uid),key=String(id||'').trim().toUpperCase();
    if(!ID.test(key)||tag.length<4||tag.length>64)reject('REGISTRATION_INVALID');
    const event=db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId);
    if(!event||!['READY','INITIALIZED'].includes(event.state))reject('REGISTRATION_PHASE_DENIED');
    if(db.prepare('SELECT 1 FROM operations WHERE event_id=? LIMIT 1').get(eventId))reject('REGISTRATION_EVENT_USED');
    const kind=String(role||'').toUpperCase();
    if(!['CARD','NODE','CORE','HQ'].includes(kind))reject('REGISTRATION_INVALID');
    if(kind==='CORE'&&(!Number.isInteger(energy)||energy<1||energy>9999))reject('REGISTRATION_ENERGY_INVALID');
    if(kind==='CARD'&&key==='FOUNDER-TEST')reject('REGISTRATION_FOUNDER_BOOTSTRAP_PROTECTED');
    const existing=[
      db.prepare('SELECT 1 FROM lab_access_cards WHERE event_id=? AND uid=?').get(eventId,tag),
      db.prepare('SELECT 1 FROM lab_node_tags WHERE event_id=? AND uid=?').get(eventId,tag),
      db.prepare('SELECT 1 FROM cores WHERE event_id=? AND uid=?').get(eventId,tag),
      db.prepare('SELECT 1 FROM hq_upload_bays WHERE event_id=? AND uid=?').get(eventId,tag)
    ];
    if(existing.some(Boolean))reject('REGISTRATION_UID_DUPLICATE');
    if(kind==='CARD'){
      const actor=db.prepare('SELECT role FROM actors WHERE event_id=? AND actor_id=?').get(eventId,key);
      if(!actor||!ROLES.has(actor.role))reject('REGISTRATION_ACTOR_UNKNOWN');
      if(db.prepare('SELECT 1 FROM lab_access_cards WHERE event_id=? AND actor_id=?').get(eventId,key))reject('REGISTRATION_TARGET_DUPLICATE');
      db.prepare('INSERT INTO lab_access_cards(event_id,uid,actor_id) VALUES (?,?,?)').run(eventId,tag,key);
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
    return {kind,id:key,uid:tag,...(kind==='CORE'?{energy}:{})};
  }
  return {register:(data)=>{
    db.exec('BEGIN IMMEDIATE');
    try{const result=register(data);db.exec('COMMIT');return result}
    catch(e){db.exec('ROLLBACK');throw e}
  }};
}
