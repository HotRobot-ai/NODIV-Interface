import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';

export class GameError extends Error {
  constructor(code) { super(code); this.code = code; }
}

const SCHEMA = `
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS events (event_id TEXT PRIMARY KEY, state TEXT NOT NULL CHECK(state IN ('READY','INITIALIZED','FIELD_ACTIVE','COMPLETED')));
CREATE TABLE IF NOT EXISTS actors (event_id TEXT NOT NULL, actor_id TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('FOUNDER','FOP','PIONEER','LOCAL','UNBOUND')), capacity INTEGER NOT NULL DEFAULT 0 CHECK(capacity BETWEEN 0 AND 3), active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), PRIMARY KEY(event_id,actor_id), FOREIGN KEY(event_id) REFERENCES events(event_id));
CREATE TABLE IF NOT EXISTS nodes (event_id TEXT NOT NULL, node_id TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('AVAILABLE','INSTALLED','DEINSTALLED')), PRIMARY KEY(event_id,node_id), FOREIGN KEY(event_id) REFERENCES events(event_id));
CREATE TABLE IF NOT EXISTS cores (event_id TEXT NOT NULL, core_id TEXT NOT NULL, uid TEXT NOT NULL, visible_energy INTEGER NOT NULL CHECK(visible_energy > 0), actual_energy INTEGER NOT NULL CHECK(actual_energy > 0), owner_type TEXT NOT NULL CHECK(owner_type IN ('HQ','PIONEER','NODE','TRANSIT')), owner_id TEXT NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(event_id,core_id), UNIQUE(event_id,uid), FOREIGN KEY(event_id) REFERENCES events(event_id));
CREATE INDEX IF NOT EXISTS cores_owner ON cores(event_id,owner_type,owner_id);
CREATE TABLE IF NOT EXISTS balances (event_id TEXT NOT NULL, actor_id TEXT NOT NULL, secured_energy INTEGER NOT NULL DEFAULT 0 CHECK(secured_energy >= 0), PRIMARY KEY(event_id,actor_id), FOREIGN KEY(event_id,actor_id) REFERENCES actors(event_id,actor_id));
CREATE TABLE IF NOT EXISTS operations (event_id TEXT NOT NULL, operation_id TEXT NOT NULL, actor_id TEXT NOT NULL, kind TEXT NOT NULL, payload_hash TEXT NOT NULL, response_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(event_id,operation_id));
CREATE TABLE IF NOT EXISTS audit (event_id TEXT NOT NULL, operation_id TEXT NOT NULL, seq INTEGER NOT NULL, core_id TEXT, from_type TEXT, from_id TEXT, to_type TEXT, to_id TEXT, energy_delta INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(event_id,operation_id,seq), FOREIGN KEY(event_id,operation_id) REFERENCES operations(event_id,operation_id));
CREATE TABLE IF NOT EXISTS missions (event_id TEXT NOT NULL, mission_id TEXT NOT NULL, actor_id TEXT NOT NULL, kind TEXT NOT NULL, node_id TEXT NOT NULL, core_id TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('ASSIGNED','COMPLETED','CANCELLED')), expires_at INTEGER NOT NULL, completed_operation_id TEXT, PRIMARY KEY(event_id,mission_id));
CREATE TABLE IF NOT EXISTS reservations (event_id TEXT NOT NULL, reservation_id TEXT NOT NULL, kind TEXT NOT NULL, actor_id TEXT NOT NULL, expires_at INTEGER NOT NULL, payload_json TEXT NOT NULL, PRIMARY KEY(event_id,reservation_id));
`;

