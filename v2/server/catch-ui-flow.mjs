// Isolated UI orchestration. The server alone authorizes fresh NFC proof.
// Never reuse an NFC grant tied to an obsolete Catch preview.
export function createCatchUiFlow({preview, confirm, acquireFreshNfcProof, onStatus = () => {}}) {
  if (![preview, confirm, acquireFreshNfcProof].every(fn => typeof fn === 'function')) throw Error('CATCH_UI_CONFIG_REQUIRED');
  let pending = false;
  return async function completeCatch(targetId) {
    if (pending) throw Error('CATCH_ALREADY_RUNNING');
    pending = true;
    try {
      let p = await preview(targetId);
      for (let attempt = 0; attempt < 2; attempt++) {
        const proof = await acquireFreshNfcProof({targetId, previewId:p.previewId});
        try {
          const receipt = await confirm({targetId, previewId:p.previewId, proof});
          onStatus('CATCH_COMPLETE');
          return receipt;
        } catch (e) {
          if (attempt || !['CATCH_SNAPSHOT_CHANGED', 'CATCH_EXPIRED'].includes(e?.message)) throw e;
          onStatus('CATCH_REFRESHING');
          p = await preview(targetId);
        }
      }
    } finally { pending = false; }
  };
}
