/* ============================================================================
   GLI STRUMENTI (MASTER SPEC v1.17 §21)

   🔷 «Vorrei che lui riuscisse a gestire dei file o creare una pagina
   personalizzata. Altri strumenti che servono deve averli tutti.»

   ════════════════════════════════════════════════════════════════════════════
   FINO A IERI IL .MON SAPEVA SOLO PARLARE.

   `ask()` mandava dei messaggi e tornava del testo. Non poteva guardare i tuoi
   dati: vedeva solo quello che gli infilavamo noi nel prompt, scelto in
   anticipo da del codice che non sa cosa stai per chiedere. Se gli domandavi
   «quanto ho dormito questa settimana» poteva solo rispondere con quello che
   per caso era in quel riassunto.

   Gli strumenti ribaltano la cosa: invece di indovinare prima cosa gli
   servirà, gli si dà il modo di andare a prenderlo.
   ════════════════════════════════════════════════════════════════════════════

   🔒 GLI STRUMENTI GIRANO QUI, NEL BROWSER. Non sul server, e non è un
   dettaglio di comodità: i dati stanno qui. Un server che sapesse eseguirli
   dovrebbe prima farseli mandare tutti — mesi di salute, ricordi, protocollo —
   e sarebbe esattamente il contrario di quello che questo progetto fa. Il
   server vede passare i NOMI degli strumenti e i risultati che il modello
   deve leggere, mai l'archivio.

   L'unica eccezione dichiarata è la ricerca sul web, che gira dal fornitore
   perché è lui ad avere una connessione a internet e un indice.

   ⚠️ E GLI STRUMENTI CHE SCRIVONO NON SONO COME QUELLI CHE LEGGONO. Leggere
   una cosa sbagliata produce una frase sbagliata. Scrivere una cosa sbagliata
   resta. Quindi ogni strumento che scrive passa dai controlli di `pages.ts` e
   torna indietro un errore leggibile invece di applicare a metà.
   ========================================================================= */

import type { HealthState, Memory } from '../engine/types';
import { STAT_KEYS, isKnown } from '../engine/types';
import { STAT_LABELS, trend } from '../engine/health';
import type { Protocol } from '../engine/protocol';
import { describeDiet, describeTraining } from '../engine/protocol';
import type { DailySync } from '../engine/progression';
import { DAILY_SIGNALS } from '../engine/progression';
import type { Page, NewPage } from '../engine/pages';
import { pagesDigest } from '../engine/pages';
import { MANOPOLE } from '../engine/skin';
import { PEZZI } from '../engine/layout';

/* --- La forma di uno strumento ---------------------------------------------- */

export interface ToolDef {
  name: string;
  description: string;
  schema: Record<string, unknown>;
}

