import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatchUiFlow} from './catch-ui-flow.mjs';
test('stale preview refresh obtains new NFC proof bound to new preview',async()=>{
 let seq=0;const grants=[];const states=[];
 const run=createCatchUiFlow({preview:async()=>({previewId:'p'+ ++seq}),acquireFreshNfcProof:async ({previewId})=>{grants.push(previewId);return 'grant-'+previewId},confirm:async ({previewId,proof})=>{assert.equal(proof,'grant-'+previewId);if(previewId==='p1')throw Error('CATCH_SNAPSHOT_CHANGED');return {core:'NEW'}},onStatus:s=>states.push(s)});
 assert.deepEqual(await run('P'),{core:'NEW'});
 assert.deepEqual(grants,['p1','p2']);assert.deepEqual(states,['CATCH_REFRESHING','CATCH_COMPLETE']);
});
test('no automatic retry for NFC grant or access errors',async()=>{
 let calls=0;const run=createCatchUiFlow({preview:async()=>({previewId:'p'}),acquireFreshNfcProof:async()=> 'grant',confirm:async()=>{calls++;throw Error('NFC_GRANT_INVALID_OR_CONSUMED')}});
 await assert.rejects(run('P'),/NFC_GRANT_INVALID_OR_CONSUMED/);assert.equal(calls,1);
});
test('retry limited to one refresh',async()=>{
 let seq=0;const run=createCatchUiFlow({preview:async()=>({previewId:String(++seq)}),acquireFreshNfcProof:async()=> 'fresh',confirm:async()=>{throw Error('CATCH_SNAPSHOT_CHANGED')}});
 await assert.rejects(run('P'),/CATCH_SNAPSHOT_CHANGED/);assert.equal(seq,2);
});
test('no transfer without new physical proof',async()=>{
 let calls=0;const run=createCatchUiFlow({preview:async()=>({previewId:'p'}),acquireFreshNfcProof:async()=>{throw Error('NFC_SCAN_CANCELLED')},confirm:async()=>{calls++}});
 await assert.rejects(run('P'),/NFC_SCAN_CANCELLED/);assert.equal(calls,0);
});
