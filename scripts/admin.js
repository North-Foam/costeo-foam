import { db } from '../server/db.js';
import { hashPassword } from '../server/security.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
// Credentials must be injected via private environment or a local ignored .env file.
const email = z.string().trim().toLowerCase().email().parse(process.env.ADMIN_EMAIL);
const name = z.string().trim().min(1).max(100).parse(process.env.ADMIN_NAME);
const password = z.string().min(12).max(128).parse(process.env.ADMIN_PASSWORD);
const database = await db();
try {
  await database.transaction(async tx => {
    await tx.query('LOCK TABLE users IN EXCLUSIVE MODE');
    if ((await tx.query('SELECT id FROM users LIMIT 1')).rows.length) throw new Error('El primer administrador ya existe. Usa la administración de usuarios.');
    await tx.query("INSERT INTO users(id,email,name,password_hash,role) VALUES($1,$2,$3,$4,'admin')", [randomUUID(), email, name, await hashPassword(password)]);
  });
  console.log('Administrador creado. Deberá cambiar su contraseña en el primer acceso.');
} finally { await database.close(); }
