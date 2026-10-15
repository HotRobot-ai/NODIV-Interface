# V2 SQLite source-of-truth recovery (2026-10-15)

Canonical isolated package (NOT deployed):
https://drive.google.com/file/d/13N7QEScITMh86ZHyUEJHeJfixEHgFnF0/view

File: NODIV-V2-SQLITE-NFC-INTEGRATION-83-TESTS.zip
ZIP SHA-256: `437c3de6b3db4d5d57d0a38a314cf84540344903adbd810b1d722e43a37136d3`
Contained `sqlite-core.mjs` SHA-256: `35e1070d5da81cf5796fbfa401e1546e4278c640af8378f7415473a9a46246f2`

Reproducible baseline: `node --test *.test.mjs` in extracted archive: **83/83 pass** (verified from original ZIP).

**Not a full integration:** Catch/EVAC/INSTALL/DEINSTALL are denied by `ACTION_NOT_IMPLEMENTED` in this core. No production deployment. Do not confuse adapter tests on this branch with implemented game-domain handlers. Master state should track separate local archive and GitHub branch.

Next: import exact `sqlite-core.mjs` bytes to this isolated branch; check digest, then run complete tests and implement Catch under the original V1 rules. No COM/Mission Board changes.
