/* NODIV FORCE RECALL – isolated, side-effect-free emergency state guards.
 * NOT wired into Code.js or deployed. Integration must enforce these checks
 * server-side under the same script lock as all gameplay writes.
 */
'use strict';
const EMERGENCY='EMERGENCY_SHUTDOWN';
const CLOSED='EMERGENCY_CLOSED';
const GAMEPLAY=new Set(['EXCHANGE','CATCH','RESTORE','RE_SUPPLY','UPLOAD','INSTALL','EVAC_START','PRE_EVAC_START','NODE_ACCESS']);
function requestRecall(state,actor,eventId,confirmation){
 if(actor!=='FOUNDER')throw Error('ROLE_DENIED');
 if(state.eventId!==eventId)throw Error('EVENT_MISMATCH');
 if(state.phase===EMERGENCY)return {...state,replayed:true};
 if(state.phase!=='FIELD_ACTIVE')throw Error('EVENT_NOT_FIELD_ACTIVE');
 if(confirmation!=='ABBRECHEN')throw Error('CONFIRMATION_REQUIRED');
 return {...state,phase:EMERGENCY,replayed:false,recallStarted:true};
}
function allowed(state,action){
 if(state.phase===EMERGENCY)return ['FOP_DEINSTALL','FOP_CORE_SCAN','FOP_RECOVERY_CONFIRM','FOUNDER_RECALL_STATUS','FOUNDER_CLOSE_RECALL','AUDIT_READ'].includes(action);
 if(state.phase===CLOSED)return action==='AUDIT_READ';
 return !GAMEPLAY.has(action)||state.phase==='FIELD_ACTIVE';
}
function closeRecall(state,{nodes,cores,openOrders}){
 if(state.phase!==EMERGENCY)throw Error('RECALL_NOT_ACTIVE');
 if(nodes.some(n=>n.status!=='DEINSTALLED'))throw Error('NODE_RECOVERY_INCOMPLETE');
 if(cores.some(c=>c.ownerType!=='HQ'&&c.ownerType!=='NODIV_RESERVE'))throw Error('CORE_RECOVERY_INCOMPLETE');
 if(openOrders.length)throw Error('OPEN_OPERATIONS');
 return {...state,phase:CLOSED};
}
module.exports={EMERGENCY,CLOSED,requestRecall,allowed,closeRecall};
