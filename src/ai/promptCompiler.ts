/* ============================================================================
   IL COMPILATORE DI PROMPT (MASTER v1.2 §10)

   🔷 «Forse il problema è anche che il prompt non è generato da un'AI?»
   🔷 «Sì, sarà ChatGPT e questo nuovo doc.»

   ════════════════════════════════════════════════════════════════════════════
   ⚠️ COM'ERA FATTO PRIMA, E PERCHÉ AVEVA UN TETTO.

   265 frammenti in libreria, 25 scelti da regole, incollati in ordine di
   priorità: 16.000 caratteri e ZERO chiamate a un modello. Un assemblatore di
   stringhe.

   Il tetto è che un concatenatore può dire solo quello che è già scritto nei
   frammenti, e i frammenti sono generici per forza: sanno cos'è BEAST in
   generale, cos'è McCracken in generale. Non sanno che QUESTO è uno squalo
   corriere. La riga che ha fatto la differenza nel prompt riuscito — «the
   mouth occupies a surprisingly large percentage of the lower face» — nessun
   frammento potrà mai scriverla.

   E c'è di peggio: un concatenatore non si accorge dei conflitti. HUMANOIDITY
   2/5 e «due braccia, due gambe» finivano nello stesso testo, e il modello di
   immagini eseguiva tutte e due le cose insieme. È letteralmente così che
   nasce un corpo deforme.
   ════════════════════════════════════════════════════════════════════════════

   🔒 QUESTO NON SOSTITUISCE IL LIVELLO DETERMINISTICO, LO LEGGE.

   I fatti restano decisi dal motore — quale Family, quanto umano, quali
   riferimenti, quali moltiplicatori — e arrivano qui come vincoli. Il modello
   non può cambiarli: può solo tradurli in istruzioni disegnabili, parte del
   corpo per parte del corpo, con i numeri.

   🔒 E SI CONTROLLA. Un prompt riscritto che ha perso i numeri o i divieti
   viene BUTTATO e si tiene quello deterministico. Un compilatore di cui ci si
   fida sulla parola è il modo più elegante di peggiorare le cose senza
   accorgersene.

   🔒 SI SCRIVE UNA VOLTA SOLA. Stessa regola dei ricordi e dei post della
   stanza: un prompt che cambia a ogni apertura produce sei immagini di sei
   creature diverse con lo stesso nome.
   ========================================================================= */

import { ask } from './backend';
import type { BackendFailure } from './backend';
import { compilePrompt } from '../assets-pipeline/compiler';
import type { AssetType, MonRecord } from '../engine/types';

/* --- Le regole del compilatore, dal documento ------------------------------ */

/**
 * Le ventiquattro sezioni di §10, nell'ordine.
 *
 * 🔒 In cache: è identico per ogni creatura e per ogni asset, quindi dal
 * secondo prompt in poi costa un decimo.
 */
const COMPILER_RULES = [
  'You are the VINZ.MON PROMPT COMPILER, working from MASTER CHARACTER SYSTEM v1.2.',
  'You receive the facts of one already-generated Form and you write the final image prompt.',
  '',
  'WHAT YOU MAY AND MAY NOT DO',
  '- You may NOT change any fact: family, archetype, affinity, size, role, fashion, mood,',
  '  humanoidity, design DNA, cultural references, palette and appearance are already decided.',
  '- You MAY and MUST translate them into drawable, per-body-part, numeric instructions.',
  '- You must resolve conflicts between layers instead of passing both through. The body plan',
  '  set by HUMANOIDITY always wins over the human naming of masses; the declared counts always',
  '  win over the urge to add one more system.',
  '- Never name a designer, a franchise or an existing character in the output.',
  '',
  'STRUCTURE — write these sections, in this order, with these headings:',
  '1. PREMISE — a fresh Form of the same VINZ.MON; it must feel like VINZ transformed into another possible body.',
  '2. HOUSE CHARACTER DNA — one dominant identity mass, 3–4 silhouette landmarks, one decisive proportional exaggeration, one slightly ridiculous over-specific feature, one facial attitude readable before lore.',
  '3. HOUSE COLOR DNA — the jobs of each colour.',
  '4. CORE FORM — the locked fields, listed.',
  '5. HUMANOIDITY — translated into explicit body rules and explicit prohibitions.',
  '6. CORE PERSONALITY — 3 to 7 sentences that make this Form understandable as a person, BEFORE any power, equipment or lore. Mundane enough to imagine arguing with him.',
  '7. CHARACTER DESIGN DNA — expanded into numeric proportions, shape language, facial construction, detail budget and silhouette rules.',
  '8. VINZ IDENTITY — explicit hair-mass COUNT and geometry, and eyewear shape with approximate face occupancy.',
  '9. FAMILY ANATOMY — reduced to 2–4 major systems, no more.',
  '10. AFFINITY — reduced to 1–3 transformed zones.',
  '11. ROLE — expressed through behaviour and ONE dominant prop or body mass, never a lore system.',
  '12. FASHION — a small number of major garment masses.',
  '13. ACTIVE CULTURAL DNA — compressed into attitude, colour, movement and shape. Never an object per reference.',
  '14. ASYMMETRY BUDGET — a short explicit list.',
  '15. DETAIL BUDGET — a literal inventory, with a STOP line for low density, or the zones where complexity is allowed for high density.',
  '16. NEGATIVE SPACE — name the empty shapes that must stay unfilled.',
  '17. SILHOUETTE TEST — name the 3–6 shapes that must survive a black fill.',
  '18. MEMORY TEST — the one sentence a viewer should remember.',
  '19. APPEAL CHECK — 4 to 8 mundane expressive behaviours the design must support.',
  '20. VISUAL DNA LOCK — the complete inventory of what the final image contains.',
  '21. APPEARANCE — rendering only; it may never redesign proportions.',
  '22. COLOR DISTRIBUTION — approximate percentages.',
  '23. PRESENTATION — the pose, described limb by limb, and the framing.',
  '24. FINAL HIERARCHY — what is read first, second, third, and what is discovered only afterward.',
  '',
  'RULES OF WRITING',
  '- Quantify wherever proportion, count or area matters. «Very few shapes» is not executable; «about five primary masses» is.',
  '- Use negative constraints only against likely failure modes; never let prohibitions outweigh the positive design.',
  '- The output must be self-contained: usable in a fresh chat with no hidden context.',
  '- Output the prompt only. No preamble, no commentary, no markdown fences.',
].join('\n');

