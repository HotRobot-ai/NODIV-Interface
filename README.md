# NODIV // NODE DIVISION

**MISSION WÜRZBURG // 2027**

Digital interface for the NODIV field infrastructure.

This repository contains the browser-based terminal used to interact with the physical NODE NETWORK and the N-CORE SYSTEM.

## SYSTEM

**NODIV**  
NODE DIVISION

**CENTRAL OPERATIONS**  
WÜRZBURG

## COMPONENTS

- N-CORE registration
- NODE control
- NFC identity access
- Founder / ROOT access
- Connection to the NODIV game database
- Mobile field operation via Web NFC

## ARCHITECTURE

Physical infrastructure and digital systems are connected through NFC.

`NFC → UID → NODIV API → GAME DATABASE → CENTRAL OPERATIONS`

The frontend is hosted through GitHub Pages.

The backend is provided by Google Apps Script with Google Sheets as the operational database.

## PROJECT

**MISSION WÜRZBURG // 2027**

A physical-digital urban game built around people, places and connected infrastructure.

---

`NODIV // CENTRAL OPERATIONS`  
`SYSTEM ACCESS // RESTRICTED`


## FOP initial Node installation

`nodeinstallorder` supplies PRIMARY and a server-selected loadout of exactly three
registered, free HQ reserve Cores. The selection considers all triples, favors
STABLE (>=600 visible E), then minimizes distance to a per-Node energy budget
(the smaller of the pool's average triple and available energy / remaining
unstocked Event Nodes, with a 600 E target floor). Equal candidates prefer the
smaller energy spread; sorted energy/ID order makes ties deterministic. If no
STABLE triple exists, the best available total determines DEGRADED/CRITICAL.
This is a balancing heuristic, not a guarantee of an optimal full-event partition.

Reservations reuse the existing Deployment Register: three ASSIGNED rows with
purpose `NODE_INSTALLATION`, the exact Node/carrier and installation-specific
IDs. Private Script Properties hold session/event-bound order metadata and a
fixed 30-minute expiry. No new sheet or automatic ownership migration is used.
The login, event state and expiry must remain valid for a reservation to count.
Expired/revoked reservations are ignored immediately, even without a scheduler;
the next order cleans their rows. `nodeinstallcancel` marks reservations CANCELLED;
a new order replaces the previous order for that login. Cache eviction does not
lose the durable order. Failed reservation publication removes its metadata.

The FOP sets the physical lock, scans only those three Cores in any order and
inserts them into the Node. The mobile deployment console shows three assigned
Core slots, ID/visible E, total E, projected state and verification from 0/3 to
3/3. Foreign scans return `CORE NOT ASSIGNED TO NODE-XXX`. Confirmation rechecks
all UIDs, ownership/status, assignment and competing mission deployments under
ScriptLock. Existing ownership/transaction helpers prepare one atomic Sheets
batch for transfers, log entries, reservation delivery and Node/code activation.
Other ownership transfers respect these reservations; installation rows cannot
be accepted/displayed as mission cargo. Successful installation hides PRIMARY and scan/confirm controls and shows a
compact DEPLOYMENT COMPLETE summary.

Existing complete Nodes are rejected before selection or writes. In particular,
no changes/migration run for NODE-001's real 859 E loadout (NC-006=105,
NC-003=401, NC-004=353). Existing ACTIVE+PRIMARY but empty legacy Nodes still need
an explicit order, including during FIELD_ACTIVE. Nodes with 1, 2 or more than
3 owned Cores require manual investigation; ownership is never auto-corrected.

Deployment: sync `Code.js` to the existing Apps Script project and create a new
version of the existing web-app deployment. Keep its existing URL and the Sheets
v4 advanced service from package 1. GitHub Pages serves the updated FOP UI.

Validation: `node --test tests/*.test.cjs`; FOP DOM-state tests use simulated
NFC/API responses and require no browser dependencies. Visual mobile-browser
verification remains necessary; Chromium was unavailable in the execution environment.
The backend fixture covers loadout balance, STABLE/fallback states, reservation
isolation/expiry/cancellation, foreign and unordered scans, atomic failure,
existing transfer behavior and preservation of the real NODE-001 fixture.
Physical Android NFC, UID reading, lock setup, Core insertion, deployed API
permissions and concurrent real-device operations require real-world validation.


## FOP operations, recovery and Alpha shutdown

The mobile FOP console now selects only server-listed operations; free Node-ID
entry is removed. `fopoperations` returns `{id, type, nodeId, label}` options such
as `INSTALL // NODE-002` or `DEINSTALL // NODE-001`. Empty/unavailable queues show
`NO OPERATIONS AVAILABLE` and disable retrieval. The list is read-only: it checks
current event membership, provisioning, Node/core state, assignments, stock and
live reservations without adding Event Nodes. Order retrieval repeats validation
under ScriptLock, so stale/spoofed selections cannot authorize an operation.
NODE-002 provisioned after the current initialization stays outside that event.

