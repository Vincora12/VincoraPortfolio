import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const PORT=5207;
const server=spawn('npx',['vite','--port',String(PORT),'--strictPort'],{stdio:['ignore','pipe','pipe'],detached:true});
let ready=false; server.stdout.on('data',d=>{const s=d.toString(); if(s.includes('ready in')||s.includes('Local:'))ready=true;});
for(let i=0;i<120&&!ready;i++) await sleep(100); await sleep(700);
let b;
try { b = await chromium.launch({args:['--no-proxy-server']}); } catch {
  const root='/opt/pw-browsers';
  const c=readdirSync(root).filter(d=>d.startsWith('chromium')).flatMap(d=>[join(root,d,'chrome-linux','chrome'),join(root,d,'chrome-linux','headless_shell')]).filter(existsSync);
  b = await chromium.launch({executablePath:c[0],args:['--no-proxy-server']});
}
const p=await b.newPage({viewport:{width:460,height:1000}});
p.on('pageerror',e=>console.log('PAGEERROR',String(e)));
await p.goto(`http://localhost:${PORT}/#/lab/soul`,{waitUntil:'networkidle'});
await sleep(1200);
// le tre ancore dello schizzo, una per volta
for (const [nome, chip] of [['sleepy','sleepy'],['neutral','neutral'],['angry','angry']]) {
  await p.locator(`.soullab__chip:text-is("${chip}")`).first().click();
  await sleep(500);
  await p.locator('.soullab__stage').first().screenshot({path:`/tmp/soul-${nome}.png`});
}
await b.close(); try{process.kill(-server.pid,'SIGTERM')}catch{}
console.log('fatto');
