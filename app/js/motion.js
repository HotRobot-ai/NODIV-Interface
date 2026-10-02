export const NODIV_EVENTS=Object.freeze({
 APP_BOOT:'APP_BOOT',NFC_ARMED:'NFC_ARMED',IDENTITY_VERIFIED:'IDENTITY_VERIFIED',
 ACCESS_DENIED:'ACCESS_DENIED',ROLE_ENTER:'ROLE_ENTER',CORE_TRANSFERRED:'CORE_TRANSFERRED',
 CATCH_SUCCESS:'CATCH_SUCCESS',CATCH_COOLDOWN:'CATCH_COOLDOWN',NODE_EXCHANGE:'NODE_EXCHANGE',
 NODE_RESTORED:'NODE_RESTORED',FIELD_MESSAGE:'FIELD_MESSAGE',EMERGENCY:'EMERGENCY'
});
export function emitNodiv(type,detail={}){window.dispatchEvent(new CustomEvent('nodiv',{detail:{type,...detail}}))}
export function motionTarget(el,kind='nd-pop'){if(!el)return;el.classList.remove(kind);void el.offsetWidth;el.classList.add(kind)}
window.addEventListener('nodiv',e=>{
 const {type,target}=e.detail||{}; const el=target?document.querySelector(target):document.querySelector('#app');
 if(type==='ACCESS_DENIED'||type==='EMERGENCY') motionTarget(el,'nd-glitch');
 else motionTarget(el,'nd-pop');
});
