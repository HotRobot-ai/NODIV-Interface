# V2 102-test archive: GitHub reconciliation (2026-10-15)

Archive (37 files): https://drive.google.com/file/d/10fFGOXQLtWWTPFHIdKyRrqb0wpQA_qs2/view

Compared original archive Git blob SHA-1 values against branch feature/v2-102-snapshot-import.

Of 12 files with matching names already under v2/server/, **9 are byte-identical** to the archive:
- auth.mjs
- catch-candidate.mjs
- catch-nfc-adapter.mjs
- catch-transaction.mjs
- catch-transaction.test.mjs
- nfc-grants.mjs
- sqlite-core.mjs
- sqlite-core.test.mjs
- v2-core-nfc-adapter.mjs

**3 test files differ**, preserve both versions until compared:
- catch-candidate.test.mjs: archive f092a320e22558b0478c54410d3e292c23075580; v2/server b453a386befa5c723f0db83bc3168c967072915d
- catch-reciprocal.test.mjs: archive a405a833df7f39223b8fb06e6e90815df898af9e; v2/server 09d3088171e388d4c89ee6c2e4552617234e1766
- v2-core-nfc-adapter.test.mjs: archive 861f657dcd55cccae7097ec6de0367567f9c2e53; v2/server 5774a87c43695b57cdcd9cd73c9cc05d6476b990

Nine archive originals are independently committed under v2/snapshot-102/ and have matching Git blob SHAs. README.md there is an additional metadata file, not part of the 37-file archive.

The local archive passed 102/102 tests. **The assembled GitHub branch has not been tested as an integrated 102-test version.** Do not claim deployment readiness. Main and production remain unchanged.
