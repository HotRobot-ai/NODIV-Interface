import {createHmac, timingSafeEqual} from 'node:crypto';

/**
 * Verify an authenticated, server-issued scan assertion before creating a grant.
 * This does NOT prove NFC chip authenticity: only a trusted scanner/reader
 * service may issue assertions after validating the physical scan.
 */
export function createScanAssertionVerifier({resolveReaderSecret, maxAgeMs=30000, now=()=>Date.now()}={}) {
  if (typeof resolveReaderSecret !== 'function') throw new Error('TRUSTED_READER_RESOLVER_REQUIRED');
  const used = new Set(); // process-local replay cache; replace with transactional SQLite storage for deployment
  return function verify(assertion, expected) {
    if (!assertion || !expected || typeof assertion !== 'object') throw new Error('SCAN_ASSERTION_REQUIRED');
    const fields=['readerId','eventId','actorId','command','targetType','targetId','operationId','uid','nonce'];
    if (!fields.every(k=>typeof assertion[k]==='string' && assertion[k].length>0)) throw new Error('SCAN_ASSERTION_INVALID');
    for(const k of ['eventId','actorId','command','targetType','targetId','operationId']) {
      if(assertion[k]!==expected[k]) throw new Error('SCAN_SCOPE_MISMATCH');
    }
    if (typeof expected.uid==='string' && assertion.uid!==expected.uid) throw new Error('SCAN_UID_MISMATCH');
    if (!Number.isSafeInteger(assertion.timestamp) || Math.abs(now()-assertion.timestamp)>maxAgeMs) throw new Error('SCAN_EXPIRED');
    if (used.has(assertion.readerId+':'+assertion.nonce)) throw new Error('SCAN_REPLAY');
    const secret=resolveReaderSecret(assertion.readerId);
    if (typeof secret!=='string' || secret.length<32) throw new Error('READER_NOT_TRUSTED');
    const payload=JSON.stringify(fields.map(k=>assertion[k]).concat(assertion.timestamp));
    const expectedMac=createHmac('sha256',secret).update(payload).digest('hex');
    if(typeof assertion.signature!=='string'|| !/^[0-9a-f]{64}$/.test(assertion.signature) || !timingSafeEqual(Buffer.from(expectedMac,'hex'),Buffer.from(assertion.signature,'hex'))) throw new Error('SCAN_SIGNATURE_INVALID');
    used.add(assertion.readerId+':'+assertion.nonce);
    return true;
  };
}
