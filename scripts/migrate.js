import { db } from '../server/db.js';
import { statements } from '../server/schema.js';
import defaults from '../server/defaults.json' with { type: 'json' };
export async function migrate(database) {
  await database.transaction(async tx => {
    for (const statement of statements) await tx.query(statement);
    await tx.query('INSERT INTO workspace(id,state) VALUES(1,$1) ON CONFLICT(id) DO NOTHING', [JSON.stringify(defaults)]);
  });
}
if (process.argv[1]?.endsWith('migrate.js')) {
  const database = await db(); await migrate(database); await database.close(); console.log('Base inicializada; datos existentes conservados.');
}
