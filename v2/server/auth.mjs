import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export class AuthError extends Error {
  constructor(code) { super(code); this.code = code; }
}

const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url');
const dec = x => JSON.parse(Buffer.from(x, 'base64url').toString('utf8'));

// A UID is an identifier, never a credential. Tokens are issued only after
// a separate trusted registration/authentication step.
export function issueSession({ eventId, actorId, role, ttlSeconds = 3600, now = Date.now(), secret }) {
  if (!secret || Buffer.byteLength(secret) < 32) throw new AuthError('WEAK_SECRET');
  if (![eventId, actorId, role].every(x => typeof x === 'string' && x.length > 0)) throw new AuthError('INVALID_PRINCIPAL');
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 86400) throw new AuthError('INVALID_TTL');
  const payload = enc({ v: 1, eventId, actorId, role, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + ttlSeconds, nonce: randomBytes(16).toString('hex') });
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySession(token, { secret, eventId, now = Date.now() }) {
  if (typeof token !== 'string' || token.length > 4096 || !secret || Buffer.byteLength(secret) < 32) throw new AuthError('INVALID_SESSION');
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new AuthError('INVALID_SESSION');
  const expected = createHmac('sha256', secret).update(parts[0]).digest();
  let actual;
  try { actual = Buffer.from(parts[1], 'base64url'); } catch { throw new AuthError('INVALID_SESSION'); }
  if (actual.toString('base64url') !== parts[1] || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new AuthError('INVALID_SESSION');
  let p;
  try { p = dec(parts[0]); } catch { throw new AuthError('INVALID_SESSION'); }
  if (p.v !== 1 || ![p.eventId,p.actorId,p.role].every(x => typeof x === 'string' && x.length > 0) || !Number.isSafeInteger(p.exp) || !Number.isSafeInteger(p.iat) || p.exp <= Math.floor(now/1000) || p.iat > Math.floor(now/1000) + 30 || p.eventId !== eventId) throw new AuthError('SESSION_DENIED');
  return { eventId:p.eventId, actorId:p.actorId, role:p.role };
}

// API boundary: actor identity must never be taken from untrusted request body.
export function runAuthorized(core, token, request, opts) {
  const principal = verifySession(token, { ...opts, eventId:request.eventId });
  const actor = core.db.prepare('SELECT role,active FROM actors WHERE event_id=? AND actor_id=?').get(principal.eventId, principal.actorId);
  if (!actor || !actor.active || actor.role !== principal.role) throw new AuthError('ACTOR_REVOKED');
  if ('actorId' in request && request.actorId !== principal.actorId) throw new AuthError('ACTOR_SPOOFING');
  return core.run({ ...request, actorId:principal.actorId });
}
