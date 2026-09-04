/* ============================================================================
   L'IDENTITÀ DEL WORLD DOPO UNA RISE (Narrative System Phase 2)

   🔷 Decisione canonica: RISE (mega-evoluzione) apre un World nuovo, non uno
   strato dello stesso posto. Quel World esiste già — deterministico, tramite
   `riseWorld()` in `engine/world.ts` — PRIMA che questa chiamata parta.
   Stessa regola di bio e narratore (MASTER SPEC §17): un World nato senza
   chiave AI deve esistere comunque. Questa funzione non lo crea, lo
   ARRICCHISCE: nome, identità e descrizione un po' meno di catalogo, quando
   c'è la chiave.

   🔒 UNA VOLTA SOLA PER MONDO, MAI PER TUNE. La guardia vera sta in
   `store.ts` (`resolveWorldIdentity`): l'evoluzione ordinaria resta nello
   stesso World e non genera mai questa chiamata — qui dentro non c'è nessun
   controllo di quel tipo perché non è il posto giusto per tenerlo.
   ========================================================================= */

import { ask } from './backend';
import { AI_STEPS } from '../../netlify/functions/_shared/routing';
import type { BackendFailure } from './backend';
import type { MonRecord } from '../engine/types';
import { displayName } from '../engine/types';
import type { World } from '../engine/world';

export interface WorldIdentity {
  name: string;
  identity: string;
  descriptor: string;
}

export interface WorldIdentityOutcome {
  identity: WorldIdentity | null;
  failure: BackendFailure | null;
  /** Perché è stata scartata, quando lo è stata. Va in DEV, non in produzione. */
  rejected: string | null;
}

const WORLD_IDENTITY_RULES = [
  'Dai un nome e un\'identità a un posto narrativo nuovo — un World nel senso di VINZ.MON: un territorio',
  'mentale/emotivo/tematico che la creatura sta esplorando, non una mappa fisica o un pianeta.',
  '',
  'COSA NON PUOI FARE',
  '- Non descrivere il corpo, l\'aspetto o l\'anatomia della creatura: questo è il luogo, non lei.',
  '- Non nominare un designer, un franchise o un personaggio esistente.',
  '- Non scrivere codice, markdown o virgolette caporali.',
  '- Non ripetere il nome del World precedente: questo è un posto diverso, anche se è lo stesso viaggio.',
  '',
  'COSA CONSEGNI — un oggetto JSON, e nient\'altro:',
  '{',
  '  "name": "un riferimento breve, come un\'etichetta di soglia (2-5 parole).",',
  '  "identity": "una frase sola: cosa rende stabile e riconoscibile questo posto.",',
  '  "descriptor": "1-2 frasi: com\'è adesso, appena aperto — non ancora esplorato fino in fondo."',
  '}',
  '',
  'Solo il JSON. Nessuna premessa, nessun commento, nessun blocco di codice.',
].join('\n');

function factsOf(ctx: { world: World; previousWorld: World; record: MonRecord; wish?: string }): string {
  const { world, previousWorld, record, wish } = ctx;
  return [
    `LA CREATURA CHE APRE QUESTO POSTO: ${displayName(record.data.name)}, affinità ${record.data.affinity}.`,
    `IL POSTO CHE SI LASCIA DIETRO: ${previousWorld.name} — ${previousWorld.description}`,
    `RIFERIMENTI CULTURALI DEL NUOVO POSTO (tono, non aspetto fisico): ${(world.worldCulturalDna ?? []).join(', ') || 'nessuno assegnato'}`,
    `NOME PROVVISORIO GIÀ ASSEGNATO (puoi sostituirlo): ${world.name}`,
    wish ? `UN DESIDERIO ESPRESSO PER QUESTA TRASFORMAZIONE: ${wish}` : '',
  ].filter(Boolean).join('\n');
}

/**
 * Arricchisce l'identità di un World appena aperto da una RISE. Torna `null`
 * se non si può o se il risultato non regge i controlli: chi chiama tiene
 * l'identità deterministica già scritta da `riseWorld()`, che esiste sempre.
 */
export async function writeWorldIdentityWithAi(
  token: string | null,
  model: string | null | undefined,
  ctx: { world: World; previousWorld: World; record: MonRecord; wish?: string },
): Promise<WorldIdentityOutcome> {
  const { data, failure, detail } = await ask<{ text: string }>(token, {
    capability: 'text-cheap',
    voiceModel: model,
    system: [{ text: WORLD_IDENTITY_RULES, cache: true }],
    user: factsOf(ctx),
    effort: AI_STEPS.worldIdentity.effort,
    maxTokens: AI_STEPS.worldIdentity.maxTokens,
  });

  if (!data?.text) return { identity: null, failure, rejected: detail ?? null };

  const parsed = parseWorldIdentity(data.text);
  if (!parsed) return { identity: null, failure: null, rejected: 'risposta non leggibile come JSON' };
  if (/[{}]/.test(`${parsed.name} ${parsed.identity} ${parsed.descriptor}`) || /```/.test(data.text)) {
    return { identity: null, failure: null, rejected: 'ha scritto codice letterale' };
  }

  return { identity: parsed, failure: null, rejected: null };
}

function parseWorldIdentity(raw: string): WorldIdentity | null {
  const text = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  let obj: unknown;
  try {
    obj = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }

  const o = obj as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name.trim() : '';
  const identity = typeof o.identity === 'string' ? o.identity.trim() : '';
  const descriptor = typeof o.descriptor === 'string' ? o.descriptor.trim() : '';

  if (name.length < 2 || name.length > 60) return null;
  if (identity.length < 10 || identity.length > 400) return null;
  if (descriptor.length < 10 || descriptor.length > 600) return null;

  return { name, identity, descriptor };
}
