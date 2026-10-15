import test from 'node:test';
import assert from 'node:assert/strict';
import {createV2CommandBoundary,V2BoundaryError} from './command-boundary.mjs';

const session={active:true,actorId:'P003',eventId:'EVT-TEST',role:'PIONEER'};
function boundary(overrides={}) {
  return createV2CommandBoundary({
    resolveSession:async()=>session,
    authorize:async()=>true,
    validateNfcGrant:async()=>true,
    execute:async ({session,command})=>({actor:session.actorId,command}),
    ...overrides
  });
}
const req=(command,payload={})=>({method:'POST',token:'test-token',command,payload});
test('refuses to start without all security dependencies',()=>{
  assert.throws(()=>createV2CommandBoundary({}),{code:'SECURITY_DEPENDENCY_MISSING'});
});
test('refuses unknown commands and direct core mutations',async()=>{
  const dispatch=boundary();
  await assert.rejects(dispatch(req('sqlite.run')),{code:'UNKNOWN_COMMAND'});
  await assert.rejects(dispatch(req('catch.confirm',{moves:[]})),{code:'PRIVILEGED_FIELD_DENIED'});
  await assert.rejects(dispatch(req('exchange.confirm',{actorId:'FOUNDER'})),{code:'PRIVILEGED_FIELD_DENIED'});
});
test('rejects absent, inactive or unauthorized sessions',async()=>{
  await assert.rejects(boundary()( {...req('player.state'),token:''}),{code:'SESSION_REQUIRED'});
  await assert.rejects(boundary({resolveSession:async()=>null})(req('player.state')),{code:'SESSION_INVALID'});
  await assert.rejects(boundary({authorize:async()=>false})(req('player.state')),{code:'ROLE_OR_EVENT_DENIED'});
});
test('read commands do not require a scan; mutations fail without validated scan grant',async()=>{
  const dispatch=boundary({validateNfcGrant:async()=>false});
  assert.deepEqual(await dispatch(req('player.state')),{actor:'P003',command:'player.state'});
  await assert.rejects(dispatch(req('catch.confirm')),{code:'NFC_GRANT_REQUIRED'});
});
test('server-derived actor reaches trusted command executor',async()=>{
  assert.deepEqual(await boundary()(req('catch.confirm',{target:'P004'})),{actor:'P003',command:'catch.confirm'});
});
