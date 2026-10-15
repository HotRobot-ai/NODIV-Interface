/** Trusted-only bridge: reuse SqliteGameCore's transaction hook; NEVER nest BEGIN. */
import {consumeNfcGrant} from './nfc-grants.mjs';

export function runCoreWithNfcGrant(core, operation, scope) {
  if (!core || typeof core.run !== 'function' || !core.db || !operation || !scope)
    throw Error('TRUSTED_CORE_REQUIRED');
  if (operation.eventId !== scope.eventId || operation.actorId !== scope.actorId ||
      operation.operationId !== scope.operationId || !scope.id || !scope.command ||
      !scope.targetType || !scope.targetId)
    throw Error('AUTHORITATIVE_ORDER_REQUIRED');
  return core.run(operation, (db,{replay}) => {
    if (replay) {
      const prior=db.prepare(`SELECT consumed_at FROM v2_nfc_grants WHERE id=? AND event_id=?
        AND actor_id=? AND command=? AND target_type=? AND target_id=? AND operation_id=?`)
        .get(scope.id,scope.eventId,scope.actorId,scope.command,scope.targetType,scope.targetId,scope.operationId);
      if (!prior || prior.consumed_at===null) throw Error('NFC_REPLAY_SCOPE_DENIED');
    } else consumeNfcGrant(db,scope);
  });
}
