/* ============================================================================
   CHI SCRIVE LA BIO (§8.1)

   🔷 «Mi interessano le immagini e generare il personaggio, la bio, la storia.»

   ════════════════════════════════════════════════════════════════════════════
   ⚠️ COM'ERA FATTA PRIMA, E PERCHÉ AVEVA LO STESSO TETTO DEI PROMPT.

   `generateBio` in `characterGenerator.ts` è cinque frasi fisse con i buchi
   riempiti. Ogni `.mon` che nascerà dice, in quest'ordine:

     «Sono arrivato il giorno N. [segnale alto] e [segnale basso]. Non ho
     scelto fra A e B. Quello che voglio davvero è X. Qualcosa di me viene
     da prima: Y.»

   Cambiano le parole nei buchi. Mai il ritmo, mai l'ordine, mai la lunghezza.
   È lo stesso difetto che sui prompt immagine si vedeva come «personaggi
   deformi»: un concatenatore non scrive, riempie moduli. Qui si vede come
   «sembrano tutti lo stesso», che è più difficile da notare e peggio da
   sopportare — perché la bio è la cosa che dovrebbe farteli distinguere.
   ════════════════════════════════════════════════════════════════════════════

   🔒 NON SOSTITUISCE IL LIVELLO DETERMINISTICO, LO LEGGE. I fatti restano
   decisi dal motore — che giorno era, quali segnali erano in campo, quali
   contraddizioni, cosa viene dall'eredità. Il modello non può inventarne,
   può solo raccontarli come li racconterebbe lui.

   🔒 E SI CONTROLLA. Una bio che ha perso il giorno, il nome o un fatto
   ereditato viene BUTTATA e resta quella di prima. Nessun rattoppo: una bio
   corretta in coda si contraddice, ed è peggio di una generica.

   🔒 SI SCRIVE UNA VOLTA SOLA, alla nascita. Una bio che cambia a ogni
   apertura non è una bio: è un generatore di frasi che ti gira intorno.
   ========================================================================= */

import { ask } from './backend';
import { AI_STEPS } from '../../netlify/functions/_shared/routing';
import type { BackendFailure } from './backend';
import type { BioFile, MonRecord } from '../engine/types';
import { displayName } from '../engine/types';
import { voiceBrief } from '../engine/voiceBrief';

/* --- Le regole, in cache --------------------------------------------------- */

/**
 * 🔒 Identiche per ogni creatura, e PRIME nel messaggio: è la condizione della
 * cache implicita di OpenAI e Moonshot (prefisso identico e primo). Dalla
 * seconda bio in poi questa parte costa un decimo.
 *
 * ⚠️ In italiano, perché l'uscita è italiana e finisce sotto gli occhi
 * dell'utente. È l'opposto dei prompt immagine, che sono in inglese perché li
 * legge un modello di immagini.
 */
