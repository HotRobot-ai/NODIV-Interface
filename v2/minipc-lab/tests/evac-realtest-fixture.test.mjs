import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {seedTestDatabase} from '../server/seed.mjs';
import {createV2GameplayRuntime} from '../../server/gameplay-runtime.mjs';
import {createFounderRegistry} from '../server/founder-registry.mjs';
import {seedEvacRealtestDatabase} from '../server/evac-realtest-fixture.mjs';

test('BLOCK06 EVAC fixture copies only physical acceptance hardware and leaves source untouched',()=>{
  const dir=mkdtempSync(join(tmpdir(),'nodiv-evac-fixture-'));
  const source=join(dir,'source.sqlite'),target=join(dir,'evac.sqlite'),sourceEvent='BLOCK06-REALTEST',targetEvent='EVAC-REALTEST';
  const previous=process.env.NODIV_UID_FOUNDER_CARD;
  process.env.NODIV_UID_FOUNDER_CARD='04FADE0001';
  let src;
  try{
    seedTestDatabase(source,sourceEvent,'registration');
    src=createV2GameplayRuntime(source);
    const reg=createFounderRegistry(src.core.db);
    for(const [id,uid] of [['FOP-TEST','04AA0002'],['P9003','04AA0003'],['P9004','04AA0004']])reg.register({eventId:sourceEvent,role:'CARD',id,uid});
    reg.register({eventId:sourceEvent,role:'NODE',id:'NODE-001',uid:'04BB0001'});
    reg.register({eventId:sourceEvent,role:'NODE',id:'NODE-002',uid:'04BB0002'});
    reg.register({eventId:sourceEvent,role:'HQ',id:'HQ-01',uid:'04CC0001'});
    for(let i=1;i<=12;i++)reg.register({eventId:sourceEvent,role:'CORE',id:'NC-'+String(i).padStart(3,'0'),uid:'04DD'+String(i).padStart(4,'0'),energy:180+i*10});
    const sourceBefore=src.core.db.prepare('SELECT COUNT(*) n FROM cores WHERE event_id=?').get(sourceEvent).n;
    src.close();src=null;

    const made=seedEvacRealtestDatabase(target,source,targetEvent,sourceEvent);
    assert.equal(made.created,true);assert.equal(made.physical.length,6);
    const evac=createV2GameplayRuntime(target),db=evac.core.db;
    assert.equal(db.prepare("SELECT COUNT(*) n FROM nodes WHERE event_id=? AND state='INSTALLED'").get(targetEvent).n,10);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id=? AND owner_type='NODE'").get(targetEvent).n,30);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM evac_original_nodes WHERE event_id=?').get(targetEvent).n,10);
    assert.equal(db.prepare('SELECT state FROM evac_control WHERE event_id=?').get(targetEvent).state,'PRE_EVAC_READY');
    assert.equal(db.prepare("SELECT uid FROM lab_node_tags WHERE event_id=? AND node_id='NODE-001'").get(targetEvent).uid,'04BB0001');
    assert.equal(db.prepare("SELECT uid FROM lab_access_cards WHERE event_id=? AND actor_id='P9003'").get(targetEvent).uid,'04AA0003');
    const physicalUids=new Set(db.prepare("SELECT uid FROM cores WHERE event_id=? AND owner_id IN ('NODE-001','NODE-002') ORDER BY owner_id,core_id").all(targetEvent).map(x=>x.uid));
    assert.equal(physicalUids.size,6);for(let i=1;i<=6;i++)assert.ok(physicalUids.has('04DD'+String(i).padStart(4,'0')));
    assert.equal(evac.core.assertIntegrity(targetEvent).ok,true);
    evac.evac.start.start({eventId:targetEvent,founderId:'FOUNDER-TEST',operationId:'EVAC-FIXTURE-START'});
    const team=evac.evac.teams.reserve({eventId:targetEvent,teamId:'PHYSICAL-TEAM',fopId:'FOP-TEST',pioneerA:'P9003',pioneerB:'P9004',nodeIds:['NODE-001','NODE-002']});
    assert.deepEqual(team.assignments.map(x=>x.nodeId),['NODE-001','NODE-002']);
    evac.close();

    const check=createV2GameplayRuntime(source);
    assert.equal(check.core.db.prepare('SELECT COUNT(*) n FROM cores WHERE event_id=?').get(sourceEvent).n,sourceBefore);
    assert.equal(check.core.db.prepare('SELECT state FROM events WHERE event_id=?').get(sourceEvent).state,'READY');
    assert.equal(check.core.db.prepare("SELECT COUNT(*) n FROM nodes WHERE event_id=?").get(sourceEvent).n,10);
    assert.equal(check.core.db.prepare("SELECT COUNT(*) n FROM cores WHERE event_id=? AND core_id LIKE 'EVAC-S%'").get(sourceEvent).n,0);
    check.close();
  }finally{
    if(src)src.close();
    if(previous===undefined)Reflect.deleteProperty(process.env,'NODIV_UID_FOUNDER_CARD');else process.env.NODIV_UID_FOUNDER_CARD=previous;
    rmSync(dir,{recursive:true,force:true});
  }
});
