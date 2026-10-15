/** Server-side candidate resolution only. Does NOT transfer ownership. */
export function resolveCatchCandidate(db,{eventId,targetPioneerId}) {
  if(typeof eventId!=='string'||!eventId||typeof targetPioneerId!=='string'||!targetPioneerId) throw Error('CATCH_TARGET_REQUIRED');
  const target=db.prepare("SELECT active FROM actors WHERE event_id=? AND actor_id=? AND role='PIONEER'").get(eventId,targetPioneerId);
  if(!target||target.active!==1) throw Error('CATCH_TARGET_INVALID');
  const candidate=db.prepare(`SELECT core_id,visible_energy FROM cores
    WHERE event_id=? AND owner_type='PIONEER' AND owner_id=? AND status='FIELD'
    ORDER BY visible_energy DESC,core_id ASC LIMIT 1`).get(eventId,targetPioneerId);
  if(!candidate) throw Error('NO_CATCHABLE_CORE');
  return {coreId:candidate.core_id,visibleEnergy:candidate.visible_energy};
}
