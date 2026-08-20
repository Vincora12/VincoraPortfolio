/* ============================================================================
   I PEZZI CHE SI POSSONO SPOSTARE E NASCONDERE (§10, §13)

   🔷 «Vorrei anche togliere pulsanti e spostare elementi, e immaginarmi le
      schermate in modo diverso.»

   ════════════════════════════════════════════════════════════════════════════
   PERCHÉ NON È UN GRADINO PIÙ IN ALTO DI `skin.ts`, MA LA STESSA SCALA

   L'aspetto era un catalogo di manopole con dei valori. Questo è un catalogo di
   PEZZI con due sole cose che si possono fare: farli sparire, e cambiarli di
   posto dentro il contenitore in cui già stanno.

   ⚠️ NON È MANIPOLAZIONE DEL DOM, e la differenza non è accademica. Il modello
   non descrive un elemento e non scrive un selettore: nomina un pezzo che
   esiste in questa tabella. Da lì il codice — non lui — scrive due sole forme
   di regola, `display:none` e `order:N`. Non c'è nessuna strada da una frase
   sua a una regola arbitraria, ed è la stessa ragione per cui `skin.ts` non
   accetta CSS.

   🔒 L'ORDINE FUNZIONA PERCHÉ I CONTENITORI SONO GIÀ FLEX. `.splash` e
   `.dossier` sono colonne flex, quindi `order` sposta davvero. Se un giorno
   uno dei due smettesse di esserlo, i pezzi resterebbero dove sono e nessuno
   capirebbe perché: per questo `contenitore` è dichiarato qui accanto a ogni
   pezzo, e non dedotto.
   ════════════════════════════════════════════════════════════════════════════

   🔒 CI SONO PEZZI CHE NON SI POSSONO NASCONDERE, E SONO LA RAGIONE PER CUI
   QUESTO STRUMENTO PUÒ ESISTERE. La barra in fondo, il campo per scrivere e
   la scorciatoia DEV restano sempre: sono le tre strade per DIRGLI di
   rimettere le cose a posto. Un catalogo che permettesse di nascondere il
   campo di testo sarebbe un catalogo che si può usare una volta sola.
   ========================================================================= */

export interface Pezzo {
  /** Il nome che usa lui. Italiano, come gli strumenti. */
  id: string;
  /** Il valore di `data-pezzo` sull'elemento vero. */
  attr: string;
  /** Dove sta, detto a lui. */
  dove: string;
  /** Cos'è. Finisce nella descrizione dello strumento. */
  cosa: string;
  /**
   * Il contenitore è una colonna flex, quindi si può riordinare.
   * Falso = si può solo nascondere.
   */
  riordinabile: boolean;
}

export const PEZZI: readonly Pezzo[] = [
  /* --- La schermata del .mon ------------------------------------------- */
  { id: 'nome', attr: 'nome', dove: 'MON', cosa: 'il nome grande in cima', riordinabile: true },
  { id: 'foto', attr: 'foto', dove: 'MON', cosa: 'la figura della creatura con gli adesivi', riordinabile: true },
  { id: 'parlagli', attr: 'parlagli', dove: 'MON', cosa: 'il pulsante che porta in chat', riordinabile: true },
  { id: 'dossier', attr: 'dossier', dove: 'MON', cosa: 'tutto il blocco sotto la foto', riordinabile: true },
  { id: 'bio', attr: 'bio', dove: 'MON · dossier', cosa: 'il quaderno: racconto, appunti, disegno', riordinabile: true },
  { id: 'statistiche', attr: 'statistiche', dove: 'MON · dossier', cosa: 'com’eri quando è nato', riordinabile: true },
  { id: 'identita', attr: 'identita', dove: 'MON · dossier', cosa: 'family, affinità, taglia, ruolo', riordinabile: true },
  { id: 'sigillo', attr: 'sigillo', dove: 'MON · dossier', cosa: 'il marchio in fondo', riordinabile: true },

  /* --- La chat ---------------------------------------------------------- */
  { id: 'faccia', attr: 'faccia', dove: 'CHAT', cosa: 'il ritratto in testa alla conversazione', riordinabile: false },
  { id: 'riga-identita', attr: 'riga-identita', dove: 'CHAT', cosa: 'nome e forma sotto la faccia', riordinabile: false },
  { id: 'riga-sync', attr: 'riga-sync', dove: 'CHAT', cosa: 'la barra dei giorni raccontati', riordinabile: false },

  /* --- In cima ovunque --------------------------------------------------- */
  { id: 'giorno', attr: 'giorno', dove: 'ovunque', cosa: 'il contatore dei giorni in alto', riordinabile: false },
];

