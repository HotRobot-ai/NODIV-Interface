import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const server=readFileSync(new URL('../server/server.mjs',import.meta.url),'utf8');
const client=readFileSync(new URL('../client/app.js',import.meta.url),'utf8');

test('parallel RE-SUPPLY is limited by known targets, HQ stock and free slots',()=>{
  assert.match(server,/maxCount:Math\.min\(2,Math\.max\(0,capacity-used\),availableNodes,reserveCount\)/);
  assert.match(server,/if\(targets\.length<count\)throw Error\('NO_KNOWN_AVAILABLE_NODE'\)/);
  assert.match(server,/if\(reserve\.length<count\)throw Error\('NO_HQ_RESERVE'\)/);
  assert.match(server,/db\.exec\('ROLLBACK'\)/);
  assert.match(client,/v\.resupplyDispatch\.maxCount>=2/);
  assert.match(client,/data:\{count\}/);
});

test('handover needs matching FOP or Founder session and NFC card',()=>{
  assert.match(server,/store\.session\(b\.authorizerToken\)/);
  assert.match(server,/\['FOUNDER','FOP'\]\.includes\(authorizer\.role\)/);
  assert.match(server,/card\.actor_id!==authorizer\.actor_id/);
  assert.match(server,/RESUPPLY_HQ_HANDOVER_REQUIRED/);
  assert.match(client,/authorizerUid,authorizerToken:authorization\.token,uid/);
});

test('pending handover remains visible and mission launch is blocked after reload',()=>{
  assert.match(server,/handoverConfirmed:!!m\.handoverAt/);
  assert.match(client,/selected\?\.handoverRequired&&!selected\.handoverConfirmed/);
  assert.match(client,/HQ-ÜBERGABE AUSSTEHEND/);
  assert.match(client,/data-resupply-handover|data-hq-handover/);
});
