import test from 'node:test';
import assert from 'node:assert/strict';
import {createMobileLab} from './mobile-lab.mjs';
import {createPioneerV2Bridge} from './pioneer-v2-bridge.mjs';

test('mobile lab serves UI and completes three-core flow over HTTP',async()=>{
 const lab=createMobileLab();
 await new Promise(resolve=>lab.server.listen(0,'127.0.0.1',resolve));
 const baseUrl=`http://127.0.0.1:${lab.server.address().port}`;
 try {
  const ui=await fetch(baseUrl+'/lab');
  assert.equal(ui.status,200);
  assert.match(await ui.text(),/PIONEER · EXCHANGE LAB/);
  const bridge=createPioneerV2Bridge({baseUrl,token:lab.token});
  await bridge.scanNode(lab.uid.node);
  await bridge.chooseSize(3);
  for(const uid of lab.uid.personal)await bridge.scanCore(uid);
  for(const uid of lab.uid.nodeCores)await bridge.scanCore(uid);
  const result=await bridge.confirm();
  assert.equal(result.ok,true);
  assert.equal(result.received.length,3);
  assert.equal((await bridge.confirm()).replay,true);
  assert.equal(lab.db.prepare("SELECT count(*) n FROM cores WHERE owner='NODE:NODE-TEST'").get().n,3);
 } finally {await new Promise(resolve=>lab.server.close(resolve));lab.db.close()}
});

test('mobile lab rejects invented UID',async()=>{
 const lab=createMobileLab();
 assert.throws(()=>lab.scan({token:lab.token,uid:'INVENTED'}),/UNKNOWN_NODE_TAG/);
 lab.db.close();
});
