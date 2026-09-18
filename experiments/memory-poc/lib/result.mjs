import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { POC_ROOT } from './setup.mjs';

const DIR = resolve(POC_ROOT, 'results');
mkdirSync(DIR, { recursive: true });

export function writeResult(name, obj) {
  const path = resolve(DIR, `${name}.json`);
  writeFileSync(path, JSON.stringify(obj, null, 2));
  console.log(`\n=== ${obj.status ?? '?'} — ${name} ===`);
  console.log(JSON.stringify(obj, null, 2));
  return path;
}
