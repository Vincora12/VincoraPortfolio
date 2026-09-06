import { build } from 'esbuild';

await build({
  entryPoints: ['server/core-server.ts'],
  outfile: 'server-dist/server.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  packages: 'external',
  external: ['node:*'],
  logLevel: 'info',
});
