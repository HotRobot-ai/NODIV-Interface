# V2 transactional core — security gate (14 Oct 2026)

Source inspected: local `sqlite-core.mjs`; local test runner reported 54 passing tests. This is **not** a production readiness claim.

## Blocking findings before integration
1. `SqliteGameCore.run()` is a privileged mutation method, not a public API. It accepts caller-provided `actorId`, `moves`, `kind`, `operationId`, and `missionId`. Only a server-side command layer may construct these values from verified sessions, NFC grants, and authoritative state.
2. `EXCHANGE` validates route, node state and capacity, but not NFC scan/session, node cooldown, player inventory progress, or an exchange order.
3. `RESTORE_1` and `RESTORE_2` validate ownership and the lowest visible Node Core, but not assigned restore mission, required prior exchange, or the one-hour post-restore Node lock.
4. `RESUPPLY` validates assigned mission, expiry and transit ownership, but its `mission.node_id` is only checked as installed; there is no consumed proof of an actual scan at that target node in the transaction.
5. `HQ_UPLOAD` validates ownership and calculates exact energy credit, but does not yet enforce upload terminal ownership/reservation or HQ scan authorization.
6. `CATCH`, `INSTALL`, `DEINSTALL`, `EVAC`, and `SHUTDOWN` deliberately fail closed with `ACTION_NOT_IMPLEMENTED`.
7. The prototype uses Node.js `node:sqlite` and has **not** been verified in Cloudflare Durable Objects SQLite or under a self-hosted HTTP runtime.

## Mandatory integration order
1. Define authenticated command boundary; reject client-supplied ownership graph and actor IDs.
2. Bind a verified, single-use NFC grant and any mission/order to the *same transaction* as the Core transfer.
3. Implement missing per-action domain guards, especially cooldowns and event/role lifecycle.
4. Add race, replay, recovery and multi-user tests; verify real Cloudflare and/or self-hosted runtime separately.
5. Only then consider integration, field tests, performance evaluation and a separately approved production deployment.

No Mission Board or COM work. No production change authorized.
