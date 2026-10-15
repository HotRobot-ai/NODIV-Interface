import test from 'node:test';
import assert from 'node:assert/strict';
import {OwnershipCore} from './core.mjs';
test('transfer and replay do not double book',()=>{
 const c=new OwnershipCore([{id:'NC001',owner:'HQ'}]);
 assert.equal(c.transfer({requestId:'r1',coreId:'NC001',from:'HQ',to:'P001'}).replay,false);
 assert.equal(c.transfer({requestId:'r1',coreId:'NC001',from:'HQ',to:'P001'}).replay,true);
 assert.equal(c.audit.length,1);
 assert.equal(c.cores.get('NC001'),'P001');
});
test('same request ID with different payload rejected',()=>{
 const c=new OwnershipCore([{id:'NC001',owner:'HQ'}]);
 c.transfer({requestId:'r1',coreId:'NC001',from:'HQ',to:'P001'});
 assert.throws(()=>c.transfer({requestId:'r1',coreId:'NC001',from:'HQ',to:'P002'}),/IDEMPOTENCY_CONFLICT/);
});
test('wrong owner and unknown core rejected',()=>{
 const c=new OwnershipCore([{id:'NC001',owner:'HQ'}]);
 assert.throws(()=>c.transfer({requestId:'r1',coreId:'NC001',from:'P001',to:'P002'}),/OWNERSHIP_CONFLICT/);
 assert.throws(()=>c.transfer({requestId:'r2',coreId:'NC999',from:'HQ',to:'P002'}),/UNKNOWN_CORE/);
});
test('duplicate identity rejected',()=>{
 assert.throws(()=>new OwnershipCore([{id:'NC001',owner:'HQ'},{id:'NC001',owner:'P001'}]),/DUPLICATE_CORE/);
});
