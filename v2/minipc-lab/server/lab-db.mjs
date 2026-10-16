import { randomBytes, randomInt, createHash } from 'node:crypto';

export function normalizeUid(value='') {
  return String(value).trim().toUpperCase().replace(/[^0-9A-Z]/g,'');
}

function ensureColumn(db,table,column,definition){
  const cols=db.prepare(`PRAGMA table_info(${table})`).all().map(x=>x.name);
  if(!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export function installLabSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS lab_access_cards (
      event_id TEXT NOT NULL, uid TEXT NOT NULL, actor_id TEXT NOT NULL,
      PRIMARY KEY(event_id, uid)
    );
    CREATE TABLE IF NOT EXISTS lab_node_tags (
      event_id TEXT NOT NULL, uid TEXT NOT NULL, node_id TEXT NOT NULL,
      PRIMARY KEY(event_id, uid)
    );
    CREATE TABLE IF NOT EXISTS lab_sessions (
      token_hash TEXT PRIMARY KEY, event_id TEXT NOT NULL, actor_id TEXT NOT NULL,
      created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS lab_scan_grants (
      grant_id TEXT PRIMARY KEY, event_id TEXT NOT NULL, actor_id TEXT NOT NULL,
      purpose TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL,
      uid TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
      consumed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS lab_exchange_intents (
      exchange_id TEXT PRIMARY KEY, event_id TEXT NOT NULL, actor_id TEXT NOT NULL,
      node_id TEXT NOT NULL, operation_id TEXT NOT NULL UNIQUE, access_code_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('PREPARED','CONFIRMED','FAILED')),
      incoming_core_id TEXT, outgoing_core_id TEXT, response_json TEXT,
      count INTEGER NOT NULL DEFAULT 1,
      incoming_core_ids_json TEXT NOT NULL DEFAULT '[]',
      outgoing_core_ids_json TEXT NOT NULL DEFAULT '[]'
    );
  `);
  ensureColumn(db,'lab_exchange_intents','count','INTEGER NOT NULL DEFAULT 1');
  ensureColumn(db,'lab_exchange_intents','incoming_core_ids_json',"TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db,'lab_exchange_intents','outgoing_core_ids_json',"TEXT NOT NULL DEFAULT '[]'");
}

export function tokenHash(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

export function createLabStore(core, {clock=()=>Math.floor(Date.now()/1000), sessionTtl=3600, grantTtl=90, exchangeTtl=300}={}) {
  const db=core.db;
  installLabSchema(db);
  const clean=()=>{
    const now=clock();
    db.prepare('DELETE FROM lab_sessions WHERE expires_at<=?').run(now);
    db.prepare('DELETE FROM lab_scan_grants WHERE expires_at<=? AND consumed_at IS NULL').run(now);
  };
  const parseList=(value)=>{try{const x=JSON.parse(value||'[]');return Array.isArray(x)?x:[]}catch{return []}};
  const sessionRole=(session,allowed,code='ROLE_DENIED')=>{if(!allowed.includes(session.role))throw Error(code)};

  return {
    db,
    seedAccessCard(eventId,uid,actorId){
      db.prepare('INSERT OR REPLACE INTO lab_access_cards(event_id,uid,actor_id) VALUES (?,?,?)').run(eventId,normalizeUid(uid),actorId);
    },
    seedNodeTag(eventId,uid,nodeId){
      db.prepare('INSERT OR REPLACE INTO lab_node_tags(event_id,uid,node_id) VALUES (?,?,?)').run(eventId,normalizeUid(uid),nodeId);
    },
    startSession(eventId,uid){
      clean();
      const card=db.prepare('SELECT actor_id FROM lab_access_cards WHERE event_id=? AND uid=?').get(eventId,normalizeUid(uid));
      if(!card) throw Error('ACCESS_CARD_DENIED');
      const actor=db.prepare('SELECT role,active FROM actors WHERE event_id=? AND actor_id=?').get(eventId,card.actor_id);
      if(!actor||actor.active!==1||!['FOUNDER','FOP','PIONEER','LOCAL','UNBOUND'].includes(actor.role)) throw Error('SESSION_ACTOR_DENIED');
      const token=randomBytes(32).toString('base64url'), now=clock();
      db.prepare('INSERT INTO lab_sessions(token_hash,event_id,actor_id,created_at,expires_at) VALUES (?,?,?,?,?)').run(tokenHash(token),eventId,card.actor_id,now,now+sessionTtl);
      return {token,actorId:card.actor_id,role:actor.role,expiresAt:now+sessionTtl};
    },
    session(token){
      clean();
      if(!token) throw Error('NO_SESSION');
      const row=db.prepare('SELECT event_id,actor_id,expires_at FROM lab_sessions WHERE token_hash=?').get(tokenHash(token));
      if(!row||row.expires_at<=clock()) throw Error('NO_SESSION');
      const actor=db.prepare('SELECT role,capacity,active FROM actors WHERE event_id=? AND actor_id=?').get(row.event_id,row.actor_id);
      if(!actor||actor.active!==1) throw Error('SESSION_ACTOR_DENIED');
      return {...row,...actor};
    },
    accessTarget(session,uid){
      const card=db.prepare('SELECT actor_id FROM lab_access_cards WHERE event_id=? AND uid=?').get(session.event_id,normalizeUid(uid));
      if(!card) throw Error('ACCESS_CARD_DENIED');
      const actor=db.prepare('SELECT actor_id,role,active FROM actors WHERE event_id=? AND actor_id=?').get(session.event_id,card.actor_id);
      if(!actor||actor.active!==1) throw Error('ACCESS_CARD_DENIED');
      return actor;
    },
    nodeTarget(session,uid){
      const node=db.prepare('SELECT n.node_id,n.state FROM lab_node_tags t JOIN nodes n ON n.event_id=t.event_id AND n.node_id=t.node_id WHERE t.event_id=? AND t.uid=?').get(session.event_id,normalizeUid(uid));
      if(!node) throw Error('NODE_TAG_DENIED');
      return node;
    },
    coreTarget(session,uid){
      const row=db.prepare('SELECT core_id,owner_type,owner_id,visible_energy,status FROM cores WHERE event_id=? AND uid=?').get(session.event_id,normalizeUid(uid));
      if(!row) throw Error('CORE_UID_UNKNOWN');
      return row;
    },
    uploadBayTarget(session,uid){
      const bay=db.prepare('SELECT bay_id FROM hq_upload_bays WHERE event_id=? AND uid=? AND active=1').get(session.event_id,normalizeUid(uid));
      if(!bay) throw Error('UPLOAD_POINT_INVALID');
      return bay;
    },
    issueNodeGrant(session,uid){
      sessionRole(session,['PIONEER'],'PIONEER_REQUIRED');
      const normalized=normalizeUid(uid);
      const node=db.prepare('SELECT node_id FROM lab_node_tags WHERE event_id=? AND uid=?').get(session.event_id,normalized);
      if(!node) throw Error('NODE_TAG_DENIED');
      if(db.prepare('SELECT state FROM nodes WHERE event_id=? AND node_id=?').get(session.event_id,node.node_id)?.state!=='INSTALLED') throw Error('NODE_NOT_INSTALLED');
      const count=db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id=? AND owner_type='NODE' AND owner_id=?").get(session.event_id,node.node_id).n;
      if(count!==3) throw Error('NODE_REQUIRES_THREE_CORES');
      const now=clock(), grantId=randomBytes(18).toString('base64url');
      db.prepare('INSERT INTO lab_scan_grants(grant_id,event_id,actor_id,purpose,target_type,target_id,uid,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(grantId,session.event_id,session.actor_id,'EXCHANGE_NODE','NODE',node.node_id,normalized,now,now+grantTtl);
      const cd=db.prepare("SELECT until_epoch FROM node_cooldowns WHERE event_id=? AND node_id=? AND kind='EXCHANGE'").get(session.event_id,node.node_id)?.until_epoch||0;
      return {grantId,nodeId:node.node_id,expiresAt:now+grantTtl,cooldownUntil:cd>now?cd:null};
    },
    prepareExchange(session,{grantId,count=1}){
      sessionRole(session,['PIONEER'],'PIONEER_REQUIRED');
      if(!Number.isInteger(count)||count<1||count>3) throw Error('EXCHANGE_COUNT_INVALID');
      const now=clock();
      const grant=db.prepare('SELECT * FROM lab_scan_grants WHERE grant_id=?').get(grantId);
      if(!grant||grant.event_id!==session.event_id||grant.actor_id!==session.actor_id||grant.purpose!=='EXCHANGE_NODE'||grant.expires_at<=now||grant.consumed_at) throw Error('NODE_GRANT_DENIED');
      const cd=db.prepare("SELECT until_epoch FROM node_cooldowns WHERE event_id=? AND node_id=? AND kind='EXCHANGE'").get(session.event_id,grant.target_id)?.until_epoch||0;
      if(cd>now) throw Error('NODE_EXCHANGE_COOLDOWN');
      const actor=db.prepare('SELECT capacity FROM actors WHERE event_id=? AND actor_id=?').get(session.event_id,session.actor_id);
      const personal=db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id=? AND owner_type='PIONEER' AND owner_id=? AND status='FIELD'").get(session.event_id,session.actor_id).n;
      if(count>actor.capacity||count>personal) throw Error('EXCHANGE_COUNT_EXCEEDS_CAPACITY');
      const nodeCount=db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id=? AND owner_type='NODE' AND owner_id=? AND status='DEPLOYED'").get(session.event_id,grant.target_id).n;
      if(nodeCount!==3) throw Error('NODE_REQUIRES_THREE_CORES');
      const exchangeId=randomBytes(18).toString('base64url');
      const operationId='LAB-EX-'+randomBytes(12).toString('hex');
      const accessCode=String(randomInt(0,10000)).padStart(4,'0');
      db.exec('BEGIN IMMEDIATE');
      try{
        const used=db.prepare('UPDATE lab_scan_grants SET consumed_at=? WHERE grant_id=? AND consumed_at IS NULL AND expires_at>?').run(now,grantId,now);
        if(used.changes!==1) throw Error('NODE_GRANT_DENIED');
        db.prepare('INSERT INTO lab_exchange_intents(exchange_id,event_id,actor_id,node_id,operation_id,access_code_hash,created_at,expires_at,state,count,incoming_core_ids_json,outgoing_core_ids_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(exchangeId,session.event_id,session.actor_id,grant.target_id,operationId,tokenHash(accessCode),now,now+exchangeTtl,'PREPARED',count,'[]','[]');
        db.exec('COMMIT');
      }catch(e){db.exec('ROLLBACK');throw e;}
      return {exchangeId,nodeId:grant.target_id,count,accessCode,expiresAt:now+exchangeTtl};
    },
    scanExchangeCore(session,{exchangeId,uid}){
      sessionRole(session,['PIONEER'],'PIONEER_REQUIRED');
      const normalized=normalizeUid(uid), now=clock();
      const intent=db.prepare('SELECT * FROM lab_exchange_intents WHERE exchange_id=?').get(exchangeId);
      if(!intent||intent.event_id!==session.event_id||intent.actor_id!==session.actor_id||intent.expires_at<=now||intent.state!=='PREPARED') throw Error('EXCHANGE_INTENT_DENIED');
      const coreRow=db.prepare('SELECT core_id,owner_type,owner_id,visible_energy,status FROM cores WHERE event_id=? AND uid=?').get(session.event_id,normalized);
      if(!coreRow) throw Error('CORE_UID_UNKNOWN');
      let key,kind;
      if(coreRow.owner_type==='PIONEER'&&coreRow.owner_id===session.actor_id&&coreRow.status==='FIELD'){key='incoming_core_ids_json';kind='PIONEER_CORE';}
      else if(coreRow.owner_type==='NODE'&&coreRow.owner_id===intent.node_id&&coreRow.status==='DEPLOYED'){key='outgoing_core_ids_json';kind='NODE_CORE';}
      else throw Error('CORE_NOT_ELIGIBLE_FOR_EXCHANGE');
      const incoming=parseList(intent.incoming_core_ids_json),outgoing=parseList(intent.outgoing_core_ids_json);
      if([...incoming,...outgoing].includes(coreRow.core_id)) throw Error('DUPLICATE_CORE');
      const target=key==='incoming_core_ids_json'?incoming:outgoing;
      if(target.length>=intent.count) throw Error('EXCHANGE_SIDE_COMPLETE');
      target.push(coreRow.core_id);
      db.prepare(`UPDATE lab_exchange_intents SET ${key}=? WHERE exchange_id=? AND state='PREPARED'`).run(JSON.stringify(target),exchangeId);
      const inCount=key==='incoming_core_ids_json'?target.length:incoming.length;
      const outCount=key==='outgoing_core_ids_json'?target.length:outgoing.length;
      return {exchangeId,kind,coreId:coreRow.core_id,visibleEnergy:coreRow.visible_energy,count:intent.count,inCount,outCount,ready:inCount===intent.count&&outCount===intent.count};
    },
    confirmExchange(session,{exchangeId,accessCode}){
      sessionRole(session,['PIONEER'],'PIONEER_REQUIRED');
      const intent=db.prepare('SELECT * FROM lab_exchange_intents WHERE exchange_id=?').get(exchangeId);
      if(!intent||intent.event_id!==session.event_id||intent.actor_id!==session.actor_id) throw Error('EXCHANGE_INTENT_DENIED');
      if(intent.state==='CONFIRMED'&&intent.response_json) return {...JSON.parse(intent.response_json),replayed:true};
      if(intent.state!=='PREPARED'||intent.expires_at<=clock()) throw Error('EXCHANGE_INTENT_EXPIRED');
      if(tokenHash(accessCode)!==intent.access_code_hash) throw Error('ACCESS_CODE_DENIED');
      const incomingIds=parseList(intent.incoming_core_ids_json),outgoingIds=parseList(intent.outgoing_core_ids_json);
      if(incomingIds.length!==intent.count||outgoingIds.length!==intent.count) throw Error('EXCHANGE_SCANS_INCOMPLETE');
      const moves=[
        ...incomingIds.map(id=>({id,fromType:'PIONEER',fromId:session.actor_id,toType:'NODE',toId:intent.node_id,status:'DEPLOYED'})),
        ...outgoingIds.map(id=>({id,fromType:'NODE',fromId:intent.node_id,toType:'PIONEER',toId:session.actor_id,status:'FIELD'}))
      ];
      const result=core.run({eventId:session.event_id,operationId:intent.operation_id,actorId:session.actor_id,kind:'EXCHANGE',moves},(tx,{replay})=>{
        const response={ok:true,eventId:session.event_id,exchangeId,operationId:intent.operation_id,nodeId:intent.node_id,count:intent.count,incomingCoreIds:incomingIds,outgoingCoreIds:outgoingIds,incomingCoreId:incomingIds[0],outgoingCoreId:outgoingIds[0],replayed:!!replay};
        tx.prepare("UPDATE lab_exchange_intents SET state='CONFIRMED',response_json=? WHERE exchange_id=?").run(JSON.stringify(response),exchangeId);
      });
      const response={ok:true,eventId:session.event_id,exchangeId,operationId:intent.operation_id,nodeId:intent.node_id,count:intent.count,incomingCoreIds:incomingIds,outgoingCoreIds:outgoingIds,incomingCoreId:incomingIds[0],outgoingCoreId:outgoingIds[0],replayed:!!result.replayed,cooldownUntil:result.cooldownUntil};
      if(!result.replayed) db.prepare("UPDATE lab_exchange_intents SET response_json=? WHERE exchange_id=?").run(JSON.stringify(response),exchangeId);
      return response;
    },
    state(session){
      const actor=db.prepare('SELECT actor_id,role,capacity,active FROM actors WHERE event_id=? AND actor_id=?').get(session.event_id,session.actor_id);
      const personal=db.prepare("SELECT core_id,uid,visible_energy,status FROM cores WHERE event_id=? AND owner_type='PIONEER' AND owner_id=? ORDER BY core_id").all(session.event_id,session.actor_id);
      const nodes=db.prepare("SELECT node_id,state FROM nodes WHERE event_id=? ORDER BY node_id").all(session.event_id).map(n=>({...n,cores:db.prepare("SELECT core_id,uid,visible_energy,status FROM cores WHERE event_id=? AND owner_type='NODE' AND owner_id=? ORDER BY core_id").all(session.event_id,n.node_id)}));
      const recent=db.prepare('SELECT operation_id,kind,created_at,response_json FROM operations WHERE event_id=? AND actor_id=? ORDER BY created_at DESC LIMIT 10').all(session.event_id,session.actor_id).map(x=>({...x,response:JSON.parse(x.response_json)}));
      return {eventId:session.event_id,actor,personal,nodes,recent};
    }
  };
}
