# V2 Catch interface integration boundary

Current production-era UI: `NODIV_Catch_V1.0.html` calls Apps Script `identify`, `uidlookup`, `catch` directly with physical card/core UIDs. It does not call V2 `CatchTransaction.preview` or `confirm`.

Isolated V2 module: `v2/server/catch-ui-flow.mjs` orchestrates preview -> fresh NFC proof -> confirm, with one refresh after stale preview. It is **not yet connected** to the existing Catch HTML or a live V2 HTTP endpoint.

Implementation requirement: keep existing V1 UI untouched. Create a dedicated V2 adapter only after confirming authenticated HTTP endpoints for preview, proof acquisition and confirm. Never turn an old V1 UID lookup into an authorization token. Do not silently retry with a consumed NFC grant.

Game rule confirmed: an already-started Node Exchange completes first. Then Catch selects the highest-energy currently catchable personal N-Core. Stale previews must be refreshed.

No production deployment or gameplay change.
