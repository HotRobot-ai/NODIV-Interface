/**
 * NODIV V2 HTTP command boundary (isolated, NOT wired to production).
 * This module deliberately does not expose SqliteGameCore.run() over HTTP.
 * All writes require a trusted session resolver and a server-owned command handler.
 */
export const V2_COMMANDS = Object.freeze({
  'player.state': 'read',
  'unbound.network': 'read',
  'unbound.discover': 'node-scan',
  'catch.begin': 'read',
  'catch.confirm': 'catch',
  'exchange.begin': 'read',
  'exchange.confirm': 'exchange',
  'restore.begin': 'read',
  'restore.confirm': 'restore',
  'resupply.begin': 'read',
  'resupply.confirm': 'resupply',
  'upload.begin': 'read',
  'upload.confirm': 'upload',
  'fop.install': 'fop',
  'fop.deinstall': 'fop',
  'evac.start': 'evac',
  'evac.team': 'evac',
  'evac.final': 'evac'
});
const forbidden = new Set(['actorId','actorRole','moves','fromType','fromId','toType','toId','ownerType','ownerId','newStatus','energyCredit','coreLedger']);
const own = (object,key) => Object.prototype.hasOwnProperty.call(object,key);
export class V2BoundaryError extends Error {
  constructor(code,status=400){super(code);this.code=code;this.status=status;}
}
export function createV2CommandBoundary({resolveSession,authorize,execute,validateNfcGrant}={}) {
  if (![resolveSession,authorize,execute,validateNfcGrant].every(fn=>typeof fn==='function'))
    throw new V2BoundaryError('SECURITY_DEPENDENCY_MISSING',503);
  return async function dispatch(request) {
    if (!request || request.method!=='POST') throw new V2BoundaryError('METHOD_NOT_ALLOWED',405);
    const {command,token,payload={}}=request;
    if (typeof command!=='string'||!own(V2_COMMANDS,command)) throw new V2BoundaryError('UNKNOWN_COMMAND',404);
    if (typeof token!=='string'||!token||token.length>4096) throw new V2BoundaryError('SESSION_REQUIRED',401);
    if (!payload||typeof payload!=='object'||Array.isArray(payload)) throw new V2BoundaryError('INVALID_PAYLOAD');
    if (Object.keys(payload).some(key=>forbidden.has(key)||key==='token'||key==='session'))
      throw new V2BoundaryError('PRIVILEGED_FIELD_DENIED',403);
    const session=await resolveSession(token);
    if (!session||session.active!==true||!session.actorId||!session.eventId||!session.role)
      throw new V2BoundaryError('SESSION_INVALID',401);
    const permitted=await authorize({session,command,payload});
    if (permitted!==true) throw new V2BoundaryError('ROLE_OR_EVENT_DENIED',403);
    // Begin/read commands do not mutate. A scan receipt is never a client assertion: it must be consumed by the
    // authoritative command transaction, not merely checked in this boundary.
    const scope=V2_COMMANDS[command];
    if (scope!=='read') {
      const verified=await validateNfcGrant({session,command,payload});
      if (verified!==true) throw new V2BoundaryError('NFC_GRANT_REQUIRED',403);
    }
    // execute is a trusted domain command implementation, not raw sqlite.run.
    return execute({session,command,payload});
  };
}
