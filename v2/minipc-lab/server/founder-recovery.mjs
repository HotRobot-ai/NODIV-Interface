import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,chmodSync} from 'node:fs';

export function founderRecoveryKeyPath(dbPath){
  return String(dbPath).replace(/[\\/][^\\/]+$/, '') + '/founder-recovery.key';
}
function hash(value){return createHash('sha256').update(String(value)).digest('hex')}
function validUid(value){return /^[0-9A-F]{8,32}$/.test(String(value||''))}
function safeEqualHex(a,b){
  if(!/^[0-9a-f]{64}$/i.test(String(a))||!/^[0-9a-f]{64}$/i.test(String(b)))return false;
  return timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
function normalizeKey(raw){return String(raw||'').trim()}
function replaceFounderEnv(raw,currentUid,newUid){
  const m=String(raw).match(/^NODIV_UID_FOUNDER_CARD=([0-9A-Fa-f]{8,32})\s*$/m);
  if(!m)throw Error('FOUNDER_RECOVERY_CONFIG_MISSING');
  if(m[1].toUpperCase()!==currentUid)throw Error('FOUNDER_RECOVERY_CONFIG_MISMATCH');
  return String(raw).replace(/^NODIV_UID_FOUNDER_CARD=.*$/m,'NODIV_UID_FOUNDER_CARD='+newUid);
}

export function installFounderRecoverySchema(db){
  db.exec(`
    CREATE TABLE IF NOT EXISTS lab_founder_recovery (
      event_id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      secret_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_recovered_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS lab_founder_recovery_audit (
      recovery_id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      old_uid TEXT NOT NULL,
      new_uid TEXT NOT NULL,
      recovered_at INTEGER NOT NULL
    );
  `);
}

export function ensureFounderRecovery(db,{eventId,actorId='FOUNDER-TEST',keyPath,clock=()=>Math.floor(Date.now()/1000)}){
  installFounderRecoverySchema(db);
  const actor=db.prepare('SELECT role,active FROM actors WHERE event_id=? AND actor_id=?').get(eventId,actorId);
  const card=db.prepare('SELECT uid FROM lab_access_cards WHERE event_id=? AND actor_id=?').get(eventId,actorId);
  if(actor?.role!=='FOUNDER'||actor.active!==1||!card)throw Error('FOUNDER_RECOVERY_IDENTITY_INVALID');
  const row=db.prepare('SELECT actor_id,secret_hash FROM lab_founder_recovery WHERE event_id=?').get(eventId);
  if(row){
    if(row.actor_id!==actorId)throw Error('FOUNDER_RECOVERY_IDENTITY_AMBIGUOUS');
    if(!existsSync(keyPath))return {ready:false,created:false,reason:'FOUNDER_RECOVERY_KEY_MISSING'};
    const secret=normalizeKey(readFileSync(keyPath,'utf8'));
    return safeEqualHex(row.secret_hash,hash(secret))
      ? {ready:true,created:false}
      : {ready:false,created:false,reason:'FOUNDER_RECOVERY_KEY_INVALID'};
  }
  if(existsSync(keyPath))throw Error('FOUNDER_RECOVERY_UNCLAIMED_KEY_PRESENT');
  const secret=randomBytes(32).toString('base64url');
  writeFileSync(keyPath,secret+'\n',{encoding:'utf8',mode:0o600,flag:'wx'});
  try{chmodSync(keyPath,0o600)}catch{}
  db.prepare('INSERT INTO lab_founder_recovery(event_id,actor_id,secret_hash,created_at) VALUES (?,?,?,?)').run(eventId,actorId,hash(secret),clock());
  return {ready:true,created:true};
}

export function recoverFounderAccess(db,{eventId,actorId='FOUNDER-TEST',newUid,keyPath,envPath,clock=()=>Math.floor(Date.now()/1000)}){
  installFounderRecoverySchema(db);
  const uid=String(newUid||'').toUpperCase();
  if(!validUid(uid))throw Error('FOUNDER_RECOVERY_UID_INVALID');
  const actor=db.prepare('SELECT role,active FROM actors WHERE event_id=? AND actor_id=?').get(eventId,actorId);
  if(actor?.role!=='FOUNDER'||actor.active!==1)throw Error('FOUNDER_RECOVERY_IDENTITY_INVALID');
  const cards=db.prepare('SELECT uid FROM lab_access_cards WHERE event_id=? AND actor_id=?').all(eventId,actorId);
  if(cards.length!==1)throw Error('FOUNDER_RECOVERY_IDENTITY_AMBIGUOUS');
  const oldUid=String(cards[0].uid||'').toUpperCase();
  if(uid===oldUid)throw Error('FOUNDER_RECOVERY_SAME_UID');

  const row=db.prepare('SELECT actor_id,secret_hash FROM lab_founder_recovery WHERE event_id=?').get(eventId);
  if(!row||row.actor_id!==actorId)throw Error('FOUNDER_RECOVERY_NOT_ENROLLED');
  if(!existsSync(keyPath))throw Error('FOUNDER_RECOVERY_KEY_MISSING');
  const secret=normalizeKey(readFileSync(keyPath,'utf8'));
  if(!safeEqualHex(row.secret_hash,hash(secret)))throw Error('FOUNDER_RECOVERY_KEY_INVALID');

  const duplicate=[
    db.prepare('SELECT 1 FROM lab_access_cards WHERE event_id=? AND uid=?').get(eventId,uid),
    db.prepare('SELECT 1 FROM lab_node_tags WHERE event_id=? AND uid=?').get(eventId,uid),
    db.prepare('SELECT 1 FROM cores WHERE event_id=? AND uid=?').get(eventId,uid),
    db.prepare('SELECT 1 FROM hq_upload_bays WHERE event_id=? AND uid=?').get(eventId,uid)
  ];
  if(duplicate.some(Boolean))throw Error('FOUNDER_RECOVERY_UID_DUPLICATE');

  const originalEnv=readFileSync(envPath,'utf8');
  const updatedEnv=replaceFounderEnv(originalEnv,oldUid,uid);
  const backupPath=envPath+'.before-founder-recovery';
  writeFileSync(backupPath,originalEnv,'utf8');
  writeFileSync(envPath,updatedEnv,'utf8');

  db.exec('BEGIN IMMEDIATE');
  try{
    const changed=db.prepare('UPDATE lab_access_cards SET uid=? WHERE event_id=? AND actor_id=? AND uid=?').run(uid,eventId,actorId,oldUid);
    if(changed.changes!==1)throw Error('FOUNDER_RECOVERY_CARD_CHANGED');
    db.prepare('DELETE FROM lab_sessions WHERE event_id=? AND actor_id=?').run(eventId,actorId);
    db.prepare('UPDATE lab_founder_recovery SET last_recovered_at=? WHERE event_id=?').run(clock(),eventId);
    db.prepare('INSERT INTO lab_founder_recovery_audit(event_id,actor_id,old_uid,new_uid,recovered_at) VALUES (?,?,?,?,?)').run(eventId,actorId,oldUid,uid,clock());
    db.exec('COMMIT');
  }catch(error){
    try{db.exec('ROLLBACK')}catch{}
    writeFileSync(envPath,originalEnv,'utf8');
    throw error;
  }
  return {ok:true,eventId,actorId,oldUid,newUid,backupPath,sessionsRevoked:true};
}
