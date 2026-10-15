/** Trusted V2 command executor adapter. No direct client-to-SQLite mutations. */
import {runWithNfcGrant} from './nfc-grants.mjs';
import {V2_COMMANDS,V2BoundaryError} from './command-boundary.mjs';
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
/**
 * resolveScope MUST obtain target and operation from authoritative server orders,
 * not the client payload. handlers are synchronous domain commands using the SAME db.
 * Read handlers receive session only; no raw ownership graph is exposed.
 */
export function createTrustedV2Executor({db,resolveScope,handlers}={}) {
 if(!db||typeof resolveScope!=='function'||!handlers||typeof handlers!=='object')
  throw new V2BoundaryError('TRUSTED_EXECUTOR_UNAVAILABLE',503);
 return async function execute({session,command,payload}) {
  if(!session||!session.actorId||!session.eventId||!own(V2_COMMANDS,command))
   throw new V2BoundaryError('TRUSTED_CONTEXT_INVALID',403);
  const handler=handlers[command];
  if(typeof handler!=='function') throw new V2BoundaryError('COMMAND_NOT_IMPLEMENTED',501);
  if(V2_COMMANDS[command]==='read') return handler({db,session,payload});
  const scope=await resolveScope({session,command,payload});
  if(!scope||scope.eventId!==session.eventId||scope.actorId!==session.actorId||scope.command!==command||
     !scope.id||!scope.targetType||!scope.targetId||!scope.operationId)
   throw new V2BoundaryError('AUTHORITATIVE_ORDER_REQUIRED',403);
  // A verified NFC grant is consumed inside the exact transaction as the domain mutation.
  return runWithNfcGrant(db,scope,()=>handler({db,session,scope,payload}));
 };
}
