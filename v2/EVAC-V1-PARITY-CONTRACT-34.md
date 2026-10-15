# EVAC V1 code parity — verified 15 Oct 2026, step 34

Source: `Code.js` on GitHub `main`, inspected directly. This is the source contract for V2 EVAC; the simplified prototype described in MASTERSTAND is **not** parity.

## Mandatory EVAC-1 sequence
- Founder may start only in FIELD_ACTIVE after completed pre-evacuation and no active installation, Exchange, RESTORE or RE-SUPPLY operations (`Code.js` lines 7964–7978).
- FOP forms a team with **two distinct active Pioneers**, verified through their Access Card UIDs; the team consists of one FOP and two Pioneers (7980–7985).
- Each team reserves **two eligible start Nodes** and each Node's **three distinct cores**. The two Pioneers each become carrier for one Node's complete three-core cargo (7990–8001).
- FOP deinstalls the team's Nodes in assigned sequence, scanning the correct Node and three cores; each core transfers to protected `NODIV_RESERVE/HQ IN_TRANSIT` with a deployment reservation, not to a freely exchangeable Pioneer inventory (7930–7950, 4500–4525).
- A team completes only after both Nodes are recovered; recovery receipt replay must not duplicate movements (7952–7962).

## Mandatory EVAC-2 final upload
- Each Pioneer scans **one assigned cargo core** at the final upload, receives a short-lived snapshot-bound scan receipt, and confirms (`Code.js` 8061–8085).
- Confirmation withdraws **all three** assigned cargo cores into `NODIV_RESERVE/HQ RESERVE`, marks deployments `DELIVERED`, and credits energy for **the one scanned selected core only** (8085–8090).
- A team's withdrawal receipt is written after both Pioneers' final uploads (8089).
- Completion requires exactly **10 original start Nodes**, **5 distinct teams**, **15 distinct members**, **10 recovered Nodes**, **two recoveries and two final uploads per team**, zero Node-owned cores, matching energy ledger and deployment receipts, no open operations, and valid Event Register closure (8029–8059).

## Migration implications
A V2 shortcut that sends two cores to Pioneers and one to HQ is incompatible. Preserve protected cargo, two-node team order, 3/3 FOP deinstallation, final one-core energy award, full three-core withdrawal, replay, and global completion guards. The code also contains PRE-EVAC functionality (7793–7875) and event shutdown separate from story EVAC (4534 onward).

## Verification boundary
This is a code inspection, **not** a running V2 implementation or end-to-end test. No production deployment. COM and Mission Board untouched.
