import {createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
import {issueNfcGrant,installNfcGrantSchema} from './nfc-grants.mjs';
const fields=['readerId','eventId','actorId','command','targetType','targetId','operationId','uid','nonce'];
export function installScanAssertionSchema(db){
 db.exec(`CREATE TABLE IF NOT EXISTS v2_scan_nonces (
  reader_id TEXT NOT NULL, nonce TEXT NOT NULL, event_id TEXT NOT NULL,
  operation_id TEXT NOT NULL, accepted_at INTEGER NOT NULL,
  PRIMARY KEY(reader_id,nonce)
 );`);
 installNfcGrantSchema(db);
}
export function createTrustedScanGrantIssuer(db,{resolveReaderSecret,resolveExpectedUid,now=()=>Date.now(),maxAgeMs=30000,ttlMs=30000}={}){
 if(typeof resolveReaderSecret!=='function'||typeof resolveExpectedUid!=='function')throw Error('SCAN_TRUST_CONFIG_REQUIRED');
 return function issue(assertion,scope){
  if(!assertion||!scope||typeof assertion!=='object'||typeof scope!=='object')throw Error('SCAN_ASSERTION_REQUIRED');
  for(const k of fields)if(typeof assertion[k]!=='string'||!assertion[k])throw Error('SCAN_ASSERTION_INVALID');
  for(const k of ['eventId','actorId','command','targetType','targetId','operationId'])if(assertion[k]!==scope[k])throw Error('SCAN_SCOPE_MISMATCH');
  const timestamp=now();
  if(!Number.isSafeInteger(timestamp)||!Number.isSafeInteger(assertion.timestamp)||assertion.timestamp>timestamp||timestamp-assertion.timestamp>maxAgeMs)throw Error('SCAN_EXPIRED');
  const secret=resolveReaderSecret(assertion.readerId);
  if(typeof secret!=='string'||secret.length<32)throw Error('READER_NOT_TRUSTED');
  const payload=JSON.stringify(fields.map(k=>assertion[k]).concat(assertion.timestamp));
  const expected=createHmac('sha256',secret).update(payload).digest();
  if(typeof assertion.signature!=='string'||!/^[a-f0-9]{64}$/.test(assertion.signature)||!timingSafeEqual(expected,Buffer.from(assertion.signature,'hex')))throw Error('SCAN_SIGNATURE_INVALID');
  db.exec('BEGIN IMMEDIATE');
  try{
   if(resolveExpectedUid(db,scope)!==assertion.uid)throw Error('SCAN_UID_MISMATCH');
   db.prepare('INSERT INTO v2_scan_nonces(reader_id,nonce,event_id,operation_id,accepted_at) VALUES (?,?,?,?,?)')
     .run(assertion.readerId,assertion.nonce,scope.eventId,scope.operationId,timestamp);
   const grant=issueNfcGrant(db,{...scope,now:timestamp,ttlMs});
   db.exec('COMMIT');
   return grant;
  }catch(e){db.exec('ROLLBACK');throw e}
 };
}
