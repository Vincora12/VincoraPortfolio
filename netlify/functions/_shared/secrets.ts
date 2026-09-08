/* ============================================================================
   METTERE UNA CHIAVE, DAL LAB INVECE CHE DAL TERMINALE

   🔷 «Devo poter mettere le API key sul lab.» Fino a oggi l'unico modo era
   aprire `.env` a mano sul Mac — `setup.ts` sapeva solo DIRE quale chiave
   manca e dove andarla a prendere, mai scriverla.

   🔒 STESSA LEGGE DI `setup.ts`: mai restituire una chiave, solo se c'è. Qui
   vale anche al contrario — si accetta una chiave in scrittura, non la si
   rimanda mai indietro nella risposta.

   🔒 ELENCO CHIUSO. `name` deve essere una delle variabili che questo
   progetto dichiara di sapere usare (`SETTABLE_VARS`, sotto) — mai una
   stringa arbitraria dal client. Altrimenti questo endpoint diventerebbe un
   modo per scrivere QUALSIASI variabile d'ambiente del server, `VINZMON_TOKEN`
   incluso: la chiave con cui questa stessa richiesta si è autenticata.

   ⚠️ EFFETTO IMMEDIATO E DUREVOLE INSIEME. `process.env` cambia subito — la
   prossima chiamata al fornitore la vede, senza riavviare il Core — e la
   riga viene scritta anche su `.env`, altrimenti la chiave sparirebbe al
   prossimo riavvio, l'esatto opposto di «impostata». */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Le uniche variabili che questo endpoint può scrivere. Mai `VINZMON_TOKEN`:
    è il segreto con cui la richiesta stessa si autentica, cambiarlo da qui
    potrebbe chiudere fuori chi lo sta usando in quel momento. */
export const SETTABLE_VARS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_API_KEY',
  'MOONSHOT_API_KEY',
  'XAI_API_KEY',
  'VINZMON_SHORTCUT_TOKEN',
] as const;
export type SettableVar = (typeof SETTABLE_VARS)[number];

export function isSettableVar(name: string): name is SettableVar {
  return (SETTABLE_VARS as readonly string[]).includes(name);
}

/* 🔴 `import.meta.url` QUI MENTE: dopo `npm run build:server` questo file
   vive impacchettato dentro `server-dist/server.mjs`, un unico file — la sua
   URL a runtime è quella del BUNDLE, non quella di questo sorgente. Un
   calcolo "sali di N cartelle" tarato sulla profondità di `_shared/` è
   sbagliato per costruzione: al primo giro ha scritto `.env` un livello
   SOPRA il repository, silenziosamente, restituendo comunque `{ok:true}`.

   🔒 `process.cwd()` invece è vero per definizione: `mon.vinz.core.plist`
   dichiara `WorkingDirectory` sulla radice del repo, ed è lì che il processo
   vive per tutta la sua vita — lo stesso presupposto su cui già si regge
   `localStore.ts` (`resolve(process.env.VINZMON_DATA_DIR || 'data')`, che è
   relativo alla CWD esattamente per questo). */
const ENV_PATH = join(process.cwd(), '.env');

/**
 * Scrive una variabile su `.env` e in `process.env`, sostituendo la riga se
 * già c'è. Una stringa vuota SPEGNE la chiave (la riga resta, vuota) invece
 * di cancellarla: coerente con come il resto dell'app already legge
 * `ANTHROPIC_API_KEY=` come «non configurata», non come «riga assente».
 */
export function setSecret(name: SettableVar, value: string): void {
  const line = `${name}=${value}`;
  const existing = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  const next = pattern.test(existing)
    ? existing.replace(pattern, line)
    : `${existing.replace(/\n?$/, '\n')}${line}\n`;
  writeFileSync(ENV_PATH, next, 'utf8');
  process.env[name] = value;
}
