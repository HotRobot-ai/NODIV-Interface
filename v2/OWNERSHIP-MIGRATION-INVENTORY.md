# NODIV V2 – verified ownership migration inventory (2026-10-13)

Source: main/Code.js, blob bcb88f87369aad0b787c1b533bcce1f91a0a9e06. This document records inspected implementation, not V2 test results.

| Workflow | Existing implementation | State touched |
|---|---|---|
| Exchange | normalExchange, validateLiveExchange, stageValidatedExchangeTransfer | Core ownership/status, exchange log, session-bound order, node cooldown |
| Catch | catchCoreTransfer, catchContext | Highest eligible personal Core, ownership, target ghost time, completion receipt |
| RESTORE #1/#2 | normalRestoreOne | HQ transit Core -> Node, displaced Core -> Pioneer (#1) or HQ (#2), slot capacity, deployment, node lock |
| RE-SUPPLY | normalReSupply | HQ transit deployment, target Node Core, Pioneer inventory, mission state |
| HQ Upload | normalHqUpload | Pioneer -> HQ reserve, secured-energy ledger, upload terminal reservation, receipt |
| Installation | confirmNodeInstallation | Exactly three reserved Cores -> Node, deployment status, node/event state |
| EVAC | evacuationAction, evacuationFinalAction | Team assignments, recoveries, final cargo, event lifecycle |
| Shutdown | shutdownFieldEvent | Founder authorization, installed node/core guards, event completion |

## V2 invariant requirements
- Exactly 200 unique Core IDs and UID mappings per event.
- Each Core has exactly one authoritative owner; active Node requires exactly 3 Cores.
- All mutation + status + energy credit + audit + idempotency receipt commit in ONE SQLite transaction on ONE event Durable Object.
- All requests must derive actor from authenticated server session, never from NFC UID alone.
- Persist operation state and replay receipts beyond client retry and temporary order expiration.
- Event close must reject outstanding transfers and incomplete recovery.
- Never import current live event into test fixtures without explicit authorization.

## Migration risk discovered
RESTORE #1 increases Pioneer capacity and transfers displaced Core to Pioneer; RESTORE #2 returns displaced Core to HQ. A generic 'swap' would silently change gameplay. HQ Upload also credits secured energy, so ownership-only persistence is insufficient.

## Open
Detailed line-by-line reconciliation of every path, database schema, Cloudflare runtime implementation, provider pricing, end-to-end and load testing. COM and Mission Board remain excluded.
