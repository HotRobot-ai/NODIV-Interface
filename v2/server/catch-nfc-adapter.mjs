/** Trusted server-side Catch confirmation: physical target grant and transfer share one transaction. */
import {consumeNfcGrant} from './nfc-grants.mjs';

export function confirmCatchWithNfcGrant(catchService, request, scope) {
  if (!catchService || typeof catchService.confirm !== 'function' || !catchService.core?.db || !request || !scope)
    throw Error('TRUSTED_CATCH_REQUIRED');
  if (scope.command !== 'catch.confirm' || scope.targetType !== 'PIONEER' ||
      scope.eventId !== request.eventId || scope.actorId !== request.catcherId ||
      scope.operationId !== request.previewId || !scope.id || !scope.targetId)
    throw Error('AUTHORITATIVE_CATCH_ORDER_REQUIRED');
  const db=catchService.core.db;
  return catchService.confirm(request,(transactionDb,{replay})=>{
    const preview=transactionDb.prepare('SELECT target_id FROM catch_previews WHERE event_id=? AND preview_id=?').get(request.eventId,request.previewId);
    if (!preview || preview.target_id !== scope.targetId) throw Error('NFC_CATCH_TARGET_MISMATCH');
    if (replay) {
      const prior=transactionDb.prepare(`SELECT consumed_at FROM v2_nfc_grants WHERE id=? AND event_id=? AND actor_id=? AND command=? AND target_type=? AND target_id=? AND operation_id=?`).get(scope.id,scope.eventId,scope.actorId,scope.command,scope.targetType,scope.targetId,scope.operationId);
      if (!prior || prior.consumed_at===null) throw Error('NFC_REPLAY_SCOPE_DENIED');
    } else consumeNfcGrant(transactionDb,scope);
  });
}
