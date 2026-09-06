import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const data = resolve(process.env.VINZMON_DATA_DIR || join(root, 'data'));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = join(root, 'backups', stamp);
mkdirSync(target, { recursive: true, mode: 0o700 });
let count = 0;
for (const name of ['vinzmon.sqlite', 'mem0-history.sqlite', 'mem0-vectors.sqlite']) {
  const source = join(data, name);
  if (!existsSync(source)) continue;
  const output = join(target, name);
  const db = new DatabaseSync(source);
  db.exec(`VACUUM INTO '${output.replaceAll("'", "''")}'`);
  db.close();
  count += 1;
}
if (!count) throw new Error('No VINZ.MON data exists yet; start the server before making a backup.');
console.info(`Backup created: ${target}`);
