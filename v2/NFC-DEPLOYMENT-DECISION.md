# NODIV V2 — NFC security and deployment assessment

Status: architecture assessment; no production changes.

## Verified prototype boundary
- A provisioned reader HMAC proves use of the reader secret, **not authenticity of a physical UID-only NFC tag**.
- A copied UID or compromised reader can still impersonate a tag.
- Player sessions are signed, but a complete trusted enrollment flow has not been implemented.

## Practical paths
1. **Browser NFC**: Treat UID as an untrusted gameplay signal, never as identity or cryptographic proof of presence. Authenticate the player separately; apply server-side action/session/target/state/cooldown guards and audit. Browser support varies; iOS Safari has no general-purpose Web NFC API for this workflow. Never ship reader secrets in browser JavaScript.
2. **Provisioned reader / Android app**: Can sign server challenges and attest its own observation if device keys are securely provisioned, rotated and revoked. Still does not authenticate a UID-only tag. Verify existing antenna capabilities first.
3. **Cryptographic NFC tags**: May prove tag possession with challenge-response, but require verified chip/platform support and approval of any hardware changes.

## Architecture recommendation
- Keep assurance levels explicit: `READER_ATTESTED_UID` versus `BROWSER_REPORTED_UID`. Neither is cryptographic proof of physical presence.
- Make per-operation policy explicit; never silently promote browser-reported UID to trusted-reader proof.
- Keep transactional ownership engine independent of NFC transport.
- Verify existing tag/antenna chip types, current registration flow, Android/iOS behavior, and latency before choosing deployment.

## Still unknown
- Reader model/API and secure secret storage.
- Node and Access Card tag types and any cryptographic features.
- Cross-device field tests and current production scan flow.