export interface ToolUse {
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResult {
  id: string;
  /** Quello che il modello legge. Sempre testo: è la lingua che capisce. */
  content: string;
  isError?: boolean;
}

/**
 * Tutto quello che uno strumento può leggere o toccare.
 *
 * Passa come oggetto invece di leggere lo store da dentro perché così gli
 * strumenti si possono provare senza montare l'app — ed è l'unico modo di
 * verificarli quando le chiavi non ci sono ancora.
 */
export interface ToolContext {
  day: number;
  health: HealthState;
  protocol: Protocol;
  days: Record<number, DailySync>;
  memories: readonly Memory[];
  pages: readonly Page[];
  monName: string | null;
  /** Scrive una pagina nuova. Torna il nome nell'indirizzo, o l'errore. */
  writePage: (input: NewPage) => { ok: boolean; slug?: string; error?: string };
  /** Cambia una sezione di una pagina esistente. */
  updatePage: (slug: string, heading: string, body: string) => { ok: boolean; error?: string };
  /** Mette un promemoria. */
  remember: (text: string, inDays: number, everyDays: number | null) => { ok: boolean; error?: string };
  /** Com'è l'aspetto adesso, a parole. */
  skinNow: () => string;
  /** Cambia una manopola d'aspetto, o spiega perché no. §10 — catalogo chiuso. */
  changeSkin: (what: string, value: string) => { ok: boolean; error?: string };
  /** Rimette l'aspetto di fabbrica — colori E disposizione. */
  resetSkin: () => void;
  /** Cosa è nascosto o spostato adesso, a parole. */
  layoutNow: () => string;
  /** Nasconde o rimostra un pezzo dichiarato. §13 — catalogo chiuso. */
  showPiece: (id: string, visible: boolean) => { ok: boolean; error?: string };
  /** Sposta un pezzo dentro la sua colonna. */
  movePiece: (id: string, at: number) => { ok: boolean; error?: string };
  logMeal: (input: { slot: 'colazione' | 'pranzo' | 'cena' | 'spuntino'; description: string; kcal: number; protein: number; carbs: number; fat: number }) => void;
  logWorkout: (input: { title: string; details: string; minutes: number }) => void;
  logWeight: (kg: number) => void;
  saveDiet: (title: string, text: string) => void;
}

/* ============================================================================
   IL CATALOGO

   I nomi sono in italiano di proposito. Il briefing della voce è in italiano,
   la conversazione è in italiano: un `write_page` in mezzo è una crepa da cui
   il modello scivola nel registro sbagliato, e si sente nella risposta.
   ========================================================================= */

export const TOOLS: ToolDef[] = [
  {
    name: 'leggi_i_miei_dati',
    description:
      'Guarda i dati veri di Vincenzo invece di tirare a indovinare. Usalo ogni volta che una risposta dipende da come sta andando davvero: come ha dormito, se si è allenato, cosa ha dichiarato di mangiare, cosa vi siete detti. Meglio guardare che supporre.',
    schema: {
      type: 'object',
      properties: {
        cosa: {
          type: 'string',
          enum: ['salute', 'protocollo', 'giornate', 'ricordi'],
          description:
            'salute = le sei statistiche e i loro andamenti; protocollo = la dieta e gli allenamenti dichiarati; giornate = cosa ha registrato negli ultimi giorni; ricordi = cosa vi siete detti.',
        },
        giorni: {
          type: 'integer',
          description: 'Quanti giorni indietro guardare. Da 1 a 60. Vale per giornate e ricordi.',
        },
      },
      required: ['cosa'],
    },
  },
  {
    name: 'registra_pasto',
    description: 'Registra nella sezione ME un pasto raccontato in chat o riconosciuto da una foto. Se quantità o valori nutrizionali sono incerti, chiedi conferma prima di usarlo.',
    schema: { type: 'object', properties: {
      pasto: { type: 'string', enum: ['colazione', 'pranzo', 'cena', 'spuntino'] },
      descrizione: { type: 'string' }, kcal: { type: 'number' }, proteine: { type: 'number' }, carboidrati: { type: 'number' }, grassi: { type: 'number' },
    }, required: ['pasto', 'descrizione', 'kcal', 'proteine', 'carboidrati', 'grassi'] },
  },
  {
    name: 'registra_allenamento',
    description: 'Registra nella sezione ME un allenamento che l’utente dice di aver completato.',
    schema: { type: 'object', properties: { titolo: { type: 'string' }, dettagli: { type: 'string' }, minuti: { type: 'number' } }, required: ['titolo', 'dettagli', 'minuti'] },
  },
  {
    name: 'registra_peso',
    description: 'Registra nella sezione ME una nuova misurazione del peso.',
    schema: { type: 'object', properties: { kg: { type: 'number' } }, required: ['kg'] },
  },
  {
    name: 'imposta_dieta',
    description: 'Salva nella sezione DIETA un piano alimentare fornito dall’utente, anche estratto da un file allegato. Conserva indicazioni, pasti e quantità senza inventare dati mancanti.',
    schema: { type: 'object', properties: { titolo: { type: 'string' }, testo: { type: 'string' } }, required: ['titolo', 'testo'] },
  },
  {
    name: 'elenca_le_pagine',
    description:
      'Le pagine che hai già scritto per lui. Guardale prima di scriverne una nuova: se una c’è già, si aggiorna invece di farne una seconda quasi uguale.',
    schema: { type: 'object', properties: {} },
  },
  {
    name: 'leggi_una_pagina',
    description: 'Il contenuto di una pagina, per sapere cosa c’è già scritto prima di cambiarla.',
    schema: {
      type: 'object',
      properties: { nome: { type: 'string', description: 'Il nome breve della pagina.' } },
      required: ['nome'],
    },
  },
  {
    name: 'scrivi_una_pagina',
    description:
      'Crea una pagina che resta e che lui può ritrovare senza scorrere la chat: la dieta del periodo, il programma di palestra, l’itinerario di un viaggio. Scrivila in markdown — titoli, elenchi, tabelle, spunte. Falla quando serve un documento, non per rispondere a una domanda: una risposta si dice parlando.',
    schema: {
      type: 'object',
      properties: {
        titolo: { type: 'string', description: 'Breve, riconoscibile. Massimo 60 caratteri.' },
        markdown: { type: 'string', description: 'Il contenuto della pagina, in markdown.' },
        appuntala: {
          type: 'boolean',
          description: 'Vero se deve stare in cima all’elenco perché riguarda il periodo di adesso.',
        },
      },
      required: ['titolo', 'markdown'],
    },
  },
  {
    name: 'aggiorna_una_pagina',
    description:
      'Cambia UNA sezione di una pagina, lasciando intatto tutto il resto. Se la sezione non esiste viene aggiunta in fondo. Usa questo invece di riscrivere tutto: riscrivendo si perde quello che c’era.',
    schema: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Il nome breve della pagina.' },
        sezione: { type: 'string', description: 'Il titolo della sezione da sostituire.' },
        testo: { type: 'string', description: 'Il nuovo contenuto della sezione, in markdown.' },
      },
      required: ['nome', 'sezione', 'testo'],
    },
  },
  /* ════════════════════════════════════════════════════════════════════════
     🔷 «Permetti all'AI di poter modificare la UI — solo la UI, l'estetica.»

     ⚠️ NON PRENDE CSS, E NON È PIGRIZIA. Un campo libero che finisce in un
     foglio di stile può spegnere l'app — testo bianco su bianco, la barra
     nascosta — e l'unica strada per tornare indietro passa dall'app che nel
     frattempo non si vede. Qui il modello sceglie DENTRO un catalogo chiuso
     (`engine/skin.ts`), come sceglie dentro le tassonomie di generazione.

     🔒 Restano fuori i colori dei segnali e l'accento del personaggio: i primi
     perché §17 li accoppia a una parola, e un rosso che diventa verde fa
     mentire la parola; il secondo perché è chi è lui, non una preferenza.
     ════════════════════════════════════════════════════════════════════════ */
  {
    name: 'cambia_aspetto',
    description: [
      'Cambia UNA cosa dell’aspetto dell’app. Solo estetica: colori, spessori, spazi, carattere.',
      'Non puoi scrivere CSS e non puoi toccare niente che non sia in questo elenco.',
      '',
      'Cosa puoi cambiare:',
      ...MANOPOLE.map((m) => `- ${m.id} → ${m.cosa}`),
      '',
      'I colori si scrivono #rrggbb. Le misure in pixel. Le scelte con il loro nome.',
      'Per rimettere tutto com’era: usa "reset" come cosa.',
      'Cambia una manopola alla volta e digli cosa hai fatto, non incollargli i valori.',
    ].join('\n'),
    schema: {
      type: 'object',
      properties: {
        cosa: { type: 'string', description: 'Il nome della manopola, o "reset".' },
        valore: { type: 'string', description: 'Il valore nuovo. Vuoto se cosa è "reset".' },
      },
      required: ['cosa'],
    },
  },
  {
    name: 'guarda_aspetto',
    description:
      'Dice com’è l’aspetto adesso e cosa è già stato cambiato. Usalo prima di cambiare, per non rifare una cosa già fatta.',
    schema: { type: 'object', properties: {} },
  },
  /* ════════════════════════════════════════════════════════════════════════
     🔷 «Vorrei anche togliere pulsanti e spostare elementi, e immaginarmi le
        schermate in modo diverso.»

     ⚠️ NON È MANIPOLAZIONE DEL DOM. Il modello non descrive un elemento e non
     scrive un selettore: nomina un pezzo che esiste nel catalogo. Da lì il
     codice — non lui — scrive due sole forme di regola, «nascondi» e «metti in
     posizione N».

     🔒 Tre pezzi non si possono nascondere, ed è la ragione per cui questo
     strumento può esistere: la barra in fondo, il campo per scrivere e la
     scorciatoia DEV sono le tre strade per dirgli di rimettere le cose a
     posto. Un catalogo che permettesse di nascondere il campo di testo
     sarebbe un catalogo usabile una volta sola.
     ════════════════════════════════════════════════════════════════════════ */
  {
    name: 'cambia_schermata',
    description: [
      'Nasconde, rimostra o sposta un pezzo delle schermate. Solo disposizione: non crea niente di nuovo.',
      '',
      'I pezzi che ci sono:',
      ...PEZZI.map((p) => `- ${p.id} (${p.dove}) → ${p.cosa}${p.riordinabile ? '' : ' · solo nascondere'}`),
      '',
      'azione: "nascondi" | "mostra" | "sposta". Con "sposta" serve anche posizione (1 = in cima).',
      'La barra in fondo, il campo di testo e il pulsante DEV non si toccano: servono a disfare.',
      'Un pezzo alla volta. Poi digli cosa hai fatto con parole tue.',
    ].join('\n'),
    schema: {
      type: 'object',
      properties: {
        pezzo: { type: 'string', description: 'Il nome del pezzo.' },
        azione: { type: 'string', enum: ['nascondi', 'mostra', 'sposta'] },
        posizione: { type: 'number', description: 'Solo con "sposta". 1 = in cima.' },
      },
      required: ['pezzo', 'azione'],
    },
  },
  {
    name: 'guarda_schermata',
    description: 'Dice quali pezzi sono nascosti o spostati adesso. Guarda prima di cambiare.',
    schema: { type: 'object', properties: {} },
  },
  {
    name: 'ricorda_di',
    description:
      'Metti un promemoria che ti farai tornare in mente tu, nel giorno giusto. Usalo quando te lo chiede, o quando concordate una cosa che ha una data.',
    schema: {
      type: 'object',
      properties: {
        cosa: { type: 'string', description: 'Cosa gli dirai quel giorno. Una frase.' },
        fra_giorni: { type: 'integer', description: 'Fra quanti giorni. 0 = oggi.' },
        ogni_giorni: {
          type: 'integer',
          description: 'Se si ripete, ogni quanti giorni. Omettilo se è una volta sola.',
        },
      },
      required: ['cosa', 'fra_giorni'],
    },
  },
];

