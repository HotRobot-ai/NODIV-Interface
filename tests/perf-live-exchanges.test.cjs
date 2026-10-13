const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('Code.js','utf8');
const from=source.indexOf('function exchangeCompleted(');
const to=source.indexOf('function assertExchangeUnreserved(',from);
assert.ok(from>=0&&to>from,'exchange reservation helpers exist');
const code=source.slice(from,to);
function harness(count){
 let historyReads=0;
 const properties={};
 for(let i=0;i<count;i++)properties['EX_'+i]=JSON.stringify({id:'order-'+i,identity:'P003',eventId:'EVENT',expiresAt:Date.now()+60000});
 const context={EXCHANGE_PREFIX:'EX_',EXCHANGE_PREVIEW_PREFIX:'EX_PREVIEW_',PropertiesService:{getScriptProperties:()=>({getProperties:()=>properties})},transactionHistorySnapshot:()=>{historyReads++;return {rows:[],resetIndex:-1}},exchangeLogRows:()=>[],findIdentityById:()=>({status:'ACTIVE',role:'PIONEER',nodeAccess:true}),readCurrentEvent:()=>({state:'FIELD_ACTIVE',eventId:'EVENT'}),Date,JSON,Object};
 vm.createContext(context);vm.runInContext(code+';globalThis.check=liveExchanges;',context);
 return {check:context.check,reads:()=>historyReads};
}
test('no active reservations avoids audit history read',()=>{
 const h=harness(0);assert.equal(h.check().length,0);assert.equal(h.reads(),0);
});
test('multiple live reservations use one audit snapshot',()=>{
 const h=harness(5);assert.equal(h.check().length,5);assert.equal(h.reads(),1);
});
test('caller-provided snapshot avoids a second history read',()=>{
 const h=harness(4);
 const supplied={rows:[],resetIndex:-1};
 assert.equal(h.check(supplied).length,4);
 assert.equal(h.reads(),0);
});
test('a new call uses a new snapshot rather than cross-request caching',()=>{
 const h=harness(3);h.check();h.check();assert.equal(h.reads(),2);
});

test('30 reservations reuse caller snapshot without additional audit reads',()=>{
 const h=harness(30);
 const supplied={rows:[],resetIndex:-1};
 assert.equal(h.check(supplied).length,30);
 assert.equal(h.reads(),0);
});

test('expired reservations do not read audit history',()=>{
 let reads=0;
 const context={EXCHANGE_PREFIX:'EX_',EXCHANGE_PREVIEW_PREFIX:'EX_PREVIEW_',PropertiesService:{getScriptProperties:()=>({getProperties:()=>({'EX_expired':JSON.stringify({id:'expired',expiresAt:Date.now()-1000})})})},transactionHistorySnapshot:()=>{reads++;return {rows:[],resetIndex:-1}},exchangeLogRows:()=>[],Date,JSON,Object};
 vm.createContext(context);vm.runInContext(code+';globalThis.check=liveExchanges;',context);
 assert.equal(context.check().length,0);assert.equal(reads,0);
});
test('history read failure blocks reservation validation (fail closed)',()=>{
 const context={EXCHANGE_PREFIX:'EX_',EXCHANGE_PREVIEW_PREFIX:'EX_PREVIEW_',PropertiesService:{getScriptProperties:()=>({getProperties:()=>({'EX_active':JSON.stringify({id:'active',expiresAt:Date.now()+60000})})})},transactionHistorySnapshot:()=>{throw Error('temporary read failure')},exchangeLogRows:()=>[],Date,JSON,Object};
 vm.createContext(context);vm.runInContext(code+';globalThis.check=liveExchanges;',context);
 assert.throws(()=>context.check(),/temporary read failure/);
});

test('completed reservation remains excluded when audit marks its exchange complete',()=>{
 let reads=0;
 const order={id:'completed-order',identity:'P003',eventId:'EVENT',expiresAt:Date.now()+60000};
 const row=Array(16).fill('');row[2]='NORMAL_EXCHANGE';row[15]=order.id;
 const context={EXCHANGE_PREFIX:'EX_',EXCHANGE_PREVIEW_PREFIX:'EX_PREVIEW_',PropertiesService:{getScriptProperties:()=>({getProperties:()=>({'EX_completed':JSON.stringify(order)})})},transactionHistorySnapshot:()=>{reads++;return {rows:[row],resetIndex:-1}},exchangeLogRows:s=>s.rows.slice(s.resetIndex+1),findIdentityById:()=>({status:'ACTIVE',role:'PIONEER',nodeAccess:true}),readCurrentEvent:()=>({state:'FIELD_ACTIVE',eventId:'EVENT'}),Date,JSON,Object};
 vm.createContext(context);vm.runInContext(code+';globalThis.check=liveExchanges;',context);
 assert.equal(context.check().length,0);assert.equal(reads,1);
});
