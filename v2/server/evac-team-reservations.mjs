import {randomUUID} from 'node:crypto';

/**
 * Isolated EVAC-1 team reservation for the existing SQLite core.
 * Does not transfer cores, start EVAC, or deinstall a node.
 * Must be called only after authoritative Founder PRE-EVAC readiness.
 */
export function createEvacTeamReservations(core) {
 const db=core?.db;
 if(!db?.prepare) throw Error('EVAC_CORE_REQUIRED');
 db.exec(`
 CREATE TABLE IF NOT EXISTS evac_control (\n  event_id TEXT PRIMARY KEY, state TEXT NOT NULL CHECK(state IN ('PRE_EVAC_READY','STARTED')),\n  FOREIGN KEY(event_id) REFERENCES events(event_id));\n CREATE TABLE IF NOT EXISTS evac_teams (
  event_id TEXT NOT NULL, team_id TEXT NOT NULL, fop_id TEXT NOT NULL,
  pioneer_a TEXT NOT NULL, pioneer_b TEXT NOT NULL,
  PRIMARY KEY(event_id,team_id), UNIQUE(event_id,fop_id),
  FOREIGN KEY(event_id) REFERENCES events(event_id));
 CREATE TABLE IF NOT EXISTS evac_assignments (
  event_id TEXT NOT NULL, team_id TEXT NOT NULL, sequence INTEGER NOT NULL CHECK(sequence IN (1,2)),
  node_id TEXT NOT NULL, carrier_id TEXT NOT NULL, core_snapshot TEXT NOT NULL,
  PRIMARY KEY(event_id,team_id,sequence), UNIQUE(event_id,node_id),
  FOREIGN KEY(event_id,team_id) REFERENCES evac_teams(event_id,team_id));
 `);
 return {
  reserve({eventId,teamId=randomUUID(),fopId,pioneerA,pioneerB,nodeIds}) {
   if(!eventId||!teamId||!fopId||!pioneerA||!pioneerB||new Set([fopId,pioneerA,pioneerB]).size!==3||
      !Array.isArray(nodeIds)||nodeIds.length!==2||nodeIds[0]===nodeIds[1])
     throw Error('EVAC_TEAM_INVALID');
   db.exec('BEGIN IMMEDIATE');
   try {
    if(db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId)?.state!=='FIELD_ACTIVE') throw Error('EVAC_EVENT_INVALID');
    if(db.prepare('SELECT state FROM evac_control WHERE event_id=?').get(eventId)?.state!=='STARTED') throw Error('EVAC_NOT_STARTED');\n    for(const [id,role] of [[fopId,'FOP'],[pioneerA,'PIONEER'],[pioneerB,'PIONEER']])
     if(!db.prepare('SELECT 1 FROM actors WHERE event_id=? AND actor_id=? AND role=? AND active=1').get(eventId,id,role)) throw Error('EVAC_MEMBER_DENIED');
    if(db.prepare('SELECT 1 FROM evac_teams WHERE event_id=? AND (fop_id IN (?,?,?) OR pioneer_a IN (?,?,?) OR pioneer_b IN (?,?,?))').get(eventId,...Array(3).fill([fopId,pioneerA,pioneerB]).flat())) throw Error('EVAC_MEMBER_ALREADY_ASSIGNED');
    const assignments=[];
    for(let i=0;i<2;i++){
     const nodeId=nodeIds[i];
     if(db.prepare("SELECT state FROM nodes WHERE event_id=? AND node_id=?").get(eventId,nodeId)?.state!=='INSTALLED') throw Error('EVAC_NODE_UNAVAILABLE');
     if(db.prepare('SELECT 1 FROM evac_assignments WHERE event_id=? AND node_id=?').get(eventId,nodeId)) throw Error('EVAC_NODE_ALREADY_ASSIGNED');
     const cores=db.prepare("SELECT core_id,uid,visible_energy,version FROM cores WHERE event_id=? AND owner_type='NODE' AND owner_id=? ORDER BY core_id").all(eventId,nodeId);
     if(cores.length!==3)throw Error('EVAC_NODE_REQUIRES_THREE_CORES');
     assignments.push({nodeId,carrierId:i===0?pioneerA:pioneerB,cores});
    }
    db.prepare('INSERT INTO evac_teams(event_id,team_id,fop_id,pioneer_a,pioneer_b) VALUES (?,?,?,?,?)').run(eventId,teamId,fopId,pioneerA,pioneerB);
    assignments.forEach((a,i)=>db.prepare('INSERT INTO evac_assignments(event_id,team_id,sequence,node_id,carrier_id,core_snapshot) VALUES (?,?,?,?,?,?)').run(eventId,teamId,i+1,a.nodeId,a.carrierId,JSON.stringify(a.cores)));
    db.exec('COMMIT');
    return {eventId,teamId,fopId,pioneers:[pioneerA,pioneerB],assignments};
   } catch(e){db.exec('ROLLBACK');throw e;}
  }
 };
}
