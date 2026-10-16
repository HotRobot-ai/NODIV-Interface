import {existsSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createV2GameplayRuntime} from '../../server/gameplay-runtime.mjs';
import {installLabSchema,normalizeUid} from './lab-db.mjs';

function need(row,code){if(!row)throw Error(code);return row}
function hex(uid){const v=normalizeUid(uid);if(!/^[0-9A-F]{8,32}$/.test(v))throw Error('EVAC_SOURCE_UID_INVALID');return v}

export function seedEvacRealtestDatabase(targetPath,sourcePath,targetEventId='EVAC-REALTEST',sourceEventId='BLOCK06-REALTEST'){
  if(existsSync(targetPath)){
    const check=new DatabaseSync(targetPath);
    try{if(check.prepare('SELECT 1 FROM events WHERE event_id=?').get(targetEventId))return {created:false,eventId:targetEventId,targetPath};}
    finally{check.close()}
    throw Error('EVAC_TARGET_DATABASE_UNEXPECTED');
  }
  if(!existsSync(sourcePath))throw Error('EVAC_SOURCE_DATABASE_REQUIRED');

  const source=new DatabaseSync(sourcePath,{readOnly:true});
  let sourceData;
  try{
    const card=id=>hex(need(source.prepare('SELECT uid FROM lab_access_cards WHERE event_id=? AND actor_id=?').get(sourceEventId,id),'EVAC_SOURCE_CARD_REQUIRED:'+id).uid);
    const node=id=>hex(need(source.prepare('SELECT uid FROM lab_node_tags WHERE event_id=? AND node_id=?').get(sourceEventId,id),'EVAC_SOURCE_NODE_REQUIRED:'+id).uid);
    const bay=hex(need(source.prepare("SELECT uid FROM hq_upload_bays WHERE event_id=? AND bay_id='HQ-01' AND active=1").get(sourceEventId),'EVAC_SOURCE_HQ_REQUIRED').uid);
    let physical=[];
    for(const nodeId of ['NODE-001','NODE-002']){
      const rows=source.prepare("SELECT core_id,uid,visible_energy FROM cores WHERE event_id=? AND owner_type='NODE' AND owner_id=? ORDER BY core_id").all(sourceEventId,nodeId);
      if(rows.length===3)physical.push(...rows.map(r=>({...r,nodeId})));
    }
    if(physical.length!==6){
      const rows=source.prepare('SELECT core_id,uid,visible_energy FROM cores WHERE event_id=? ORDER BY core_id LIMIT 6').all(sourceEventId);
      if(rows.length!==6)throw Error('EVAC_SOURCE_SIX_CORES_REQUIRED');
      physical=rows.map((r,i)=>({...r,nodeId:i<3?'NODE-001':'NODE-002'}));
    }
    physical=physical.map(r=>({...r,uid:hex(r.uid)}));
    if(new Set(physical.map(r=>r.uid)).size!==6)throw Error('EVAC_SOURCE_CORE_UID_DUPLICATE');
    sourceData={
      cards:{founder:card('FOUNDER-TEST'),fop:card('FOP-TEST'),p9003:card('P9003'),p9004:card('P9004')},
      nodes:{one:node('NODE-001'),two:node('NODE-002')},bay,physical
    };
  }finally{source.close()}

  const runtime=createV2GameplayRuntime(targetPath);
  const core=runtime.core,db=core.db;
  try{
    installLabSchema(db);
    core.seedEvent(targetEventId,'FIELD_ACTIVE');
    core.seedActor(targetEventId,'FOUNDER-TEST','FOUNDER',0);
    for(let i=1;i<=5;i++)core.seedActor(targetEventId,i===1?'FOP-TEST':`FOP-E${i}`,'FOP',0);
    const pioneers=['P9003','P9004',...Array.from({length:8},(_,i)=>`P-E${i+3}`)];
    for(const id of pioneers)core.seedActor(targetEventId,id,'PIONEER',3);

    for(let i=1;i<=10;i++){
      const nodeId='NODE-'+String(i).padStart(3,'0');
      core.seedNode(targetEventId,nodeId,'INSTALLED');
      db.prepare('INSERT INTO evac_original_nodes(event_id,node_id) VALUES (?,?)').run(targetEventId,nodeId);
      const tag=i===1?sourceData.nodes.one:i===2?sourceData.nodes.two:`EE${String(i).padStart(2,'0')}0001`;
      db.prepare('INSERT INTO lab_node_tags(event_id,uid,node_id) VALUES (?,?,?)').run(targetEventId,tag,nodeId);
    }

    for(const p of sourceData.physical)core.seedCore(targetEventId,{id:p.core_id,uid:p.uid,energy:p.visible_energy,ownerType:'NODE',ownerId:p.nodeId,status:'DEPLOYED'});
    for(let n=3;n<=10;n++)for(let k=1;k<=3;k++)core.seedCore(targetEventId,{
      id:`EVAC-S${String(n).padStart(2,'0')}-${k}`,
      uid:`EE${String(n).padStart(2,'0')}${String(k).padStart(2,'0')}00`,
      energy:180+n*11+k*17,ownerType:'NODE',ownerId:'NODE-'+String(n).padStart(3,'0'),status:'DEPLOYED'
    });

    for(const [uid,actor] of [[sourceData.cards.founder,'FOUNDER-TEST'],[sourceData.cards.fop,'FOP-TEST'],[sourceData.cards.p9003,'P9003'],[sourceData.cards.p9004,'P9004']])
      db.prepare('INSERT INTO lab_access_cards(event_id,uid,actor_id) VALUES (?,?,?)').run(targetEventId,uid,actor);
    runtime.hq.seedBay(targetEventId,{id:'HQ-01',uid:sourceData.bay});
    db.prepare("INSERT INTO evac_control(event_id,state) VALUES (?,'PRE_EVAC_READY')").run(targetEventId);
    core.assertIntegrity(targetEventId);
    return {created:true,eventId:targetEventId,targetPath,physical:sourceData.physical.map(p=>({coreId:p.core_id,energy:p.visible_energy,nodeId:p.nodeId}))};
  }finally{runtime.close()}
}