/* ⚠️ Non è un elenco di cose «importanti»: è l'elenco delle cose che servono
   per ANNULLARE una modifica. Toglierne una qui dentro vuol dire costruire una
   trappola che scatta la prima volta che si sbaglia. */
export const INTOCCABILI = ['barra', 'campo-testo', 'dev'] as const;

export interface Layout {
  /** Pezzi nascosti, per id di attributo. */
  hidden: string[];
  /** Posizione dentro il contenitore. Assente = quella naturale. */
  order: Record<string, number>;
}

export const RESET_LAYOUT: Layout = { hidden: [], order: {} };

export interface Esito {
  ok: boolean;
  layout?: Layout;
  error?: string;
}

function trova(id: string): Pezzo | undefined {
  const k = id.trim().toLowerCase();
  return PEZZI.find((p) => p.id === k);
}

/** Nasconde o rimostra un pezzo. */
export function mostra(layout: Layout, id: string, visibile: boolean): Esito {
  if ((INTOCCABILI as readonly string[]).includes(id.trim().toLowerCase())) {
    return {
      ok: false,
      error: `«${id}» non si può nascondere: è una delle tre strade per dirmi di rimettere le cose a posto.`,
    };
  }
  const p = trova(id);
  if (!p) return { ok: false, error: `«${id}» non è un pezzo che conosco. Quelli che ci sono: ${PEZZI.map((x) => x.id).join(', ')}.` };

  const hidden = layout.hidden.filter((h) => h !== p.attr);
  if (!visibile) hidden.push(p.attr);
  return { ok: true, layout: { ...layout, hidden } };
}

/** Sposta un pezzo dentro il suo contenitore. Numeri bassi = più in alto. */
export function sposta(layout: Layout, id: string, posizione: number): Esito {
  const p = trova(id);
  if (!p) return { ok: false, error: `«${id}» non è un pezzo che conosco.` };
  if (!p.riordinabile) {
    return { ok: false, error: `«${id}» non si può spostare: non è dentro una colonna. Si può solo nascondere.` };
  }
  if (!Number.isFinite(posizione) || posizione < 1 || posizione > 20) {
    return { ok: false, error: `La posizione sta fra 1 e 20. 1 è in cima.` };
  }
  return { ok: true, layout: { ...layout, order: { ...layout.order, [p.attr]: Math.round(posizione) } } };
}

/**
 * Le regole, scritte dal CODICE.
 *
 * 🔒 Due forme sole, e i nomi vengono dal catalogo: non c'è modo di far uscire
 * da qui un selettore che il modello abbia scelto.
 */
export function layoutCss(layout: Layout): string {
  const righe: string[] = [];
  const noti = new Set(PEZZI.map((p) => p.attr));

  for (const h of layout.hidden) {
    if (noti.has(h)) righe.push(`[data-pezzo="${h}"]{display:none !important}`);
  }
  for (const [k, n] of Object.entries(layout.order)) {
    if (noti.has(k) && Number.isFinite(n)) righe.push(`[data-pezzo="${k}"]{order:${Math.round(n)}}`);
  }
  return righe.join('\n');
}

const TAG_ID = 'vinzmon-layout';

/** Scrive le regole in un unico tag di stile, sostituendo quelle di prima. */
export function applyLayout(layout: Layout | null, doc: Document = document): void {
  let tag = doc.getElementById(TAG_ID);
  if (!layout || (layout.hidden.length === 0 && Object.keys(layout.order).length === 0)) {
    tag?.remove();
    return;
  }
  if (!tag) {
    tag = doc.createElement('style');
    tag.id = TAG_ID;
    doc.head.appendChild(tag);
  }
  tag.textContent = layoutCss(layout);
}

/** Com'è adesso, a parole. */
export function describeLayout(layout: Layout): string {
  const via = PEZZI.filter((p) => layout.hidden.includes(p.attr)).map((p) => `- ${p.id}: nascosto`);
  const mossi = PEZZI.filter((p) => layout.order[p.attr] !== undefined).map(
    (p) => `- ${p.id}: posizione ${layout.order[p.attr]}`,
  );
  const tutto = [...via, ...mossi];
  return tutto.length === 0 ? 'Niente spostato né nascosto: schermate come sono nate.' : tutto.join('\n');
}