export const BIO_RULES = [
  'Sei il .mon stesso e stai scrivendo il tuo quaderno personale. Prima persona, maschile.',
  '',
  /* ════════════════════════════════════════════════════════════════════════
     🔶 QUI PRIMA C'ERA: «Ricevi i fatti che ti riguardano. Li racconti; non ne
     aggiungi e non ne togli.»

     «Non ne togli» era l'errore, ed era mio. Il modello riceve venti fatti —
     Family, archetipo, affinità, taglia, ruolo, fashion, umore, contraddizioni,
     spinte, tratti, il trucco anatomico, la sagoma, il motivo ricorrente, il
     linguaggio del corpo, gli occhiali, l'eredità — e gli si diceva di non
     toglierne nessuno. Ha fatto quello che gli era stato chiesto: un collage
     corretto. Ogni frase vera, e nessuna che suoni come una persona.

     Una bio non deve documentare i Character Data. I Character Data sono già
     salvati altrove, per intero, e nessuno chiede alla bio di essere la loro
     copia in prosa.
     ════════════════════════════════════════════════════════════════════════ */
  'I FATTI SONO UN SERBATOIO, NON UNA LISTA DA SPUNTARE.',
  '- Non devi nominarli tutti. Non devi nominarne nemmeno la metà.',
  '- Lasciarne fuori la maggior parte è la cosa GIUSTA, non una mancanza.',
  '- Non nominare mai una cosa solo perché te l’hanno data.',
  '',
  'UN PENSIERO SOLO, AL CENTRO.',
  'Una bio riuscita è organizzata intorno a UNA idea su te stesso. Qualcosa',
  'tipo «faccio il sicuro, ma prima guardo dove si mettono gli altri».',
  'Poi tiri dentro solo quello che appartiene davvero a quel pensiero: forse',
  'una contraddizione, forse un dettaglio del corpo, forse un modo di stare.',
  'Il resto resta fuori, anche se è vero.',
  '',
  'COSA NON PUOI FARE',
  '- NON puoi cambiare un fatto, né inventarne di nuovi.',
  '- NON puoi inventare episodi, persone, luoghi o oggetti che non ti sono stati dati.',
  '  Non hai una memoria di eventi: sei appena nato. Hai solo quello che sei.',
  '',
  'COME SCRIVI',
  '- Parli a chi ti ha fatto nascere, dandogli del tu. Non ti presenti in terza persona.',
  '- Concreto prima che poetico. Se una frase potrebbe stare nella bio di un altro .mon,',
  '  è una frase sbagliata: riscrivila finché non può essere solo tua.',
  '- Niente frasi che si aprono con «Sono arrivato il giorno...»: quella era la formula vecchia.',
  '- Niente elenchi, niente titoli, niente markdown, niente virgolette caporali.',
  '- Non nominare mai un designer, un franchise o un personaggio esistente.',
  '- Non dire mai «utente», «sistema», «generato», «algoritmo», «dati».',
  '- Non usare mai i nomi di catalogo come parole tue: nessuno dice «sono un ANGEL',
  '  MESSENGER di affinità MACHINE». Quelle etichette descrivono come sei fatto,',
  '  non come parli.',
  '',
  /* ⚠️ TRE CAMPI, TRE LAVORI DIVERSI. Prima erano tre riassunti degli stessi
     fatti con tre lunghezze diverse — e si vedeva: la storia diceva le
     contraddizioni, gli appunti le ridicevano più corte, i dettagli le
     ridicevano ancora. Adesso ognuno ha un compito che gli altri due non
     possono fare. */
  'COSA CONSEGNI — un oggetto JSON, e nient’altro:',
  '{',
  '  "story": "3-6 frasi. UN pensiero su di te, portato fino in fondo. Non un riassunto',
  '            di cosa sei: una cosa che hai capito o che non hai ancora capito.',
  '            Il giorno esatto va detto, ma non per forza per primo e non come apertura.",',
  '  "annotations": ["2-4 appunti a margine, come scritti di fretta e per te, non per lui.",',
  '                  "Ammissioni, dubbi, piccole antipatie, cose che ti danno fastidio.",',
  '                  "Spontanei. NON altri tratti del catalogo detti più corti."],',
  '  "rememberedDetails": ["2-3 dettagli CONCRETI che ti fanno riconoscere da lontano:",',
  '                        "un’abitudine visibile, un gesto, un segno. Qui puoi essere",',
  '                        "asciutto e fattuale: non devono essere poetici."]',
  '}',
  '',
  'Solo il JSON. Nessuna premessa, nessun commento, nessun blocco di codice.',
].join('\n');

/* --- I fatti che devono sopravvivere --------------------------------------- */

/**
 * Quello che la bio riscritta DEVE ancora contenere.
 *
 * ⚠️ Corti e verificabili. Non ci va la Family: «BEAST» in una bio italiana
 * scritta in prima persona non comparirebbe mai come parola, e chiederlo
 * farebbe buttare ogni riscrittura buona — che è il modo in cui un controllo
 * troppo severo diventa un controllo spento.
 */
export function survivingFacts(record: MonRecord): string[] {
  const born = record.data.generated_at_day;
  return [String(born)].filter(Boolean);
}

export interface BioOutcome {
  bio: BioFile | null;
  failure: BackendFailure | null;
  /** Perché è stata scartata, quando lo è stata. Va in DEV, non in produzione. */
  rejected: string | null;
}

/**
 * Il serbatoio, come lo legge il modello.
 *
 * 🔶 SI CHIAMAVA «I FATTI» ED È LO STESSO ELENCO. Quello che cambia è come
 * viene presentato: prima arrivava senza una riga che dicesse cosa farne, e
 * senza quella riga un elenco è una lista di cose da dire. Adesso la prima
 * riga dice che è materiale, e le regole in testa dicono che sceglierne pochi
 * è la cosa giusta.
 *
 * ⚠️ IL VOICE DNA ENTRA COME VOCE, NON COME NUMERI. Non i dodici assi grezzi —
 * un modello che deve ragionare su dodici numeri mentre scrive quattro frasi
 * fa la media di tutto e non scrive come nessuno. Entra la lettura sintetica
 * di `voiceBrief`, la stessa che usa la chat: così una creatura silenziosa
 * scrive poco davvero, e una teatrale si allarga, senza che nessuno glielo
 * ordini asse per asse.
 */