/** I nomi, per i controlli. */
export const TOOL_NAMES = TOOLS.map((t) => t.name);

/* ============================================================================
   L'ESECUZIONE
   ========================================================================= */

const clampDays = (n: unknown, fallback: number): number => {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.max(1, Math.min(60, v));
};

function healthReport(health: HealthState): string {
  const lines = STAT_KEYS.map((k) => {
    const entry = health.stats[k];
    if (!isKnown(entry.value)) return `${k} (${STAT_LABELS[k]}): non lo so ancora`;
    const t = trend(health, k, 7);
    const arrow = isKnown(t) ? (t > 1 ? `in salita (+${t})` : t < -1 ? `in discesa (${t})` : 'stabile') : 'senza andamento';
    return `${k} (${STAT_LABELS[k]}): ${entry.value} su 100, ${arrow}, affidabilità ${Math.round(entry.confidence * 100)}%`;
  });

  const cond = isKnown(health.condition) ? `${health.condition} su 100` : 'sconosciuta';
  const disc = isKnown(health.disc) ? `${health.disc} su 100` : 'sconosciuta';

  return [
    `CONDIZIONE DI OGGI: ${cond}`,
    `COSTANZA NEL REGISTRARE: ${disc}`,
    '',
    ...lines,
    '',
    'I valori vanno da 0 a 100. Un dato che manca è «non lo so», mai uno zero.',
  ].join('\n');
}

