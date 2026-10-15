import test from 'node:test';
import assert from 'node:assert/strict';
import {lanAddresses,startLanLab} from './lan-lab.mjs';

test('only explicit loopback and LAN bind addresses allowed',()=>{
 assert.throws(()=>startLanLab({host:'192.168.0.1'}),/HOST_NOT_ALLOWED/);
 assert.throws(()=>startLanLab({port:0}),/INVALID_PORT/);
});
test('LAN IPv4 addresses filter loopback and duplicates',()=>{
 assert.deepEqual(lanAddresses({lo:[{family:'IPv4',internal:true,address:'127.0.0.1'}],wifi:[{family:'IPv4',internal:false,address:'192.168.1.12'},{family:'IPv4',internal:false,address:'192.168.1.12'},{family:'IPv6',internal:false,address:'::1'}]}),['192.168.1.12']);
});
test('default launcher binds loopback and serves simulated lab',async()=>{
 const {lab,listening}=startLanLab({port:8788});
 try {await listening;const r=await fetch('http://127.0.0.1:8788/lab');assert.equal(r.status,200);assert.match(await r.text(),/PIONEER/)}
 finally {await new Promise(resolve=>lab.server.close(resolve));lab.db.close()}
});
