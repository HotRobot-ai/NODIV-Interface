/** NODIV V2 single-use NFC authorization; same SQLite DB as game state. */
import { randomUUID } from 'node:crypto';
export function installNfcGrantSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS v2_nfc_grants (
    id TEXT PRIMARY KEY, event_id TEXT NOT NULL, actor_id TEXT NOT NULL,
    command TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL, consumed_at INTEGER,
    operation_id TEXT UNIQUE NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_v2_nfc_grants_actor ON v2_nfc_grants(event_id, actor_id, expires_at);`);
}
/** Call ONLY after the server verified physical NFC scan and authenticated actor. */
export function issueNfcGrant(db,{eventId,actorId,command,targetType,targetId,operationId,now=Date.now(),ttlMs=30000}) {
  if (![eventId,actorId,command,targetType,targetId,operationId].every(v=>typeof v==='string'&&v.length>0)) throw Error('INVALID_GRANT_SCOPE');
  if (!Number.isSafeInteger(now)||!Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>120000) throw Error('INVALID_GRANT_TTL');
  const id=randomUUID();
  db.prepare('INSERT INTO v2_nfc_grants (id,event_id,actor_id,command,target_type,target_id,expires_at,operation_id) VALUES (?,?,?,?,?,?,?,?)')
    .run(id,eventId,actorId,command,targetType,targetId,now+ttlMs,operationId);
  return {id,expiresAt:now+ttlMs};
}
/** MUST run inside caller's BEGIN IMMEDIATE transaction with Core mutation and receipt. */
export function consumeNfcGrant(db,{id,eventId,actorId,command,targetType,targetId,operationId,now=Date.now()}) {
  if (![id,eventId,actorId,command,targetType,targetId,operationId].every(v=>typeof v==='string'&&v.length>0)) throw Error('INVALID_GRANT_SCOPE');
  const result=db.prepare('UPDATE v2_nfc_grants SET consumed_at=? WHERE id=? AND event_id=? AND actor_id=? AND command=? AND target_type=? AND target_id=? AND operation_id=? AND consumed_at IS NULL AND expires_at>=?')
    .run(now,id,eventId,actorId,command,targetType,targetId,operationId,now);
  if(result.changes!==1) throw Error('NFC_GRANT_INVALID_OR_CONSUMED');
}
/** Trusted synchronous domain callback uses SAME db and transaction. */
export function runWithNfcGrant(db,scope,mutation,{now=Date.now()}={}) {
  if(typeof mutation!=='function') throw Error('MUTATION_REQUIRED');
  db.exec('BEGIN IMMEDIATE');
  try {
    consumeNfcGrant(db,{...scope,now});
    const result=mutation(db);
    if(result&&typeof result.then==='function') throw Error('ASYNC_MUTATION_FORBIDDEN');
    db.exec('COMMIT');return result;
  }catch(error){db.exec('ROLLBACK');throw error;}
}