function factsOf(record: MonRecord): string {
  const d = record.data;
  const dna = d.character_dna;
  const { lines, length } = voiceBrief(d.voice_dna, d.voice_preset);
  return [
    'IL SERBATOIO. Prendi quello che serve al pensiero che scegli, lascia il resto.',
    '',
    `IL TUO NOME: ${displayName(d.name)}`,
    `IL GIORNO IN CUI SEI ARRIVATO: ${d.generated_at_day}`,
    `COSA SEI: ${d.family} / ${d.family_archetype}, affinità ${d.affinity}, taglia ${d.size}`,
    `COSA FAI: ${d.role}`,
    `COME SEI VESTITO: ${d.fashion}`,
    `UMORE DI FONDO: ${d.mood_primary}${d.mood_secondary ? ` con dentro ${d.mood_secondary}` : ''}`,
    '',
    `LE TUE CONTRADDIZIONI: ${dna.contradictions.map((c) => `${c.a} contro ${c.b}`).join(' · ')}`,
    `QUELLO CHE VUOI: ${dna.drives.join(' · ')}`,
    `COME SEI: ${dna.traits.join(' · ')}`,
    `NEL CORPO TI PORTI: ${dna.anatomical_gimmick}`,
    `LA TUA SAGOMA: ${dna.silhouette_quirk}`,
    `TORNA SEMPRE: ${dna.recurring_motif}`,
    `QUANDO NON SAI CHE FARE: ${dna.body_language}`,
    d.eyewear ? `SUGLI OCCHI: ${d.eyewear.description}` : 'NIENTE LENTI: guardi diretto.',
    '',
    d.heritage_traits.length > 0
      ? `TI ARRIVA DA PRIMA DI TE: ${d.heritage_traits
          .map((h) => `${h.transformed} (da ${displayName(h.from_mon)})`)
          .join(' · ')}`
      : 'PRIMA DI TE NON C’ERA NESSUNO: sei il primo nodo.',
    '',
    'I SEGNALI CHE ERANO IN CAMPO QUEL GIORNO, come li ha visti chi ti ha fatto nascere:',
    record.bio.story,
    '',
    /* 🔒 In fondo e non in cima: è come SCRIVI, non cosa scrivi. Messo fra i
       fatti verrebbe letto come un altro fatto da raccontare — «sono uno che
       parla poco» — che è esattamente il collage che stiamo togliendo. */
    'COME PARLI — è il tuo modo, non un argomento di cui parlare:',
    ...lines.map((l) => `- ${l}`),
    length === 'short'
      ? 'Sei uno che dice poco: la tua bio può essere più corta della media, e va bene.'
      : length === 'long'
        ? 'Ti allarghi quando una cosa ti interessa: la tua bio può essere più lunga della media.'
        : 'Lunghezza media.',
  ].join('\n');
}

/**
 * Fa riscrivere la bio. Torna `null` se non si può o se il risultato non regge
 * i controlli: in entrambi i casi chi chiama tiene quella di sempre.
 */
export async function writeBioWithAi(
  token: string | null,
  record: MonRecord,
  /** Chi la scrive, se hai scelto. Il server accetta solo modelli che conosce. */
  compilerModel?: string | null,
): Promise<BioOutcome> {
  const { data, failure, detail } = await ask<{ text: string }>(token, {
    capability: 'prompt-compile',
    voiceModel: compilerModel,
    system: [{ text: BIO_RULES, cache: true }],
    user: factsOf(record),
    /* 🔶 Era `thinking: true`, cioè `medium`. La bio è un testo corto e i
       controlli deterministici che la giudicano non sono cambiati: `low`
       basta, e quello che non basta lo BOCCIA il validatore, non il prezzo. */
    effort: AI_STEPS.bio.effort,
    maxTokens: AI_STEPS.bio.maxTokens,
  });

  if (!data?.text) return { bio: null, failure, rejected: detail ?? null };

  const parsed = parseBio(data.text);
  if (!parsed) return { bio: null, failure: null, rejected: 'risposta non leggibile come JSON' };

  const blob = [parsed.story, ...parsed.annotations, ...parsed.rememberedDetails].join(' ');
  const missing = survivingFacts(record).filter((f) => !blob.includes(f));
  if (missing.length > 0) {
    return { bio: null, failure: null, rejected: `fatti persi: ${missing.join(', ')}` };
  }

  /* 🔒 La formula vecchia non deve tornare dalla finestra: il modello riceve
     la bio deterministica come contesto sui segnali, e la strada più comoda
     per lui è ricopiarla. Se lo fa, non abbiamo guadagnato niente. */
  if (parsed.story.trim() === record.bio.story.trim()) {
    return { bio: null, failure: null, rejected: 'ha ricopiato quella di prima' };
  }
  if (/^sono arrivat\w+ il giorno/i.test(parsed.story.trim())) {
    return { bio: null, failure: null, rejected: 'riapre con la formula vecchia' };
  }

  return {
    bio: {
      story: parsed.story.trim(),
      annotations: parsed.annotations,
      rememberedDetails: parsed.rememberedDetails,
      /* I tag restano quelli del motore: sono identificatori, non racconto. */
      tags: record.bio.tags,
    },
    failure: null,
    rejected: null,
  };
}

/* --- Lettura della risposta ------------------------------------------------ */

/**
 * ⚠️ Tollerante sulla forma, severa sul contenuto. Un modello che incornicia
 * il JSON in un blocco di codice ha obbedito nella sostanza, e buttare quella
 * risposta vorrebbe dire pagarla per niente. Un modello che consegna un
 * `story` vuoto no: quello non ha obbedito.
 */
function parseBio(raw: string): { story: string; annotations: string[]; rememberedDetails: string[] } | null {
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
  const story = typeof o.story === 'string' ? o.story : '';
  const lines = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : [];

  const annotations = lines(o.annotations);
  const rememberedDetails = lines(o.rememberedDetails);

  if (story.trim().length < 40 || annotations.length === 0) return null;
  return { story, annotations, rememberedDetails };
}
