/* ============================================================================
   LA VOCE DEL NARRATORE (VINZMON_NARRATIVE_ROLE_IMPLEMENTATION_BRIEF §10)

   🔷 «Parla tutte le volte che nasce un mon raccontando appunto la storia.»

   ════════════════════════════════════════════════════════════════════════════
   NON È LA BIO. La bio è il .mon che scrive di sé, in prima persona, per chi
   lo ha fatto nascere. Questa è VINZ.MON — il sistema — che osserva
   dall'esterno e INDICIZZA un arrivo: non racconta cosa il .mon pensa di sé,
   racconta cosa è appena successo nel mondo. Voce fredda da terminale, che
   ogni tanto si incrina in immagine viva — mai il contrario, mai robotica
   riga per riga.

   Esempio di tono (dal brief, in inglese solo come riferimento di registro —
   qui si scrive in italiano perché è quello che l'utente legge):

     > WORLD SIGNAL DETECTED
     > source: MON_01
     > status: unresolved

     A corridor has appeared where yesterday there was only a wall.
     I can tell you when it appeared.
     I cannot tell you what it means.

     [OPEN TRACE]
   ════════════════════════════════════════════════════════════════════════════

   🔒 NON SOSTITUISCE IL LIVELLO DETERMINISTICO, LO LEGGE — stessa regola
   della bio: i fatti restano quelli decisi dal motore, il modello li indicizza
   con questa voce, non ne inventa.

   🔒 SI SCRIVE UNA VOLTA SOLA, alla nascita di quella forma. Vedi
   `MonRecord.narratorLine` in `engine/types.ts`.

   🔒 OGNI SUPERFICIE CHE DIPENDE DALL'AI HA UN FALLBACK DETERMINISTICO
   (MASTER SPEC §17). Senza chiave o con la chiamata fallita,
   `narratorFallbackLine` produce comunque un testo nella stessa voce.
   ========================================================================= */

import { ask } from './backend';
import { AI_STEPS } from '../../netlify/functions/_shared/routing';
import type { BackendFailure } from './backend';
import type { MonRecord } from '../engine/types';
import { displayName } from '../engine/types';
import { ledgerBlock, returnBlock, worldBlock } from '../engine/world';
import type { ReturnContext, StoryLedger, World } from '../engine/world';

/* --- Le regole, in cache --------------------------------------------------- */

export const NARRATOR_RULES = [
  'Sei VINZ.MON: non il .mon che è appena nato, ma il sistema che lo osserva e lo indicizza.',
  'Non parli in prima persona come il .mon. Parli come un\'interfaccia che registra un arrivo nel mondo.',
  '',
  'REGISTRO — un terminale vivo, non un terminale finto.',
  '- Blocchi corti e controllati. Mai un muro di testo letterario.',
  '- Ogni tanto un\'etichetta da sistema: uno stato, una coordinata, un istante, un segnale rilevato.',
  '  Bastano una o due per blocco: usarle troppo le trasforma in decorazione e la prosa smette di leggersi.',
  '- Il terminale può diventare poetico, simbolico, perfino perturbante — ma deve restare un sistema',
  '  che osserva e rivela, non un narratore romantico travestito da terminale.',
  '- Il contrasto è il punto: una riga fredda da sistema seguita da un\'immagine viva, mai tutto uguale.',
  '',
  'COSA NON PUOI FARE',
  '- MAI codice di programmazione vero (niente parentesi graffe, niente sintassi di un linguaggio reale).',
  '- MAI un messaggio di errore finto a ogni riga: è un cliché da hacker da B-movie, e stanca.',
  '- MAI decorazioni ASCII pesanti: cornici, barre di caricamento, riempitivi di simboli.',
  '- MAI presentare una lettura psicologica come una verità diagnostica: puoi osservare, indicizzare,',
  '  segnalare — mai dichiarare cosa il .mon "è" o "significa" come se fosse un referto.',
  '- MAI cambiare un fatto o inventarne di nuovi che non ti sono stati dati.',
  '- MAI nominare un designer, un franchise o un personaggio esistente.',
  '- MAI usare le etichette di catalogo come parole tue (Family, Role, Affinity): quelle descrivono',
  '  come è fatto il .mon, non il vocabolario con cui il sistema ne parla.',
  '',
  'COSA CONSEGNI — un oggetto JSON, e nient\'altro:',
  '{',
  '  "lines": ["4-7 blocchi, in ordine. Ognuno una riga o una frase corta.",',
  '            "Alterna righe da sistema (segnali, stati, coordinate) e righe",',
  '            "di immagine viva sul .mon che è appena arrivato.",',
  '            "L\'ultimo blocco è una chiusura in sospeso, non una conclusione:",',
  '            "il sistema osserva, non spiega tutto."]',
  '}',
  '',
  'Solo il JSON. Nessuna premessa, nessun commento, nessun blocco di codice.',
].join('\n');

/* --- I fatti che devono sopravvivere --------------------------------------- */

