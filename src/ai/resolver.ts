/* ============================================================================
   IL PRIMO STADIO, CHIESTO A UN MODELLO

   🔷 «Proviamo con un'API. Facciamogli fare solo il prompt finale, quello lo do
   a ChatGPT.»

   È il modo giusto di dividere il lavoro: la parte che si può automatizzare
   (decidere) la fa l'API, la parte che oggi non si può (disegnare, per via del
   muro dei dieci secondi) la fai tu portando il prompt dove vuoi.

   ⚠️ E HA UNA POSSIBILITÀ CONCRETA DI STARE NEI DIECI SECONDI, che il vecchio
   compilatore non aveva nemmeno in teoria:

     vecchio   ~4.000 token in ingresso, fino a 8.000 in USCITA
     questo    ~1.600 in ingresso, ~800 di JSON — PIÙ il ragionamento

   L'uscita è quella che costa tempo — si genera un token alla volta. Il conto
   qui sopra era incompleto la prima volta che l'ho scritto: contava il JSON e
   basta, e i token di ragionamento sono anch'essi uscita. Per questo la
   chiamata chiede `thinking: false` (vedi sotto). Se anche così non basta, il
   messaggio adesso dice `timeout` con parole sue, e la strada a mano resta lì
   accanto.

   🔒 La validazione è la STESSA di quella incollata a mano: `parseResolution`.
   Due controlli diversi vorrebbero dire che la strada automatica accetta cose
   che l'altra rifiuta.

   ════════════════════════════════════════════════════════════════════════════
   DUE STRATI, E NON SI TOCCANO

     LA MEMORIA (`resolver/memory.ts`)   come si decide — il gusto, i numeri
                                          che hanno reso, i fallimenti noti
     IL PROMPT  (`vendor/resolver.ts`)   cosa c'è da decidere — questa creatura

   🔒 Il primo va nel blocco di sistema, il secondo nel messaggio utente,
   integro. Il compilatore che viene dopo riceve solo le DECISIONI: la memoria
   non lo raggiunge nemmeno volendo, perché `compilePrompt` prende
   `CharacterData` e `CreativeResolution` e non ha nessun altro parametro.

   ⚠️ E la memoria non deve MAI finire nel prompt immagine, né copiata né
   riassunta. `verify:package` lo verifica cercando nove frasi che esistono
   solo lì dentro: i tipi tengono il confine, ma non impediscono a un modello
   di copiare mezza tabella dentro un campo di testo della risoluzione — che
   invece al compilatore ci arriva.
   ════════════════════════════════════════════════════════════════════════════
   ========================================================================= */

import { askLong } from './backend';
import type { BackendFailure } from './backend';
import type { Lesson, MonRecord } from '../engine/types';
import { characterDataFor } from '../assets-pipeline/resolver/adapter';
import { numericGrammarFor } from '../assets-pipeline/resolver/vendor/rules';
import { buildCreativeResolverPrompt } from '../assets-pipeline/resolver/vendor/resolver';
import { parseResolution } from '../assets-pipeline/resolver/parse';
import { AI_STEPS } from '../../netlify/functions/_shared/routing';
import { RESOLVER_CONTRACT } from '../assets-pipeline/resolver/contract';
import { resolverMemoryWith } from '../assets-pipeline/resolver/memory';
import type { CreativeResolution } from '../assets-pipeline/resolver/vendor/types';

/**
 * Le lezioni come ordini, non come racconto.
 *
 * ⚠️ «Vinz prefers X» e «X. This overrides the document above» sono la stessa
 * informazione con due forze diverse, e la seconda è quella che serve quando
 * il resto del contesto tira in direzione opposta.
 */
function vincoliDa(lessons: readonly Lesson[]): string {
  return [
    'ACTIVE CONSTRAINTS FROM VINZ — read these last, apply them first.',
    '',
    'These are decisions Vinz made himself, after the memory document above.',
    'They are not preferences to weigh: they are binding. Where any of them',
    'touches something the document or your habits would resolve differently,',
    'THEY WIN, and your resolution must visibly reflect them.',
    '',
    ...lessons.map((l) => `- ${l.text}`),
    '',
    'They still never override generated Character Data and never introduce',
    'new taxonomy. They change HOW you resolve, not WHAT the Form is.',
  ].join('\n');
}

export interface ResolveOutcome {
  resolution: CreativeResolution | null;
  failure: BackendFailure | null;
  /** Perché è stata scartata, o perché la chiamata non è andata. */
  problems: string[];
  /** Cosa è stato aggiustato per leggerla. */
  repaired: string[];
  /**
   * Con quante lezioni è stata fatta.
   *
   * ⚠️ Serve a separare due guasti che da fuori sono identici: «la lezione non
   * è arrivata» e «è arrivata e non l'ha usata». Zero qui significa il primo,
   * ed è l'unico dei due che è colpa del codice.
   */
  usedLessons: number;
  /**
   * Quanto ha impiegato LA CHIAMATA, in millisecondi.
   *
   * 🔒 Non è il tempo che vedi sul pulsante: quello comprende il caricamento
   * del codice, la costruzione del prompt e il salvataggio. Questo è il solo
   * numero confrontabile col tetto della piattaforma.
   */
  ms: number | null;
}

