# Catch V2 — NFC trust boundary review (step 28)

Verified source modules:
- `nfc-grants.mjs`: `issueNfcGrant` inserts a scoped, short-lived grant; `consumeNfcGrant` atomically marks it consumed.
- `catch-nfc-adapter.mjs`: Catch confirmation consumes that grant within the ownership transaction.
- `trusted-executor.mjs`: resolves authoritative scope and consumes grants within domain writes.
- `catch-http-client.mjs`: accepts an injected `acquireFreshNfcProof` callback.
- `catch-v2-ui.mjs`: requires the same callback, but does not implement it.

**Missing verified component:** a server-trusted physical NFC scan attestation and grant issuer. Web NFC serialNumber/UID alone is an identifier, not cryptographic proof of card presence. A public endpoint accepting a client-reported UID and issuing a Catch grant would be unsafe.

Next development gate: select and verify a supported trusted reader/provisioning architecture (e.g. supervised reader or cryptographic challenge-response capable hardware), and bind physical proof to event, actor, target Pioneer and Catch preview. Then integrate an issuer with expiry and replay protection. Do not issue grants from arbitrary browser UID claims.

No production deployment. No changes to V1 Catch, COM or Mission Board.
