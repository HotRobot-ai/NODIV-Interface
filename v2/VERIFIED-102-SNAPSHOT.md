# NODIV V2 — verified 102-test source snapshot

Source archive in Google Drive:
https://drive.google.com/file/d/1tOtHXn0tvBaqrp5yOSELNALT4oh9ep9-/view

Snapshot: `NODIV-V2-CATCH-RECIPROCAL-102-TESTS.zip`
SHA-256: `ba12120772cd07d0ca49a8ff5d4e80ca783bfb31dc4f9f1834c5d04dba69463e`

Verified by extracting archive and running `node --test '*.test.mjs'` in `nodiv-v2-integration` on 2026-10-15: **102 passed, 0 failed**.

Critical source digests from extracted archive:
- `sqlite-core.mjs`: `040ac59323b8e0e460932a87cdb9424d94eafd0b619466d20510f071186c5cd4`
- `catch-transaction.mjs`: `14b0d06c72366971543014a193fab465573a168a64c67a8c71cfbf3e3bbceb07`
- `catch-reciprocal.test.mjs`: `f247e4fddf838c79623488742fdc39f9e6cbedc32afaa360fb91e5f4e52d210a`

**Important:** This manifest is NOT a substitute for importing the actual source files to GitHub. Until the import, Drive archive is the authoritative recovery snapshot. This isolated V2 code is NOT deployed to production. Mission Board/COM remain frozen.
