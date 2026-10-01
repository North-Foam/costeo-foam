// One-time private bootstrap. Leave disabled for ordinary deployments.
if (process.env.BOOTSTRAP_ADMIN === 'true') {
  const { db } = await import('../server/db.js');
  const { migrate } = await import('./migrate.js');
  await migrate(await db());
  await import('./admin.js');
}