The existing installation selection and atomic booking remain. Recovery reuses
its expiring session/event-bound order metadata, Deployment Register reservations,
scan validation, cancellation and ownership/log batch helpers. New reservation
purpose: `NODE_DEINSTALLATION`; installation rows retain `NODE_INSTALLATION`.
Prior installation attribution does not restrict which authorized FOP can accept
a recovery; the new order binds its own FOP/session. Node access, Node-targeted
mission assignment and competing ownership transfers are blocked during either
live FOP operation. Expiry/revocation or explicit cancellation releases the
reservation; scans never move ownership. Abort a partially performed physical
recovery only after restoring the physical state represented by the database.

| Action | Required parameters beyond `action` | Result |
| --- | --- | --- |
| `fopoperations` | `token` | Current authorized operation options |
| `nodedeinstallorder` | `token`, `node` | Exact three current NODE-owned Core IDs/E/UID-bound removal order |
| `nodedeinstallscan` | `token`, `node`, `installation`, `uid` | Verified 0/3–3/3 removal progress |
| `nodedeinstallcancel` | `token`, `node`, `installation` | Release recovery reservations, ownership unchanged |
| `nodedeinstallconfirm` | `token`, `node`, `installation` | Atomic 3/3 return to HQ + code/Node deactivation |
| `eventshutdown` | Founder `token`, current `event` ID | Technical FIELD_ACTIVE -> COMPLETED, or concrete blockers |

On explicit 3/3 recovery confirmation, one atomic Sheets batch moves all three
Cores from NODE to NODIV_RESERVE/HQ with RESERVE status, records transactions,
closes reservation rows, sets the Node AVAILABLE, clears current FOP attribution
and disables active/pending code slots. Event Node Codes uses DEINSTALLED; all
five mechanical codes and the historical INSTALLED AT remain. Node recovery and
its actor are retained in the Transaction Log. Success shows
`RECOVERY COMPLETE // NODE-001 // 3/3 CORES RETURNED` and hides scan/confirm/code
controls. Loadout energy is labeled recoverable energy/current Node state.

The Founder Event Control button `FIELD EVENT SHUTDOWN // ALPHA BESTÄTIGEN`
invokes a separate event-bound shutdown. `abortEvent()` stays unchanged and denies
FIELD_ACTIVE. Shutdown requires all Event Node records to be DEINSTALLED with
inactive codes and AVAILABLE physical register state, zero Node-owned Cores
(including outside the event), and no live installation/recovery orders for the
current event. Failure returns `FIELD_SHUTDOWN_BLOCKED`, `message` and `blockers`.
Success atomically writes COMPLETED, zero active Nodes, UPDATED AT and a new
COMPLETED AT column (K) plus FIELD_EVENT_SHUTDOWN audit entry. No history is
removed; completed events are excluded by the existing readCurrentEvent(). New
initialization still requires the existing readiness/preflight process.
This is only an Alpha technical shutdown, not story evacuation or final uploads.

Deployment does not run recovery, alter NODE-001's 859 E loadout, add NODE-002 to
the active event or migrate data. Sync Code.js and redeploy the same Apps Script
web app; existing Sheets v4 service is reused. Column K is added only on explicit
successful shutdown. Physical Android NFC, removal/return to HQ, concurrent device
locking, empty/eligible queue display, mobile layout, blocked shutdown and successful
shutdown/new-event preparation require real-device checks after deployment.

### Pioneer Normal Exchange V1.0

A Node scan (`gameplayroute`) returns status, visible total energy, allowed sizes
and a short-lived session-bound preview, never a mechanical code.
`exchangeauthorize` requires `token`, `node`, `preview`, `size`; only this action
releases the current code after validating FIELD_ACTIVE membership, confirmed
Node state, exactly three Node cores, inventory/slot limit and reservations.
`exchangescan` requires `token`, `node`, `exchange`, `uid`: scan all personal
incoming cores first, then the same number of outgoing Node cores.
`exchangeconfirm` and `exchangecancel` use `token`, `node`, `exchange`.

Orders expire after 30 minutes and bind the session, event, Node/code state and
core snapshots. They reserve the Node and Pioneer inventory against competing
FOP orders, exchanges and ownership transfers. Cancel/expiry does not move cores.
Only final confirmation books all ownership/status transfers and transaction
records in one Sheets batch. A durable NORMAL_EXCHANGE transaction stores the
completion ID and starts a server-enforced five-minute Node cooldown, including
after cache eviction or a lost response. Completion cannot replay.
The first successful exchange while capacity is one writes RESTORE_1_ELIGIBLE
in the same batch; it does not grant a slot or start a restore mission.

Deploy the updated Code.js to the existing Apps Script web app; the existing
Sheets v4 service is reused. No live data migration or test-event mutation is
performed by deployment. Physical NFC identification/selection, mechanical
access, Android layout and real network interruptions require hardware tests.

### RESTORE V1.0 — Phase 1 (capacity 1 → 2)

