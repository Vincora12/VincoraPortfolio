import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const args = Object.fromEntries(process.argv.slice(2).flatMap((value, index, all) => value.startsWith('--') && all[index + 1] && !all[index + 1].startsWith('--') ? [[value.slice(2), all[index + 1]]] : []));
if (!args.custom || !args.mem0) {
  console.error('Usage: node scripts/memory-reconcile.mjs --custom <copied-custom.json> --mem0 <copied-mem0.json>');
  process.exitCode = 2;
} else {
  const compiled = await build({ stdin: { contents: `export { reconcileMemoryRows } from './netlify/functions/_shared/v2/memoryReconciliation';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'error' });
  const { reconcileMemoryRows } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
  const rows = async (path, source) => {
    const parsed = JSON.parse(await readFile(resolve(path), 'utf8'));
    const input = Array.isArray(parsed) ? parsed : Array.isArray(parsed.memories) ? parsed.memories : Array.isArray(parsed.results) ? parsed.results : [];
    return input.flatMap((row, index) => {
      const text = typeof row.text === 'string' ? row.text : typeof row.memory === 'string' ? row.memory : '';
      return text ? [{ id: typeof row.id === 'string' ? row.id : `${source}:${index}`, text, source, provenance: row.metadata, confidence: row.confidence, updatedAt: row.updatedAt }] : [];
    });
  };
  const report = reconcileMemoryRows(await rows(args.custom, 'custom'), await rows(args.mem0, 'mem0'));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.safeToSwitchWriter) process.exitCode = 1;
}
