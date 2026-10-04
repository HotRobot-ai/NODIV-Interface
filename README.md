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
be accepted/displayed as mission cargo. Successful installation hides inputs,
PRIMARY and actions and shows a compact DEPLOYMENT COMPLETE summary.

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