export class SqliteGameCore {
  constructor(path = ':memory:', clock = () => Math.floor(Date.now()/1000)) { this.db = new DatabaseSync(path, { timeout: 5000 }); if (path !== ':memory:') this.db.exec('PRAGMA journal_mode=WAL'); this.db.exec(SCHEMA); this.clock = clock; }
  close() { this.db.close(); }
  seedEvent(eventId, state = 'FIELD_ACTIVE') { this.db.prepare('INSERT INTO events(event_id,state) VALUES (?,?)').run(eventId,state); }
  seedActor(eventId, actorId, role, capacity = 0) { this.db.prepare('INSERT INTO actors(event_id,actor_id,role,capacity) VALUES (?,?,?,?)').run(eventId,actorId,role,capacity); this.db.prepare('INSERT INTO balances(event_id,actor_id) VALUES (?,?)').run(eventId,actorId); }
  seedNode(eventId, nodeId, state = 'AVAILABLE') { this.db.prepare('INSERT INTO nodes(event_id,node_id,state) VALUES (?,?,?)').run(eventId,nodeId,state); }
  seedCore(eventId, {id,uid,energy,actualEnergy=energy,ownerType,ownerId,status='FIELD'}) { this.db.prepare('INSERT INTO cores(event_id,core_id,uid,visible_energy,actual_energy,owner_type,owner_id,status) VALUES (?,?,?,?,?,?,?,?)').run(eventId,id,uid,energy,actualEnergy,ownerType,ownerId,status); }
  seedMission(eventId, {id,actorId,kind='RESUPPLY',nodeId,coreId,expiresAt}) { this.db.prepare('INSERT INTO missions(event_id,mission_id,actor_id,kind,node_id,core_id,state,expires_at) VALUES (?,?,?,?,?,?,?,?)').run(eventId,id,actorId,kind,nodeId,coreId,'ASSIGNED',expiresAt); }
  core(eventId,id) { return this.db.prepare('SELECT * FROM cores WHERE event_id=? AND core_id=?').get(eventId,id); }
  balance(eventId,actorId) { return this.db.prepare('SELECT secured_energy FROM balances WHERE event_id=? AND actor_id=?').get(eventId,actorId)?.secured_energy; }
  run({eventId,operationId,actorId,kind,moves=[],energyCredit=0,capacityChange=0,nodeChanges=[],eventState=null,missionId=null}, transactionHook = null) {
    if(!eventId||!operationId||!actorId||!kind) throw new GameError('INVALID_OPERATION');
    if(!Array.isArray(moves)||!Array.isArray(nodeChanges)||!Number.isSafeInteger(energyCredit)||energyCredit<0||!Number.isSafeInteger(capacityChange)) throw new GameError('INVALID_OPERATION');
    const payload = {eventId,actorId,kind,moves,energyCredit,capacityChange,nodeChanges,eventState,missionId};
    const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const prior = this.db.prepare('SELECT payload_hash,response_json FROM operations WHERE event_id=? AND operation_id=?').get(eventId,operationId);
      if(prior) {
        if(prior.payload_hash!==hash) throw new GameError('IDEMPOTENCY_CONFLICT');
        if(transactionHook) transactionHook(this.db,{replay:true});
        this.db.exec('COMMIT');
        return {...JSON.parse(prior.response_json),replayed:true};
      }
      const event = this.db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId);
      if(!event || event.state!=='FIELD_ACTIVE') throw new GameError('EVENT_NOT_FIELD_ACTIVE');
      const ec=this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='evac_control'").get();
      if(ec && this.db.prepare('SELECT state FROM evac_control WHERE event_id=?').get(eventId)?.state==='STARTED') throw new GameError('EVAC_NORMAL_ACTION_FROZEN');
      const actor = this.db.prepare('SELECT * FROM actors WHERE event_id=? AND actor_id=?').get(eventId,actorId);
      if(!actor||!actor.active) throw new GameError('ACTOR_DENIED');
      const permitted = {EXCHANGE:['PIONEER'],CATCH:['LOCAL','UNBOUND','PIONEER'],RESTORE_1:['PIONEER'],RESTORE_2:['PIONEER'],RESUPPLY:['PIONEER'],HQ_UPLOAD:['PIONEER'],INSTALL:['FOP'],DEINSTALL:['FOP'],EVAC:['FOP','FOUNDER','PIONEER'],SHUTDOWN:['FOUNDER']};
      if(!permitted[kind]?.includes(actor.role)) throw new GameError('ROLE_DENIED');
      if(new Set(moves.map(m=>m.id)).size!==moves.length) throw new GameError('DUPLICATE_CORE');
      // Valid ownership operations take priority over pending Catch previews.
      // Catch.confirm atomically rejects a stale snapshot; caller must refresh preview.
      // Domain checks run inside the same transaction as the ownership updates.
      // Never accept a caller-supplied energy amount or arbitrary transfer graph.
      if(kind==='HQ_UPLOAD') {
        if(moves.length<1 || moves.length>3 || capacityChange || nodeChanges.length || eventState) throw new GameError('UPLOAD_INVALID_SHAPE');
        let expected=0;
        for(const m of moves) {
          if(m.fromType!=='PIONEER'||m.fromId!==actorId||m.toType!=='HQ'||m.toId!=='HQ') throw new GameError('UPLOAD_INVALID_ROUTE');
          const c=this.core(eventId,m.id);
          if(!c) throw new GameError('CORE_UNKNOWN');
          expected+=c.actual_energy;
        }
        if(energyCredit!==expected) throw new GameError('UPLOAD_CREDIT_MISMATCH');
      } else if(kind==='EXCHANGE') {
        if(energyCredit||capacityChange||nodeChanges.length||eventState||moves.length<2||moves.length>6||moves.length%2) throw new GameError('EXCHANGE_INVALID_SHAPE');
        const incoming=moves.filter(m=>m.fromType==='PIONEER'&&m.fromId===actorId&&m.toType==='NODE');
        const outgoing=moves.filter(m=>m.fromType==='NODE'&&m.toType==='PIONEER'&&m.toId===actorId);
        if(incoming.length!==outgoing.length||incoming.length*2!==moves.length||incoming.length>actor.capacity) throw new GameError('EXCHANGE_INVALID_ROUTE');
        const nodes=new Set([...incoming.map(m=>m.toId),...outgoing.map(m=>m.fromId)]);
        if(nodes.size!==1) throw new GameError('EXCHANGE_DIFFERENT_NODES');
        const nodeId=[...nodes][0];
        if(this.db.prepare('SELECT state FROM nodes WHERE event_id=? AND node_id=?').get(eventId,nodeId)?.state!=='INSTALLED') throw new GameError('NODE_NOT_INSTALLED');
      } else if(kind==='RESTORE_1') {
        if(energyCredit||nodeChanges.length||eventState||capacityChange!==1||actor.capacity!==1||moves.length!==2) throw new GameError('RESTORE_1_INVALID_SHAPE');
        const incoming=moves.find(m=>m.fromType==='TRANSIT'&&m.fromId===actorId&&m.toType==='NODE');
        const outgoing=moves.find(m=>m.fromType==='NODE'&&m.toType==='PIONEER'&&m.toId===actorId);
        if(!incoming||!outgoing||incoming.toId!==outgoing.fromId) throw new GameError('RESTORE_1_INVALID_ROUTE');
        const targetNode=this.db.prepare('SELECT state FROM nodes WHERE event_id=? AND node_id=?').get(eventId,incoming.toId);
        if(targetNode?.state!=='INSTALLED') throw new GameError('NODE_NOT_INSTALLED');
        const nodeCores=this.db.prepare("SELECT core_id,visible_energy FROM cores WHERE event_id=? AND owner_type='NODE' AND owner_id=? ORDER BY visible_energy ASC,core_id ASC").all(eventId,incoming.toId);
        if(nodeCores.length!==3) throw new GameError('NODE_REQUIRES_THREE_CORES');
        if(outgoing.id!==nodeCores[0].core_id) throw new GameError('RESTORE_MUST_DISPLACE_LOWEST');
        const transit=this.core(eventId,incoming.id);
        if(!transit||transit.owner_type!=='TRANSIT'||transit.owner_id!==actorId) throw new GameError('RESTORE_TRANSIT_NOT_ASSIGNED');

      } else if(kind==='RESTORE_2') {
        // Restore #2 replaces the lowest Node core, returns it to HQ,
        // and upgrades the Pioneer from 2 to 3 personal slots atomically.
        if(energyCredit||nodeChanges.length||eventState||capacityChange!==1||actor.capacity!==2||moves.length!==2) throw new GameError('RESTORE_2_INVALID_SHAPE');
        const incoming=moves.find(m=>m.fromType==='TRANSIT'&&m.fromId===actorId&&m.toType==='NODE');
        const outgoing=moves.find(m=>m.fromType==='NODE'&&m.toType==='HQ'&&m.toId==='HQ');
        if(!incoming||!outgoing||incoming.toId!==outgoing.fromId) throw new GameError('RESTORE_2_INVALID_ROUTE');
        if(this.db.prepare('SELECT state FROM nodes WHERE event_id=? AND node_id=?').get(eventId,incoming.toId)?.state!=='INSTALLED') throw new GameError('NODE_NOT_INSTALLED');
        const nodeCores=this.db.prepare("SELECT core_id,visible_energy FROM cores WHERE event_id=? AND owner_type='NODE' AND owner_id=? ORDER BY visible_energy ASC,core_id ASC").all(eventId,incoming.toId);
        if(nodeCores.length!==3) throw new GameError('NODE_REQUIRES_THREE_CORES');
        if(outgoing.id!==nodeCores[0].core_id) throw new GameError('RESTORE_MUST_DISPLACE_LOWEST');
        const transit=this.core(eventId,incoming.id);
        if(!transit||transit.owner_type!=='TRANSIT'||transit.owner_id!==actorId) throw new GameError('RESTORE_TRANSIT_NOT_ASSIGNED');

      } else if(kind==='RESUPPLY') {
        // Existing V1/V2 rule: one HQ transit Core replaces the weakest Node Core;
        // that displaced Core becomes the Pioneer's new personal Core. Node remains 3/3.
        if(energyCredit||capacityChange||nodeChanges.length||eventState||moves.length!==2||!missionId) throw new GameError('RESUPPLY_INVALID_SHAPE');
        const mission=this.db.prepare('SELECT * FROM missions WHERE event_id=? AND mission_id=?').get(eventId,missionId);
        if(!mission||mission.kind!=='RESUPPLY'||mission.actor_id!==actorId||mission.state!=='ASSIGNED'||mission.expires_at<=this.clock()) throw new GameError('RESUPPLY_MISSION_DENIED');
        if(this.db.prepare('SELECT state FROM nodes WHERE event_id=? AND node_id=?').get(eventId,mission.node_id)?.state!=='INSTALLED') throw new GameError('NODE_NOT_INSTALLED');
        const incoming=moves.find(m=>m.id===mission.core_id&&m.fromType==='TRANSIT'&&m.fromId===actorId&&m.toType==='NODE'&&m.toId===mission.node_id);
        const outgoing=moves.find(m=>m.fromType==='NODE'&&m.fromId===mission.node_id&&m.toType==='PIONEER'&&m.toId===actorId);
        if(!incoming||!outgoing) throw new GameError('RESUPPLY_INVALID_ROUTE');
        const transit=this.core(eventId,incoming.id);
        if(!transit||transit.owner_type!=='TRANSIT'||transit.owner_id!==actorId||transit.status!=='IN_TRANSIT') throw new GameError('RESUPPLY_TRANSIT_NOT_ASSIGNED');
        const nodeCores=this.db.prepare("SELECT core_id,visible_energy,status FROM cores WHERE event_id=? AND owner_type='NODE' AND owner_id=? ORDER BY visible_energy ASC,core_id ASC").all(eventId,mission.node_id);
        if(nodeCores.length!==3||nodeCores.some(c=>c.status!=='DEPLOYED')) throw new GameError('NODE_REQUIRES_THREE_CORES');
        if(outgoing.id!==nodeCores[0].core_id) throw new GameError('RESUPPLY_MUST_DISPLACE_LOWEST');
        const personal=this.db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id=? AND owner_type='PIONEER' AND owner_id=? AND status='FIELD'").get(eventId,actorId).n;
        if(personal!==0) throw new GameError('RESUPPLY_REQUIRES_EMPTY_INVENTORY');
      } else if(kind==='INSTALL') {
        if(energyCredit||capacityChange||eventState||moves.length!==3||nodeChanges.length!==1) throw new GameError('INSTALL_INVALID_SHAPE');
        const change=nodeChanges[0];
        if(!change?.id||change.state!=='INSTALLED') throw new GameError('INSTALL_INVALID_NODE_CHANGE');
        const node=this.db.prepare('SELECT state FROM nodes WHERE event_id=? AND node_id=?').get(eventId,change.id);
        if(!node||node.state==='INSTALLED') throw new GameError('INSTALL_NODE_UNAVAILABLE');
        if(this.db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id=? AND owner_type='NODE' AND owner_id=?").get(eventId,change.id).n!==0) throw new GameError('INSTALL_NODE_NOT_EMPTY');
        if(moves.some(m=>m.fromType!=='TRANSIT'||m.fromId!==actorId||m.toType!=='NODE'||m.toId!==change.id||m.status!=='DEPLOYED')) throw new GameError('INSTALL_INVALID_ROUTE');
        for(const m of moves){const c=this.core(eventId,m.id);if(!c||c.owner_type!=='TRANSIT'||c.owner_id!==actorId||c.status!=='IN_TRANSIT') throw new GameError('INSTALL_CARGO_INVALID');}
      } else if(kind==='DEINSTALL') {
        if(energyCredit||capacityChange||eventState||moves.length!==3||nodeChanges.length!==1) throw new GameError('DEINSTALL_INVALID_SHAPE');
        const change=nodeChanges[0];
        if(!change?.id||change.state!=='DEINSTALLED') throw new GameError('DEINSTALL_INVALID_NODE_CHANGE');
        if(this.db.prepare('SELECT state FROM nodes WHERE event_id=? AND node_id=?').get(eventId,change.id)?.state!=='INSTALLED') throw new GameError('DEINSTALL_NODE_NOT_INSTALLED');
        const current=this.db.prepare("SELECT core_id,status FROM cores WHERE event_id=? AND owner_type='NODE' AND owner_id=? ORDER BY core_id").all(eventId,change.id);
        if(current.length!==3||current.some(c=>c.status!=='DEPLOYED')) throw new GameError('NODE_REQUIRES_THREE_CORES');
        if(moves.some(m=>m.fromType!=='NODE'||m.fromId!==change.id||m.toType!=='HQ'||m.toId!=='HQ'||m.status!=='RESERVE')) throw new GameError('DEINSTALL_INVALID_ROUTE');
        if(new Set(moves.map(m=>m.id)).size!==3||moves.some(m=>!current.some(c=>c.core_id===m.id))) throw new GameError('DEINSTALL_CORE_MISMATCH');
      } else {
        // Remaining operations require dedicated domain services rather than a generic mutation path.
        throw new GameError('ACTION_NOT_IMPLEMENTED');
      }

      for(const move of moves) {
        const core = this.core(eventId,move.id);
        if(!core) throw new GameError('CORE_UNKNOWN');
        if(core.owner_type!==move.fromType||core.owner_id!==move.fromId) throw new GameError('OWNERSHIP_CHANGED');
        if(core.status==='EVAC_CARGO') throw new GameError('EVAC_CARGO_PROTECTED');
        if(!['HQ','PIONEER','NODE','TRANSIT'].includes(move.toType)||!move.toId) throw new GameError('INVALID_DESTINATION');
        if(move.toType==='PIONEER'&&!this.db.prepare("SELECT 1 FROM actors WHERE event_id=? AND actor_id=? AND role='PIONEER'").get(eventId,move.toId)) throw new GameError('PIONEER_UNKNOWN');
        if(move.toType==='NODE'&&!this.db.prepare('SELECT 1 FROM nodes WHERE event_id=? AND node_id=?').get(eventId,move.toId)) throw new GameError('NODE_UNKNOWN');
        this.db.prepare('UPDATE cores SET owner_type=?,owner_id=?,status=?,version=version+1 WHERE event_id=? AND core_id=?').run(move.toType,move.toId,move.status??core.status,eventId,move.id);
      }
      if(kind==='RESUPPLY') {
        const updated=this.db.prepare("UPDATE missions SET state='COMPLETED',completed_operation_id=? WHERE event_id=? AND mission_id=? AND state='ASSIGNED'").run(operationId,eventId,missionId);
        if(updated.changes!==1) throw new GameError('RESUPPLY_MISSION_DENIED');
      }
      if(capacityChange) {
        if(kind!=='RESTORE_1'&&kind!=='RESTORE_2') throw new GameError('CAPACITY_CHANGE_DENIED');
        this.db.prepare('UPDATE actors SET capacity=capacity+? WHERE event_id=? AND actor_id=?').run(capacityChange,eventId,actorId);
      }
      for(const n of nodeChanges) {
        if(!['INSTALL','DEINSTALL','EVAC'].includes(kind)) throw new GameError('NODE_CHANGE_DENIED');
        if(this.db.prepare('UPDATE nodes SET state=? WHERE event_id=? AND node_id=?').run(n.state,eventId,n.id).changes!==1) throw new GameError('NODE_UNKNOWN');
      }
      if(eventState) {
        if(kind!=='SHUTDOWN'||eventState!=='COMPLETED') throw new GameError('EVENT_CHANGE_DENIED');
        this.db.prepare('UPDATE events SET state=? WHERE event_id=?').run(eventState,eventId);
      }
      if(energyCredit) {
        if(kind!=='HQ_UPLOAD') throw new GameError('ENERGY_CREDIT_DENIED');
        if(this.db.prepare('UPDATE balances SET secured_energy=secured_energy+? WHERE event_id=? AND actor_id=?').run(energyCredit,eventId,actorId).changes!==1) throw new GameError('BALANCE_UNKNOWN');
      }
      const affected = new Set([...moves.filter(m=>m.fromType==='NODE').map(m=>m.fromId),...moves.filter(m=>m.toType==='NODE').map(m=>m.toId),...nodeChanges.map(n=>n.id)]);
      for(const nodeId of affected) {
        const node = this.db.prepare('SELECT state FROM nodes WHERE event_id=? AND node_id=?').get(eventId,nodeId);
        const count = this.db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id=? AND owner_type='NODE' AND owner_id=?").get(eventId,nodeId).n;
        if(node?.state==='INSTALLED'&&count!==3) throw new GameError('NODE_REQUIRES_THREE_CORES');
        if(node?.state!=='INSTALLED'&&count!==0) throw new GameError('UNINSTALLED_NODE_HAS_CORES');
      }
      const pioneers = new Set([actorId,...moves.filter(m=>m.fromType==='PIONEER').map(m=>m.fromId),...moves.filter(m=>m.toType==='PIONEER').map(m=>m.toId)]);
      for(const pioneer of pioneers) {
        const p = this.db.prepare("SELECT capacity FROM actors WHERE event_id=? AND actor_id=? AND role='PIONEER'").get(eventId,pioneer);
        if(!p) continue;
        const count = this.db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id=? AND owner_type='PIONEER' AND owner_id=?").get(eventId,pioneer).n;
        if(count>p.capacity) throw new GameError('PIONEER_CAPACITY_EXCEEDED');
      }
      const response = {ok:true,eventId,operationId,kind,moved:moves.map(m=>m.id),energyCredit,replayed:false};
      this.db.prepare('INSERT INTO operations(event_id,operation_id,actor_id,kind,payload_hash,response_json) VALUES (?,?,?,?,?,?)').run(eventId,operationId,actorId,kind,hash,JSON.stringify(response));
      moves.forEach((m,i)=>this.db.prepare('INSERT INTO audit(event_id,operation_id,seq,core_id,from_type,from_id,to_type,to_id) VALUES (?,?,?,?,?,?,?,?)').run(eventId,operationId,i,m.id,m.fromType,m.fromId,m.toType,m.toId));
      if(energyCredit) this.db.prepare('INSERT INTO audit(event_id,operation_id,seq,energy_delta) VALUES (?,?,?,?)').run(eventId,operationId,moves.length,energyCredit);
      if(transactionHook) transactionHook(this.db,{replay:false});
      this.db.exec('COMMIT'); return response;
    } catch(error) { this.db.exec('ROLLBACK'); throw error; }
  }
}
