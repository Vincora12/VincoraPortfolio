/* Verifica end-to-end di Memory V1 sui moduli REALI di netlify/functions
   (non il POC), con storage e servizio Mem0 completamente isolati:
   - VINZMON_DATA_DIR punta a /tmp/memv1-check/data (mai data/vinzmon.sqlite)
   - VINZMON_MEMORY_SERVICE_URL punta a un'istanza mem0 su :8798, avviata
     a parte con storage anch'esso isolato (mai i file mem0-*.sqlite veri).
   Vedi scripts/memory-v1-manual-run.md per come avviare l'istanza di prova
   prima di eseguire questo script. */
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.VINZMON_DATA_DIR = '/tmp/memv1-check/data';
process.env.VINZMON_LOCAL_CORE = '1';
process.env.VINZMON_MEMORY_WRITER_MODE = 'mem0';
process.env.MEM0_LLM_PROVIDER = 'ollama';
process.env.MEM0_EMBEDDER_PROVIDER = 'ollama';
process.env.VINZMON_MEMORY_SERVICE_URL = 'http://127.0.0.1:8798';
process.env.VINZMON_MEMORY_SERVICE_SECRET = 'memv1-check-secret-not-real-0000';
mkdirSync(process.env.VINZMON_DATA_DIR, { recursive: true });

const cwd = process.cwd();
const dir = mkdtempSync(join(tmpdir(), 'vinz-memv1-check-'));
const entry = join(dir, 'entry.ts');
const out = join(cwd, 'node_modules', '.vinz-memv1-check.mjs');

writeFileSync(entry, `
export { writePersonalMemory, searchPersonalMemory, memoryBackendMode } from '${cwd}/netlify/functions/_shared/core/memory.ts';
export { isMemoryV1Enabled, resumeIncompleteMemoryV1Captures, searchScopedPersonalMemory } from '${cwd}/netlify/functions/_shared/memoryV1.ts';
export { getStore } from '${cwd}/netlify/functions/_shared/localStore.ts';
`);

await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error', packages: 'external' });

const m = await import(`file://${out}?v=${Date.now()}`);

