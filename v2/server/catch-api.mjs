import {verifySession,AuthError} from './auth.mjs';
import {confirmCatchWithNfcGrant} from './catch-nfc-adapter.mjs';

// Transport-independent V2 API boundary. Caller must enforce HTTPS, request-size
// limits, origin policy and rate limits before exposing this through HTTP.
export function createCatchApi({catchService,secret,now=()=>Date.now()}){
 if(!catchService?.core?.db||typeof secret!=='string'||Buffer.byteLength(secret)<32)throw Error('CATCH_API_CONFIG_INVALID');
 const authenticate=(token,eventId)=>{
  const principal=verifySession(token,{secret,eventId,now:now()});
  const actor=catchService.core.db.prepare('SELECT role,active FROM actors WHERE event_id=? AND actor_id=?').get(eventId,principal.actorId);
  if(!actor?.active||actor.role!==principal.role)throw new AuthError('ACTOR_REVOKED');
  if(!['LOCAL','UNBOUND'].includes(principal.role))throw new AuthError('CATCH_ACCESS_DENIED');
  return principal;
 };
 return {
  preview({token,eventId,targetId}){
   const actor=authenticate(token,eventId);
   if(typeof targetId!=='string'||!targetId.trim())throw Error('CATCH_TARGET_REQUIRED');
   return catchService.preview({eventId,catcherId:actor.actorId,targetId});
  },
  confirm({token,eventId,previewId,proof}){
   const actor=authenticate(token,eventId);
   if(typeof previewId!=='string'||!previewId.trim())throw Error('CATCH_PREVIEW_REQUIRED');
   if(!proof||typeof proof!=='object')throw Error('NFC_PROOF_REQUIRED');
   const request={eventId,previewId,catcherId:actor.actorId};
   return confirmCatchWithNfcGrant(catchService,request,{
    ...proof,eventId,actorId:actor.actorId,operationId:previewId,
    command:'catch.confirm',targetType:'PIONEER'
   });
  }
 };
}
