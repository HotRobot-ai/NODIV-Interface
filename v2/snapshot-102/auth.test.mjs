import test from 'node:test';
import assert from 'node:assert/strict';
import { issueSession, verifySession, runAuthorized, AuthError } from './auth.mjs';
import { SqliteGameCore } from './sqlite-core.mjs';
const secret = 'this-is-a-test-secret-with-more-than-32-bytes';
const now = 1_800_000_000_000;
const base = {eventId:'E',actorId:'P1',role:'PIONEER',secret,now};
const token = () => issueSession(base);
test('valid signed session resolves server-side identity',()=>assert.deepEqual(verifySession(token(),{eventId:'E',secret,now}),{eventId:'E',actorId:'P1',role:'PIONEER'}));
test('modified token is rejected',()=>assert.throws(()=>verifySession(token().replace(/.$/,'x'),{eventId:'E',secret,now}),AuthError));
test('expired token is rejected',()=>assert.throws(()=>verifySession(token(),{eventId:'E',secret,now:now+3601000}),AuthError));
test('cross-event replay is rejected',()=>assert.throws(()=>verifySession(token(),{eventId:'OTHER',secret,now}),AuthError));
test('short signing key is rejected',()=>assert.throws(()=>issueSession({...base,secret:'123'}),AuthError));
test('request actor spoofing is rejected before mutation',()=>{
 const core=new SqliteGameCore();try{core.seedEvent('E');core.seedActor('E','P1','PIONEER',1);assert.throws(()=>runAuthorized(core,token(),{eventId:'E',actorId:'P2',operationId:'1',kind:'HQ_UPLOAD'}, {secret,now}),e=>e.code==='ACTOR_SPOOFING');}finally{core.close();}
});
test('revoked actor is rejected',()=>{
 const core=new SqliteGameCore();try{core.seedEvent('E');core.seedActor('E','P1','PIONEER',1);core.db.prepare('UPDATE actors SET active=0 WHERE event_id=? AND actor_id=?').run('E','P1');assert.throws(()=>runAuthorized(core,token(),{eventId:'E',operationId:'1',kind:'HQ_UPLOAD'},{secret,now}),e=>e.code==='ACTOR_REVOKED');}finally{core.close();}
});
