/* ============================================================================
   ASSET REQUEST PACKAGE (§22.1, §22.2)

   🔒 §22.1 — "Every generated .mon can export a single downloadable
   asset-request package."

   Contenuto, esattamente come da §22.2:
     00_CHARACTER_DATA.json
     01_CHARACTER_MASTER_PROMPT.txt
     02_ROTATION_SPRITE_PROMPT.txt
     03_PROFILE_PORTRAIT_PROMPT.txt
     04_BIO_DOODLE_PROMPT.txt
     05_REACTION_PACK_PROMPT.txt
     06_ENCOUNTER_HERO_PROMPT.txt
     07_SIGIL_PROMPT.txt
     ASSET_MANIFEST.json
     README.txt

   Questo modulo sta al posto della futura chiamata all'image-generation API
   (§25): il confine di servizio resta lo stesso, cambia solo chi lo esegue.
   ========================================================================= */

import JSZip from 'jszip';
import { ASSET_TYPES } from '../engine/assets';
import type { MonRecord } from '../engine/types';
import { displayName } from '../engine/types';
import { COMPILER_VERSION, compilePrompt } from './compiler';
import { buildManifest, expectedFileName } from './manifest';

export interface PackageFile {
  name: string;
  content: string;
}

/**
 * Costruisce i file del pacchetto in memoria. Utile anche per l'anteprima.
 *
 * §48 SITE IMPLEMENTATION — «Every exported asset request must include:
 * character_data.json, compiled_prompt.txt, fragment_ids.json and
 * asset_manifest.json.» I prompt numerati di §22.2 restano, perché il
 * pacchetto ne contiene uno per tipo di asset: `compiled_prompt.txt` raccoglie
 * l'insieme e `fragment_ids.json` registra da quali frammenti atomici è nato.
 */
export function buildPackageFiles(record: MonRecord): PackageFile[] {
  const manifest = buildManifest(record);

  const files: PackageFile[] = [
    { name: '00_CHARACTER_DATA.json', content: JSON.stringify(record.data, null, 2) },
  ];

  const fragmentIds: Record<string, string[]> = {};
  const combined: string[] = [];

  for (const def of ASSET_TYPES) {
    const compiled = compilePrompt(record, def.type);
    files.push({ name: def.promptFile, content: compiled.text });
    fragmentIds[def.assetId] = compiled.fragmentIds;
    combined.push(
      `${'='.repeat(78)}\n${def.promptFile}  —  ${def.label}\n${'='.repeat(78)}\n\n${compiled.text}`,
    );
  }

  files.push({ name: 'compiled_prompt.txt', content: combined.join('\n\n') });

  // §48 — «fragment_ids.json records exactly which atomic fragments were used,
  // in order.» Con le versioni, perché §48 chiede la riproducibilità.
  files.push({
    name: 'fragment_ids.json',
    content: JSON.stringify(
      {
        mon: record.data.name,
        compiler_version: COMPILER_VERSION,
        generation_config_version: record.data.generation_config_version,
        seed: record.data.seed,
        fragments_by_asset: fragmentIds,
      },
      null,
      2,
    ),
  });

  files.push({ name: 'ASSET_MANIFEST.json', content: JSON.stringify(manifest, null, 2) });
  files.push({ name: 'README.txt', content: buildReadme(record) });

  return files;
}