function daysReport(days: Record<number, DailySync>, today: number, back: number): string {
  const out: string[] = [];

  for (let d = today; d > today - back && d > 0; d--) {
    const day = days[d];
    if (!day) continue;
    const parts = DAILY_SIGNALS.map((key) => {
      const sig = day.signals?.[key];
      if (!sig || sig.status === 'UNKNOWN') return null;
      return `${key}: ${sig.status === 'KNOWN' ? (sig.note ?? 'sì') : sig.status}`;
    }).filter(Boolean);

    if (parts.length > 0) out.push(`Giorno ${d} (${day.status}) — ${parts.join(' · ')}`);
  }

  if (out.length === 0) return `Negli ultimi ${back} giorni non ha registrato niente.`;
  return out.join('\n');
}

function memoriesReport(memories: readonly Memory[], today: number, back: number): string {
  const recent = memories.filter((m) => today - m.day <= back);
  if (recent.length === 0) return `Negli ultimi ${back} giorni non c’è niente di segnato.`;

  return recent
    .slice(-30)
    .map((m) => `Giorno ${m.day} (${m.kind}): ${m.title}${m.text ? ` — ${m.text}` : ''}`)
    .join('\n');
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Esegue uno strumento e torna quello che il modello leggerà.
 *
 * ⚠️ Non lancia MAI. Un'eccezione qui interromperebbe il giro e lascerebbe la
 * conversazione senza risposta; un errore raccontato invece il modello lo
 * legge e si corregge da solo — che è la differenza fra «l'app si è rotta» e
 * «ha detto che quella pagina non c'era».
 */
export function runTool(use: ToolUse, ctx: ToolContext): ToolResult {
  const args = (use.input ?? {}) as Record<string, unknown>;
  const fail = (msg: string): ToolResult => ({ id: use.id, content: msg, isError: true });
  const ok = (msg: string): ToolResult => ({ id: use.id, content: msg });

  try {
    switch (use.name) {
      case 'registra_pasto': {
        const slot = str(args.pasto) as 'colazione' | 'pranzo' | 'cena' | 'spuntino';
        if (!['colazione', 'pranzo', 'cena', 'spuntino'].includes(slot)) return fail('Il tipo di pasto non è valido.');
        const numbers = [args.kcal, args.proteine, args.carboidrati, args.grassi].map(Number);
        if (numbers.some((value) => !Number.isFinite(value) || value < 0)) return fail('I valori nutrizionali non sono validi.');
        ctx.logMeal({ slot, description: str(args.descrizione), kcal: numbers[0]!, protein: numbers[1]!, carbs: numbers[2]!, fat: numbers[3]! });
        return ok('Pasto registrato in ME.');
      }
      case 'registra_allenamento': {
        const minutes = Number(args.minuti);
        if (!Number.isFinite(minutes) || minutes < 0) return fail('La durata non è valida.');
        ctx.logWorkout({ title: str(args.titolo), details: str(args.dettagli), minutes });
        return ok('Allenamento registrato in ME.');
      }
      case 'registra_peso': {
        const kg = Number(args.kg);
        if (!Number.isFinite(kg) || kg < 20 || kg > 400) return fail('Il peso non sembra valido.');
        ctx.logWeight(kg);
        return ok('Peso aggiornato in ME.');
      }
      case 'imposta_dieta': {
        const title = str(args.titolo); const text = str(args.testo);
        if (!title || !text) return fail('Titolo o contenuto della dieta mancanti.');
        ctx.saveDiet(title, text);
        return ok('Dieta salvata nella sezione ME → DIETA.');
      }
      case 'leggi_i_miei_dati': {
        const what = str(args.cosa);
        const back = clampDays(args.giorni, 7);

        if (what === 'salute') return ok(healthReport(ctx.health));
        if (what === 'protocollo') {
          const diet = describeDiet(ctx.protocol.diet);
          const training = describeTraining(ctx.protocol.training);
          if (!diet && !training) return ok('Non ha ancora dichiarato né dieta né allenamenti.');
          return ok(
            [diet ? `DIETA: ${diet}` : 'DIETA: non dichiarata', training ? `ALLENAMENTI: ${training}` : 'ALLENAMENTI: non dichiarati'].join('\n'),
          );
        }
        if (what === 'giornate') return ok(daysReport(ctx.days, ctx.day, back));
        if (what === 'ricordi') return ok(memoriesReport(ctx.memories, ctx.day, back));
        return fail('Non so cosa guardare: usa salute, protocollo, giornate o ricordi.');
      }

      case 'elenca_le_pagine':
        return ok(pagesDigest(ctx.pages));

      case 'leggi_una_pagina': {
        const name = str(args.nome);
        const page = ctx.pages.find((p) => p.slug === name || p.title.toLowerCase() === name.toLowerCase());
        if (!page) return fail(`Non c’è nessuna pagina che si chiama «${name}».\n${pagesDigest(ctx.pages)}`);
        return ok(`# ${page.title}\n\n${page.markdown}`);
      }

      case 'scrivi_una_pagina': {
        const res = ctx.writePage({
          title: str(args.titolo),
          markdown: typeof args.markdown === 'string' ? args.markdown : '',
          pinned: args.appuntala === true,
        });
        if (!res.ok) return fail(res.error ?? 'La pagina non è stata scritta.');
        return ok(
          `Fatto. La pagina esiste e lui la trova in ME, oppure all’indirizzo #/p/${res.slug}. Diglielo con parole tue: non incollargli il contenuto, ce l’ha già.`,
        );
      }

      case 'aggiorna_una_pagina': {
        const res = ctx.updatePage(str(args.nome), str(args.sezione), typeof args.testo === 'string' ? args.testo : '');
        if (!res.ok) return fail(res.error ?? 'La pagina non è stata aggiornata.');
        return ok('Fatto. La sezione è cambiata, il resto della pagina è rimasto com’era.');
      }

      case 'guarda_aspetto':
        return ok(ctx.skinNow());

      case 'cambia_aspetto': {
        const cosa = str(args.cosa).toLowerCase();
        if (cosa.length === 0) return fail('Manca cosa cambiare.');

        if (cosa === 'reset') {
          ctx.resetSkin();
          return ok('Fatto: aspetto rimesso com’era di fabbrica.');
        }

        const valore = str(args.valore);
        if (valore.length === 0) return fail(`Manca il valore nuovo per «${cosa}».`);

        const res = ctx.changeSkin(cosa, valore);
        /* 🔒 L'errore torna al MODELLO, non all'utente: è scritto per farlo
           correggere da solo — «fuori scala, sta fra 0 e 24» — invece di
           finire in faccia a chi sta solo chiacchierando. */
        if (!res.ok) return fail(res.error ?? 'Non si può cambiare così.');
        return ok(`Fatto: «${cosa}» adesso è ${valore}. Si vede subito. Se non gli piace, dillo e lo rimetto.`);
      }

      case 'guarda_schermata':
        return ok(ctx.layoutNow());

      case 'cambia_schermata': {
        const pezzo = str(args.pezzo);
        const azione = str(args.azione).toLowerCase();
        if (pezzo.length === 0) return fail('Manca quale pezzo.');

        if (azione === 'nascondi' || azione === 'mostra') {
          const res = ctx.showPiece(pezzo, azione === 'mostra');
          if (!res.ok) return fail(res.error ?? 'Non si può.');
          return ok(
            azione === 'nascondi'
              ? `Fatto: «${pezzo}» non si vede più. Per rimetterlo basta che me lo dica.`
              : `Fatto: «${pezzo}» è tornato.`,
          );
        }

        if (azione === 'sposta') {
          const at = typeof args.posizione === 'number' ? args.posizione : NaN;
          const res = ctx.movePiece(pezzo, at);
          if (!res.ok) return fail(res.error ?? 'Non si può.');
          return ok(`Fatto: «${pezzo}» adesso è in posizione ${Math.round(at)}.`);
        }

        return fail('L’azione è "nascondi", "mostra" o "sposta".');
      }

      case 'ricorda_di': {
        const text = str(args.cosa);
        const inDays = typeof args.fra_giorni === 'number' ? Math.max(0, Math.round(args.fra_giorni)) : -1;
        const every =
          typeof args.ogni_giorni === 'number' && args.ogni_giorni > 0
            ? Math.round(args.ogni_giorni)
            : null;

        if (text.length === 0) return fail('Manca cosa devo ricordargli.');
        if (inDays < 0) return fail('Manca fra quanti giorni.');

        const res = ctx.remember(text, inDays, every);
        if (!res.ok) return fail(res.error ?? 'Il promemoria non è stato messo.');
        return ok(
          every
            ? `Fatto: glielo dirò fra ${inDays} giorni e poi ogni ${every}.`
            : `Fatto: glielo dirò il giorno ${ctx.day + inDays}.`,
        );
      }

      default:
        return fail(`Non ho uno strumento che si chiama «${use.name}».`);
    }
  } catch (err) {
    console.warn('[tools] strumento fallito:', use.name, err);
    return fail('Quello strumento non ha funzionato. Rispondi con quello che sai già.');
  }
}

/* ============================================================================
   I BLOCCHI DA RIMANDARE INDIETRO

   Il fornitore vuole sapere cosa aveva chiesto e cosa gli è stato risposto,
   nella sua grammatica. Sono due turni: quello che ha detto lui, e quello con
   i risultati.
   ========================================================================= */

export function assistantTurn(text: string, uses: readonly ToolUse[]): Record<string, unknown> {
  const content: Record<string, unknown>[] = [];
  /* ⚠️ Un blocco di testo VUOTO fa rifiutare la richiesta, e il caso capita
     sempre: quando il modello chiama uno strumento senza dire niente prima.
     Si mette solo se c'è qualcosa dentro. */
  if (text.trim().length > 0) content.push({ type: 'text', text });
  for (const u of uses) content.push({ type: 'tool_use', id: u.id, name: u.name, input: u.input });
  return { role: 'assistant', content };
}

export function resultBlocks(results: readonly ToolResult[]): Record<string, unknown>[] {
  return results.map((r) => ({
    type: 'tool_result',
    tool_use_id: r.id,
    content: r.content,
    ...(r.isError ? { is_error: true } : {}),
  }));
}
