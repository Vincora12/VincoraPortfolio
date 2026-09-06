import { spawn } from 'node:child_process';

const children = [
  spawn(process.execPath, ['server-dist/server.mjs'], { stdio: 'inherit', env: { ...process.env, PORT: process.env.CORE_PORT || '8787' } }),
  spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['exec', '--', 'vite'], { stdio: 'inherit' }),
];
const stop = () => children.forEach((child) => child.kill('SIGTERM'));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
const [code] = await Promise.race(children.map((child) => new Promise((done) => child.once('exit', (code) => done([code ?? 1])))));
stop();
process.exitCode = code;