/**
 * ⚠️ Corto e verificabile, come `survivingFacts` in `bioWriter.ts`: il nome
 * di questa forma deve comparire, letteralmente — è un'indicizzazione, e
 * un'indicizzazione che non nomina cosa sta indicizzando ha fallito il
 * proprio lavoro anche se il resto del testo è bellissimo.
 */
function survivingNarratorFacts(record: MonRecord): string[] {
  return [displayName(record.data.name)];
}

export interface NarratorOutcome {
  line: string | null;
  failure: BackendFailure | null;
  rejected: string | null;
}

function factsOf(record: MonRecord): string {
  const d = record.data;
  return [
    'IL SERBATOIO. Non devi nominare tutto: scegli cosa entra in un\'indicizzazione da sistema.',
    '',
    `NOME DELLA FORMA (va nominato, letteralmente, in almeno un blocco): ${displayName(d.name)}`,
    `GIORNO DELL\'ARRIVO: ${d.generated_at_day}`,
    `RADICE DEL CORPO (non pronunciare le etichette): ${d.family} / ${d.family_archetype}; affinità ${d.affinity}`,
    d.narrativeDNA
      ? [
          `ARCHETIPO NARRATIVO (non pronunciare l\'etichetta): ${d.narrativeDNA.archetype}`,
          `FUNZIONE NELLA STORIA ADESSO (non pronunciare l\'etichetta): ${d.narrativeDNA.function}`,
          `SPINTA: ${d.narrativeDNA.drive}`,
          `CONTRADDIZIONE: ${d.narrativeDNA.contradiction}`,
        ].join('\n')
      : `CONTRADDIZIONI DI CHI È: ${d.character_dna.contradictions.map((c) => `${c.a} contro ${c.b}`).join(' · ')}`,
    d.evolution_state
      ? `QUESTO NON È IL PRIMO ARRIVO: la forma precedente era ${d.evolution_state.previous_labels.at(-1) ?? '—'}, stadio ${d.evolution_state.stage}.`
      : 'PRIMO ARRIVO: non c\'era una forma prima di questa.',
  ].join('\n');
}

/**
 * Fa scrivere la riga del narratore. Torna `null` se non si può o se il
 * risultato non regge i controlli: in entrambi i casi chi chiama usa
 * `narratorFallbackLine`.
 */