Founder uses `restoreeligible` (token) and `restoreassign` (token, pioneer).
Only ACTIVE PIONEER identities with capacity 1, RESTORE_1_ELIGIBLE and no prior
RESTORE_1_COMPLETE qualify. The server selects a free, active FIELD_ACTIVE
Event Node with exactly three registered cores and total visible energy below
600 E. It prioritizes the lowest Node energy, then Node ID. Replacement is
fixed to the lowest visible Node core (ties by Core ID). It chooses the least
HQ energy that reaches STABLE, otherwise the least that reaches DEGRADED.
If no pair qualifies, no order is created. There is no manual Node/core choice.

The existing Deployment Register records purpose RESTORE_1 / IN_TRANSIT. Cargo
retains NODIV_RESERVE/HQ ownership with status IN_TRANSIT, so it never occupies
a personal slot and is excluded from catch, upload and normal exchange.
Durable Script Properties retain the assigned snapshots, scans and expiration.
Orders last 30 minutes; Founder eligibility/assignment explicitly cleans stale
orders and returns unchanged HQ-owned cargo status to RESERVE. Expiry never
changes ownership. Historical deployment/log rows remain. No migration or live
data change happens merely by deploying this code.

Pioneer `restorestate` returns mission information without a code. A target
Node NFC scan via `gameplayroute` binds/resumes the existing order to the current
authenticated session of the assigned identity. `restoreauthorize` requires
token, restore, node and the preceding target scan; only then is the current
mechanical code returned. `restorescan` additionally uses uid and phase IN/OUT;
accepted retries return authoritative progress without adding another scan.
Only the assigned HQ cargo and the fixed lowest Node core are accepted.
The generic deployment-delivery endpoint cannot execute RESTORE.

`restoreconfirm` revalidates event, identity, session, Node/code fingerprint,
all Node core snapshots, cargo, deployment and competing reservations under
ScriptLock. One Advanced Sheets batch moves cargo HQ → NODE / DEPLOYED, returns
the lowest Node core NODE → HQ / RESERVE, marks the deployment COMPLETED, sets
Access Card Register capacity to 2 and records RESTORE_1_IN, RESTORE_1_OUT and
RESTORE_1_COMPLETE. Personal inventory is unchanged. Completion consumes
eligibility and prevents replay, even if property cleanup fails. Failed batches
leave all ownership, logs, capacity and scan progress intact for recovery.
The durable completion timestamp enforces RESTORE_TARGET_LOCKED for that
Pioneer/Node for one hour; the API reports remainingSeconds and lockUntil.
Other Nodes remain accessible. No RESTORE #2 or additional progression is added.

Deploy updated Code.js to the existing Apps Script Web App (existing Sheets v4
service), and publish the frontend updates. Test cargo handoff, target scan,
mechanical code, ordered NFC scans, session recovery and mobile layout with real
Android hardware before relying on field operation.

### CATCH V1.0 — direct authenticated encounter

The existing `catch` action now takes `token` and `mode=preview` with a physically
scanned `targetUid`, then `mode=confirm` with the returned `catchId`. The Catcher
must have an active authenticated Access Card with `catchAccess=true`; the target
must present an active Pioneer card. Self-catch is rejected. Anonymous legacy
requests and manually selected Core IDs do not authorize a transfer.

The preview discloses only target identity and readiness, never the selected Core.
The server selects the highest **visible** energy eligible personal FIELD Core
(ties use Core ID). Transit, open deployments, active Exchange/Restore/FOP Core
reservations are excluded. No eligible Core yields `NO_CATCHABLE_CORE`; no free
personal slot yields `CATCHER_CAPACITY_FULL`. Existing Ghost protection is respected;
Catch does not introduce a new Ghost timer or change progression/RESTORE rewards.

Five-minute previews use existing Script Properties, reserve no inventory and
store private inventory snapshots. Under ScriptLock, confirm rechecks the cards,
FIELD_ACTIVE event, full inventories, highest eligible Core and reservations.
Two overlapping previews of the same target cannot both commit. The existing
ownership engine stages one Advanced Sheets atomic batch: `PIONEER/<target>` to
`PIONEER/<catcher>`, status FIELD, and `CATCH_COMPLETE` including visible energy.
The durable log is the retry receipt, including when the batch succeeded but its
response was lost. No new sheet, column, migration or live-data repair is required.

Catcher roles display their PIONEER-owned personal Cores alongside any existing
role-owned inventory; both types count against capacity, excluding transit cargo.
The Catcher screen refreshes immediately after success. Other visible field
screens poll authoritative player state every five seconds and refresh on focus;
there is no GPS or browser ownership calculation. Red/yellow/green indicate an
open step, running NFC/server operation, and server acceptance.

Deploy a new Apps Script Web App version and the updated frontend/cache assets.
Real Android/NFC validation remains necessary for login, both physical Access
Cards, duplicate NFC callbacks, actual handover and recovery from interrupted
network responses. No physical cards or live event data are changed by deployment.