let failures = 0;
const check = (ok, label) => { console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}`); if (!ok) failures++; };
const section = (title) => console.log(`\n--- ${title} ---`);

// Stato salvato sintetico: MON_A attivo.
async function seedActiveMon(name) {
  await m.getStore({ name: 'vinzmon-state', consistency: 'strong' }).setJSON('save', {
    savedAt: new Date().toISOString(), day: 1,
    state: { activeMonName: name, mons: {}, progression: { bond: 0.5 } },
  });
}

console.log('flag Memory V1 attivo:', m.isMemoryV1Enabled());
check(m.isMemoryV1Enabled() === true, 'isMemoryV1Enabled() vero con env di test isolato');
check(m.memoryBackendMode() === 'mem0', 'memoryBackendMode() legge mem0 dall\'ambiente isolato');

let messageSeq = 0;
const nextMessageId = (label) => `memv1-check-${label}-${Date.now()}-${messageSeq++}`;

section('A — memoria condivisa: MON_A vede USER + MON_A, MON_B vede solo USER');
await seedActiveMon(''); // nessun mon attivo -> lo scritto va a livello USER
await m.writePersonalMemory({ text: 'Vincenzo vive a Roma.', messageId: nextMessageId('user-fact') });
await seedActiveMon('mon-a'); // ora un mon è attivo -> lo scritto va sotto quel mon
await m.writePersonalMemory({ text: 'Con questo mon parliamo spesso di programmazione la sera.', messageId: nextMessageId('mon-a-fact') });

/* Mem0 normalizza l'estrazione in inglese (osservato in tutta la sessione,
   POC incluso) — il controllo cerca sia la forma italiana sia quella
   inglese più probabile, non una sola delle due per non ripetere l'errore
   già fatto nel POC (Test B iniziale). */
const resultsForA = await m.searchScopedPersonalMemory({ query: 'Dove vive e di cosa parliamo?', agentId: 'mon-a' });
const textsA = resultsForA.map((r) => r.text.toLowerCase()).join(' | ');
check(/roma|rome|vincenzo/.test(textsA), 'MON_A recupera il fatto USER (Roma/Vincenzo)');
check(/programmazione|programming|sera|evening/.test(textsA), 'MON_A recupera il proprio fatto privato');

const resultsForB = await m.searchScopedPersonalMemory({ query: 'Dove vive e di cosa parliamo?', agentId: 'mon-b' });
const textsB = resultsForB.map((r) => r.text.toLowerCase()).join(' | ');
check(/roma|rome|vincenzo/.test(textsB), 'MON_B recupera il fatto USER condiviso');
check(!/programmazione|programming/.test(textsB), 'MON_B NON recupera il fatto privato di MON_A');

section('B — isolamento: query filtrata per Mon esclude Mon diverso, non filtrata (assente) include solo USER');
const noScope = await m.searchScopedPersonalMemory({ query: 'Di cosa parliamo la sera?' });
check(!/programmazione/.test(noScope.map((r) => r.text.toLowerCase()).join(' ')), 'ricerca senza agentId non vede il privato di MON_A (nessun agentId = solo USER)');

section('C — correzione: Atlas venerdì -> lunedì, valore corrente corretto');
await seedActiveMon('mon-c');
await m.writePersonalMemory({ text: 'Il progetto Atlas sarà lanciato venerdì.', messageId: nextMessageId('atlas-1') });
await m.writePersonalMemory({ text: 'Il lancio di Atlas è stato spostato a lunedì.', messageId: nextMessageId('atlas-2') });
const atlas = await m.searchPersonalMemory('Quando viene lanciato Atlas?', 10);
const atlasTexts = atlas.map((r) => r.text.toLowerCase());
check(atlasTexts.some((t) => t.includes('monday')), 'la ricerca restituisce il valore corretto (lunedì)');
check(!atlasTexts.some((t) => t.includes('friday')), 'il fatto superato (venerdì) non è più presente');

section('D — concorrenza: due correzioni contemporanee sullo stesso fatto');
/* Cosa deve essere vero (garanzia di concorrenza, dal compito): nessuna
   elaborazione più vecchia finita in ritardo deve sovrascrivere in
   silenzio quella più recente. NON: che le due finiscano fuse in una sola
   riga — quello dipende dal riconoscimento della correzione (soglia +
   giudizio Ollama), un limite già dichiarato nel POC (validato su 3 casi),
   non una garanzia di concorrenza. I due si verificano separatamente. */
await seedActiveMon('mon-d');
await m.writePersonalMemory({ text: 'Il colore preferito è il blu.', messageId: nextMessageId('color-1') });
const [d1, d2] = await Promise.all([
  m.writePersonalMemory({ text: 'Il colore preferito non è più il blu, ora è il rosso.', messageId: nextMessageId('color-2a') }),
  m.writePersonalMemory({ text: 'Il colore preferito non è più il blu, ora è il verde.', messageId: nextMessageId('color-2b') }),
]);
const colorSearch = await m.searchPersonalMemory('Qual è il colore preferito?', 10);
const colorTexts = colorSearch.map((r) => r.text.toLowerCase());
/* "used to be blue but is now red" cita il blu correttamente come STORIA,
   non come valore attuale — quello che conta è che nessuna riga affermi il
   blu come stato presente (schemi tipo "is blue" / "è il blu" senza un
   riferimento al passato nella stessa frase). */
const stillBlue = colorTexts.some((t) => /\bis\s+blue\b|\bè\s+(il\s+)?blu\b/.test(t) && !/(used to be|was|era)\b.*\bblue|blu\b/.test(t));
check(!stillBlue, 'nessuna riga afferma il blu come valore ATTUALE (citarlo come storia passata va bene)');
if (d1.result.status === 'failed' || d2.result.status === 'failed') { console.log('   d1:', JSON.stringify(d1)); console.log('   d2:', JSON.stringify(d2)); }
check(d1.result.status !== 'failed' && d2.result.status !== 'failed', 'entrambe le scritture concorrenti sono riuscite (nessun errore mascherato da successo)');
console.log('   righe attive dopo le due scritture concorrenti:', colorTexts);

section('G — nuova sessione: nessuna conversazione ripassata, solo lo storage');
await seedActiveMon('mon-g');
await m.writePersonalMemory({ text: 'Il mio linguaggio di programmazione preferito è TypeScript.', messageId: nextMessageId('lang') });
const freshSession = await m.searchPersonalMemory('Qual è il mio linguaggio preferito?', 5); // nessun contesto di conversazione passato qui
check(freshSession.some((r) => /typescript/i.test(r.text)), 'il fatto torna in una ricerca "nuova sessione" senza rimandare la conversazione originale');

section('H — filtraggio: niente nodi-entità nel risultato scoped');
const scopedForFilterCheck = await m.searchScopedPersonalMemory({ query: 'TypeScript', agentId: 'mon-g' });
check(scopedForFilterCheck.length > 0, 'la ricerca scoped restituisce almeno una riga');
// searchScopedPersonalMemory filtra già i nodi entità internamente: qui si
// verifica che nessuna riga "corta" tipica di un nodo TOPIC/PROPER sia
// passata (euristica di controllo, non la garanzia stessa: quella è nel
// filtro isEntityRow dentro memoryV1.ts).
check(scopedForFilterCheck.every((r) => r.text.split(' ').length >= 3), 'nessuna riga simile a un frammento da nodo-entità nel risultato scoped');

section('Riepilogo');
console.log(failures === 0 ? `\nTUTTI I CONTROLLI PASSATI (${messageSeq} scritture sintetiche)` : `\n${failures} CONTROLLI FALLITI`);
if (failures) process.exit(1);
