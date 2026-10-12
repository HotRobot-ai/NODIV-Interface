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
test('a new call uses a new snapshot rather than cross-request caching',()=>{
 const h=harness(3);h.check();h.check();assert.equal(h.reads(),2);
});
