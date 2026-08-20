/* ============================================================================
   L'ASPETTO CHE PUÒ CAMBIARE LUI (§10)

   🔷 «Permetti all'AI di poter modificare la UI — solo la UI, l'estetica —
      così posso fare delle modifiche con lui.»

   ════════════════════════════════════════════════════════════════════════════
   ⚠️ LA DOMANDA VERA NON È «COME», È «FIN DOVE».

   Dare a un modello un campo di testo libero che finisce in un foglio di stile
   sarebbe stato più corto da scrivere e sbagliato per una ragione sola: una
   regola CSS può spegnere l'app. `display:none` sulla barra, testo bianco su
   bianco, un `position:fixed` che copre lo schermo — e la strada per tornare
   indietro passa da quella stessa app, che nel frattempo non si vede più.

   🔒 QUINDI NON È CSS: È UN CATALOGO CHIUSO DI MANOPOLE. Ogni voce qui sotto
   dichiara cosa tocca, che forma ha un valore valido e fra quali estremi può
   stare. Un nome che non è in questa tabella non esiste; un valore fuori
   scala viene rifiutato con una frase che dice perché.

   È la stessa idea dei cataloghi di generazione: il modello sceglie DENTRO
   una tassonomia, non inventa la tassonomia.

   🔒 E QUELLO CHE NON È QUI DENTRO NON SI PIEGA. Fuori dal catalogo restano
   di proposito:
   • i colori dei segnali (`--signal-*`), perché §17 dice che uno stato
     colorato porta sempre anche una parola: se il rosso dell'allarme diventa
     verde, la parola resta giusta e il colore mente;
   • l'accento del personaggio (`--char-*`), che viene dal suo Color DNA e non
     è una preferenza estetica: è chi è lui;
   • qualunque cosa che non sia un token — niente selettori, niente regole,
     niente posizioni, niente `display`.
   ════════════════════════════════════════════════════════════════════════════

   🔒 SI TORNA SEMPRE INDIETRO. `RESET_SKIN` è vuoto per costruzione, e
   `applySkin(null)` rimuove ogni proprietà scritta. Una modifica che non
   piace si annulla con una frase, e se anche non si riuscisse a parlargli il
   pannello DEV ha lo stesso pulsante.
   ========================================================================= */

/** Che forma ha un valore ammesso. */
type Forma =
  | { kind: 'px'; min: number; max: number }
  | { kind: 'colore' }
  | { kind: 'scelta'; among: readonly string[] };

export interface Manopola {
  /** Il nome che usa lui. In italiano, come gli strumenti. */
  id: string;
  /** I token CSS che tocca. Più di uno quando la cosa è una sola. */
  vars: readonly string[];
  forma: Forma;
  /** Cosa cambia, detto a lui. Finisce nella descrizione dello strumento. */
  cosa: string;
}

export const MANOPOLE: readonly Manopola[] = [
  {
    id: 'sfondo',
    vars: ['--white'],
    forma: { kind: 'colore' },
    cosa: 'il fondo delle schermate chiare',
  },
  {
    id: 'carta',
    vars: ['--paper'],
    forma: { kind: 'colore' },
    cosa: 'il fondo dei riquadri e delle bolle',
  },
  {
    id: 'inchiostro',
    vars: ['--ink'],
    forma: { kind: 'colore' },
    cosa: 'il colore del testo e dei bordi',
  },
  {
    id: 'filo',
    vars: ['--hairline'],
    forma: { kind: 'colore' },
    cosa: 'le righe sottili di separazione',
  },
  {
    id: 'spessore-bordi',
    vars: ['--border'],
    forma: { kind: 'px', min: 0, max: 6 },
    cosa: 'quanto sono spessi i bordi',
  },
  {
    id: 'angoli',
    vars: ['--radius', '--radius-soft'],
    forma: { kind: 'px', min: 0, max: 24 },
    cosa: 'quanto sono arrotondati gli angoli — 0 è la geometria rettangolare di partenza',
  },
  {
    id: 'respiro',
    vars: ['--u4'],
    forma: { kind: 'px', min: 8, max: 28 },
    cosa: 'lo spazio interno standard: più alto, più arioso',
  },
  {
    id: 'ombra',
    vars: ['--shadow-hard', '--shadow-hard-sm'],
    forma: { kind: 'scelta', among: ['dura', 'leggera', 'niente'] },
    cosa: 'le ombre nette sotto i riquadri',
  },
  {
    id: 'carattere-testo',
    vars: ['--font-body'],
    forma: { kind: 'scelta', among: ['inter', 'archivo', 'mono'] },
    cosa: 'il carattere del testo che si legge',
  },
];

