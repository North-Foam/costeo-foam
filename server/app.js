import express from 'express';
import helmet from 'helmet';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { db } from './db.js';
import { cookie, sessionToken, digest, newToken, hashPassword, verifyPassword, checkOrigin, rateLimit } from './security.js';
import { validateState, validateRoleChanges } from './state.js';

export const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: {
  defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'], imgSrc: ["'self'", 'data:', 'blob:'],
  connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'self'"],
  upgradeInsecureRequests: process.env.NODE_ENV === 'production' || process.env.VERCEL ? [] : null
} }, crossOriginEmbedderPolicy: false }));
app.use('/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.use('/api', checkOrigin, express.json({ limit: '2mb', strict: true }));
const fail = (status, message) => { const e = new Error(message); e.status = status; throw e; };
const emailSchema = z.string().trim().toLowerCase().email().max(254);
const passwordSchema = z.string().min(12, 'La contraseña debe tener al menos 12 caracteres.').max(128);
const roleSchema = z.enum(['admin', 'captura', 'consulta']);
const nameSchema = z.string().trim().min(1).max(100);
const publicUser = u => ({ id: u.id, email: u.email, name: u.name, role: u.role, active: u.active, mustChangePassword: u.must_change_password });
async function audit(database, actor, action, details = {}) {
  await database.query('INSERT INTO audit_log(actor_id,action,details) VALUES($1,$2,$3)', [actor, action, JSON.stringify(details)]);
}
async function authenticate(req, res, next) {
  const token = sessionToken(req);
  if (!token) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
  const database = await db();
  const { rows } = await database.query(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true`, [digest(token)]);
  if (!rows.length) { cookie(res, '', 0); return res.status(401).json({ error: 'La sesión terminó. Inicia sesión nuevamente.' }); }
  req.user = rows[0]; req.token = token; next();
}
const adminOnly = (req, res, next) => req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Solo el administrador puede realizar esta acción.' });

app.post('/api/login', async (req, res) => {
  const input = z.object({ email: emailSchema, password: z.string().min(1).max(128) }).strict().parse(req.body);
  const database = await db();
  const ip = process.env.VERCEL ? String(req.headers['x-vercel-forwarded-for'] || req.socket.remoteAddress).split(',')[0].trim() : req.socket.remoteAddress;
  if (!await rateLimit(database, 'ip:' + ip, 40) || !await rateLimit(database, 'email:' + input.email, 8)) {
    res.setHeader('Retry-After', '900'); return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos.' });
  }
  const { rows } = await database.query('SELECT * FROM users WHERE email=$1', [input.email]);
  const user = rows[0];
  if (!await verifyPassword(input.password, user?.password_hash) || !user?.active) return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  const token = newToken();
  await database.transaction(async tx => {
    // Recheck password and activation under lock so reset/deactivation wins races.
    const { rows: fresh } = await tx.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [user.id]);
    if (!fresh[0]?.active || fresh[0].password_hash !== user.password_hash) fail(401, 'Inicia sesión nuevamente.');
    await tx.query('DELETE FROM sessions WHERE expires_at<=now() OR token_hash=$1', [digest(sessionToken(req))]);
    await tx.query("DELETE FROM rate_limits WHERE reset_at < now()-interval '1 day'");
    await tx.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '8 hours')", [digest(token), user.id]);
    await audit(tx, user.id, 'login');
  });
  cookie(res, token); res.json({ user: publicUser(user) });
});
app.use('/api', authenticate);
app.get('/api/me', (req, res) => res.json({ user: publicUser(req.user) }));
app.post('/api/logout', async (req, res) => {
  await (await db()).query('DELETE FROM sessions WHERE token_hash=$1', [digest(req.token)]);
  cookie(res, '', 0); res.json({ ok: true });
});
app.post('/api/password', async (req, res) => {
  const input = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema }).strict().parse(req.body);
  const database = await db();
  if (!await rateLimit(database, 'password:' + req.user.id, 8)) fail(429, 'Demasiados intentos. Espera 15 minutos.');
  if (input.currentPassword === input.newPassword) fail(400, 'Elige una contraseña diferente.');
  if (!await verifyPassword(input.currentPassword, req.user.password_hash)) fail(400, 'La contraseña actual no es correcta.');
  const hash = await hashPassword(input.newPassword);
  await database.transaction(async tx => {
    const result = await tx.query('UPDATE users SET password_hash=$1,must_change_password=false WHERE id=$2 AND password_hash=$3 RETURNING id', [hash, req.user.id, req.user.password_hash]);
    if (!result.rows.length) fail(409, 'Tu cuenta cambió. Inicia sesión nuevamente.');
    await tx.query('DELETE FROM sessions WHERE user_id=$1', [req.user.id]);
    await audit(tx, req.user.id, 'password_changed');
  });
  cookie(res, '', 0); res.json({ ok: true });
});
app.use('/api', (req, res, next) => req.user.must_change_password ? res.status(403).json({ error: 'Cambia tu contraseña temporal para continuar.', code: 'PASSWORD_CHANGE_REQUIRED' }) : next());
app.get('/api/state', async (req, res) => {
  const { rows } = await (await db()).query('SELECT state,revision,updated_at FROM workspace WHERE id=1');
  if (!rows.length) fail(503, 'La base de datos aún no está inicializada.');
  res.json(rows[0]);
});
app.put('/api/state', async (req, res) => {
  if (req.user.role === 'consulta') fail(403, 'Tu perfil es de solo consulta.');
  const input = z.object({ revision: z.number().int().nonnegative(), state: z.unknown() }).strict().parse(req.body);
  const state = validateState(input.state);
  const result = await (await db()).transaction(async tx => {
    // Revalidate role in the write transaction; never trust a role from the browser.
    const { rows: users } = await tx.query('SELECT * FROM users WHERE id=$1 FOR SHARE', [req.user.id]);
    const user = users[0];
    if (!user?.active || user.must_change_password || user.role === 'consulta') fail(403, 'Tu cuenta ya no tiene permiso para guardar.');
    const { rows } = await tx.query('SELECT state,revision FROM workspace WHERE id=1 FOR UPDATE');
    if (rows[0].revision !== input.revision) fail(409, 'Otra persona guardó cambios. Respalda tus cambios pendientes y recarga antes de continuar.');
    validateRoleChanges(user.role, rows[0].state, state);
    const changed = await tx.query('UPDATE workspace SET state=$1, revision=revision+1,updated_at=now(),updated_by=$2 WHERE id=1 RETURNING revision,updated_at', [JSON.stringify(state), user.id]);
    await audit(tx, user.id, 'state_saved', { revision: changed.rows[0].revision });
    return changed.rows[0];
  });
  res.json(result);
});
app.get('/api/users', adminOnly, async (req, res) => {
  const { rows } = await (await db()).query('SELECT id,email,name,role,active,must_change_password FROM users ORDER BY created_at');
  res.json({ users: rows.map(publicUser) });
});
app.post('/api/users', adminOnly, async (req, res) => {
  const input = z.object({ email: emailSchema, name: nameSchema, role: roleSchema, password: passwordSchema }).strict().parse(req.body);
  const hash = await hashPassword(input.password);
  const user = await (await db()).transaction(async tx => {
    await requireCurrentAdmin(tx, req.user.id);
    const { rows } = await tx.query('INSERT INTO users(id,email,name,role,password_hash) VALUES($1,$2,$3,$4,$5) RETURNING *', [randomUUID(), input.email, input.name, input.role, hash]);
    await audit(tx, req.user.id, 'user_created', { userId: rows[0].id, role: input.role }); return rows[0];
  });
  res.status(201).json({ user: publicUser(user) });
});
async function requireCurrentAdmin(tx, id) {
  // Consistent ordering serializes changes and protects the last active admin.
  const { rows } = await tx.query('SELECT * FROM users ORDER BY id FOR UPDATE');
  const actor = rows.find(u => u.id === id);
  if (!actor?.active || actor.role !== 'admin' || actor.must_change_password) fail(403, 'Tu cuenta ya no tiene permiso de administrador.');
  return rows;
}
app.patch('/api/users/:id', adminOnly, async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const input = z.object({ name: nameSchema.optional(), role: roleSchema.optional(), active: z.boolean().optional(), password: passwordSchema.optional() }).strict().parse(req.body);
  const hash = input.password ? await hashPassword(input.password) : null;
  const user = await (await db()).transaction(async tx => {
    const users = await requireCurrentAdmin(tx, req.user.id); const target = users.find(u => u.id === id);
    if (!target) fail(404, 'Usuario no encontrado.');
    if (id === req.user.id && (input.active === false || (input.role && input.role !== 'admin') || hash)) fail(400, 'Usa otro administrador para cambiar tu perfil; cambia tu contraseña desde Mi cuenta.');
    const role = input.role ?? target.role; const active = input.active ?? target.active;
    if (target.active && target.role === 'admin' && (!active || role !== 'admin') && users.filter(u => u.active && u.role === 'admin').length <= 1) fail(400, 'Debe quedar al menos un administrador activo.');
    const { rows } = await tx.query('UPDATE users SET name=$1,role=$2,active=$3,password_hash=$4,must_change_password=$5 WHERE id=$6 RETURNING *', [input.name ?? target.name, role, active, hash ?? target.password_hash, hash ? true : target.must_change_password, id]);
    await tx.query('DELETE FROM sessions WHERE user_id=$1', [id]);
    await audit(tx, req.user.id, 'user_updated', { userId: id, role, active, passwordReset: !!hash }); return rows[0];
  }); res.json({ user: publicUser(user) });
});
app.get('/api/audit', adminOnly, async (req, res) => {
  const { rows } = await (await db()).query('SELECT a.id,a.action,a.details,a.created_at,u.name AS actor FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 100');
  res.json({ entries: rows });
});
app.get('/api/tc', async (req, res) => {
  if (!process.env.BMX_TOKEN) return res.status(503).json({ error: 'La consulta a Banxico no está configurada. Captura el tipo de cambio manualmente.' });
  const response = await fetch('https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF43718,SF60653/datos/oportuno', { headers: { 'Bmx-Token': process.env.BMX_TOKEN }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) fail(502, 'Banxico no está disponible.');
  const body = await response.json();
  const pick = id => { const d = body.bmx?.series?.find(s => s.idSerie === id)?.datos?.[0]; const valor = Number(String(d?.dato).replaceAll(',', '')); return Number.isFinite(valor) && valor > 0 ? { valor, fecha: d.fecha } : null; };
  res.json({ fix: pick('SF43718'), pagos: pick('SF60653') });
});
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
app.use(express.static(resolve('public'), { dotfiles: 'deny', index: 'index.html', setHeaders: res => res.setHeader('Cache-Control', 'no-cache') }));
app.use((err, req, res, next) => {
  if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues[0]?.message || 'Datos inválidos.' });
  if (err.code === '23505') return res.status(409).json({ error: 'Ese correo ya está registrado.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Los datos exceden el tamaño permitido (2 MB).' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' });
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error('Request failed', err.code || err.name); // Never log credentials, SQL values or financial payloads.
  res.status(503).json({ error: 'El servicio no está disponible. Revisa la conexión y la configuración de la base de datos.' });
});
export default app;
