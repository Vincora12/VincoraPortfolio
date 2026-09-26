import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import readline from 'node:readline';

const child = spawn(process.execPath, [resolve('scripts/hermes-vinz-mcp-server.mjs')], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: process.env,
});
const lines = readline.createInterface({ input: child.stdout });
const replies = [];
lines.on('line', (line) => replies.push(JSON.parse(line)));
child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'check', version: '1' } } })}\n`);
child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`);
if (process.env.VINZMON_TOKEN) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'vinz_leggi_me', arguments: {} } })}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'vinz_registra_peso', arguments: { request_id: 'unconfirmed-check', kg: 70 } } })}\n`);
}

setTimeout(() => {
  child.kill('SIGTERM');
  const initialized = replies.find((reply) => reply.id === 1)?.result?.serverInfo?.name === 'vinzmon';
  const names = replies.find((reply) => reply.id === 2)?.result?.tools?.map((tool) => tool.name) ?? [];
  const expected = ['vinz_leggi_me', 'vinz_registra_pasto', 'vinz_registra_allenamento', 'vinz_registra_peso'];
  const readReply = replies.find((reply) => reply.id === 3)?.result;
  const readOk = !process.env.VINZMON_TOKEN || (readReply?.isError !== true && readReply?.content?.[0]?.text?.includes('"ok":true'));
  const deniedReply = replies.find((reply) => reply.id === 4)?.result;
  const unconfirmedWriteDenied = !process.env.VINZMON_TOKEN || (deniedReply?.isError === true && deniedReply?.content?.[0]?.text?.includes('Scrittura rifiutata'));
  if (!initialized || expected.some((name) => !names.includes(name)) || !readOk || !unconfirmedWriteDenied) {
    console.error('Hermes VINZ.MON MCP check failed.');
    process.exitCode = 1;
    return;
  }
  console.log(`Hermes VINZ.MON MCP check passed (${names.length} tools).`);
}, 250);
