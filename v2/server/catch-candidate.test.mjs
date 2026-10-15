import test from 'node:test';
import assert from 'node:assert/strict';
import {SqliteGameCore} from './sqlite-core.mjs';
import {resolveCatchCandidate} from './catch-candidate.mjs';
test('highest visible personal FIELD core selected; transit and HQ excluded',()=>{
 const c=new SqliteGameCore();try{
 c.seedEvent('E');c.seedActor('E','P','PIONEER',3);
 c.seedCore('E',{id:'low',uid:'1',energy:100,ownerType:'PIONEER',ownerId:'P'});
 c.seedCore('E',{id:'high',uid:'2',energy:450,ownerType:'PIONEER',ownerId:'P'});
 c.seedCore('E',{id:'transit',uid:'3',energy:490,ownerType:'TRANSIT',ownerId:'P'});
 c.seedCore('E',{id:'secured',uid:'4',energy:497,ownerType:'HQ',ownerId:'HQ'});
 assert.deepEqual(resolveCatchCandidate(c.db,{eventId:'E',targetPioneerId:'P'}),{coreId:'high',visibleEnergy:450});
 }finally{c.close();}
});
test('reject inactive, unknown and coreless target',()=>{
 const c=new SqliteGameCore();try{c.seedEvent('E');c.seedActor('E','P','PIONEER',3);
 assert.throws(()=>resolveCatchCandidate(c.db,{eventId:'E',targetPioneerId:'P'}),/NO_CATCHABLE_CORE/);
 c.db.prepare('UPDATE actors SET active=0 WHERE event_id=? AND actor_id=?').run('E','P');
 assert.throws(()=>resolveCatchCandidate(c.db,{eventId:'E',targetPioneerId:'P'}),/CATCH_TARGET_INVALID/);
 assert.throws(()=>resolveCatchCandidate(c.db,{eventId:'E',targetPioneerId:'unknown'}),/CATCH_TARGET_INVALID/);
 }finally{c.close();}
});
