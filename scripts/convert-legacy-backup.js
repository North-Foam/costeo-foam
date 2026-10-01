import { readFile, writeFile } from 'node:fs/promises';
import { convertLegacyState } from '../server/legacy.js';

const [source, destination] = process.argv.slice(2);
if (!source || !destination) {
  console.error('Uso: node scripts/convert-legacy-backup.js respaldo.json convertido.json');
  process.exit(1);
}
const state = convertLegacyState(JSON.parse(await readFile(source, 'utf8')));
await writeFile(destination, JSON.stringify(state, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log('Respaldo convertido y validado.');
