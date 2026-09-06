import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const action = process.argv[2];
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const label = 'mon.vinz.core';
const agents = join(homedir(), 'Library', 'LaunchAgents');
const plist = join(agents, `${label}.plist`);
const pidFile = join(root, 'data', 'vinzmon.pid');
const uid = typeof process.getuid === 'function' ? process.getuid() : 501;
const domain = `gui/${uid}`;
const run = (...args) => spawnSync(args[0], args.slice(1), { stdio: 'inherit' });
const inspect = (...args) => spawnSync(args[0], args.slice(1), { stdio: 'ignore' });

if (action === 'install') {
  mkdirSync(agents, { recursive: true });
  mkdirSync(join(root, 'data'), { recursive: true });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n<key>Label</key><string>${label}</string>\n<key>ProgramArguments</key><array><string>${process.execPath}</string><string>${join(root, 'server-dist', 'server.mjs')}</string></array>\n<key>WorkingDirectory</key><string>${root}</string>\n<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>\n<key>StandardOutPath</key><string>${join(root, 'data', 'service.log')}</string>\n<key>StandardErrorPath</key><string>${join(root, 'data', 'service-error.log')}</string>\n</dict></plist>\n`;
  writeFileSync(plist, xml, { mode: 0o600 });
  run('launchctl', 'bootout', domain, plist);
  const result = run('launchctl', 'bootstrap', domain, plist);
  if (result.status !== 0) process.exit(result.status ?? 1);
  run('launchctl', 'kickstart', '-k', `${domain}/${label}`);
  console.info('VINZ.MON auto-start installed and started.');
} else if (action === 'uninstall') {
  run('launchctl', 'bootout', domain, plist);
  if (existsSync(plist)) unlinkSync(plist);
  console.info('VINZ.MON auto-start removed. Local data was preserved.');
} else if (action === 'stop') {
  if (existsSync(plist)) run('launchctl', 'bootout', domain, plist);
  else if (existsSync(pidFile)) {
    const pid = Number(readFileSync(pidFile, 'utf8'));
    try { process.kill(pid, 'SIGTERM'); } catch { console.info('VINZ.MON is not running.'); }
  } else console.info('VINZ.MON is not running.');
} else if (action === 'status') {
  const result = inspect('launchctl', 'print', `${domain}/${label}`);
  if (result.status !== 0 && existsSync(pidFile)) {
    const pid = Number(readFileSync(pidFile, 'utf8'));
    try { process.kill(pid, 0); console.info(`VINZ.MON is running (PID ${pid}).`); }
    catch (error) { console.info(error?.code === 'EPERM' ? `VINZ.MON is running (PID ${pid}).` : 'VINZ.MON is not running (stale PID file).'); }
  } else if (result.status === 0) console.info('VINZ.MON launchd service is running.');
  else console.info('VINZ.MON is not running.');
} else {
  console.error('Usage: node scripts/service.mjs install|uninstall|stop|status');
  process.exitCode = 2;
}
