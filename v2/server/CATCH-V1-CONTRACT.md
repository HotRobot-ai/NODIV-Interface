# Verified V1 Catch contract — migration guard

Source: `Code.js` on `main`, functions `catchPersonalCores`, `catchContext`, `catchCoreTransfer` (around lines 5580–5645), reviewed 2026-10-15.

- Catcher: ACTIVE card with `catchAccess===true`; target: ACTIVE PIONEER; no self-catch; FIELD_ACTIVE event.
- Target cannot be caught during active `ghostUntil`.
- Catcher must have a free inventory slot (`coreCapacity`); receiver's inventory counts both legacy `PIONEER`-typed and role-typed cores; exclude `IN_TRANSIT`.
- Candidate: highest **visible** energy personal FIELD core of target, deterministic core-ID tie break; exclude missing UID, nonfinite energy, and cores reserved by exchange, restore, deployment or installation. Block if catcher has an authorized exchange.
- NFC encounter creates a five-minute expiring **preview**, bound to catcher identity/card and target identity/card/UID. Preview snapshots both inventories and selected core; confirm rejects expiry or changed snapshots.
- Confirm atomically transfers selected core from target to catcher, with `ownerType='PIONEER'` **even when catcher role is LOCAL or UNBOUND**, and gives target 5 minutes Ghost protection. Logs successful completion and supports idempotent replay.
- The current V2 SQLite schema has `owner_type='PIONEER'` but capacity enforcement checks actor's personal PIONEER holdings, which can support this legacy representation; however, the V2 core still has no ghost_until column or Catch confirmation state machine.
- **Do not enable a Catch endpoint** until preview/confirm, reservations, capacity, ghost and replay are implemented together and tested. No production deployment.

V2 isolated implementation update (2026-10-15): Catch excludes active ASSIGNED mission core IDs before selecting highest-energy eligible core; local full suite 95/95. Remaining: other V1 exchange/restore/deployment/install reservations must be represented and enforced before release.