export async function writeNarratorWithAi(
  token: string | null,
  record: MonRecord,
  compilerModel?: string | null,
  /**
   * 🔷 v4 §10.2 — cosa è già stato raccontato.
   *
   * Facoltativo perché la nascita del PRIMO mon non ha niente alle spalle, ed
   * è giusto che il registro sia vuoto lì. Da lì in poi arriva sempre: un
   * narratore che non sa cosa ha già detto ripete il corridoio finché il
   * corridoio non vuol più dire niente.
   */
  context?: { world: World | null; ledger: StoryLedger },
): Promise<NarratorOutcome> {
  const { data, failure, detail } = await ask<{ text: string }>(token, {
    capability: 'prompt-compile',
    voiceModel: compilerModel,
    system: [{ text: NARRATOR_RULES, cache: true }],
    user: context
      ? [factsOf(record), '', worldBlock(context.world), '', ledgerBlock(context.ledger)].join('\n')
      : factsOf(record),
    effort: AI_STEPS.narrator.effort,
    maxTokens: AI_STEPS.narrator.maxTokens,
  });

  if (!data?.text) return { line: null, failure, rejected: detail ?? null };

  const parsed = parseNarrator(data.text);
  if (!parsed) return { line: null, failure: null, rejected: 'risposta non leggibile come JSON' };

  const blob = parsed.join(' ');
  const missing = survivingNarratorFacts(record).filter((f) => !blob.includes(f));
  if (missing.length > 0) {
    return { line: null, failure: null, rejected: `fatti persi: ${missing.join(', ')}` };
  }
  if (/[{}]/.test(blob) || /```/.test(data.text)) {
    return { line: null, failure: null, rejected: 'ha scritto codice letterale' };
  }

  return { line: parsed.join('\n'), failure: null, rejected: null };
}

function parseNarrator(raw: string): string[] | null {
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
  const lines = Array.isArray(o.lines)
    ? o.lines.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : [];

  if (lines.length < 3) return null;
  return lines;
}

/* --- Fallback deterministico (MASTER SPEC §17) ----------------------------- */

/**
 * Nessuna chiave, chiamata fallita: la voce da terminale resta comunque,
 * costruita solo dai fatti già decisi dal motore. Non è la versione «brutta»
 * della voce AI: è la rete di sicurezza che garantisce che il narratore
 * parli SEMPRE, come chiesto.
 */
/* ============================================================================
   §14 — RETURN / «RIPARTI DA QUI»

   🔷 «Return is not loading an old save. The user returns as their current
   self. Past canon remains intact while the World may have changed.»

   ⚠️ REGOLE PROPRIE, NON UN SECONDO GIRO DI QUELLE DI SOPRA. Un arrivo dice
   «è successo qualcosa di nuovo»; un ritorno dice «questo posto è andato
   avanti». Sono due tempi verbali diversi, e con lo stesso prompt il modello
   scriverebbe una seconda nascita — che è il modo in cui un ritorno smette di
   pesare.
   ========================================================================= */

export const RETURN_RULES = [
  'Sei VINZ.MON: il sistema che riapre un posto già indicizzato, non che ne annuncia uno nuovo.',
  '',
  'COSA STA SUCCEDENDO — leggilo bene, è tutta la differenza:',
  '- Questo posto ESISTE GIÀ. Quello che è scritto nel canone è successo davvero e non si tocca.',
  '- Chi torna è la forma di ADESSO, non quella di allora. Non fingere che non sia cambiato niente.',
  '- Il tempo è passato ANCHE PER IL POSTO. Non è come è stato lasciato, e non è un\'altra cosa:',
  '  è lo stesso posto più vecchio. Qualcosa si è consumato, qualcosa si è aperto.',
  '- Non stai facendo nascere niente. Non usare il vocabolario dell\'arrivo.',
  '',
  'PREFERISCI RACCOGLIERE INVECE DI PIANTARE.',
  '- Se c\'è un filo aperto nel registro, tiralo: vale più di un\'immagine nuova.',
  '- Non ripetere quello che il registro dice che hai già fatto.',
  '- Puoi lasciare una cosa sola in sospeso, non tre.',
  '',
  'REGISTRO — le stesse regole di voce di sempre:',
  '- Blocchi corti. Qualche etichetta da sistema, non una per riga.',
  '- Contrasto fra la riga fredda e l\'immagine viva.',
  '- MAI codice vero, MAI errori finti a ripetizione, MAI decorazioni ASCII.',
  '- MAI dichiarare cosa una cosa SIGNIFICA per chi legge: puoi dire cosa è cambiato, non perché.',
  '',
  'COSA CONSEGNI — un oggetto JSON, e nient\'altro:',
  '{',
  '  "lines": ["4-7 blocchi. Il primo dice che il posto è stato riaperto.",',
  '            "Poi cosa è cambiato mentre non c\'eravate.",',
  '            "L\'ultimo lascia una cosa aperta, non conclude."]',
  '}',
  '',
  'Solo il JSON. Nessuna premessa, nessun commento, nessun blocco di codice.',
].join('\n');

export async function writeReturnWithAi(
  token: string | null,
  compilerModel: string | null | undefined,
  ctx: ReturnContext,
): Promise<NarratorOutcome> {
  const { data, failure, detail } = await ask<{ text: string }>(token, {
    capability: 'prompt-compile',
    voiceModel: compilerModel,
    system: [{ text: RETURN_RULES, cache: true }],
    user: returnBlock(ctx),
    effort: AI_STEPS.narrator.effort,
    maxTokens: AI_STEPS.narrator.maxTokens,
  });

  if (!data?.text) return { line: null, failure, rejected: detail ?? null };

  const parsed = parseNarrator(data.text);
  if (!parsed) return { line: null, failure: null, rejected: 'risposta non leggibile come JSON' };

  const blob = parsed.join(' ');
  if (/[{}]/.test(blob) || /```/.test(data.text)) {
    return { line: null, failure: null, rejected: 'ha scritto codice letterale' };
  }

  return { line: parsed.join('\n'), failure: null, rejected: null };
}

/** Il ritorno senza chiave, costruito solo sul canone già scritto. */
export function returnFallbackLine(ctx: ReturnContext): string {
  const last = ctx.world.canon.at(-1);
  return [
    '> TRACCIA RIAPERTA',
    `> luogo: ${ctx.world.name}`,
    `> ultimo segnale: giorno ${last?.day ?? ctx.world.emergedOnDay}`,
    '',
    ctx.elapsedDays > 0
      ? `Sono passati ${ctx.elapsedDays} giorni. Il posto non ti ha aspettato.`
      : 'Il posto è quasi come lo hai lasciato.',
    `Chi rientra è ${displayName(ctx.record.data.name)}, la forma di adesso.`,
    'Quello che era vero qui è ancora vero. Il resto va guardato di nuovo.',
    '',
    '[TRACCIA APERTA]',
  ].join('\n');
}

export function narratorFallbackLine(record: MonRecord): string {
  const d = record.data;
  const name = displayName(d.name);
  const isEvolution = Boolean(d.evolution_state);
  return [
    '> SEGNALE RILEVATO',
    `> sorgente: ${name}`,
    `> giorno: ${d.generated_at_day}`,
    '',
    isEvolution
      ? 'Qualcosa che era già qui ha cambiato forma.'
      : 'Qualcosa che non c\'era ha preso forma.',
    d.narrativeDNA
      ? `Il sistema legge ${d.narrativeDNA.drive.toLowerCase()}.`
      : 'Il sistema registra una nuova voce sulla mindline.',
    'Non posso dirti cosa significa. Posso dirti che è successo.',
    '',
    '[TRACCIA APERTA]',
  ].join('\n');
}
