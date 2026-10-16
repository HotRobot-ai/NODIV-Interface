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
CREATE TABLE IF NOT EXISTS node_cooldowns (event_id TEXT NOT NULL, node_id TEXT NOT NULL, kind TEXT NOT NULL, until_epoch INTEGER NOT NULL, operation_id TEXT NOT NULL, PRIMARY KEY(event_id,node_id,kind), FOREIGN KEY(event_id,node_id) REFERENCES nodes(event_id,node_id));
CREATE TABLE IF NOT EXISTS actor_node_locks (event_id TEXT NOT NULL, actor_id TEXT NOT NULL, node_id TEXT NOT NULL, kind TEXT NOT NULL, until_epoch INTEGER NOT NULL, operation_id TEXT NOT NULL, PRIMARY KEY(event_id,actor_id,node_id,kind), FOREIGN KEY(event_id,actor_id) REFERENCES actors(event_id,actor_id), FOREIGN KEY(event_id,node_id) REFERENCES nodes(event_id,node_id));
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
  _fail(code, problems=null) { const e=new GameError(code); if(problems)e.problems=problems; throw e; }
  _assertNodeUnlocked(eventId,actorId,nodeId) {
    const lock=this.db.prepare("SELECT until_epoch FROM actor_node_locks WHERE event_id=? AND actor_id=? AND node_id=? AND kind='RESTORE'").get(eventId,actorId,nodeId);
    if(lock?.until_epoch>this.clock()) this._fail('RESTORE_TARGET_LOCKED');
  }
  _assertMissionFree(eventId,nodeId,excludeMissionId=null) {
    const row=excludeMissionId
      ? this.db.prepare("SELECT mission_id FROM missions WHERE event_id=? AND node_id=? AND state='ASSIGNED' AND expires_at>? AND mission_id<>? LIMIT 1").get(eventId,nodeId,this.clock(),excludeMissionId)
      : this.db.prepare("SELECT mission_id FROM missions WHERE event_id=? AND node_id=? AND state='ASSIGNED' AND expires_at>? LIMIT 1").get(eventId,nodeId,this.clock());
    if(row) this._fail('NODE_OPERATION_RESERVED');
  }
  _assertReservationFree(eventId,operationId,actorId,nodeId,coreIds=[]) {
    const rows=this.db.prepare("SELECT reservation_id,kind,actor_id,payload_json FROM reservations WHERE event_id=? AND expires_at>?").all(eventId,this.clock());
    const coreSet=new Set(coreIds);
    for(const r of rows){
      if(r.reservation_id===operationId) continue;
      let p; try{p=JSON.parse(r.payload_json)}catch{this._fail('RESERVATION_UNVERIFIABLE')}
      if(!p||typeof p!=='object'||Array.isArray(p)) this._fail('RESERVATION_UNVERIFIABLE');
      if(r.actor_id===actorId&&p.operationId===operationId) continue;
      if(p.coreIds!==undefined&&!Array.isArray(p.coreIds)) this._fail('RESERVATION_UNVERIFIABLE');
      const ids=[p.coreId,p.core_id,...(p.coreIds||[])].filter(v=>v!==undefined);
      if(ids.some(v=>typeof v!=='string'||!v.trim())) this._fail('RESERVATION_UNVERIFIABLE');
      const nodes=[p.nodeId,p.node_id].filter(v=>v!==undefined);
      if(nodes.some(v=>typeof v!=='string'||!v.trim())) this._fail('RESERVATION_UNVERIFIABLE');
      const relevant=/EXCHANGE|RESTORE|RESUPPLY|INSTALL|DEINSTALL|DEPLOY/i.test(r.kind);
      if(relevant&&!ids.length&&!nodes.length) this._fail('RESERVATION_UNVERIFIABLE');
      if(nodes.includes(nodeId)||ids.some(id=>coreSet.has(id))) this._fail('OPERATION_RESERVED');
    }
  }
  _restoreQualified(eventId,actorId,phase) {
    if(phase===1) return Boolean(this.db.prepare("SELECT 1 FROM operations WHERE event_id=? AND actor_id=? AND kind='EXCHANGE' LIMIT 1").get(eventId,actorId));
    const r1=this.db.prepare("SELECT rowid FROM operations WHERE event_id=? AND actor_id=? AND kind='RESTORE_1' ORDER BY rowid DESC LIMIT 1").get(eventId,actorId);
    if(!r1) return false;
    const xs=this.db.prepare("SELECT response_json FROM operations WHERE event_id=? AND actor_id=? AND kind='EXCHANGE' AND rowid>? ORDER BY rowid").all(eventId,actorId,r1.rowid);
    return xs.some(row=>{try{return JSON.parse(row.response_json)?.moved?.length===4}catch{return false}});
  }
  assertIntegrity(eventId) {
    const problems=[];
    for(const n of this.db.prepare(`SELECT n.node_id,n.state,COUNT(c.core_id) AS core_count,
      SUM(CASE WHEN c.status='DEPLOYED' THEN 1 ELSE 0 END) AS deployed_count
      FROM nodes n LEFT JOIN cores c ON c.event_id=n.event_id AND c.owner_type='NODE' AND c.owner_id=n.node_id
      WHERE n.event_id=? GROUP BY n.node_id,n.state`).all(eventId)){
      if(n.state==='INSTALLED'&&(n.core_count!==3||n.deployed_count!==3)) problems.push('NODE_INVALID:'+n.node_id);
      if(n.state!=='INSTALLED'&&n.core_count!==0) problems.push('UNINSTALLED_NODE_HAS_CORES:'+n.node_id);
    }
    const orphanActor=this.db.prepare(`SELECT c.core_id FROM cores c LEFT JOIN actors a ON a.event_id=c.event_id AND a.actor_id=c.owner_id
      WHERE c.event_id=? AND c.owner_type IN ('PIONEER','TRANSIT') AND a.actor_id IS NULL LIMIT 1`).get(eventId);
    if(orphanActor) problems.push('CORE_ACTOR_ORPHAN:'+orphanActor.core_id);
    const orphanNode=this.db.prepare(`SELECT c.core_id FROM cores c LEFT JOIN nodes n ON n.event_id=c.event_id AND n.node_id=c.owner_id
      WHERE c.event_id=? AND c.owner_type='NODE' AND n.node_id IS NULL LIMIT 1`).get(eventId);
    if(orphanNode) problems.push('CORE_NODE_ORPHAN:'+orphanNode.core_id);
    const badHq=this.db.prepare("SELECT core_id FROM cores WHERE event_id=? AND owner_type='HQ' AND owner_id<>'HQ' LIMIT 1").get(eventId);
    if(badHq) problems.push('CORE_HQ_OWNER_INVALID:'+badHq.core_id);
    const over=this.db.prepare(`SELECT a.actor_id,a.capacity,COUNT(c.core_id) AS n FROM actors a
      LEFT JOIN cores c ON c.event_id=a.event_id AND c.owner_type='PIONEER' AND c.owner_id=a.actor_id
      WHERE a.event_id=? GROUP BY a.actor_id,a.capacity HAVING COUNT(c.core_id)>a.capacity LIMIT 1`).get(eventId);
    if(over) problems.push('ACTOR_CAPACITY_EXCEEDED:'+over.actor_id);
    if(problems.length) this._fail('EVENT_INTEGRITY_VIOLATION',problems);
    return {ok:true,eventId};
  }
  recoverExpiredMissions(eventId) {
    if(!eventId) this._fail('INVALID_EVENT');
    const event=this.db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId);
    if(!event||event.state!=='FIELD_ACTIVE') return {eventId,recovered:[]};
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const rows=this.db.prepare("SELECT * FROM missions WHERE event_id=? AND state='ASSIGNED' AND expires_at<=? AND kind IN ('RESTORE_1','RESTORE_2','RESUPPLY') ORDER BY mission_id").all(eventId,this.clock());
      const recovered=[];
      for(const m of rows){
        const c=this.core(eventId,m.core_id);
        if(!c||c.owner_type!=='TRANSIT'||c.owner_id!==m.actor_id||c.status!=='IN_TRANSIT') this._fail('MISSION_RECOVERY_STATE_MISMATCH');
        const operationId='MISSION-EXPIRE:'+m.mission_id;
        const hash=createHash('sha256').update(JSON.stringify({eventId,missionId:m.mission_id,kind:m.kind})).digest('hex');
        this.db.prepare("UPDATE cores SET owner_type='HQ',owner_id='HQ',status='RESERVE',version=version+1 WHERE event_id=? AND core_id=?").run(eventId,m.core_id);
        this.db.prepare("UPDATE missions SET state='CANCELLED',completed_operation_id=? WHERE event_id=? AND mission_id=? AND state='ASSIGNED'").run(operationId,eventId,m.mission_id);
        const response={ok:true,eventId,operationId,kind:'MISSION_EXPIRE',missionId:m.mission_id,coreId:m.core_id};
        this.db.prepare("INSERT OR IGNORE INTO operations(event_id,operation_id,actor_id,kind,payload_hash,response_json) VALUES (?,?,?,?,?,?)").run(eventId,operationId,m.actor_id,'MISSION_EXPIRE',hash,JSON.stringify(response));
        this.db.prepare("INSERT OR IGNORE INTO audit(event_id,operation_id,seq,core_id,from_type,from_id,to_type,to_id) VALUES (?,?,0,?,?,?,?,?)").run(eventId,operationId,m.core_id,'TRANSIT',m.actor_id,'HQ','HQ');
        recovered.push(m.mission_id);
      }
      this.assertIntegrity(eventId);
      this.db.exec('COMMIT');
      return {eventId,recovered};
    }catch(e){this.db.exec('ROLLBACK');throw e}
  }
  run({eventId,operationId,actorId,kind,moves=[],energyCredit=0,capacityChange=0,nodeChanges=[],eventState=null,missionId=null}, transactionHook = null) {
    if(!eventId||!operationId||!actorId||!kind) throw new GameError('INVALID_OPERATION');
    if(!Array.isArray(moves)||!Array.isArray(nodeChanges)||!Number.isSafeInteger(energyCredit)||energyCredit<0||!Number.isSafeInteger(capacityChange)) throw new GameError('INVALID_OPERATION');
    const payload={eventId,actorId,kind,moves,energyCredit,capacityChange,nodeChanges,eventState,missionId};
    const hash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const prior=this.db.prepare('SELECT payload_hash,response_json FROM operations WHERE event_id=? AND operation_id=?').get(eventId,operationId);
      if(prior){
        if(prior.payload_hash!==hash) this._fail('IDEMPOTENCY_CONFLICT');
        if(transactionHook) transactionHook(this.db,{replay:true});
        this.db.exec('COMMIT');
        return {...JSON.parse(prior.response_json),replayed:true};
      }
      const event=this.db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId);
      if(!event||event.state!=='FIELD_ACTIVE') this._fail('EVENT_NOT_FIELD_ACTIVE');
      const ec=this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='evac_control'").get();
      if(ec&&this.db.prepare('SELECT state FROM evac_control WHERE event_id=?').get(eventId)?.state==='STARTED') this._fail('EVAC_NORMAL_ACTION_FROZEN');
      const actor=this.db.prepare('SELECT * FROM actors WHERE event_id=? AND actor_id=?').get(eventId,actorId);
      if(!actor||!actor.active) this._fail('ACTOR_DENIED');
      const permitted={EXCHANGE:['PIONEER'],CATCH:['LOCAL','UNBOUND','PIONEER'],RESTORE_1:['PIONEER'],RESTORE_2:['PIONEER'],RESUPPLY:['PIONEER'],HQ_UPLOAD:['PIONEER'],INSTALL:['FOP'],DEINSTALL:['FOP'],EVAC:['FOP','FOUNDER','PIONEER'],SHUTDOWN:['FOUNDER']};
      if(!permitted[kind]?.includes(actor.role)) this._fail('ROLE_DENIED');
      if(new Set(moves.map(m=>m.id)).size!==moves.length) this._fail('DUPLICATE_CORE');

      let nodeId=null,exchangeCooldownUntil=null,restoreLockUntil=null;
      if(kind==='HQ_UPLOAD'){
        if(moves.length<1||moves.length>3||capacityChange||nodeChanges.length||eventState) this._fail('UPLOAD_INVALID_SHAPE');
        let expected=0;
        for(const m of moves){
          if(m.fromType!=='PIONEER'||m.fromId!==actorId||m.toType!=='HQ'||m.toId!=='HQ') this._fail('UPLOAD_INVALID_ROUTE');
          const c=this.core(eventId,m.id); if(!c) this._fail('CORE_UNKNOWN');
          if(c.status!=='FIELD') this._fail('UPLOAD_CORE_NOT_FIELD');
          expected+=c.actual_energy;
        }
        if(energyCredit!==expected) this._fail('UPLOAD_CREDIT_MISMATCH');
      }else if(kind==='EXCHANGE'){
        if(energyCredit||capacityChange||nodeChanges.length||eventState||moves.length<2||moves.length>6||moves.length%2) this._fail('EXCHANGE_INVALID_SHAPE');
        const incoming=moves.filter(m=>m.fromType==='PIONEER'&&m.fromId===actorId&&m.toType==='NODE');
        const outgoing=moves.filter(m=>m.fromType==='NODE'&&m.toType==='PIONEER'&&m.toId===actorId);
        if(incoming.length!==outgoing.length||incoming.length*2!==moves.length||incoming.length>actor.capacity) this._fail('EXCHANGE_INVALID_ROUTE');
        const nodes=new Set([...incoming.map(m=>m.toId),...outgoing.map(m=>m.fromId)]);
        if(nodes.size!==1) this._fail('EXCHANGE_DIFFERENT_NODES');
        nodeId=[...nodes][0];
        if(this.db.prepare('SELECT state FROM nodes WHERE event_id=? AND node_id=?').get(eventId,nodeId)?.state!=='INSTALLED') this._fail('NODE_NOT_INSTALLED');
        const nodeCores=this.db.prepare("SELECT core_id,status FROM cores WHERE event_id=? AND owner_type='NODE' AND owner_id=?").all(eventId,nodeId);
        if(nodeCores.length!==3||nodeCores.some(c=>c.status!=='DEPLOYED')) this._fail('NODE_REQUIRES_THREE_CORES');
        for(const m of incoming){const c=this.core(eventId,m.id);if(!c||c.status!=='FIELD')this._fail('EXCHANGE_PERSONAL_CORE_INVALID')}
        for(const m of outgoing){const c=this.core(eventId,m.id);if(!c||c.status!=='DEPLOYED')this._fail('EXCHANGE_NODE_CORE_INVALID')}
        this._assertNodeUnlocked(eventId,actorId,nodeId);
        this._assertMissionFree(eventId,nodeId);
        this._assertReservationFree(eventId,operationId,actorId,nodeId,moves.map(m=>m.id));
        const cd=this.db.prepare("SELECT until_epoch FROM node_cooldowns WHERE event_id=? AND node_id=? AND kind='EXCHANGE'").get(eventId,nodeId);
        if(cd?.until_epoch>this.clock()) this._fail('NODE_EXCHANGE_COOLDOWN');
      }else if(kind==='RESTORE_1'||kind==='RESTORE_2'){
        const phase=kind==='RESTORE_2'?2:1;
        if(energyCredit||nodeChanges.length||eventState||capacityChange!==1||actor.capacity!==phase||moves.length!==2) this._fail(kind+'_INVALID_SHAPE');
        const incoming=moves.find(m=>m.fromType==='TRANSIT'&&m.fromId===actorId&&m.toType==='NODE');
        const outgoing=phase===1
          ? moves.find(m=>m.fromType==='NODE'&&m.toType==='PIONEER'&&m.toId===actorId)
          : moves.find(m=>m.fromType==='NODE'&&m.toType==='HQ'&&m.toId==='HQ');
        if(!incoming||!outgoing||incoming.toId!==outgoing.fromId) this._fail(kind+'_INVALID_ROUTE');
        nodeId=incoming.toId;
        if(this.db.prepare('SELECT state FROM nodes WHERE event_id=? AND node_id=?').get(eventId,nodeId)?.state!=='INSTALLED') this._fail('NODE_NOT_INSTALLED');
        const mission=missionId&&this.db.prepare('SELECT * FROM missions WHERE event_id=? AND mission_id=?').get(eventId,missionId);
        if(!mission||mission.kind!==kind||mission.actor_id!==actorId||mission.node_id!==nodeId||mission.core_id!==incoming.id||mission.state!=='ASSIGNED'||mission.expires_at<=this.clock()) this._fail('RESTORE_MISSION_DENIED');
        if(!this._restoreQualified(eventId,actorId,phase)) this._fail(kind+'_NOT_QUALIFIED');
        this._assertNodeUnlocked(eventId,actorId,nodeId);
        this._assertMissionFree(eventId,nodeId,missionId);
        this._assertReservationFree(eventId,operationId,actorId,nodeId,moves.map(m=>m.id));
        const nodeCores=this.db.prepare("SELECT core_id,visible_energy,status FROM cores WHERE event_id=? AND owner_type='NODE' AND owner_id=? ORDER BY visible_energy ASC,core_id ASC").all(eventId,nodeId);
        if(nodeCores.length!==3||nodeCores.some(c=>c.status!=='DEPLOYED')) this._fail('NODE_REQUIRES_THREE_CORES');
        if(outgoing.id!==nodeCores[0].core_id) this._fail('RESTORE_MUST_DISPLACE_LOWEST');
        const transit=this.core(eventId,incoming.id);
        if(!transit||transit.owner_type!=='TRANSIT'||transit.owner_id!==actorId||transit.status!=='IN_TRANSIT') this._fail('RESTORE_TRANSIT_NOT_ASSIGNED');
        const projected=nodeCores.reduce((sum,c)=>sum+c.visible_energy,0)-nodeCores[0].visible_energy+transit.visible_energy;
        if(projected<450) this._fail('RESTORE_ENERGY_TARGET_NOT_MET');
      }else if(kind==='RESUPPLY'){
        if(energyCredit||capacityChange||nodeChanges.length||eventState||moves.length!==2||!missionId) this._fail('RESUPPLY_INVALID_SHAPE');
        const mission=this.db.prepare('SELECT * FROM missions WHERE event_id=? AND mission_id=?').get(eventId,missionId);
        if(!mission||mission.kind!=='RESUPPLY'||mission.actor_id!==actorId||mission.state!=='ASSIGNED'||mission.expires_at<=this.clock()) this._fail('RESUPPLY_MISSION_DENIED');
        nodeId=mission.node_id;
        if(this.db.prepare('SELECT state FROM nodes WHERE event_id=? AND node_id=?').get(eventId,nodeId)?.state!=='INSTALLED') this._fail('NODE_NOT_INSTALLED');
        this._assertNodeUnlocked(eventId,actorId,nodeId);
        this._assertMissionFree(eventId,nodeId,missionId);
        this._assertReservationFree(eventId,operationId,actorId,nodeId,moves.map(m=>m.id));
        const incoming=moves.find(m=>m.id===mission.core_id&&m.fromType==='TRANSIT'&&m.fromId===actorId&&m.toType==='NODE'&&m.toId===nodeId);
        const outgoing=moves.find(m=>m.fromType==='NODE'&&m.fromId===nodeId&&m.toType==='PIONEER'&&m.toId===actorId);
        if(!incoming||!outgoing) this._fail('RESUPPLY_INVALID_ROUTE');
        const transit=this.core(eventId,incoming.id);
        if(!transit||transit.owner_type!=='TRANSIT'||transit.owner_id!==actorId||transit.status!=='IN_TRANSIT') this._fail('RESUPPLY_TRANSIT_NOT_ASSIGNED');
        const nodeCores=this.db.prepare("SELECT core_id,visible_energy,status FROM cores WHERE event_id=? AND owner_type='NODE' AND owner_id=? ORDER BY visible_energy ASC,core_id ASC").all(eventId,nodeId);
        if(nodeCores.length!==3||nodeCores.some(c=>c.status!=='DEPLOYED')) this._fail('NODE_REQUIRES_THREE_CORES');
        if(outgoing.id!==nodeCores[0].core_id) this._fail('RESUPPLY_MUST_DISPLACE_LOWEST');
        const personal=this.db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id=? AND owner_type='PIONEER' AND owner_id=? AND status='FIELD'").get(eventId,actorId).n;
        if(personal!==0) this._fail('RESUPPLY_REQUIRES_EMPTY_INVENTORY');
      }else if(kind==='INSTALL'){
        if(energyCredit||capacityChange||eventState||moves.length!==3||nodeChanges.length!==1) this._fail('INSTALL_INVALID_SHAPE');
        const change=nodeChanges[0]; if(!change?.id||change.state!=='INSTALLED') this._fail('INSTALL_INVALID_NODE_CHANGE');
        nodeId=change.id;
        const node=this.db.prepare('SELECT state FROM nodes WHERE event_id=? AND node_id=?').get(eventId,nodeId);
        if(!node||node.state==='INSTALLED') this._fail('INSTALL_NODE_UNAVAILABLE');
        if(this.db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id=? AND owner_type='NODE' AND owner_id=?").get(eventId,nodeId).n!==0) this._fail('INSTALL_NODE_NOT_EMPTY');
        this._assertMissionFree(eventId,nodeId);
        this._assertReservationFree(eventId,operationId,actorId,nodeId,moves.map(m=>m.id));
        if(moves.some(m=>m.fromType!=='TRANSIT'||m.fromId!==actorId||m.toType!=='NODE'||m.toId!==nodeId||m.status!=='DEPLOYED')) this._fail('INSTALL_INVALID_ROUTE');
        for(const m of moves){const c=this.core(eventId,m.id);if(!c||c.owner_type!=='TRANSIT'||c.owner_id!==actorId||c.status!=='IN_TRANSIT')this._fail('INSTALL_CARGO_INVALID')}
      }else if(kind==='DEINSTALL'){
        if(energyCredit||capacityChange||eventState||moves.length!==3||nodeChanges.length!==1) this._fail('DEINSTALL_INVALID_SHAPE');
        const change=nodeChanges[0]; if(!change?.id||change.state!=='DEINSTALLED') this._fail('DEINSTALL_INVALID_NODE_CHANGE');
        nodeId=change.id;
        if(this.db.prepare('SELECT state FROM nodes WHERE event_id=? AND node_id=?').get(eventId,nodeId)?.state!=='INSTALLED') this._fail('DEINSTALL_NODE_NOT_INSTALLED');
        this._assertMissionFree(eventId,nodeId);
        this._assertReservationFree(eventId,operationId,actorId,nodeId,moves.map(m=>m.id));
        const current=this.db.prepare("SELECT core_id,status FROM cores WHERE event_id=? AND owner_type='NODE' AND owner_id=? ORDER BY core_id").all(eventId,nodeId);
        if(current.length!==3||current.some(c=>c.status!=='DEPLOYED')) this._fail('NODE_REQUIRES_THREE_CORES');
        if(moves.some(m=>m.fromType!=='NODE'||m.fromId!==nodeId||m.toType!=='HQ'||m.toId!=='HQ'||m.status!=='RESERVE')) this._fail('DEINSTALL_INVALID_ROUTE');
        if(new Set(moves.map(m=>m.id)).size!==3||moves.some(m=>!current.some(c=>c.core_id===m.id))) this._fail('DEINSTALL_CORE_MISMATCH');
      }else this._fail('ACTION_NOT_IMPLEMENTED');

      for(const move of moves){
        const c=this.core(eventId,move.id); if(!c) this._fail('CORE_UNKNOWN');
        if(c.owner_type!==move.fromType||c.owner_id!==move.fromId) this._fail('OWNERSHIP_CHANGED');
        if(c.status==='EVAC_CARGO') this._fail('EVAC_CARGO_PROTECTED');
        if(!['HQ','PIONEER','NODE','TRANSIT'].includes(move.toType)||!move.toId) this._fail('INVALID_DESTINATION');
        if(move.toType==='PIONEER'&&!this.db.prepare('SELECT 1 FROM actors WHERE event_id=? AND actor_id=?').get(eventId,move.toId)) this._fail('ACTOR_UNKNOWN');
        if(move.toType==='NODE'&&!this.db.prepare('SELECT 1 FROM nodes WHERE event_id=? AND node_id=?').get(eventId,move.toId)) this._fail('NODE_UNKNOWN');
        this.db.prepare('UPDATE cores SET owner_type=?,owner_id=?,status=?,version=version+1 WHERE event_id=? AND core_id=?').run(move.toType,move.toId,move.status??c.status,eventId,move.id);
      }
      if(missionId&&['RESTORE_1','RESTORE_2','RESUPPLY'].includes(kind)){
        const updated=this.db.prepare("UPDATE missions SET state='COMPLETED',completed_operation_id=? WHERE event_id=? AND mission_id=? AND state='ASSIGNED'").run(operationId,eventId,missionId);
        if(updated.changes!==1) this._fail(kind.startsWith('RESTORE')?'RESTORE_MISSION_DENIED':'RESUPPLY_MISSION_DENIED');
      }
      if(capacityChange){
        if(kind!=='RESTORE_1'&&kind!=='RESTORE_2') this._fail('CAPACITY_CHANGE_DENIED');
        this.db.prepare('UPDATE actors SET capacity=capacity+? WHERE event_id=? AND actor_id=?').run(capacityChange,eventId,actorId);
      }
      for(const n of nodeChanges){
        if(!['INSTALL','DEINSTALL','EVAC'].includes(kind)) this._fail('NODE_CHANGE_DENIED');
        if(this.db.prepare('UPDATE nodes SET state=? WHERE event_id=? AND node_id=?').run(n.state,eventId,n.id).changes!==1) this._fail('NODE_UNKNOWN');
      }
      if(eventState){
        if(kind!=='SHUTDOWN'||eventState!=='COMPLETED') this._fail('EVENT_CHANGE_DENIED');
        this.db.prepare('UPDATE events SET state=? WHERE event_id=?').run(eventState,eventId);
      }
      if(energyCredit){
        if(kind!=='HQ_UPLOAD') this._fail('ENERGY_CREDIT_DENIED');
        if(this.db.prepare('UPDATE balances SET secured_energy=secured_energy+? WHERE event_id=? AND actor_id=?').run(energyCredit,eventId,actorId).changes!==1) this._fail('BALANCE_UNKNOWN');
      }
      if(kind==='EXCHANGE'){
        exchangeCooldownUntil=this.clock()+300;
        this.db.prepare("INSERT INTO node_cooldowns(event_id,node_id,kind,until_epoch,operation_id) VALUES (?,?,'EXCHANGE',?,?) ON CONFLICT(event_id,node_id,kind) DO UPDATE SET until_epoch=excluded.until_epoch,operation_id=excluded.operation_id").run(eventId,nodeId,exchangeCooldownUntil,operationId);
      }
      if(kind==='RESTORE_1'||kind==='RESTORE_2'){
        restoreLockUntil=this.clock()+3600;
        this.db.prepare("INSERT INTO actor_node_locks(event_id,actor_id,node_id,kind,until_epoch,operation_id) VALUES (?,?,?,'RESTORE',?,?) ON CONFLICT(event_id,actor_id,node_id,kind) DO UPDATE SET until_epoch=excluded.until_epoch,operation_id=excluded.operation_id").run(eventId,actorId,nodeId,restoreLockUntil,operationId);
      }
      this.assertIntegrity(eventId);
      const response={ok:true,eventId,operationId,kind,moved:moves.map(m=>m.id),energyCredit,replayed:false,...(exchangeCooldownUntil?{cooldownUntil:exchangeCooldownUntil}:{}),...(restoreLockUntil?{nodeLockUntil:restoreLockUntil}:{})};
      this.db.prepare('INSERT INTO operations(event_id,operation_id,actor_id,kind,payload_hash,response_json) VALUES (?,?,?,?,?,?)').run(eventId,operationId,actorId,kind,hash,JSON.stringify(response));
      moves.forEach((m,i)=>this.db.prepare('INSERT INTO audit(event_id,operation_id,seq,core_id,from_type,from_id,to_type,to_id) VALUES (?,?,?,?,?,?,?,?)').run(eventId,operationId,i,m.id,m.fromType,m.fromId,m.toType,m.toId));
      if(energyCredit) this.db.prepare('INSERT INTO audit(event_id,operation_id,seq,energy_delta) VALUES (?,?,?,?)').run(eventId,operationId,moves.length,energyCredit);
      if(transactionHook) transactionHook(this.db,{replay:false});
      this.db.exec('COMMIT'); return response;
    }catch(error){this.db.exec('ROLLBACK');throw error}
  }
}
