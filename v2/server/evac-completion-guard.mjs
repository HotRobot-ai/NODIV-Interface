/**
 * EVAC-1/2 completion gate derived from Code.js main (lines 8029–8052).
 * Pure preflight: caller must supply an authoritative, consistent DB snapshot.
 * NOT a completion command; does not mutate event state or grant permissions.
 */
export function checkEvacCompletion(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') throw Error('EVAC_SNAPSHOT_REQUIRED');
  const {event, startNodes, teams, nodes, cores, openOperations = []} = snapshot;
  if (!event || !Array.isArray(startNodes) || !Array.isArray(teams) ||
      !Array.isArray(nodes) || !Array.isArray(cores) || !Array.isArray(openOperations))
    throw Error('EVAC_SNAPSHOT_INVALID');
  const blockers = [];
  const unique = a => new Set(a).size === a.length;
  const allAssignments = teams.flatMap(t => t.nodes ?? []);
  const members = teams.flatMap(t => [t.fop, ...(t.pioneers ?? [])]);
  if (startNodes.length !== 10 || !unique(startNodes) || teams.length !== 5 ||
      !unique(teams.map(t => t.id)) || members.length !== 15 ||
      members.some(m => typeof m !== 'string' || !m) || !unique(members) ||
      allAssignments.length !== 10 ||
      !unique(allAssignments.map(n => n.nodeId)) ||
      startNodes.some(id => !allAssignments.some(n => n.nodeId === id)) ||
      teams.some(t => (t.pioneers ?? []).length !== 2 || (t.nodes ?? []).length !== 2 ||
        t.nodes.some((n,i) => n.carrier !== t.pioneers[i])))
    blockers.push('TEN_START_NODES_NOT_RECOVERED');
  if (event.state !== 'FIELD_ACTIVE' || event.activeNodes !== 0 ||
      !Number.isInteger(event.plannedNodes) || event.plannedNodes < 10 || event.plannedNodes > 12 ||
      nodes.some(n => n.state !== 'DEINSTALLED'))
    blockers.push('EVENT_NODES_NOT_WITHDRAWN');
  if (cores.some(c => c.ownerType === 'NODE')) blockers.push('NODE_OWNED_CORES_REMAIN');
  for (const team of teams) {
    const recovered = team.recovered ?? [];
    const finals = team.finals ?? [];
    if (recovered.length !== 2 || !unique(recovered) ||
        (team.nodes ?? []).some(n => !recovered.includes(n.nodeId)) ||
        team.teamCompleteReceipts !== 1 || team.withdrawalReceipts !== 1)
      blockers.push(team.id + ': TEAM_NOT_WITHDRAWN');
    for (const assignment of team.nodes ?? []) {
      const final = finals.find(f => f.pioneer === assignment.carrier);
      if (!final || final.coreIds?.length !== 3 ||
          !unique(final.coreIds) || (assignment.coreIds ?? []).length !== 3 ||
          assignment.coreIds.some(id => !final.coreIds.includes(id)) ||
          !assignment.coreIds.includes(final.selectedCoreId) ||
          final.energy !== final.selectedCoreEnergy ||
          final.ledgerEntries !== 1 || final.ledgerAmount !== final.energy ||
          final.allCargoWithdrawn !== true)
        blockers.push(assignment.carrier + ': FINAL_UPLOAD_INVALID');
    }
  }
  if (openOperations.length) blockers.push('OPEN_EVACUATION_OPERATION');
  return [...new Set(blockers)];
}
