/* ============================================================================
   V2 ISSUE CAPTURE — VERIFICA (VINZ.MON PROTOTYPE V1 → V2)

   Stessa strada di scripts/conversation-lifecycle-check.mjs: esbuild
   impacchetta il sorgente TS vero (client + funzione Netlify), Node
   esegue — nessuna modifica al sorgente per renderlo testabile.

   Uso:  node scripts/v2-issues-check.mjs
   ========================================================================= */

import { build } from "esbuild";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cwd = process.cwd();
const dir = mkdtempSync(join(tmpdir(), "vinz-v2issues-"));
const entry = join(dir, "entry.ts");
const out = join(cwd, "node_modules", ".vinz-v2-issues-check.mjs");

writeFileSync(
  entry,
  [
    `export { isV2IssueIntent, classifyV2Issue, normalizeV2Title, v2IssueConfirmationText } from '${cwd}/src/ai/v2Issues.ts';`,
    `export { normalizeTitle, findDuplicate, nextId } from '${cwd}/netlify/functions/v2-issues.ts';`,
  ].join("\n"),
);

await build({
  entryPoints: [entry],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: out,
  logLevel: "error",
  external: ["@netlify/blobs"],
});

const {
  isV2IssueIntent,
  classifyV2Issue,
  normalizeV2Title,
  v2IssueConfirmationText,
  normalizeTitle,
  findDuplicate,
  nextId,
} = await import(`file://${out}`);

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`  ${ok ? "OK  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

const issue = (overrides = {}) => ({
  id: "V2-001",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  title: "New Chat deve partire vuota",
  area: "CHAT",
  type: "BUG",
  observation: "New Chat non parte vuota.",
  status: "OPEN",
  ...overrides,
});

// CASE 1 — Chat normale: nessun intento V2.
check(
  isV2IssueIntent("oggi sono stanco") === false,
  "CASE 1: 'oggi sono stanco' non è un intento V2",
);
check(
  isV2IssueIntent("ho fatto colazione con due uova") === false,
  "CASE 1b: un messaggio di salute ordinario non è un intento V2",
);
check(
  isV2IssueIntent("quando esce la v2?") === false,
  "CASE 1c: una domanda che nomina 'v2' senza chiederne la registrazione non scatta",
);

// CASE 2 — intento V2 riconosciuto sulle frasi guida della spec.
const guidancePhrases = [
  "Segna questa cosa per la versione finale.",
  "Questa nella V2 va sistemata.",
  "Ricordati che nella versione definitiva voglio X.",
  "Segna per la V2 che questa cosa non deve funzionare così.",
  "Questo bug nella versione finale va risolto.",
  "Segna per la versione finale che New Chat deve partire vuota.",
];
for (const phrase of guidancePhrases) {
  check(isV2IssueIntent(phrase) === true, `CASE 2: intento riconosciuto — "${phrase}"`);
}

// CASE 2b — la classificazione produce un'osservazione utilizzabile, senza AI.
{
  const result = classifyV2Issue("Segna per la versione finale che New Chat deve partire vuota.");
  check(
    /new chat/i.test(result.observation) && /vuota/i.test(result.observation),
    "CASE 2b: l'osservazione estratta contiene il problema, non il verbo di comando",
    result.observation,
  );
  check(result.area === "CHAT", "CASE 2b: area classificata correttamente", result.area);
  check(result.title.length > 0 && result.title.length <= 91, "CASE 2b: titolo non vuoto e limitato in lunghezza");
}

// CASE 3 — persistenza riuscita: VINZ.MON conferma, con l'ID vero.
{
  const text = v2IssueConfirmationText({ ok: true, issue: { id: "V2-007", title: "New Chat deve partire vuota" }, merged: false });
  check(text.includes("V2-007") && /^Segnato/.test(text), "CASE 3: conferma con l'ID reale su creazione", text);
  const mergedText = v2IssueConfirmationText({ ok: true, issue: { id: "V2-003", title: "Qualcosa" }, merged: true });
  check(/^Aggiornato/.test(mergedText), "CASE 3b: la fusione con un issue esistente si dichiara come aggiornamento, non come nuova voce", mergedText);
}

// CASE 4 — persistenza fallita: NESSUNA falsa conferma.
{
  const text = v2IssueConfirmationText({ ok: false });
  check(!/segnato|aggiornato/i.test(text), "CASE 4: nessuna falsa conferma quando il salvataggio fallisce", text);
  check(/non sono riuscito/i.test(text), "CASE 4b: il fallimento è dichiarato esplicitamente", text);
}

// CASE 5 — stesso problema segnalato due volte: deduplicazione conservativa,
// la voce esistente si aggiorna invece di raddoppiare.
{
  const existing = [issue()];
  const dup = findDuplicate(existing, "CHAT", "New chat deve partire vuota");
  check(Boolean(dup) && dup.id === "V2-001", "CASE 5: lo stesso problema (variazione di maiuscole/spazi) trova la voce esistente");
  const dupSubstring = findDuplicate(existing, "CHAT", "New Chat deve partire vuota anche su iPhone");
  check(Boolean(dupSubstring), "CASE 5b: una descrizione più lunga che CONTIENE il titolo esistente è ancora riconosciuta come lo stesso problema");
}

// CASE 6 — problema diverso: nuovo ID stabile, nessuna fusione sbagliata.
{
  const existing = [issue()];
  const differentArea = findDuplicate(existing, "MEMORY", "New Chat deve partire vuota");
  check(differentArea === undefined, "CASE 6: stesso titolo ma area diversa NON si fonde — conservativo per costruzione");
  const differentTitle = findDuplicate(existing, "CHAT", "Il modello risponde in inglese");
  check(differentTitle === undefined, "CASE 6b: un problema chiaramente diverso non trova nessun duplicato");
  const id = nextId(existing);
  check(id === "V2-002", "CASE 6c: il prossimo ID è sequenziale e stabile", id);
  const idWithGap = nextId([issue({ id: "V2-001" }), issue({ id: "V2-005" })]);
  check(idWithGap === "V2-006", "CASE 6d: l'ID successivo segue il massimo esistente, non la lunghezza dell'elenco", idWithGap);
}

// CASE 5/6 supporto — normalizzazione: server e client concordano sulla
// stessa nozione di "stesso titolo" (accenti, maiuscole, punteggiatura).
check(
  normalizeTitle("New Chat deve partire VUOTA!") === normalizeTitle("new chat deve partire vuota"),
  "CASE 5c: la normalizzazione lato server ignora maiuscole e punteggiatura",
);
check(
  normalizeV2Title("Perché è così") === normalizeV2Title("Perche e cosi"),
  "CASE 5d: la normalizzazione client-side (anteprima) ignora gli accenti",
);

// CASE 9 — nessuna credenziale GitHub nel bundle browser: il modulo
// client-side non referenzia token/credenziali GitHub, solo il token
// applicativo esistente (lo stesso già usato da ogni altra chiamata).
{
  const clientSource = (await import("node:fs")).readFileSync(
    join(cwd, "src/ai/v2Issues.ts"),
    "utf8",
  );
  check(
    !/github|GITHUB_TOKEN|ghp_/i.test(clientSource),
    "CASE 9: src/ai/v2Issues.ts non nomina credenziali GitHub",
  );
  const backendSource = (await import("node:fs")).readFileSync(
    join(cwd, "src/ai/backend.ts"),
    "utf8",
  );
  check(
    !/github/i.test(backendSource.match(/createV2Issue[\s\S]{0,400}/)?.[0] ?? ""),
    "CASE 9b: le chiamate V2 Issues nel client non toccano GitHub",
  );
}

// CASE 8 — non solo localStorage: il modulo di cattura non legge/scrive
// localStorage, passa sempre dal backend server-side.
{
  const clientSource = (await import("node:fs")).readFileSync(
    join(cwd, "src/ai/v2Issues.ts"),
    "utf8",
  );
  // Cerca un USO reale (localStorage.getItem/.setItem/...), non la parola
  // nel commento che dichiara esplicitamente che questo modulo non lo usa.
  check(!/localStorage\s*\.\s*\w+\s*\(/.test(clientSource), "CASE 8: src/ai/v2Issues.ts non chiama mai l'API di localStorage");
}

console.log(failures === 0 ? "\nV2 issue capture: tutte le verifiche passano." : `\n${failures} verifica/e fallite.`);
process.exit(failures === 0 ? 0 : 1);
