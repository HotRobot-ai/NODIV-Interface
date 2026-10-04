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

The existing `nodeinstallorder` returns PRIMARY plus a session-bound installation
ID. Set the mechanical lock first, then call `nodeinstallscan` for three distinct
registered NFC UIDs. The app displays the server's Core IDs, visible energy and
`1/3`, `2/3`, `3/3`; confirmation stays disabled until the server returns 3/3.
`nodeinstallconfirm` rechecks the login, order, event, Node, all three UIDs,
HQ reserve ownership/status and open deployments under the existing ScriptLock.
It stages the existing ownership/transaction helpers and commits all Core
transfers, audit entries and installation/code status in one atomic Sheets batch.
Batch timestamps are stored as ISO 8601 strings including their timezone.

Orders expire after 30 minutes (or earlier if the login/cache expires). Fetching
an order again invalidates that login's previous order and resets its scan list.
Scanning does not reserve or transfer a Core; a competing transfer causes final
confirmation to fail without partial writes. Fetch a new order after an ambiguous
network timeout to reconcile safely with the authoritative Node state.

Existing ACTIVE + PRIMARY Nodes with zero owned Cores are identified explicitly
as legacy installations. They can be completed through an explicitly fetched
order, including during FIELD_ACTIVE, retaining their existing PRIMARY code and
event phase. No migration or automatic Core booking runs on deployment/read.
Nodes with 1, 2 or more than 3 owned Cores require manual investigation; their
ownership is never auto-corrected. Already complete Nodes cannot be reinstalled.
Event activation and gameplay access require exactly three Node-owned Cores.

Deployment: sync `Code.js` and `appsscript.json` to the existing Apps Script
project and create a new version of its existing web-app deployment. The manifest
enables the advanced Google Sheets v4 service for atomic `batchUpdate`; enable
the Sheets API in the linked Cloud project if using a standard Cloud project,
and authorize the service if prompted. Keep the existing web-app URL.

Validation: `node --test tests/node-installation.test.cjs` and JavaScript syntax
checks. Tests use an in-memory Apps Script/Sheets fixture; physical Android NFC,
mechanical lock setup, actual Core insertion and the deployed Google Sheets API
must be checked on the real hardware/deployment.
