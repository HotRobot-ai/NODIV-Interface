import test from 'node:test';
import assert from 'node:assert/strict';
import {checkEvacCompletion} from './evac-completion-guard.mjs';
function valid(){
 const startNodes=Array.from({length:10},(_,i)=>'N'+i);
 const teams=Array.from({length:5},(_,i)=>({
  id:'T'+i,fop:'F'+i,pioneers:['P'+(i*2),'P'+(i*2+1)],
  nodes:[0,1].map(j=>({nodeId:startNodes[i*2+j],carrier:'P'+(i*2+j),coreIds:[0,1,2].map(k=>'C'+(i*6+j*3+k))})),
  recovered:[startNodes[i*2],startNodes[i*2+1]],teamCompleteReceipts:1,withdrawalReceipts:1
 }));
 for(const t of teams)t.finals=t.nodes.map(n=>({pioneer:n.carrier,coreIds:[...n.coreIds],selectedCoreId:n.coreIds[0],selectedCoreEnergy:100,energy:100,ledgerEntries:1,ledgerAmount:100,allCargoWithdrawn:true}));
 return {event:{state:'FIELD_ACTIVE',activeNodes:0,plannedNodes:10},startNodes,teams,nodes:startNodes.map(id=>({id,state:'DEINSTALLED'})),cores:[],openOperations:[]};
}
test('full ten-node five-team EVAC snapshot is eligible for completion preflight',()=>assert.deepEqual(checkEvacCompletion(valid()),[]));
test('one missing final upload blocks completion',()=>{const s=valid();s.teams[0].finals.pop();assert.ok(checkEvacCompletion(s).includes('P1: FINAL_UPLOAD_INVALID'));});
test('wrong selected energy blocks completion',()=>{const s=valid();s.teams[0].finals[0].ledgerAmount=200;assert.ok(checkEvacCompletion(s).includes('P0: FINAL_UPLOAD_INVALID'));});
test('incomplete node recovery blocks completion',()=>{const s=valid();s.teams[0].recovered.pop();assert.ok(checkEvacCompletion(s).includes('T0: TEAM_NOT_WITHDRAWN'));});
test('open operations and Node-owned cores block completion',()=>{const s=valid();s.openOperations.push('EXCHANGE');s.cores.push({ownerType:'NODE'});assert.deepEqual(checkEvacCompletion(s),['NODE_OWNED_CORES_REMAIN','OPEN_EVACUATION_OPERATION']);});
test('duplicate members and wrong team carrier block completion',()=>{const s=valid();s.teams[1].pioneers[0]=s.teams[0].pioneers[0];assert.ok(checkEvacCompletion(s).includes('TEN_START_NODES_NOT_RECOVERED'));});
test('malformed snapshots fail closed',()=>assert.throws(()=>checkEvacCompletion({}),/EVAC_SNAPSHOT_INVALID/));
