/* ============================================================================
   SAVE CONTROL — VERIFICA (LAB CONSOLIDATION + SAVE CONTROL)

   Stessa strada di scripts/v2-issues-check.mjs: esbuild impacchetta il
   sorgente TS vero, Node esegue — nessuna modifica al sorgente per renderlo
   testabile.

   🔒 Copre `state/saveComparison.ts`, la logica pura che sostituisce le due
   copie che c'erano prima (DEV → SERVER e adesso LAB → SYSTEM → SAVE).
   `shouldDownload` — la guardia del reset lato client — ha già copertura in
   scripts/batch-check.mjs e non si duplica qui.

   Uso:  node scripts/save-control-check.mjs
   ========================================================================= */

import { build } from "esbuild";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cwd = process.cwd();
const dir = mkdtempSync(join(tmpdir(), "vinz-savecontrol-"));
const entry = join(dir, "entry.ts");
const out = join(cwd, "node_modules", ".vinz-save-control-check.mjs");

writeFileSync(
  entry,
  [
    `export { compareSaves, peekSave, quandoFa } from '${cwd}/src/state/saveComparison.ts';`,
  ].join("\n"),
);

await build({
  entryPoints: [entry],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: out,
  logLevel: "error",
});

const { compareSaves, peekSave, quandoFa } = await import(`file://${out}`);

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`  ${ok ? "OK  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

const peek = (overrides = {}) => ({
  day: 10, savedAt: "2026-01-01T00:00:00.000Z", mons: 2, activeMonName: "Sol", kept: 1, nodes: 5,
  ...overrides,
});

// CASE 1 — allineati: nessuna delle due colonne ha qualcosa che l'altra non ha.
check(compareSaves(peek(), peek()) === "allineati", "CASE 1: due copie identiche sono allineate");

// CASE 2 — il server è indietro su un solo campo: basta a dichiararlo indietro.
check(
  compareSaves(peek(), peek({ kept: 0 })) === "server-indietro",
  "CASE 2: il server con meno .mon in teca è 'indietro', anche a parità di giorno",
);

// CASE 3 — il server è avanti su un solo campo.
check(
  compareSaves(peek(), peek({ nodes: 8 })) === "server-avanti",
  "CASE 3: il server con più nodi mindline è 'avanti', anche a parità di giorno",
);

// CASE 4 — divergenti: ognuna ha qualcosa che l'altra non ha.
check(
  compareSaves(peek({ mons: 3 }), peek({ kept: 4 })) === "divergenti",
  "CASE 4: locale avanti su un campo e indietro su un altro è 'divergenti', non 'allineati'",
);

// CASE 5 — il verdetto guarda la storia, non solo il giorno (lo stesso caso
// che ha fatto sparire dei progressi: due copie allo stesso giorno con
// contenuti diversi).
check(
  compareSaves(peek({ day: 12 }), peek({ day: 12, kept: 3 })) === "server-avanti",
  "CASE 5: stesso giorno ma il server ha più roba — 'avanti' lo dice comunque",
);

// CASE 6 — peekSave legge in difesa: un salvataggio senza quella chiave non rompe.
{
  const p = peekSave({}, 7, null);
  check(p.mons === 0 && p.kept === 0 && p.nodes === 0 && p.activeMonName === null, "CASE 6: peekSave su uno stato vuoto non solleva eccezioni e dà zeri onesti");
}
{
  const p = peekSave({ mons: { a: 1, b: 2 }, kept: [1], activeMonName: "Luna" }, 7, "2026-01-01T00:00:00.000Z");
  check(p.mons === 2 && p.kept === 1 && p.activeMonName === "Luna", "CASE 6b: peekSave legge i campi che ci sono davvero");
}

// CASE 7 — quandoFa non esplode su un timestamp assente o non valido.
check(quandoFa(null) === "mai", "CASE 7: nessuna scrittura ancora — 'mai', non un errore");
check(quandoFa("non-una-data") === "non-una-data", "CASE 7b: un timestamp illeggibile torna così com'è, non NaN");

console.log(failures === 0 ? "\nSave control: tutte le verifiche passano." : `\n${failures} verifica/e fallite.`);
process.exit(failures === 0 ? 0 : 1);
