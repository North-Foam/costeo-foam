import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export const digest = value => createHash('sha256').update(value).digest('hex');
export const newToken = () => randomBytes(32).toString('hex');
export const cookieName = process.env.VERCEL || process.env.NETLIFY || process.env.NODE_ENV === 'production' ? '__Host-nf_session' : 'nf_session';
export function cookie(res, token, maxAge = 8 * 3600) {
  res.setHeader('Set-Cookie', `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${cookieName.startsWith('__Host-') ? '; Secure' : ''}`);
}
export function sessionToken(req) {
  const entry = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='));
  const token = entry?.slice(cookieName.length + 1);
  return /^[a-f0-9]{64}$/.test(token || '') ? token : '';
}
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${salt}$${hash.toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  const [, salt, hash] = (encoded || '').split('$');
  const actual = await derive(password, salt || '00000000000000000000000000000000', 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
  const expected = Buffer.from(hash || '00'.repeat(64), 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
export function checkOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const expected = process.env.APP_ORIGIN;
  if (!expected || req.headers.origin !== expected || (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site']))) {
    return res.status(403).json({ error: 'Origen de solicitud no permitido.' });
  }
  if (!req.is('application/json')) return res.status(415).json({ error: 'Se requiere JSON.' });
  next();
}
export async function rateLimit(database, bucket, limit) {
  const { rows } = await database.query(`INSERT INTO rate_limits(bucket, attempts, reset_at) VALUES($1,1,now()+interval '15 minutes')
    ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN rate_limits.reset_at <= now() THEN 1 ELSE rate_limits.attempts+1 END,
    reset_at=CASE WHEN rate_limits.reset_at <= now() THEN now()+interval '15 minutes' ELSE rate_limits.reset_at END RETURNING attempts`, [digest(bucket)]);
  return rows[0].attempts <= limit;
}