function buildReadme(record: MonRecord): string {
  const short = displayName(record.data.name);
  const manifest = buildManifest(record);

  return [
    `VINZ.MON — ASSET REQUEST PACKAGE`,
    `${short} (${record.data.name})`,
    `Nodo Mindline: ${record.data.mindline_node} · Appearance: ${record.data.appearance} · Rarità: ${record.data.rarity}`,
    `Generato al giorno ${record.data.generated_at_day} · seed ${record.data.seed}`,
    ``,
    `───────────────────────────────────────────────────────────────────────`,
    `COME SI USA`,
    `───────────────────────────────────────────────────────────────────────`,
    ``,
    `1. Apri 01_CHARACTER_MASTER_PROMPT.txt e generalo PER PRIMO.`,
    `   Il Character Master è la fonte di verità visiva: tutti gli altri asset`,
    `   devono corrispondergli. Tienilo aperto come riferimento.`,
    ``,
    `2. Genera gli altri prompt nell'ordine numerico, allegando ogni volta il`,
    `   Character Master come immagine di riferimento.`,
    ``,
    `3. NON chiedere di ridisegnare il personaggio fra un asset e l'altro.`,
    `   Se un asset esce diverso, rigeneralo citando di nuovo il Master —`,
    `   non accettare una versione "migliorata".`,
    ``,
    `4. Salva i file con questi nomi esatti, così l'import li riconosce da solo:`,
    ...manifest.assets.map((a) => `     ${a.asset_id.padEnd(14)} → ${a.file}`),
    ``,
    `5. Torna nel prototipo, apri DEV → IMPORT ASSET e trascina dentro i file.`,
    `   Gli slot si risolvono da soli contro ASSET_MANIFEST.json.`,
    `   Puoi importarne anche solo alcuni: quelli mancanti restano segnati`,
    `   WAITING FOR IMAGE e non bloccano nessuna schermata.`,
    ``,
    `───────────────────────────────────────────────────────────────────────`,
    `REGOLE CHE NON SI TOCCANO`,
    `───────────────────────────────────────────────────────────────────────`,
    ``,
    `• L'identità del personaggio è già decisa e sta in 00_CHARACTER_DATA.json.`,
    `  L'import di un'immagine non cambia MAI un campo di identità.`,
    `• Non si cambiano anatomia della Family, Appearance, palette, Fashion,`,
    `  occhiali, capelli/decolorazione, tratti Heritage o marcatori identitari`,
    `  se non lo dice la spec o un nuovo visual approvato.`,
    `• Lo sprite di rotazione ha 8 frame su una riga, angoli 0/45/90/135/180/`,
    `  225/270/315 in senso orario, ancoraggio in basso al centro. Se l'ordine`,
    `  dei frame cambia, va dichiarato nel manifest.`,
    ``,
    `Riferimenti di spec: §21 generazione, §22 pipeline manuale, §23 tipi di`,
    `asset, §24 sprite di rotazione.`,
    ``,
  ].join('\n');
}

/** Nome del file zip scaricato. */
export function packageFileName(record: MonRecord): string {
  return `VINZVERCE_${displayName(record.data.name)}_ASSET_REQUEST.zip`;
}

/** Costruisce lo zip e lo restituisce come Blob. */
export async function buildPackageZip(record: MonRecord): Promise<Blob> {
  const zip = new JSZip();
  const root = zip.folder(`VINZVERCE_${displayName(record.data.name)}`)!;

  for (const f of buildPackageFiles(record)) {
    root.file(f.name, f.content);
  }

  // Cartella di destinazione per i file di ritorno: rende ovvio dove
  // rimetterli prima dell'import.
  root.folder('_RETURNED_ASSETS')!.file(
    'METTI_QUI_LE_IMMAGINI.txt',
    [
      'Metti in questa cartella i PNG generati con ChatGPT, con i nomi',
      'indicati in README.txt e in ASSET_MANIFEST.json.',
      '',
      'Poi trascinali nel prototipo: DEV → IMPORT ASSET.',
      '',
      ...buildManifest(record).assets.map((a) => `  ${a.file}`),
      '',
    ].join('\n'),
  );

  return zip.generateAsync({ type: 'blob' });
}

/** Avvia il download nel browser. */
export async function downloadPackage(record: MonRecord): Promise<void> {
  const blob = await buildPackageZip(record);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = packageFileName(record);
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Il revoke immediato interromperebbe il download in alcuni browser.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Riferimento al nome atteso, riesportato per comodità della UI. */
export { expectedFileName };
