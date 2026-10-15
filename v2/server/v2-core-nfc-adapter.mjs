/** Trusted-only bridge: reuse SqliteGameCore's transaction hook; NEVER nest BEGIN. */
import {consumeNfcGrant} from './nfc-grants.mjs';

const kindForCommand=Object.freeze({'exchange.confirm':'EXCHANGE','catch.confirm':'CATCH','restore.confirm':['RESTORE_1','RESTORE_2'],'resupply.confirm':'RESUPPLY','upload.confirm':'HQ_UPLOAD','fop.install':'INSTALL','fop.deinstall':'DEINSTALL','evac.final':'EVAC'});
export function runCoreWithNfcGrant(core, operation, scope) {
  if (!core || typeof core.run !== 'function' || !core.db || !operation || !scope)
    throw Error('TRUSTED_CORE_REQUIRED');
  if (operation.eventId !== scope.eventId || operation.actorId !== scope.actorId ||
      operation.operationId !== scope.operationId || !scope.id || !scope.command ||
      !scope.targetType || !scope.targetId)
    throw Error('AUTHORITATIVE_ORDER_REQUIRED');
  if (!Object.hasOwn(kindForCommand,scope.command) || !(Array.isArray(kindForCommand[scope.command]) ? kindForCommand[scope.command].includes(operation.kind) : kindForCommand[scope.command]===operation.kind)) throw Error('COMMAND_KIND_MISMATCH');
  if (operation.kind==='EXCHANGE') {
    const ids=new Set(operation.moves.flatMap(m=>[m.fromType==='NODE'?m.fromId:null,m.toType==='NODE'?m.toId:null]).filter(Boolean));
    if (scope.targetType!=='NODE'||ids.size!==1||!ids.has(scope.targetId)) throw Error('NFC_TARGET_MISMATCH');
  }
  return core.run(operation, (db,{replay}) => {
    if (replay) {
      const prior=db.prepare(`SELECT consumed_at FROM v2_nfc_grants WHERE id=? AND event_id=?
        AND actor_id=? AND command=? AND target_type=? AND target_id=? AND operation_id=?`)
        .get(scope.id,scope.eventId,scope.actorId,scope.command,scope.targetType,scope.targetId,scope.operationId);
      if (!prior || prior.consumed_at===null) throw Error('NFC_REPLAY_SCOPE_DENIED');
    } else consumeNfcGrant(db,scope);
  });
}
