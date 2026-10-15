export function createEvacFounderStart(core) {
  const db = core?.db;
  if (!db?.prepare) throw Error('EVAC_CORE_REQUIRED');
  return {
    start({eventId,founderId,operationId}) {
      if (!eventId || !founderId || !operationId) throw Error('EVAC_START_INVALID');
      db.exec('BEGIN IMMEDIATE');
      try {
        const founder = db.prepare('SELECT role,active FROM actors WHERE event_id=? AND actor_id=?').get(eventId,founderId);
        if (founder?.role !== 'FOUNDER' || founder.active !== 1) throw Error('EVAC_FOUNDER_REQUIRED');
        if (db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId)?.state !== 'FIELD_ACTIVE') throw Error('EVAC_FIELD_ACTIVE_REQUIRED');
        const state = db.prepare('SELECT state FROM evac_control WHERE event_id=?').get(eventId)?.state;
        if (state !== 'PRE_EVAC_READY') throw Error('EVAC_NOT_READY');
        if (db.prepare('SELECT 1 FROM reservations WHERE event_id=? AND expires_at>? LIMIT 1').get(eventId,core.clock())) throw Error('EVAC_OPERATION_CONFLICT');
        if (db.prepare("SELECT 1 FROM missions WHERE event_id=? AND state='ASSIGNED' LIMIT 1").get(eventId)) throw Error('EVAC_OPERATION_CONFLICT');
        throw Error('EVAC_ORIGINAL_NODE_MANIFEST_REQUIRED');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    }
  };
}
