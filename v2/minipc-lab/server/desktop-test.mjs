function reject(code, extra={}) {
  const error = Error(code);
  Object.assign(error, extra);
  throw error;
}

function byRole(rows){
  const out={FOUNDER:0,FOP:0,PIONEER:0,LOCAL:0,UNBOUND:0};
  for(const row of rows) out[row.role]=(out[row.role]||0)+1;
  return out;
}

export function createDesktopTest(core, mode){
  const db=core.db;
  db.exec(`CREATE TABLE IF NOT EXISTS lab_desktop_test (
    event_id TEXT PRIMARY KEY,
    plan_json TEXT NOT NULL,
    initialized_at INTEGER,
    started_at INTEGER,
    ended_at INTEGER,
    end_snapshot_json TEXT
  )`);

  const requireMode=()=>{ if(mode!=='desktop') reject('DESKTOP_TEST_MODE_REQUIRED'); };
  const receipt=eventId=>{
    const row=db.prepare('SELECT * FROM lab_desktop_test WHERE event_id=?').get(eventId);
    if(!row) return null;
    let plan={}, endSnapshot=null;
    try{ plan=JSON.parse(row.plan_json||'{}'); }catch{ reject('DESKTOP_TEST_PLAN_CORRUPT'); }
    try{ endSnapshot=row.end_snapshot_json?JSON.parse(row.end_snapshot_json):null; }catch{ reject('DESKTOP_TEST_END_SNAPSHOT_CORRUPT'); }
    return {...row,plan,endSnapshot};
  };
  const cards=eventId=>db.prepare(`
    SELECT c.actor_id id,a.role,c.uid
    FROM lab_access_cards c
    JOIN actors a ON a.event_id=c.event_id AND a.actor_id=c.actor_id
    WHERE c.event_id=?
    ORDER BY CASE a.role WHEN 'FOUNDER' THEN 0 WHEN 'FOP' THEN 1 WHEN 'PIONEER' THEN 2 WHEN 'LOCAL' THEN 3 ELSE 4 END,c.actor_id
  `).all(eventId);
  const nodeTags=eventId=>db.prepare(`
    SELECT t.node_id id,t.uid,n.state
    FROM lab_node_tags t JOIN nodes n ON n.event_id=t.event_id AND n.node_id=t.node_id
    WHERE t.event_id=? ORDER BY t.node_id
  `).all(eventId);
  const reserveCores=eventId=>db.prepare(`
    SELECT core_id id,visible_energy energy
    FROM cores
    WHERE event_id=? AND owner_type='HQ' AND owner_id='HQ' AND status='RESERVE'
    ORDER BY visible_energy DESC,core_id
  `).all(eventId);
  const hqRows=eventId=>db.prepare(`
    SELECT bay_id id,uid,active
    FROM hq_upload_bays
    WHERE event_id=? AND uid NOT LIKE 'PENDING-%'
    ORDER BY bay_id
  `).all(eventId);

  function makePlan(eventId){
    const enrolled=cards(eventId);
    const roles=byRole(enrolled);
    const pioneers=enrolled.filter(x=>x.role==='PIONEER').map(x=>x.id);
    const fops=enrolled.filter(x=>x.role==='FOP').map(x=>x.id);
    const hunters=enrolled.filter(x=>x.role==='LOCAL'||x.role==='UNBOUND').map(x=>x.id);
    const nodes=nodeTags(eventId);
    const hq=hqRows(eventId);
    const cores=reserveCores(eventId);
    const pool=[...cores];
    const pioneerAssignments=[];

    // Keep enough real reserve cores for one complete FOP 3-core loadout whenever
    // that can coexist with at least one real Pioneer start core.
    const preserveForFop=(fops.length>0&&nodes.length>0&&pool.length>=4)?3:0;
    const pioneerBudget=Math.max(0,pool.length-preserveForFop);
    for(const actorId of pioneers.slice(0,pioneerBudget)){
      const coreRow=pool.shift();
      if(!coreRow)break;
      pioneerAssignments.push({actorId,coreId:coreRow.id,energy:coreRow.energy});
    }

    const fopAssignments=[];
    if(fops.length>0&&nodes.length>0&&pool.length>=3){
      for(let i=0;i<3;i++){
        const coreRow=pool.shift();
        fopAssignments.push({actorId:fops[0],coreId:coreRow.id,energy:coreRow.energy});
      }
    }

    const afterStartReserve=pool.map(x=>x.id);
    const playable=[
      {code:'ROLE_LOGIN',available:enrolled.length>1,detail:enrolled.length>1?'Registrierte Rollen können sich mit ihren echten Access Cards anmelden.':'Noch keine zusätzliche Rollenkarte registriert.'},
      {code:'FOP_NODE',available:fopAssignments.length===3&&nodes.length>0,detail:fopAssignments.length===3&&nodes.length>0?'FOP kann mindestens einen registrierten Node mit exakt drei echten Cores installieren.':'Benötigt FOP, mindestens einen Node und insgesamt genug reale N-Cores.'},
      {code:'EXCHANGE',available:pioneerAssignments.length>0&&fopAssignments.length===3&&nodes.length>0,detail:pioneerAssignments.length>0&&fopAssignments.length===3&&nodes.length>0?'Pioneer-Exchange ist nach der Node-Installation erreichbar.':'Benötigt Pioneer mit Start-Core plus installierbaren 3-Core-Node.'},
      {code:'CATCH',available:pioneerAssignments.length>0&&hunters.length>0,detail:pioneerAssignments.length>0&&hunters.length>0?'Catch ist mit Pioneer + Local oder Unbound erreichbar.':'Benötigt Pioneer mit realem Core und Local oder Unbound.'},
      {code:'HQ_UPLOAD',available:pioneerAssignments.length>0&&hq.length>0,detail:pioneerAssignments.length>0&&hq.length>0?'HQ Upload ist mit realem HQ-Tag erreichbar.':'Benötigt Pioneer mit realem Core und registrierten HQ-Tag.'},
      {code:'RESTORE',available:pioneerAssignments.length>0&&fopAssignments.length===3&&afterStartReserve.length>0,detail:pioneerAssignments.length>0&&fopAssignments.length===3&&afterStartReserve.length>0?'RESTORE kann nach der bestehenden Pioneer-Qualifikation aus echter HQ-Reserve zugewiesen werden.':'Benötigt Exchange-fähigen Aufbau plus mindestens einen Reserve-Core.'},
      {code:'RE_SUPPLY',available:pioneerAssignments.length>0&&fopAssignments.length===3&&hq.length>0&&afterStartReserve.length>0,detail:pioneerAssignments.length>0&&fopAssignments.length===3&&hq.length>0&&afterStartReserve.length>0?'RE-SUPPLY bleibt über den bestehenden Voll-Upload-Pfad erreichbar.':'Benötigt Exchange/HQ sowie echte Reserve für den Pflichtauftrag.'},
      {code:'SECURE_APPROACH',available:pioneerAssignments.length>0&&hq.length>0,detail:pioneerAssignments.length>0&&hq.length>0?'Secure Approach bleibt unverändert; Aktivierung erst bei mindestens 150 E gesicherter Energie.':'Benötigt Pioneer und registrierten HQ-Tag.'},
      {code:'EVAC',available:false,detail:'EVAC wird nicht simuliert. Es erscheint nur, wenn die unveränderten regulären EVAC-Gates des realen Spielstands erfüllt sind.'}
    ];
    return {roles,pioneers,fops,hunters,nodes:nodes.map(x=>x.id),hq:hq.map(x=>x.id),pioneerAssignments,fopAssignments,afterStartReserve,playable};
  }

  function currentCapabilities(eventId){
    const enrolled=cards(eventId), roles=byRole(enrolled);
    const registeredPioneers=new Set(enrolled.filter(x=>x.role==='PIONEER').map(x=>x.id));
    const registeredFops=new Set(enrolled.filter(x=>x.role==='FOP').map(x=>x.id));
    const pioneerField=db.prepare("SELECT owner_id,COUNT(*) count FROM cores WHERE event_id=? AND owner_type='PIONEER' AND status='FIELD' GROUP BY owner_id").all(eventId)
      .filter(x=>registeredPioneers.has(x.owner_id)).reduce((sum,x)=>sum+x.count,0);
    const fopTransit=db.prepare("SELECT owner_id,COUNT(*) count FROM cores WHERE event_id=? AND owner_type='TRANSIT' AND status='IN_TRANSIT' GROUP BY owner_id").all(eventId)
      .filter(x=>registeredFops.has(x.owner_id)).reduce((sum,x)=>sum+x.count,0);
    const nodes=nodeTags(eventId);
    const installed=nodes.filter(x=>x.state==='INSTALLED').length;
    const reserve=reserveCores(eventId).length;
    const hq=hqRows(eventId).length;
    const canBuildNode=installed>0||(roles.FOP>0&&nodes.length>0&&(fopTransit>=3||reserve>=3));
    const exchange=pioneerField>0&&canBuildNode;
    let evacState=null;
    try{evacState=db.prepare('SELECT state FROM evac_control WHERE event_id=?').get(eventId)?.state||null}catch{}
    return [
      {code:'ROLE_LOGIN',available:enrolled.length>1,detail:enrolled.length>1?'Registrierte Rollen können sich mit ihren echten Access Cards anmelden.':'Noch keine zusätzliche Rollenkarte registriert.'},
      {code:'FOP_NODE',available:canBuildNode,detail:canBuildNode?'FOP kann einen real registrierten Node mit exakt drei echten Cores betreiben.':'Benötigt FOP, mindestens einen registrierten Node und drei reale Transit-/Reserve-Cores.'},
      {code:'EXCHANGE',available:exchange,detail:exchange?'Pioneer-Exchange ist mit dem realen Bestand erreichbar.':'Benötigt Pioneer mit realem FIELD-Core und einen installierten oder installierbaren 3-Core-Node.'},
      {code:'CATCH',available:pioneerField>0&&(roles.LOCAL>0||roles.UNBOUND>0),detail:pioneerField>0&&(roles.LOCAL>0||roles.UNBOUND>0)?'Catch ist mit Pioneer + Local oder Unbound erreichbar.':'Benötigt Pioneer mit realem Core und Local oder Unbound.'},
      {code:'HQ_UPLOAD',available:pioneerField>0&&hq>0,detail:pioneerField>0&&hq>0?'HQ Upload ist mit realem HQ-Tag erreichbar.':'Benötigt Pioneer mit realem Core und registrierten HQ-Tag.'},
      {code:'RESTORE',available:exchange&&reserve>0,detail:exchange&&reserve>0?'RESTORE kann nach der bestehenden Pioneer-Qualifikation aus echter HQ-Reserve zugewiesen werden.':'Benötigt Exchange-fähigen Aufbau plus mindestens einen echten Reserve-Core.'},
      {code:'RE_SUPPLY',available:exchange&&hq>0&&reserve>0,detail:exchange&&hq>0&&reserve>0?'RE-SUPPLY bleibt über den bestehenden Voll-Upload-Pfad erreichbar.':'Benötigt Exchange/HQ sowie echte Reserve für den Pflichtauftrag.'},
      {code:'SECURE_APPROACH',available:pioneerField>0&&hq>0,detail:pioneerField>0&&hq>0?'Secure Approach bleibt unverändert; Aktivierung erst bei mindestens 150 E gesicherter Energie.':'Benötigt Pioneer mit realem Core und registrierten HQ-Tag.'},
      {code:'EVAC',available:['PRE_EVAC_READY','STARTED'].includes(evacState),detail:['PRE_EVAC_READY','STARTED'].includes(evacState)?'Die unveränderten regulären EVAC-Gates sind serverseitig erreicht.':'EVAC wird im TESTMODUS nicht simuliert oder freigeschaltet.'}
    ];
  }

  function status(eventId){
    requireMode();
    const event=db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId);
    if(!event) reject('EVENT_UNKNOWN');
    const enrolled=cards(eventId), nodes=nodeTags(eventId), cores=db.prepare('SELECT COUNT(*) n FROM cores WHERE event_id=?').get(eventId).n, hq=hqRows(eventId);
    const roles=byRole(enrolled), saved=receipt(eventId);
    const basePlan=saved?.plan||makePlan(eventId);
    const playable=currentCapabilities(eventId);
    const plan={...basePlan,playable};
    return {
      mode:'TESTMODUS',
      eventState:event.state,
      canRegister:['READY','INITIALIZED','FIELD_ACTIVE'].includes(event.state),
      canInitialize:event.state==='READY',
      canStart:event.state==='INITIALIZED'&&!!saved,
      canEnd:['READY','INITIALIZED','FIELD_ACTIVE'].includes(event.state),
      ended:event.state==='TEST_ENDED',
      counts:{cards:enrolled.length,nodes:nodes.length,cores,hq:hq.length,roles},
      playable,
      plan,
      endSnapshot:saved?.endSnapshot||null
    };
  }

  function initialize(eventId, founderId){
    requireMode();
    const existing=receipt(eventId);
    if(existing?.initialized_at) return {eventId,status:'INITIALIZED',replayed:true,plan:existing.plan};
    const event=db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId);
    if(event?.state!=='READY') reject('DESKTOP_TEST_INITIALIZE_STATE_INVALID');
    const founder=db.prepare('SELECT role,active FROM actors WHERE event_id=? AND actor_id=?').get(eventId,founderId);
    if(founder?.role!=='FOUNDER'||founder.active!==1) reject('DESKTOP_TEST_FOUNDER_REQUIRED');
    const plan=makePlan(eventId);

    db.exec('BEGIN IMMEDIATE');
    try{
      for(const x of plan.pioneerAssignments){
        const changed=db.prepare(`
          UPDATE cores SET owner_type='PIONEER',owner_id=?,status='FIELD',version=version+1
          WHERE event_id=? AND core_id=? AND owner_type='HQ' AND owner_id='HQ' AND status='RESERVE'
        `).run(x.actorId,eventId,x.coreId).changes;
        if(changed!==1) reject('DESKTOP_TEST_CORE_CHANGED');
      }
      for(const x of plan.fopAssignments){
        const changed=db.prepare(`
          UPDATE cores SET owner_type='TRANSIT',owner_id=?,status='IN_TRANSIT',version=version+1
          WHERE event_id=? AND core_id=? AND owner_type='HQ' AND owner_id='HQ' AND status='RESERVE'
        `).run(x.actorId,eventId,x.coreId).changes;
        if(changed!==1) reject('DESKTOP_TEST_CORE_CHANGED');
      }
      if(db.prepare("UPDATE events SET state='INITIALIZED' WHERE event_id=? AND state='READY'").run(eventId).changes!==1) reject('DESKTOP_TEST_STATE_CHANGED');
      db.prepare(`
        INSERT INTO lab_desktop_test(event_id,plan_json,initialized_at)
        VALUES (?,?,?)
        ON CONFLICT(event_id) DO UPDATE SET plan_json=excluded.plan_json,initialized_at=excluded.initialized_at
      `).run(eventId,JSON.stringify(plan),core.clock());
      core.assertIntegrity(eventId);
      db.exec('COMMIT');
      return {eventId,status:'INITIALIZED',replayed:false,plan};
    }catch(error){db.exec('ROLLBACK');throw error}
  }

  function start(eventId){
    requireMode();
    const saved=receipt(eventId);
    if(!saved) reject('DESKTOP_TEST_SETUP_MISSING');
    const event=db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId);
    if(event?.state==='FIELD_ACTIVE') return {eventId,status:'FIELD_ACTIVE',replayed:true};
    if(event?.state!=='INITIALIZED') reject('DESKTOP_TEST_START_STATE_INVALID');
    db.exec('BEGIN IMMEDIATE');
    try{
      if(db.prepare("UPDATE events SET state='FIELD_ACTIVE' WHERE event_id=? AND state='INITIALIZED'").run(eventId).changes!==1) reject('DESKTOP_TEST_STATE_CHANGED');
      db.prepare('UPDATE lab_desktop_test SET started_at=COALESCE(started_at,?) WHERE event_id=?').run(core.clock(),eventId);
      core.assertIntegrity(eventId);
      db.exec('COMMIT');
      return {eventId,status:'FIELD_ACTIVE',replayed:false};
    }catch(error){db.exec('ROLLBACK');throw error}
  }

  function snapshot(eventId,stateBefore){
    const roles=byRole(cards(eventId));
    const nodes=db.prepare('SELECT state,COUNT(*) count FROM nodes WHERE event_id=? GROUP BY state ORDER BY state').all(eventId);
    const owners=db.prepare('SELECT owner_type,status,COUNT(*) count,SUM(visible_energy) energy FROM cores WHERE event_id=? GROUP BY owner_type,status ORDER BY owner_type,status').all(eventId);
    const missions=db.prepare("SELECT kind,state,COUNT(*) count FROM missions WHERE event_id=? GROUP BY kind,state ORDER BY kind,state").all(eventId);
    const operations=db.prepare('SELECT kind,COUNT(*) count FROM operations WHERE event_id=? GROUP BY kind ORDER BY kind').all(eventId);
    const evac=db.prepare('SELECT state,started_at,completed_at FROM evac_control WHERE event_id=?').get(eventId)||null;
    return {stateBefore,endedAt:core.clock(),roles,nodes,owners,missions,operations,evac};
  }

  function end(eventId,founderId){
    requireMode();
    const founder=db.prepare('SELECT role,active FROM actors WHERE event_id=? AND actor_id=?').get(eventId,founderId);
    if(founder?.role!=='FOUNDER'||founder.active!==1) reject('DESKTOP_TEST_FOUNDER_REQUIRED');
    const event=db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId);
    if(!event) reject('EVENT_UNKNOWN');
    if(event.state==='TEST_ENDED'){
      const saved=receipt(eventId);
      return {eventId,status:'TEST_ENDED',replayed:true,snapshot:saved?.endSnapshot||null};
    }
    if(!['READY','INITIALIZED','FIELD_ACTIVE'].includes(event.state)) reject('DESKTOP_TEST_END_STATE_INVALID');
    core.assertIntegrity(eventId);
    const endSnapshot=snapshot(eventId,event.state);
    const plan=receipt(eventId)?.plan||makePlan(eventId);

    db.exec('BEGIN IMMEDIATE');
    try{
      if(db.prepare("UPDATE events SET state='TEST_ENDED' WHERE event_id=? AND state=?").run(eventId,event.state).changes!==1) reject('DESKTOP_TEST_STATE_CHANGED');
      db.prepare(`
        INSERT INTO lab_desktop_test(event_id,plan_json,ended_at,end_snapshot_json)
        VALUES (?,?,?,?)
        ON CONFLICT(event_id) DO UPDATE SET ended_at=excluded.ended_at,end_snapshot_json=excluded.end_snapshot_json
      `).run(eventId,JSON.stringify(plan),endSnapshot.endedAt,JSON.stringify(endSnapshot));
      db.exec('COMMIT');
      return {eventId,status:'TEST_ENDED',replayed:false,snapshot:endSnapshot};
    }catch(error){db.exec('ROLLBACK');throw error}
  }

  function attachLatePioneer(eventId,actorId){
    requireMode();
    const event=db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId);
    if(!event||!['INITIALIZED','FIELD_ACTIVE'].includes(event.state))return {assigned:false,reason:'TEST_NOT_PREPARED'};
    const actor=db.prepare('SELECT role,capacity,active FROM actors WHERE event_id=? AND actor_id=?').get(eventId,actorId);
    if(actor?.role!=='PIONEER'||actor.active!==1)return {assigned:false,reason:'PIONEER_REQUIRED'};
    if(db.prepare("SELECT 1 FROM cores WHERE event_id=? AND owner_type='PIONEER' AND owner_id=? AND status='FIELD' LIMIT 1").get(eventId,actorId))return {assigned:false,reason:'ALREADY_HAS_FIELD_CORE'};
    const activeMissionIds=new Set(db.prepare("SELECT core_id FROM missions WHERE event_id=? AND state='ASSIGNED' AND expires_at>?").all(eventId,core.clock()).map(x=>x.core_id));
    const candidate=reserveCores(eventId).find(x=>!activeMissionIds.has(x.id));
    if(!candidate)return {assigned:false,reason:'NO_REAL_RESERVE_CORE'};
    db.exec('BEGIN IMMEDIATE');
    try{
      const changed=db.prepare("UPDATE cores SET owner_type='PIONEER',owner_id=?,status='FIELD',version=version+1 WHERE event_id=? AND core_id=? AND owner_type='HQ' AND owner_id='HQ' AND status='RESERVE'").run(actorId,eventId,candidate.id).changes;
      if(changed!==1)reject('DESKTOP_TEST_CORE_CHANGED');
      core.assertIntegrity(eventId);db.exec('COMMIT');
      return {assigned:true,coreId:candidate.id,energy:candidate.energy};
    }catch(error){db.exec('ROLLBACK');throw error}
  }

  return {status,initialize,start,end,attachLatePioneer};
}
