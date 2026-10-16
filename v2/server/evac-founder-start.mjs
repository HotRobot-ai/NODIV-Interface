/** Isolated EVAC start. PRE_EVAC_READY is a prerequisite set by a separately verified workflow. */
export function createEvacFounderStart(core) {
  const db = core?.db;
  if (!db?.prepare || typeof core.clock !== 'function') throw Error('EVAC_CORE_REQUIRED');
  db.exec(`CREATE TABLE IF NOT EXISTS evac_start_receipts (
    event_id TEXT PRIMARY KEY REFERENCES events(event_id),
    operation_id TEXT NOT NULL, founder_id TEXT NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS evac_original_nodes (
    event_id TEXT NOT NULL REFERENCES events(event_id),
    node_id TEXT NOT NULL,
    PRIMARY KEY(event_id,node_id)
  )`);
  return {
    start({ eventId, founderId, operationId }) {
      if (![eventId, founderId, operationId].every(x => typeof x === 'string' && x.length)) throw Error('EVAC_START_INVALID');
      // Expired normal mission cargo is durably returned before EVAC admission checks.
      core.recoverExpiredMissions(eventId);
      db.exec('BEGIN IMMEDIATE');
      try {
        const actor = db.prepare('SELECT role,active FROM actors WHERE event_id=? AND actor_id=?').get(eventId, founderId);
        if (actor?.role !== 'FOUNDER' || actor.active !== 1) throw Error('EVAC_FOUNDER_REQUIRED');
        if (db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId)?.state !== 'FIELD_ACTIVE') throw Error('EVAC_FIELD_ACTIVE_REQUIRED');
        const state = db.prepare('SELECT state FROM evac_control WHERE event_id=?').get(eventId)?.state;
        if (state === 'STARTED') {
          const prior = db.prepare('SELECT operation_id,founder_id FROM evac_start_receipts WHERE event_id=?').get(eventId);
          if (prior?.operation_id !== operationId || prior.founder_id !== founderId) throw Error('EVAC_ALREADY_STARTED');
          db.exec('COMMIT');
          return { eventId, status: 'STARTED', replayed: true };
        }
        if (state !== 'PRE_EVAC_READY') throw Error('EVAC_NOT_READY');
        if (db.prepare('SELECT 1 FROM reservations WHERE event_id=? AND expires_at>? LIMIT 1').get(eventId, core.clock())) throw Error('EVAC_OPERATION_CONFLICT');
        if (db.prepare("SELECT 1 FROM missions WHERE event_id=? AND state='ASSIGNED' AND expires_at>? LIMIT 1").get(eventId, core.clock())) throw Error('EVAC_OPERATION_CONFLICT');
        const originals = db.prepare('SELECT node_id FROM evac_original_nodes WHERE event_id=? ORDER BY node_id').all(eventId);
        if (originals.length !== 10) throw Error('EVAC_ORIGINAL_NODE_MANIFEST_REQUIRED');
        const installed = db.prepare("SELECT node_id FROM nodes WHERE event_id=? AND state='INSTALLED' ORDER BY node_id").all(eventId);
        if (installed.length !== 10 || installed.some((n,i)=>n.node_id !== originals[i].node_id)) throw Error('EVAC_START_NODE_SET_MISMATCH');
        for (const n of originals) {
          const count = db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id=? AND owner_type='NODE' AND owner_id=?").get(eventId,n.node_id).n;
          if (count !== 3) throw Error('EVAC_START_NODE_CORES_INVALID');
        }
        const changed = db.prepare("UPDATE evac_control SET state='STARTED' WHERE event_id=? AND state='PRE_EVAC_READY'").run(eventId);
        if (changed.changes !== 1) throw Error('EVAC_STATE_CHANGED');
        db.prepare('INSERT INTO evac_start_receipts(event_id,operation_id,founder_id) VALUES (?,?,?)').run(eventId,operationId,founderId);
        db.exec('COMMIT');
        return {eventId,status:'STARTED',replayed:false};
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    }
  };
}