export async function resolveWithAi(
  token: string | null,
  record: MonRecord,
  /**
   * Quello che gli hai insegnato tu, in coda al documento.
   *
   * 🔒 Passate da fuori e non lette qui dentro: questo file non deve sapere
   * dove sono conservate. È la stessa ragione per cui non legge `record` dal
   * negozio — una funzione che va a prendersi da sé i suoi ingredienti non si
   * può provare senza montare mezza app.
   */
  lessons: readonly Lesson[] = [],
  /** Il documento suo, se gliene ha dato uno al posto di quello del pacchetto. */
  custom?: string | null,
  compilerModel?: string | null,
  /** Quanti secondi sono passati: serve a far vedere che è vivo. */
  onTick?: (secondi: number) => void,
): Promise<ResolveOutcome> {
  const input = characterDataFor(record);
  const numeric = numericGrammarFor(input);

  /* 🔒 Il prompt è quello del pacchetto, parola per parola. Non viene diviso
     fra sistema e utente per guadagnare la cache: spezzarlo vorrebbe dire
     modificarlo, e il testo che gira dev'essere identico a quello che si
     copia a mano — altrimenti i due percorsi danno risultati diversi e non si
     capisce più quale sia il metodo che stiamo giudicando.

     ⚠️ E LA MEMORIA NON LO SPEZZA: è un blocco SEPARATO, prima e sopra. Il
     messaggio utente resta il prompt del pacchetto integro, byte per byte.
     Quella decisione vale ancora — quello che cambia è cosa il modello sa
     PRIMA di leggerlo, non cosa legge.

     🔒 In testa e in cache perché è identica a ogni chiamata: un prefisso
     costante e primo è la condizione perché la cache del fornitore agganci.
     Messa in coda costerebbe pieno per sempre. */
  /* ⚠️ LA STRADA LUNGA, E ADESSO IL RAGIONAMENTO SI PUÒ CHIEDERE.

     🔷 «Voglio far funzionare l'app con Sol.»

     ⚠️ E CANCELLA UNA MIA CORREZIONE PRECEDENTE. Qui c'era scritto «ragionamento
     basso, di proposito, perché il lavoro è vincolato». Era vero a metà: il
     lavoro è vincolato davvero, ma il motivo per cui l'avevo abbassato era il
     muro dei dieci secondi, non il compito. Avevo trasformato un limite di
     piattaforma in una virtù di design, che è il modo più comodo di sbagliare.

     Adesso il lavoro parte da OpenAI e resta lì; noi chiediamo ogni due
     secondi se è pronto. Nessuna chiamata aspetta il modello, quindi non c'è
     più nessun orologio da rispettare — ed è l'unica ragione per cui Sol ha
     senso: a ragionamento spento era un Terra che costa il doppio. */
  const { text, failure, detail, ms } = await askLong(
    token,
    {
      capability: 'prompt-compile',
      voiceModel: compilerModel,
      system: [
        { text: resolverMemoryWith(lessons, custom), cache: true },
        /* ⚠️ IL CONTRATTO, NON IL GUSTO. Sta qui e non fra le lezioni perché
           quelle sono SUE — le cancella, le riscrive, rifà il documento in una
           chat — e queste devono sopravvivere a tutto questo: sono come il
           resolver deve lavorare, non cosa a lui piace.

           🔒 Statico come la memoria e subito dopo di lei: il prefisso resta
           identico a ogni chiamata, quindi la cache regge lo stesso. */
        { text: RESOLVER_CONTRACT },
        /* ⚠️ LE LEZIONI, RIPETUTE QUI E IN FORMA DI ORDINE.

           🔷 «Gli ho messo la lezione, ma se faccio generare il prompt non
              sembra prenderla in considerazione.»

           Nella memoria ci sono già — sezione 15 — ma stanno in fondo a
           diciassettemila caratteri, e subito dopo arriva un prompt di altri
           sedicimila che dice per filo e per segno cosa fare. È la posizione
           più debole del contesto: quello che sta in mezzo pesa meno di quello
           che sta agli estremi, ed è misurato, non un'impressione.

           🔒 Qui sono l'ULTIMA cosa che legge prima del compito, e non sono
           più raccontate come preferenze: sono scritte come vincoli. Nella
           memoria restano lo stesso, perché quello è il registro di cosa gli
           hai insegnato e quando. */
        ...(lessons.length > 0 ? [{ text: vincoliDa(lessons) }] : []),
      ],
      /* 🔒 Il prompt del pacchetto, parola per parola, come messaggio utente.
         La memoria non lo spezza: è un blocco separato, prima e sopra. */
      user: buildCreativeResolverPrompt(input, numeric),
      /* Decidere è esattamente il lavoro che vale la pena far ragionare. Non
         `high`: i fatti arrivano dati, il formato è dettato riga per riga e la
         grammatica numerica è già calcolata — `medium` è dove la resa smette
         di crescere su un compito così vincolato. */
      effort: AI_STEPS.characterMaster.effort,
      /* 🔶 Da tremila a ottomila. Il tetto stretto serviva a non aspettare, e
         adesso nessuno aspetta. Un modello che ragiona spende token anche per
         pensare, e un tetto stretto lo taglia MENTRE pensa: produce un JSON
         troncato, non una risposta più corta. */
      maxTokens: AI_STEPS.characterMaster.maxTokens,
    },
    onTick,
  );

  if (!text) {
    return {
      resolution: null,
      failure,
      problems: [detail ?? (failure ? `chiamata fallita (${failure})` : 'nessuna risposta')],
      repaired: [],
      usedLessons: lessons.length,
      ms,
    };
  }

  const { resolution, problems, repaired } = parseResolution(text);
  return {
    resolution,
    failure: null,
    problems,
    repaired,
    usedLessons: lessons.length,
    ms,
  };
}