export type Skin = Record<string, string>;

/** Vuoto: è la pelle di fabbrica, e il fatto che sia vuota è la via di ritorno. */
export const RESET_SKIN: Skin = {};

const COLORE = /^#[0-9a-f]{6}$/i;

/* Le scelte non sono valori CSS: sono nomi che lui capisce. La traduzione sta
   qui, così il modello non deve conoscere la sintassi di `box-shadow`. */
const RESE: Record<string, Record<string, string[]>> = {
  ombra: {
    dura: ['4px 4px 0 var(--ink)', '2px 2px 0 var(--ink)'],
    leggera: ['2px 2px 0 var(--hairline)', '1px 1px 0 var(--hairline)'],
    niente: ['none', 'none'],
  },
  'carattere-testo': {
    inter: ["'Inter Variable', 'Inter', system-ui, sans-serif"],
    archivo: ["'Archivo Variable', 'Archivo', system-ui, sans-serif"],
    mono: ["'IBM Plex Mono', ui-monospace, monospace"],
  },
};

export interface Esito {
  ok: boolean;
  /** La pelle nuova, se è andata. */
  skin?: Skin;
  /** Perché no, detto a lui in modo che possa correggersi da solo. */
  error?: string;
}

/**
 * Applica una modifica al catalogo, o spiega perché non si può.
 *
 * ⚠️ TORNA UNA PELLE NUOVA, non modifica quella che riceve: chi chiama decide
 * se salvarla. Una funzione che scrive di suo in uno store non si può provare
 * senza montare l'app.
 */
export function cambia(skin: Skin, id: string, valore: string): Esito {
  const m = MANOPOLE.find((x) => x.id === id);
  if (!m) {
    return {
      ok: false,
      error: `«${id}» non è una cosa che puoi cambiare. Quelle che puoi: ${MANOPOLE.map((x) => x.id).join(', ')}.`,
    };
  }

  const v = valore.trim().toLowerCase();
  const scritti: string[] = [];

  if (m.forma.kind === 'colore') {
    if (!COLORE.test(v)) {
      return { ok: false, error: `«${valore}» non è un colore. Scrivilo come #rrggbb, per esempio #f4f4f6.` };
    }
    scritti.push(v);
  } else if (m.forma.kind === 'px') {
    const n = Number(v.replace(/px$/, ''));
    if (!Number.isFinite(n)) {
      return { ok: false, error: `«${valore}» non è un numero di pixel.` };
    }
    if (n < m.forma.min || n > m.forma.max) {
      return {
        ok: false,
        error: `${n}px è fuori scala per «${id}»: sta fra ${m.forma.min} e ${m.forma.max}.`,
      };
    }
    for (const _ of m.vars) scritti.push(`${n}px`);
  } else {
    if (!m.forma.among.includes(v)) {
      return { ok: false, error: `«${valore}» non è una scelta valida per «${id}»: ${m.forma.among.join(', ')}.` };
    }
    scritti.push(...(RESE[id]?.[v] ?? []));
  }

  const next: Skin = { ...skin };
  m.vars.forEach((varName, i) => {
    next[varName] = scritti[i] ?? scritti[0]!;
  });
  return { ok: true, skin: next };
}

/**
 * Scrive la pelle sulla pagina.
 *
 * 🔒 Solo `setProperty` su nomi che vengono dal catalogo: non c'è nessuna
 * strada da qui a una regola CSS arbitraria, e non deve esserci.
 */
export function applySkin(skin: Skin | null, root: HTMLElement = document.documentElement): void {
  const ammessi = new Set(MANOPOLE.flatMap((m) => m.vars));
  for (const v of ammessi) root.style.removeProperty(v);
  if (!skin) return;
  for (const [k, val] of Object.entries(skin)) {
    if (ammessi.has(k)) root.style.setProperty(k, val);
  }
}

/** Com'è adesso, detto a parole. Serve a lui per sapere cosa ha già cambiato. */
export function describeSkin(skin: Skin): string {
  const righe = MANOPOLE.filter((m) => m.vars.some((v) => skin[v] !== undefined)).map(
    (m) => `- ${m.id}: ${skin[m.vars[0]!]}`,
  );
  return righe.length === 0 ? 'Niente cambiato: aspetto di fabbrica.' : righe.join('\n');
}
