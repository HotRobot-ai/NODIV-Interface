const TEAM_ID=/^[A-Z0-9][A-Z0-9_-]{1,31}$/;
const ACTIVE_STATES=new Set(['CONFIGURED','PREPARED','RENDEZVOUS','TEAM_ACTIVE','DEPLOYING']);
function fail(code,extra={}){const e=Error(code);Object.assign(e,extra);throw e}
function sameSet(a,b){return a.length===b.length&&new Set(a).size===a.length&&a.every(x=>b.includes(x))}
function safeJson(value){try{return JSON.parse(value||'{}')}catch{return {}}}
function esc(value=''){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function csv(value){const s=String(value??'');return /[",\n\r]/.test(s)?'"'+s.replaceAll('"','""')+'"':s}
function tableExists(db,name){return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)}

export function createInitialDeployment(core){
  const db=core.db;
  // Older desktop events used a different team schema. CREATE TABLE IF NOT EXISTS
  // does not upgrade it. Only migrate an EMPTY legacy table, preserving all
  // registrations and refusing to overwrite any existing team history.
  const legacyTeamColumns=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lab_initial_teams'").get()
    ? db.prepare("PRAGMA table_info(lab_initial_teams)").all().map(x=>x.name)
    : [];
  if(legacyTeamColumns.length&&!legacyTeamColumns.includes('pioneer_a_id')){
    const count=db.prepare('SELECT COUNT(*) AS n FROM lab_initial_teams').get().n;
    if(count!==0)throw Error('INITIAL_LEGACY_TEAMS_REQUIRE_MANUAL_MIGRATION');
    db.exec('BEGIN IMMEDIATE');
    try{
      db.exec('DROP TABLE lab_initial_teams');
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error}
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS lab_initial_teams(
      event_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      fop_id TEXT NOT NULL,
      pioneer_a_id TEXT NOT NULL,
      pioneer_b_id TEXT NOT NULL,
      node_a_id TEXT NOT NULL,
      node_b_id TEXT NOT NULL,
      start_core_a_id TEXT,
      start_core_b_id TEXT,
      state TEXT NOT NULL,
      configured_at INTEGER NOT NULL,
      prepared_at INTEGER,
      started_at INTEGER,
      team_activated_at INTEGER,
      released_at INTEGER,
      PRIMARY KEY(event_id,team_id)
    );
    CREATE TABLE IF NOT EXISTS lab_initial_core_assignments(
      event_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      pioneer_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      core_id TEXT NOT NULL,
      seq INTEGER NOT NULL CHECK(seq BETWEEN 1 AND 3),
      handed_to_fop_at INTEGER,
      installed_at INTEGER,
      PRIMARY KEY(event_id,core_id),
      UNIQUE(event_id,team_id,pioneer_id,seq)
    );
    CREATE TABLE IF NOT EXISTS lab_initial_pioneer_confirm(
      event_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      pioneer_id TEXT NOT NULL,
      confirmed_at INTEGER NOT NULL,
      PRIMARY KEY(event_id,team_id,pioneer_id)
    );
    CREATE TABLE IF NOT EXISTS lab_initial_pioneer_issue(
      event_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      pioneer_id TEXT NOT NULL,
      issued_at INTEGER NOT NULL,
      PRIMARY KEY(event_id,team_id,pioneer_id)
    );
    CREATE TABLE IF NOT EXISTS lab_initial_node_activation(
      event_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      pioneer_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      activated_at INTEGER NOT NULL,
      PRIMARY KEY(event_id,team_id,node_id),
      UNIQUE(event_id,team_id,pioneer_id)
    );
    CREATE TABLE IF NOT EXISTS lab_initial_audit(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL,
      actor_id TEXT,
      action TEXT NOT NULL,
      outcome TEXT NOT NULL,
      code TEXT,
      detail_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS lab_api_events(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status INTEGER NOT NULL,
      error_code TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS lab_test_feedback(
      event_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      clarity INTEGER CHECK(clarity BETWEEN 1 AND 5),
      usability INTEGER CHECK(usability BETWEEN 1 AND 5),
      scanning INTEGER CHECK(scanning BETWEEN 1 AND 5),
      atmosphere INTEGER CHECK(atmosphere BETWEEN 1 AND 5),
      suggestion TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      PRIMARY KEY(event_id,actor_id)
    );
  `);

  const eventState=eventId=>db.prepare('SELECT state FROM events WHERE event_id=?').get(eventId)?.state||null;
  const actor=(eventId,id)=>db.prepare('SELECT actor_id,role,active FROM actors WHERE event_id=? AND actor_id=?').get(eventId,id);
  const profile=(eventId,id)=>tableExists(db,'lab_player_profiles')?db.prepare('SELECT real_name,callsign FROM lab_player_profiles WHERE event_id=? AND actor_id=?').get(eventId,id)||null:null;
  const cardExists=(eventId,id)=>!!db.prepare('SELECT 1 FROM lab_access_cards WHERE event_id=? AND actor_id=?').get(eventId,id);
  const nodeRow=(eventId,id)=>db.prepare('SELECT n.node_id,n.state,t.uid FROM nodes n LEFT JOIN lab_node_tags t ON t.event_id=n.event_id AND t.node_id=n.node_id WHERE n.event_id=? AND n.node_id=?').get(eventId,id);
  const coreRow=(eventId,id)=>db.prepare('SELECT core_id,uid,visible_energy,owner_type,owner_id,status FROM cores WHERE event_id=? AND core_id=?').get(eventId,id);
  const log=(eventId,actorId,action,outcome='OK',code=null,detail={})=>{
    db.prepare('INSERT INTO lab_initial_audit(event_id,actor_id,action,outcome,code,detail_json,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(eventId,actorId||null,action,outcome,code||null,JSON.stringify(detail||{}),core.clock());
  };
  const teams=eventId=>db.prepare('SELECT * FROM lab_initial_teams WHERE event_id=? ORDER BY team_id').all(eventId);
  const teamById=(eventId,teamId)=>db.prepare('SELECT * FROM lab_initial_teams WHERE event_id=? AND team_id=?').get(eventId,teamId);
  const assignments=(eventId,teamId)=>db.prepare(`
    SELECT a.*,c.visible_energy energy,c.owner_type,c.owner_id,c.status
    FROM lab_initial_core_assignments a
    JOIN cores c ON c.event_id=a.event_id AND c.core_id=a.core_id
    WHERE a.event_id=? AND a.team_id=?
    ORDER BY CASE WHEN a.pioneer_id=(SELECT pioneer_a_id FROM lab_initial_teams WHERE event_id=a.event_id AND team_id=a.team_id) THEN 0 ELSE 1 END,a.seq
  `).all(eventId,teamId);
  const confirmations=(eventId,teamId)=>db.prepare('SELECT pioneer_id,confirmed_at FROM lab_initial_pioneer_confirm WHERE event_id=? AND team_id=? ORDER BY pioneer_id').all(eventId,teamId);
  const issues=(eventId,teamId)=>db.prepare('SELECT pioneer_id,issued_at FROM lab_initial_pioneer_issue WHERE event_id=? AND team_id=? ORDER BY pioneer_id').all(eventId,teamId);
  const activations=(eventId,teamId)=>db.prepare('SELECT pioneer_id,node_id,activated_at FROM lab_initial_node_activation WHERE event_id=? AND team_id=? ORDER BY node_id').all(eventId,teamId);
  function reconcile(eventId){
    for(const t of teams(eventId)){
      for(const nodeId of [t.node_a_id,t.node_b_id]){
        const rows=db.prepare('SELECT core_id,installed_at FROM lab_initial_core_assignments WHERE event_id=? AND team_id=? AND node_id=? ORDER BY seq').all(eventId,t.team_id,nodeId);
        if(rows.length!==3||rows.every(x=>x.installed_at)||nodeRow(eventId,nodeId)?.state!=='INSTALLED')continue;
        const actual=db.prepare("SELECT core_id FROM cores WHERE event_id=? AND owner_type='NODE' AND owner_id=? AND status='DEPLOYED' ORDER BY core_id").all(eventId,nodeId).map(x=>x.core_id);
        if(sameSet(actual,rows.map(x=>x.core_id))){
          db.prepare('UPDATE lab_initial_core_assignments SET installed_at=COALESCE(installed_at,?) WHERE event_id=? AND team_id=? AND node_id=?').run(core.clock(),eventId,t.team_id,nodeId);
          log(eventId,null,'INITIAL_INSTALL_RECONCILED','OK',null,{teamId:t.team_id,nodeId});
        }
      }
    }
  }

  function validateTeamResources(eventId,{teamId,fopId,pioneerA,pioneerB,nodeA,nodeB}){
    if(!TEAM_ID.test(String(teamId||'').trim().toUpperCase()))fail('INITIAL_TEAM_ID_INVALID');
    if(!fopId||!pioneerA||!pioneerB||pioneerA===pioneerB)fail('INITIAL_TEAM_ROLES_INVALID');
    const f=actor(eventId,fopId),a=actor(eventId,pioneerA),b=actor(eventId,pioneerB);
    if(f?.role!=='FOP'||f.active!==1)fail('INITIAL_FOP_INVALID');
    if(a?.role!=='PIONEER'||a.active!==1||b?.role!=='PIONEER'||b.active!==1)fail('INITIAL_PIONEER_INVALID');
    for(const id of [fopId,pioneerA,pioneerB]){
      if(!cardExists(eventId,id))fail('INITIAL_ACCESS_CARD_REQUIRED',{actorId:id});
      const p=profile(eventId,id);if(!p?.real_name||!p?.callsign)fail('INITIAL_PLAYER_PROFILE_REQUIRED',{actorId:id});
    }
    if(!nodeA||!nodeB||nodeA===nodeB)fail('INITIAL_NODES_INVALID');
    for(const id of [nodeA,nodeB]){const n=nodeRow(eventId,id);if(!n?.uid||n.state!=='AVAILABLE')fail('INITIAL_NODE_UNAVAILABLE',{nodeId:id});}
    const current=teams(eventId).filter(t=>t.team_id!==String(teamId).trim().toUpperCase());
    for(const t of current){
      const actors=new Set([t.fop_id,t.pioneer_a_id,t.pioneer_b_id]);
      if([fopId,pioneerA,pioneerB].some(id=>actors.has(id)))fail('INITIAL_ACTOR_ALREADY_ASSIGNED');
      if([nodeA,nodeB].includes(t.node_a_id)||[nodeA,nodeB].includes(t.node_b_id))fail('INITIAL_NODE_ALREADY_ASSIGNED');
    }
  }

  function selectDeploymentCores(eventId,teamId){
    const occupied=new Set(db.prepare('SELECT core_id FROM lab_initial_core_assignments WHERE event_id=? AND team_id<>?').all(eventId,teamId).map(x=>x.core_id));
    const pool=db.prepare("SELECT core_id,visible_energy FROM cores WHERE event_id=? AND owner_type='HQ' AND owner_id='HQ' AND status='RESERVE' ORDER BY visible_energy DESC,core_id").all(eventId).filter(x=>!occupied.has(x.core_id));
    const teamCount=teams(eventId).filter(t=>t.team_id!==teamId).length+1;
    const personalReserveCount=teamCount*2;
    if(pool.length<personalReserveCount+6)fail('INITIAL_CORE_POOL_INSUFFICIENT',{available:pool.length,required:personalReserveCount+6});
    // Keep the strongest still-free cores available for the personal 1/3 start slots.
    // NODIV chooses the next six and balances their visible energy across the two start nodes.
    const selected=pool.slice(personalReserveCount,personalReserveCount+6);
    const sets=[[],[]],sums=[0,0];
    for(const row of selected){
      const target=[0,1].filter(i=>sets[i].length<3).sort((a,b)=>sums[a]-sums[b]||sets[a].length-sets[b].length||a-b)[0];
      sets[target].push(row);sums[target]+=Number(row.visible_energy)||0;
    }
    if(sets.some(x=>x.length!==3))fail('INITIAL_CORE_POOL_INSUFFICIENT');
    return {coreSetA:sets[0],coreSetB:sets[1],personalReserve:pool.slice(0,personalReserveCount)};
  }

  function configureTeam(eventId,founderId,input){
    if(eventState(eventId)!=='READY')fail('INITIAL_CONFIG_STATE_INVALID');
    if(actor(eventId,founderId)?.role!=='FOUNDER')fail('INITIAL_FOUNDER_REQUIRED');
    const teamId=String(input.teamId||'').trim().toUpperCase();
    const data={...input,teamId};
    validateTeamResources(eventId,data);
    const old=teamById(eventId,teamId);
    if(old&&!['CONFIGURED'].includes(old.state))fail('INITIAL_TEAM_ALREADY_STARTED');
    db.exec('BEGIN IMMEDIATE');
    try{
      const plan=selectDeploymentCores(eventId,teamId);
      db.prepare('DELETE FROM lab_initial_core_assignments WHERE event_id=? AND team_id=?').run(eventId,teamId);
      db.prepare(`INSERT INTO lab_initial_teams(event_id,team_id,fop_id,pioneer_a_id,pioneer_b_id,node_a_id,node_b_id,state,configured_at)
        VALUES (?,?,?,?,?,?,?,'CONFIGURED',?)
        ON CONFLICT(event_id,team_id) DO UPDATE SET fop_id=excluded.fop_id,pioneer_a_id=excluded.pioneer_a_id,pioneer_b_id=excluded.pioneer_b_id,node_a_id=excluded.node_a_id,node_b_id=excluded.node_b_id,state='CONFIGURED',configured_at=excluded.configured_at,start_core_a_id=NULL,start_core_b_id=NULL,prepared_at=NULL,started_at=NULL,team_activated_at=NULL,released_at=NULL`)
        .run(eventId,teamId,input.fopId,input.pioneerA,input.pioneerB,input.nodeA,input.nodeB,core.clock());
      for(const [pioneerId,nodeId,rows] of [[input.pioneerA,input.nodeA,plan.coreSetA],[input.pioneerB,input.nodeB,plan.coreSetB]]){
        rows.forEach((row,i)=>db.prepare('INSERT INTO lab_initial_core_assignments(event_id,team_id,pioneer_id,node_id,core_id,seq) VALUES (?,?,?,?,?,?)').run(eventId,teamId,pioneerId,nodeId,row.core_id,i+1));
      }
      const assigned=[...plan.coreSetA,...plan.coreSetB];
      log(eventId,founderId,'INITIAL_TEAM_CONFIGURED','OK',null,{teamId,fopId:input.fopId,pioneers:[input.pioneerA,input.pioneerB],nodes:[input.nodeA,input.nodeB],selection:'SYSTEM_BALANCED',cores:assigned.map(x=>({coreId:x.core_id,energy:x.visible_energy}))});
      db.exec('COMMIT');
      return status(eventId);
    }catch(e){db.exec('ROLLBACK');throw e}
  }

  function prepare(eventId,founderId){
    if(eventState(eventId)!=='READY')fail('INITIAL_PREPARE_STATE_INVALID');
    if(actor(eventId,founderId)?.role!=='FOUNDER')fail('INITIAL_FOUNDER_REQUIRED');
    const rows=teams(eventId);if(!rows.length||rows.some(t=>t.state!=='CONFIGURED'))fail('INITIAL_TEAM_CONFIGURATION_REQUIRED');
    db.exec('BEGIN IMMEDIATE');
    try{
      const deploymentIds=new Set(db.prepare('SELECT core_id FROM lab_initial_core_assignments WHERE event_id=?').all(eventId).map(x=>x.core_id));
      const reserve=db.prepare("SELECT core_id,visible_energy FROM cores WHERE event_id=? AND owner_type='HQ' AND owner_id='HQ' AND status='RESERVE' ORDER BY visible_energy DESC,core_id").all(eventId).filter(x=>!deploymentIds.has(x.core_id));
      if(reserve.length<rows.length*2)fail('INITIAL_PERSONAL_START_CORES_REQUIRED');
      let cursor=0;
      for(const t of rows){
        const starts=[reserve[cursor++],reserve[cursor++]];
        for(const [pioneerId,c] of [[t.pioneer_a_id,starts[0]],[t.pioneer_b_id,starts[1]]]){
          if(db.prepare("UPDATE cores SET owner_type='PIONEER',owner_id=?,status='FIELD',version=version+1 WHERE event_id=? AND core_id=? AND owner_type='HQ' AND owner_id='HQ' AND status='RESERVE'").run(pioneerId,eventId,c.core_id).changes!==1)fail('INITIAL_CORE_CHANGED');
        }
        for(const a of db.prepare('SELECT pioneer_id,core_id FROM lab_initial_core_assignments WHERE event_id=? AND team_id=?').all(eventId,t.team_id)){
          if(db.prepare("UPDATE cores SET owner_type='TRANSIT',owner_id=?,status='DEPLOYMENT_TRANSIT',version=version+1 WHERE event_id=? AND core_id=? AND owner_type='HQ' AND owner_id='HQ' AND status='RESERVE'").run(a.pioneer_id,eventId,a.core_id).changes!==1)fail('INITIAL_CORE_CHANGED');
        }
        db.prepare("UPDATE lab_initial_teams SET state='PREPARED',prepared_at=?,start_core_a_id=?,start_core_b_id=? WHERE event_id=? AND team_id=? AND state='CONFIGURED'")
          .run(core.clock(),starts[0].core_id,starts[1].core_id,eventId,t.team_id);
      }
      if(db.prepare("UPDATE events SET state='INITIALIZED' WHERE event_id=? AND state='READY'").run(eventId).changes!==1)fail('INITIAL_EVENT_STATE_CHANGED');
      core.assertIntegrity(eventId);log(eventId,founderId,'INITIAL_DEPLOYMENT_PREPARED','OK',null,{teams:rows.map(t=>t.team_id)});db.exec('COMMIT');
      return status(eventId);
    }catch(e){db.exec('ROLLBACK');throw e}
  }

  function issuePioneerKit(eventId,founderId,pioneerId,coreIds){
    if(actor(eventId,founderId)?.role!=='FOUNDER')fail('INITIAL_FOUNDER_REQUIRED');
    if(eventState(eventId)!=='INITIALIZED')fail('INITIAL_ISSUE_STATE_INVALID');
    const t=teamForPioneer(eventId,pioneerId);if(!t||t.state!=='PREPARED')fail('INITIAL_PIONEER_NOT_ASSIGNED');
    const deployment=db.prepare('SELECT core_id FROM lab_initial_core_assignments WHERE event_id=? AND team_id=? AND pioneer_id=? ORDER BY seq').all(eventId,t.team_id,pioneerId).map(x=>x.core_id);
    const startCoreId=pioneerId===t.pioneer_a_id?t.start_core_a_id:t.start_core_b_id;
    const expected=[startCoreId,...deployment];
    if(!Array.isArray(coreIds)||coreIds.length!==4||!sameSet(coreIds,expected))fail('INITIAL_ISSUE_CORE_MISMATCH');
    const personal=coreRow(eventId,startCoreId);
    if(!personal||personal.owner_type!=='PIONEER'||personal.owner_id!==pioneerId||personal.status!=='FIELD')fail('INITIAL_ISSUE_OWNERSHIP_CHANGED',{coreId:startCoreId});
    for(const id of deployment){const x=coreRow(eventId,id);if(!x||x.owner_type!=='TRANSIT'||x.owner_id!==pioneerId||x.status!=='DEPLOYMENT_TRANSIT')fail('INITIAL_ISSUE_OWNERSHIP_CHANGED',{coreId:id});}
    const inserted=db.prepare('INSERT OR IGNORE INTO lab_initial_pioneer_issue(event_id,team_id,pioneer_id,issued_at) VALUES (?,?,?,?)').run(eventId,t.team_id,pioneerId,core.clock()).changes===1;
    const count=issues(eventId,t.team_id).length;
    if(inserted)log(eventId,founderId,'INITIAL_PIONEER_KIT_ISSUED','OK',null,{teamId:t.team_id,pioneerId,startCoreId,deploymentCoreIds:deployment});
    return {teamId:t.team_id,pioneerId,replayed:!inserted,issued:count,energies:expected.map(id=>coreRow(eventId,id)?.visible_energy)};
  }

  function start(eventId,founderId){
    if(actor(eventId,founderId)?.role!=='FOUNDER')fail('INITIAL_FOUNDER_REQUIRED');
    if(eventState(eventId)==='FIELD_ACTIVE'&&teams(eventId).every(t=>['RENDEZVOUS','TEAM_ACTIVE','DEPLOYING','RELEASED'].includes(t.state)))return {...status(eventId),replayed:true};
    const startTeams=teams(eventId);
    if(eventState(eventId)!=='INITIALIZED'||startTeams.some(t=>t.state!=='PREPARED'))fail('INITIAL_START_BLOCKED');
    if(startTeams.some(t=>issues(eventId,t.team_id).length!==2))fail('INITIAL_PIONEER_ISSUE_REQUIRED');
    db.exec('BEGIN IMMEDIATE');
    try{
      if(db.prepare("UPDATE events SET state='FIELD_ACTIVE' WHERE event_id=? AND state='INITIALIZED'").run(eventId).changes!==1)fail('INITIAL_EVENT_STATE_CHANGED');
      db.prepare("UPDATE lab_initial_teams SET state='RENDEZVOUS',started_at=? WHERE event_id=? AND state='PREPARED'").run(core.clock(),eventId);
      log(eventId,founderId,'INITIAL_FIELD_START','OK');core.assertIntegrity(eventId);db.exec('COMMIT');
      return status(eventId);
    }catch(e){db.exec('ROLLBACK');throw e}
  }

  function teamForPioneer(eventId,pioneerId){return db.prepare('SELECT * FROM lab_initial_teams WHERE event_id=? AND (pioneer_a_id=? OR pioneer_b_id=?) ORDER BY team_id LIMIT 1').get(eventId,pioneerId,pioneerId)}
  function teamForFop(eventId,fopId){return db.prepare('SELECT * FROM lab_initial_teams WHERE event_id=? AND fop_id=? ORDER BY team_id LIMIT 1').get(eventId,fopId)}
  function activeTeamForFop(eventId,fopId){const t=teamForFop(eventId,fopId);return t&&t.state!=='RELEASED'?t:null}

  function confirmPioneer(eventId,fopId,pioneerId){
    const t=activeTeamForFop(eventId,fopId);if(!t)fail('INITIAL_FOP_TEAM_NOT_ACTIVE');
    if(!['RENDEZVOUS','TEAM_ACTIVE','DEPLOYING'].includes(t.state))fail('INITIAL_RENDEZVOUS_NOT_ACTIVE');
    if(![t.pioneer_a_id,t.pioneer_b_id].includes(pioneerId))fail('INITIAL_PIONEER_NOT_ASSIGNED');
    const prior=db.prepare('SELECT confirmed_at FROM lab_initial_pioneer_confirm WHERE event_id=? AND team_id=? AND pioneer_id=?').get(eventId,t.team_id,pioneerId);
    if(prior)return {teamId:t.team_id,pioneerId,replayed:true,confirmed:confirmations(eventId,t.team_id).length,teamActivated:confirmations(eventId,t.team_id).length===2};
    db.exec('BEGIN IMMEDIATE');
    try{
      db.prepare('INSERT INTO lab_initial_pioneer_confirm(event_id,team_id,pioneer_id,confirmed_at) VALUES (?,?,?,?)').run(eventId,t.team_id,pioneerId,core.clock());
      const count=confirmations(eventId,t.team_id).length;
      if(count===2&&t.state==='RENDEZVOUS')db.prepare("UPDATE lab_initial_teams SET state='TEAM_ACTIVE',team_activated_at=? WHERE event_id=? AND team_id=?").run(core.clock(),eventId,t.team_id);
      log(eventId,fopId,'INITIAL_PIONEER_CONFIRMED','OK',null,{teamId:t.team_id,pioneerId,count});
      db.exec('COMMIT');return {teamId:t.team_id,pioneerId,replayed:false,confirmed:count,teamActivated:count===2};
    }catch(e){db.exec('ROLLBACK');throw e}
  }

  function handover(eventId,fopId,pioneerId,coreIds){
    const t=activeTeamForFop(eventId,fopId);if(!t)fail('INITIAL_FOP_TEAM_NOT_ACTIVE');
    if(!['TEAM_ACTIVE','DEPLOYING'].includes(t.state)||confirmations(eventId,t.team_id).length!==2)fail('INITIAL_TEAM_NOT_ACTIVATED');
    if(![t.pioneer_a_id,t.pioneer_b_id].includes(pioneerId))fail('INITIAL_PIONEER_NOT_ASSIGNED');
    const expected=db.prepare('SELECT * FROM lab_initial_core_assignments WHERE event_id=? AND team_id=? AND pioneer_id=? ORDER BY seq').all(eventId,t.team_id,pioneerId);
    if(!Array.isArray(coreIds)||!sameSet(coreIds,expected.map(x=>x.core_id)))fail('INITIAL_HANDOVER_CORE_MISMATCH');
    if(expected.every(x=>x.handed_to_fop_at))return {teamId:t.team_id,pioneerId,replayed:true,energies:expected.map(x=>coreRow(eventId,x.core_id)?.visible_energy)};
    db.exec('BEGIN IMMEDIATE');
    try{
      for(const x of expected){
        if(x.handed_to_fop_at)continue;
        if(db.prepare("UPDATE cores SET owner_type='TRANSIT',owner_id=?,status='IN_TRANSIT',version=version+1 WHERE event_id=? AND core_id=? AND owner_type='TRANSIT' AND owner_id=? AND status='DEPLOYMENT_TRANSIT'").run(fopId,eventId,x.core_id,pioneerId).changes!==1)fail('INITIAL_HANDOVER_OWNERSHIP_CHANGED',{coreId:x.core_id});
        db.prepare('UPDATE lab_initial_core_assignments SET handed_to_fop_at=? WHERE event_id=? AND core_id=?').run(core.clock(),eventId,x.core_id);
      }
      db.prepare("UPDATE lab_initial_teams SET state='DEPLOYING' WHERE event_id=? AND team_id=? AND state='TEAM_ACTIVE'").run(eventId,t.team_id);
      core.assertIntegrity(eventId);log(eventId,fopId,'INITIAL_CORE_HANDOVER','OK',null,{teamId:t.team_id,pioneerId,coreIds});
      db.exec('COMMIT');
      return {teamId:t.team_id,pioneerId,replayed:false,energies:expected.map(x=>coreRow(eventId,x.core_id)?.visible_energy)};
    }catch(e){db.exec('ROLLBACK');throw e}
  }

  function assertFopNodeScan(eventId,fopId,nodeId){
    const t=activeTeamForFop(eventId,fopId);if(!t)return {structured:false};
    if(![t.node_a_id,t.node_b_id].includes(nodeId))fail('INITIAL_NODE_NOT_ASSIGNED');
    if(!['TEAM_ACTIVE','DEPLOYING'].includes(t.state))fail('INITIAL_TEAM_NOT_ACTIVATED');
    const expected=db.prepare('SELECT * FROM lab_initial_core_assignments WHERE event_id=? AND team_id=? AND node_id=? ORDER BY seq').all(eventId,t.team_id,nodeId);
    if(expected.length!==3||expected.some(x=>!x.handed_to_fop_at))fail('INITIAL_NODE_HANDOVER_INCOMPLETE');
    if(nodeRow(eventId,nodeId)?.state!=='AVAILABLE')fail('INITIAL_NODE_ALREADY_INSTALLED');
    return {structured:true,teamId:t.team_id,pioneerId:expected[0].pioneer_id,coreIds:expected.map(x=>x.core_id)};
  }

  function authorizeInstall(eventId,fopId,nodeId,coreIds){
    const gate=assertFopNodeScan(eventId,fopId,nodeId);if(!gate.structured)return gate;
    if(!sameSet(coreIds,gate.coreIds))fail('INITIAL_INSTALL_CORE_MISMATCH');
    for(const id of gate.coreIds){const c=coreRow(eventId,id);if(c?.owner_type!=='TRANSIT'||c.owner_id!==fopId||c.status!=='IN_TRANSIT')fail('INITIAL_INSTALL_CARGO_CHANGED',{coreId:id});}
    return gate;
  }
  function markInstalled(eventId,fopId,nodeId,coreIds){
    const t=teamForFop(eventId,fopId);if(!t||t.state==='RELEASED')return {structured:false};
    const expected=db.prepare('SELECT core_id FROM lab_initial_core_assignments WHERE event_id=? AND team_id=? AND node_id=? ORDER BY seq').all(eventId,t.team_id,nodeId).map(x=>x.core_id);
    if(!sameSet(coreIds,expected))fail('INITIAL_INSTALL_CORE_MISMATCH');
    db.prepare('UPDATE lab_initial_core_assignments SET installed_at=COALESCE(installed_at,?) WHERE event_id=? AND team_id=? AND node_id=?').run(core.clock(),eventId,t.team_id,nodeId);
    log(eventId,fopId,'INITIAL_NODE_INSTALLED','OK',null,{teamId:t.team_id,nodeId,coreIds});
    return {structured:true,teamId:t.team_id,nodeId};
  }
  function assertFopLoadoutAllowed(eventId,fopId){if(activeTeamForFop(eventId,fopId))fail('INITIAL_DIRECT_HQ_LOADOUT_BLOCKED')}
  function assertFopNormalAllowed(eventId,fopId){if(activeTeamForFop(eventId,fopId))fail('INITIAL_DEPLOYMENT_IN_PROGRESS')}

  function activateNode(eventId,pioneerId,nodeId){
    const t=teamForPioneer(eventId,pioneerId);if(!t)fail('INITIAL_PIONEER_TEAM_MISSING');
    if(t.state==='RELEASED'){
      const old=db.prepare('SELECT 1 FROM lab_initial_node_activation WHERE event_id=? AND team_id=? AND pioneer_id=? AND node_id=?').get(eventId,t.team_id,pioneerId,nodeId);
      if(old)return {teamId:t.team_id,nodeId,replayed:true,released:true};
    }
    if(!['DEPLOYING','TEAM_ACTIVE'].includes(t.state))fail('INITIAL_NODE_ACTIVATION_BLOCKED');
    const expectedNode=pioneerId===t.pioneer_a_id?t.node_a_id:t.node_b_id;
    if(nodeId!==expectedNode)fail('INITIAL_PIONEER_NODE_MISMATCH');
    if(nodeRow(eventId,nodeId)?.state!=='INSTALLED')fail('INITIAL_NODE_NOT_INSTALLED');
    const a=db.prepare('SELECT * FROM lab_initial_core_assignments WHERE event_id=? AND team_id=? AND pioneer_id=? ORDER BY seq').all(eventId,t.team_id,pioneerId);
    if(a.length!==3||a.some(x=>!x.installed_at))fail('INITIAL_INSTALLATION_NOT_CONFIRMED');
    for(const x of a){const c=coreRow(eventId,x.core_id);if(c?.owner_type!=='NODE'||c.owner_id!==nodeId||c.status!=='DEPLOYED')fail('INITIAL_NODE_CORE_MISMATCH');}
    db.exec('BEGIN IMMEDIATE');
    try{
      db.prepare('INSERT OR IGNORE INTO lab_initial_node_activation(event_id,team_id,pioneer_id,node_id,activated_at) VALUES (?,?,?,?,?)').run(eventId,t.team_id,pioneerId,nodeId,core.clock());
      if(tableExists(db,'pioneer_known_nodes'))db.prepare('INSERT OR IGNORE INTO pioneer_known_nodes(event_id,actor_id,node_id,discovered_at) VALUES (?,?,?,?)').run(eventId,pioneerId,nodeId,core.clock());
      const count=activations(eventId,t.team_id).length,released=count===2;
      if(released)db.prepare("UPDATE lab_initial_teams SET state='RELEASED',released_at=? WHERE event_id=? AND team_id=?").run(core.clock(),eventId,t.team_id);
      log(eventId,pioneerId,'INITIAL_NODE_ACTIVATED','OK',null,{teamId:t.team_id,nodeId,count,released});
      db.exec('COMMIT');return {teamId:t.team_id,nodeId,replayed:false,activated:count,released};
    }catch(e){db.exec('ROLLBACK');throw e}
  }

  function assertPioneerReleased(eventId,pioneerId){
    const t=teamForPioneer(eventId,pioneerId);
    if(t&&t.state!=='RELEASED')fail('INITIAL_DEPLOYMENT_LOCKED',{teamId:t.team_id,state:t.state});
    return true;
  }

  function actorState(eventId,actorId){
    reconcile(eventId);
    const p=profile(eventId,actorId);
    const pt=teamForPioneer(eventId,actorId);
    if(pt){
      const ownNode=actorId===pt.pioneer_a_id?pt.node_a_id:pt.node_b_id;
      const own=db.prepare('SELECT a.core_id,a.seq,a.handed_to_fop_at,a.installed_at,c.visible_energy energy FROM lab_initial_core_assignments a JOIN cores c ON c.event_id=a.event_id AND c.core_id=a.core_id WHERE a.event_id=? AND a.team_id=? AND a.pioneer_id=? ORDER BY a.seq').all(eventId,pt.team_id,actorId);
      const conf=!!db.prepare('SELECT 1 FROM lab_initial_pioneer_confirm WHERE event_id=? AND team_id=? AND pioneer_id=?').get(eventId,pt.team_id,actorId);
      const act=!!db.prepare('SELECT 1 FROM lab_initial_node_activation WHERE event_id=? AND team_id=? AND pioneer_id=?').get(eventId,pt.team_id,actorId);
      const nodeReady=nodeRow(eventId,ownNode)?.state==='INSTALLED'&&own.every(x=>!!x.installed_at);
      const fopProfile=profile(eventId,pt.fop_id);
      let next={code:'RENDEZVOUS',label:'FIELD OPERATOR FINDEN',detail:'Nimm dein ausgegebenes Start-Kit mit: 1 persönlicher N-Core + 3 Deployment-Cores. Zeige dem zuständigen FOP deine Access Card.'};
      if(pt.state==='RELEASED')next={code:'NORMAL',label:'FELDBETRIEB FREIGEGEBEN',detail:'Initial Deployment abgeschlossen.'};
      else if(!conf)next={code:'RENDEZVOUS',label:'FIELD OPERATOR FINDEN',detail:'Nimm dein ausgegebenes Start-Kit mit: 1 persönlicher N-Core + 3 Deployment-Cores. Zeige dem zuständigen FOP deine Access Card.'};
      else if(!own.every(x=>!!x.handed_to_fop_at))next={code:'HANDOVER',label:'N-CORE-ÜBERGABE',detail:'Bleibe beim FOP. Die drei Deployment-Cores werden gemeinsam bestätigt.'};
      else if(!nodeReady)next={code:'WAIT_INSTALL',label:'FOP FOLGEN',detail:'Der FOP führt euch zu den Start-Nodes und installiert die Deployment-Cores.'};
      else if(!act)next={code:'ACTIVATE_NODE',label:'START-NODE AKTIVIEREN',detail:'Scanne jetzt den vom FOP installierten Start-Node.'};
      else next={code:'WAIT_TEAM',label:'TEAM-SYNCHRONISIERUNG',detail:'Dein Node ist aktiv. Freigabe erfolgt, sobald beide Start-Nodes bestätigt sind.'};
      return {active:true,role:'PIONEER',teamId:pt.team_id,state:pt.state,released:pt.state==='RELEASED',callsign:p?.callsign||actorId,fopId:pt.fop_id,fopCallsign:fopProfile?.callsign||pt.fop_id,confirmed:conf,teamConfirmed:confirmations(eventId,pt.team_id).length,cores:own.map(x=>({energy:x.energy,handedOver:!!x.handed_to_fop_at,installed:!!x.installed_at})),nodeReady,activated:act,teamActivatedNodes:activations(eventId,pt.team_id).length,nextAction:next};
    }
    const ft=teamForFop(eventId,actorId);
    if(ft){
      const all=assignments(eventId,ft.team_id),conf=confirmations(eventId,ft.team_id),acts=activations(eventId,ft.team_id);
      const pioneers=[ft.pioneer_a_id,ft.pioneer_b_id].map((id,index)=>{
        const rows=all.filter(x=>x.pioneer_id===id),pr=profile(eventId,id),nodeId=index===0?ft.node_a_id:ft.node_b_id;
        return {id,callsign:pr?.callsign||id,nodeId,confirmed:conf.some(x=>x.pioneer_id===id),handedOver:rows.length===3&&rows.every(x=>!!x.handed_to_fop_at),installed:rows.length===3&&rows.every(x=>!!x.installed_at),activated:acts.some(x=>x.pioneer_id===id),cores:rows.map(x=>({id:x.core_id,energy:x.energy}))};
      });
      let next={code:'CONFIRM',label:'PIONEER BESTÄTIGEN',detail:'Scanne beide zugewiesenen Pioneer-Access-Cards.'};
      if(conf.length===2&&pioneers.some(x=>!x.handedOver))next={code:'HANDOVER',label:'DEPLOYMENT-CORES ÜBERNEHMEN',detail:'Pioneer-Card scannen und exakt die drei angezeigten Deployment-Cores übernehmen. Der persönliche Start-Core bleibt beim Pioneer.'};
      else if(pioneers.every(x=>x.handedOver)&&pioneers.some(x=>!x.installed))next={code:'INSTALL',label:'START-NODES INSTALLIEREN',detail:'Installiere die beiden zugewiesenen Nodes mit den jeweils richtigen drei Cores.'};
      else if(pioneers.every(x=>x.installed)&&acts.length<2)next={code:'WAIT_ACTIVATION',label:'PIONEER-AKTIVIERUNG',detail:'Beide Pioneers müssen ihren installierten Start-Node scannen.'};
      else if(ft.state==='RELEASED')next={code:'NORMAL',label:'TEAM FREIGEGEBEN',detail:'Initial Deployment abgeschlossen.'};
      return {active:true,role:'FOP',teamId:ft.team_id,state:ft.state,released:ft.state==='RELEASED',callsign:p?.callsign||actorId,confirmed:conf.length,activatedNodes:acts.length,pioneers,nextAction:next};
    }
    return {active:false,released:true};
  }

  function fullTeam(eventId,t){
    const fop=profile(eventId,t.fop_id),pa=profile(eventId,t.pioneer_a_id),pb=profile(eventId,t.pioneer_b_id),issued=issues(eventId,t.team_id);
    const pioneerView=(id,p,nodeId,startCoreId)=>({id,realName:p?.real_name||null,callsign:p?.callsign||id,nodeId,startCoreId,startCoreEnergy:startCoreId?coreRow(eventId,startCoreId)?.visible_energy??null:null,issued:issued.some(x=>x.pioneer_id===id)});
    return {...t,fop:{id:t.fop_id,realName:fop?.real_name||null,callsign:fop?.callsign||t.fop_id},pioneers:[
      pioneerView(t.pioneer_a_id,pa,t.node_a_id,t.start_core_a_id),
      pioneerView(t.pioneer_b_id,pb,t.node_b_id,t.start_core_b_id)
    ],assignments:assignments(eventId,t.team_id).map(x=>({pioneerId:x.pioneer_id,nodeId:x.node_id,coreId:x.core_id,energy:x.energy,handedOver:!!x.handed_to_fop_at,installed:!!x.installed_at})),issues:issued,confirmations:confirmations(eventId,t.team_id),activations:activations(eventId,t.team_id)};
  }
  function status(eventId){
    reconcile(eventId);
    const ts=teams(eventId).map(t=>fullTeam(eventId,t)),state=eventState(eventId);
    const allIssued=ts.length>0&&ts.every(t=>t.pioneers.every(p=>p.issued));
    return {configured:ts.length>0,eventState:state,teams:ts,canEdit:state==='READY',canPrepare:state==='READY'&&ts.length>0&&ts.every(t=>t.state==='CONFIGURED'),canStart:state==='INITIALIZED'&&ts.every(t=>t.state==='PREPARED')&&allIssued,released:ts.length>0&&ts.every(t=>t.state==='RELEASED')};
  }
  function assertFlexibleAllowed(eventId){if(teams(eventId).length)fail('INITIAL_STRUCTURED_MODE_ACTIVE')}

  function recordHttp({eventId,method,path,status,errorCode=null}){
    if(!eventId||(!errorCode&&method==='GET'))return;
    db.prepare('INSERT INTO lab_api_events(event_id,method,path,status,error_code,created_at) VALUES (?,?,?,?,?,?)').run(eventId,method,path,status,errorCode||null,core.clock());
  }
  function saveFeedback(eventId,actorId,{clarity,usability,scanning,atmosphere,suggestion=''}) {
    const values=[clarity,usability,scanning,atmosphere].map(Number);
    if(values.some(x=>!Number.isInteger(x)||x<1||x>5))fail('FEEDBACK_RATING_INVALID');
    if(!actor(eventId,actorId))fail('ACTOR_DENIED');
    db.prepare(`INSERT INTO lab_test_feedback(event_id,actor_id,clarity,usability,scanning,atmosphere,suggestion,created_at)
      VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(event_id,actor_id) DO UPDATE SET clarity=excluded.clarity,usability=excluded.usability,scanning=excluded.scanning,atmosphere=excluded.atmosphere,suggestion=excluded.suggestion,created_at=excluded.created_at`)
      .run(eventId,actorId,...values,String(suggestion||'').slice(0,2000),core.clock());
    return {ok:true};
  }

  function report(eventId){
    const st=status(eventId);
    const desktop=tableExists(db,'lab_desktop_test')?db.prepare('SELECT initialized_at,started_at,ended_at,end_snapshot_json FROM lab_desktop_test WHERE event_id=?').get(eventId)||null:null;
    const ops=db.prepare('SELECT operation_id,actor_id,kind,created_at,response_json FROM operations WHERE event_id=? ORDER BY created_at,operation_id').all(eventId).map(x=>({id:x.operation_id,actorId:x.actor_id,kind:x.kind,createdAt:x.created_at,response:safeJson(x.response_json)}));
    const initial=db.prepare('SELECT actor_id,action,outcome,code,detail_json,created_at FROM lab_initial_audit WHERE event_id=? ORDER BY id').all(eventId).map(x=>({...x,detail:safeJson(x.detail_json)}));
    const rejected=db.prepare('SELECT method,path,status,error_code,created_at FROM lab_api_events WHERE event_id=? AND status>=400 ORDER BY id').all(eventId);
    const apiActions=db.prepare('SELECT method,path,status,error_code,created_at FROM lab_api_events WHERE event_id=? AND status<400 ORDER BY id').all(eventId);
    const coreSummary=db.prepare('SELECT owner_type,owner_id,status,COUNT(*) count,SUM(visible_energy) energy FROM cores WHERE event_id=? GROUP BY owner_type,owner_id,status ORDER BY owner_type,owner_id,status').all(eventId);
    const feedback=db.prepare('SELECT f.actor_id,p.real_name realName,p.callsign,f.clarity,f.usability,f.scanning,f.atmosphere,f.suggestion,f.created_at createdAt FROM lab_test_feedback f LEFT JOIN lab_player_profiles p ON p.event_id=f.event_id AND p.actor_id=f.actor_id WHERE f.event_id=? ORDER BY f.created_at').all(eventId);
    const start=st.teams.map(t=>t.started_at).filter(Boolean).sort((a,b)=>a-b)[0]||desktop?.started_at||null;
    const end=desktop?.ended_at||null;
    const released=st.teams.map(t=>t.released_at).filter(Boolean).sort((a,b)=>b-a)[0]||null;
    const duration=start&&(end||released)?Math.max(0,(end||released)-start):null;
    return {generatedAt:core.clock(),event:{id:eventId,state:st.eventState,start,end,released,durationSeconds:duration},teams:st.teams,automaticFacts:{initialDeployment:initial,operations:ops,successfulApiActions:apiActions,rejectedActions:rejected,coreSummary},playerFeedback:feedback};
  }
  function reportCsv(eventId){
    const r=report(eventId),rows=[['category','timestamp','actor','action','outcome','detail']];
    for(const x of r.automaticFacts.initialDeployment)rows.push(['initial',x.created_at,x.actor_id||'',x.action,x.outcome,x.code||JSON.stringify(x.detail)]);
    for(const x of r.automaticFacts.operations)rows.push(['operation',x.createdAt,x.actorId,x.kind,'OK',x.id]);
    for(const x of r.automaticFacts.rejectedActions)rows.push(['rejected',x.created_at,'',x.method+' '+x.path,'HTTP '+x.status,x.error_code||'']);
    for(const x of r.playerFeedback)rows.push(['feedback',x.createdAt,x.callsign||x.actor_id,'ratings','SUBJECTIVE',`clarity=${x.clarity}; usability=${x.usability}; scanning=${x.scanning}; atmosphere=${x.atmosphere}; ${x.suggestion}`]);
    return rows.map(row=>row.map(csv).join(',')).join('\r\n');
  }
  function reportHtml(eventId){
    const r=report(eventId),dt=r.event.durationSeconds;
    const teamHtml=r.teams.map(t=>`<section><h2>Team ${esc(t.team_id)}</h2><p>FOP: <strong>${esc(t.fop.callsign)}</strong> · Pioneers: ${t.pioneers.map(p=>esc(p.callsign)).join(' / ')} · Nodes: ${t.pioneers.map(p=>esc(p.nodeId)).join(' / ')}</p><p>Status: <strong>${esc(t.state)}</strong> · Deployment-Cores: ${t.assignments.map(a=>esc(a.energy)+' E').join(', ')}</p></section>`).join('');
    const rejects=r.automaticFacts.rejectedActions.map(x=>`<li>${new Date(x.created_at*1000).toLocaleString('de-DE')} · ${esc(x.method)} ${esc(x.path)} · ${esc(x.error_code||('HTTP '+x.status))}</li>`).join('')||'<li>Keine protokollierten Ablehnungen.</li>';
    const feedback=r.playerFeedback.map(x=>`<li><strong>${esc(x.callsign||x.actor_id)}</strong> · Verständlichkeit ${x.clarity}/5 · Bedienung ${x.usability}/5 · Scannen ${x.scanning}/5 · Atmosphäre ${x.atmosphere}/5${x.suggestion?' · '+esc(x.suggestion):''}</li>`).join('')||'<li>Noch kein Spielerfeedback erfasst.</li>';
    const coreTotal=r.automaticFacts.coreSummary.reduce((s,x)=>s+Number(x.count||0),0),energy=r.automaticFacts.coreSummary.reduce((s,x)=>s+Number(x.energy||0),0);
    return `<!doctype html><html lang="de"><meta charset="utf-8"><title>NODIV Auswertung ${esc(eventId)}</title><style>body{font-family:system-ui;background:#071018;color:#e8f7ff;max-width:980px;margin:auto;padding:32px}section{border:1px solid #1d6f8c;padding:18px;margin:14px 0;background:#0b1822}h1,h2{color:#7eeaff}.fact{font-size:1.2rem}</style><h1>NODIV // MISSION WÜRZBURG</h1><p>Testauswertung <strong>${esc(eventId)}</strong> · Zustand ${esc(r.event.state)}</p><section><h2>Einsatz in Zahlen</h2><p class="fact">${r.teams.length} Team(s) · ${coreTotal} registrierte N-Cores · ${energy} E im aktuellen Bestand${dt!==null?' · '+Math.floor(dt/60)+' min protokollierter Ablauf':''}</p><p>Initial Deployment: ${r.teams.every(t=>t.state==='RELEASED')?'vollständig freigegeben':'nicht vollständig freigegeben'}.</p></section>${teamHtml}<section><h2>Automatisch protokollierte Fakten</h2><p>${r.automaticFacts.initialDeployment.length} Initial-Deployment-Ereignisse · ${r.automaticFacts.operations.length} Gameplay-Operationen · ${r.automaticFacts.rejectedActions.length} abgelehnte API-Aktionen.</p><ul>${rejects}</ul></section><section><h2>Spielerfeedback // subjektiv</h2><ul>${feedback}</ul></section></html>`;
  }

  return {status,configureTeam,prepare,issuePioneerKit,start,confirmPioneer,handover,authorizeInstall,markInstalled,activateNode,assertPioneerReleased,assertFopNodeScan,assertFopLoadoutAllowed,assertFopNormalAllowed,actorState,assertFlexibleAllowed,recordHttp,saveFeedback,report,reportCsv,reportHtml};
}