/* --- I vincoli che devono sopravvivere ------------------------------------- */

/**
 * Quello che il prompt riscritto DEVE ancora contenere.
 *
 * ⚠️ Sono i vincoli che un modello, riscrivendo, tende ad ammorbidire per
 * rendere il testo più scorrevole — ed è precisamente quello che non deve
 * succedere. Se anche uno manca, la riscrittura si butta.
 */
export function survivingConstraints(record: MonRecord): string[] {
  const d = record.data;
  return [
    d.family,
    d.family_archetype,
    d.affinity,
    d.size,
    d.role,
    d.fashion,
    d.mood_primary,
    d.appearance,
    String(d.humanoidity ?? 3),
    d.palette_dna.roles?.base ?? d.palette_dna.primary,
    d.palette_dna.roles?.acidHero ?? d.palette_dna.accent,
  ].filter(Boolean);
}

export interface CompileOutcome {
  text: string | null;
  failure: BackendFailure | null;
  /** Perché è stata scartata, quando lo è stata. Va in DEV, non in produzione. */
  rejected: string | null;
}

/**
 * Riscrive il prompt di un asset. Torna `null` se non si può o se il risultato
 * non regge i controlli: in entrambi i casi chi chiama usa quello di sempre.
 */
export async function compileWithAi(
  token: string | null,
  record: MonRecord,
  assetType: AssetType,
): Promise<CompileOutcome> {
  const deterministic = compilePrompt(record, assetType).text;

  const { data, failure } = await ask<{ text: string }>(token, {
    capability: 'prompt-compile',
    system: [{ text: COMPILER_RULES, cache: true }],
    user: [
      `ASSET TYPE: ${assetType}`,
      '',
      'THE FACTS, ALREADY DECIDED — every one of these must survive into your output:',
      deterministic,
    ].join('\n'),
    thinking: true,
    maxTokens: 8000,
  });

  if (!data?.text) return { text: null, failure, rejected: null };

  const written = data.text.trim();
  const missing = survivingConstraints(record).filter(
    (c) => !written.toLowerCase().includes(c.toLowerCase()),
  );

  /* 🔒 Un vincolo perso è una riscrittura buttata. Non si "corregge" il
     risultato aggiungendo in coda quello che manca: un prompt rattoppato è un
     prompt che si contraddice, ed è peggio di uno generico. */
  if (missing.length > 0) {
    return { text: null, failure: null, rejected: `vincoli persi: ${missing.join(', ')}` };
  }

  /* Un prompt molto più corto dell'originale ha riassunto invece di tradurre:
     il documento chiede di ESPANDERE i fatti in istruzioni disegnabili. */
  if (written.length < deterministic.length * 0.6) {
    return {
      text: null,
      failure: null,
      rejected: `troppo corto: ${written.length} contro ${deterministic.length} caratteri`,
    };
  }

  return { text: written, failure: null, rejected: null };
}
