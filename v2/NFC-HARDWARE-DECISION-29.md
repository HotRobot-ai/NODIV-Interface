# V2 NFC hardware decision — step 29

## Verified repository evidence
- `v2/server/nfc-grants.mjs` implements scoped, expiring, one-use server grants.
- `v2/server/catch-nfc-adapter.mjs` consumes the grant atomically with Catch.
- `v2/server/catch-http-client.mjs` requires an external proof-acquisition callback.
- No verified physical NFC proof issuer is wired into the Catch HTTP lab.
- `v2/server/reader-proof.mjs` is **not present** on this development branch. A file with that name was reported in the earlier 102-test ZIP; do not treat that as a deployed capability.

## Practical hardware options
1. **Existing ordinary NFC tags + Android Web NFC:** inexpensive and suitable for identification, but UID and static tag content are replayable. Use only for lower-trust identification, never as sole Catch authorization.
2. **Server-issued, authenticated action session plus physical scan and player confirmation:** adds operational friction and reduces casual abuse, but without cryptographic tag attestation does not prove physical card presence against a determined attacker. Clearly label as a game-level trust compromise, not secure NFC attestation.
3. **Cryptographic challenge-response NFC cards + supported reader path:** can establish card possession when implemented and provisioned correctly. Requires checking actual card chip models and Android compatibility; do not claim existing cards support it.

## Decision gate
Read the exact chip model from the ShopNFC order/invoice or a card datasheet, and test available Android reader capabilities. If cards lack cryptographic authentication, decide explicitly whether game-level anti-abuse controls are acceptable or whether Catch needs stronger cards/readers.

No purchase, production change or deployment authorized. COM and Mission Board untouched.
