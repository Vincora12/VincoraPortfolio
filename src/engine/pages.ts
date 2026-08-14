/* ============================================================================
   LE PAGINE (MASTER SPEC v1.17 §21.2)

   🔷 «A seconda dei periodi lui sceglie o io gli chiedo di creare una pagina.
   Esempio con tutta la dieta, oppure con la palestra. Oppure sono in viaggio
   in Canada e vuole farmi tutto l'itinerario e mettermi una pagina facile da
   raggiungere.»

   Quello che quelle tre cose hanno in comune non è il formato: è che sono
   documenti legati a un PERIODO della tua vita, che vuoi ritrovare senza
   scorrere sei settimane di chat.

   ════════════════════════════════════════════════════════════════════════════
   ⚠️ SONO IN MARKDOWN E NON IN HTML, ED È UNA DECISIONE, NON UNA SEMPLIFICAZIONE.

   Le altre AI restituiscono HTML perché servono chiunque per qualunque cosa.
   Qui il caso è più stretto — documenti sulla tua vita, dentro un'app che ha
   già un suo aspetto — e il markdown vince su tre fronti:

     • si disegna con i token di VINZ.MON, quindi sembra parte dell'app invece
       che una pagina web incollata dentro
     • funziona senza rete, perché è testo
     • non può eseguire niente (vedi `markdown.ts`)

   Il PDF non si genera: si stampa la pagina. Safari lo fa già.
   ════════════════════════════════════════════════════════════════════════════

   🔒 UNA PAGINA NON È UN RICORDO. I ricordi li tiene la memoria e alimentano
   la voce; le pagine sono documenti che leggi tu. Tenerle separate è quello
   che impedisce a una lista della spesa di diventare una cosa che il .mon
   crede importante di te.
   ========================================================================= */

import { firstHeading, MAX_MARKDOWN_CHARS } from './markdown';

export interface Page {
  /** Compare nell'indirizzo: `#/p/canada`. Minuscole, numeri e trattini. */
  slug: string;
  title: string;
  markdown: string;
  /** Giorno di gioco in cui è nata e in cui è stata toccata l'ultima volta. */
  createdDay: number;
  updatedDay: number;
  /** In cima all'elenco. Il .mon può proporlo, decidi tu. */
  pinned: boolean;
  /** Quale forma l'ha scritta. Serve a ricordarsi chi parlava allora. */
  byMon: string | null;
}

export const MAX_PAGES = 24;
export const MAX_TITLE = 60;
export { MAX_MARKDOWN_CHARS };

/* --- Nome nell'indirizzo ---------------------------------------------------- */

const SLUG_OK = /^[a-z0-9][a-z0-9-]{1,31}$/;

/**
 * Da un titolo qualunque a un nome che sta in un indirizzo.
 *
 * Gli accenti si traslitterano invece di sparire: «Allenamento perché sì»
 * deve diventare `allenamento-perche-si`, non `allenamento-perch-s`.
 */
export function slugify(input: string): string {
  const base = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '');

  return base.length >= 2 ? base : `pagina-${Date.now().toString(36).slice(-4)}`;
}

/** Un nome libero nella raccolta, senza mai sovrascrivere per sbaglio. */
export function uniqueSlug(wanted: string, taken: readonly string[]): string {
  const base = slugify(wanted);
  if (!taken.includes(base)) return base;

  for (let n = 2; n < 100; n++) {
    const candidate = `${base}-${n}`.slice(0, 32);
    if (!taken.includes(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36).slice(-4)}`.slice(0, 32);
}

/* --- Controlli --------------------------------------------------------------- */

/**
 * Cosa c'è che non va in una pagina, in italiano.
 *
 * ⚠️ Serve perché queste pagine le scrive un MODELLO. Un titolo di
 * quattrocento caratteri o un markdown da mezzo megabyte non sono un attacco,
 * sono una giornata storta del fornitore — e senza controllo finirebbero nel
 * salvataggio, che ha un tetto suo e comincerebbe a fallire in silenzio.
 */
export function pageProblems(p: Partial<Page>): string[] {
  const out: string[] = [];

  const slug = (p.slug ?? '').trim();
  if (!SLUG_OK.test(slug)) {
    out.push('Il nome nell’indirizzo può avere solo minuscole, numeri e trattini.');
  }

  const title = (p.title ?? '').trim();
  if (title.length === 0) out.push('Manca il titolo.');
  if (title.length > MAX_TITLE) out.push(`Il titolo supera i ${MAX_TITLE} caratteri.`);

  const md = p.markdown ?? '';
  if (md.trim().length === 0) out.push('La pagina è vuota.');
  if (md.length > MAX_MARKDOWN_CHARS) {
    out.push(`La pagina supera i ${MAX_MARKDOWN_CHARS} caratteri.`);
  }

  return out;
}

/* --- Costruzione ------------------------------------------------------------- */

export interface NewPage {
  title?: string;
  markdown: string;
  slug?: string;
  pinned?: boolean;
}

export function makePage(
  input: NewPage,
  ctx: { day: number; monName: string | null; taken: readonly string[] },
): Page {
  // Se il titolo manca, lo si prende dal primo titolo del documento invece di
  // inventarne uno: quello che il modello ha scritto è già la sua risposta.
  const title = (input.title ?? firstHeading(input.markdown) ?? 'Senza titolo')
    .trim()
    .slice(0, MAX_TITLE);

  return {
    slug: uniqueSlug(input.slug ?? title, ctx.taken),
    title,
    markdown: input.markdown.slice(0, MAX_MARKDOWN_CHARS),
    createdDay: ctx.day,
    updatedDay: ctx.day,
    pinned: input.pinned ?? false,
    byMon: ctx.monName,
  };
}

/* --- Modifica ---------------------------------------------------------------- */

/**
 * Sostituisce una sezione di una pagina, riconoscendola dal suo titolo.
 *
 * 🔒 Esiste perché il modo ovvio — «riscrivi tutta la pagina» — è quello che
 * fa perdere le cose: chiedi di aggiungere la colazione e ti torna un
 * documento in cui la cena, scritta tre settimane fa, è stata riassunta.
 * Sostituire una sezione sola lascia intatto tutto il resto per costruzione.
 *
 * Se la sezione non c'è, si aggiunge in fondo. Non è un errore: «aggiungi X»
 * e «cambia X» sono la stessa richiesta quando X ancora non esiste.
 */
export function replaceSection(markdown: string, heading: string, body: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const wanted = heading.trim().toLowerCase();

  let start = -1;
  let level = 0;

  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.*)$/.exec(lines[i]!.trim());
    if (m && m[2]!.trim().toLowerCase() === wanted) {
      start = i;
      level = m[1]!.length;
      break;
    }
  }

  if (start === -1) {
    const sep = markdown.trim().length > 0 ? '\n\n' : '';
    return `${markdown.trim()}${sep}## ${heading.trim()}\n\n${body.trim()}\n`;
  }

  // La sezione finisce al primo titolo di pari livello o più alto.
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = /^(#{1,6})\s+/.exec(lines[i]!.trim());
    if (m && m[1]!.length <= level) {
      end = i;
      break;
    }
  }

  const head = lines[start]!;
  return [...lines.slice(0, start), head, '', body.trim(), '', ...lines.slice(end)]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

/* --- Elenco ------------------------------------------------------------------ */

/** In cima le appuntate, poi le più fresche. Una pagina vecchia scende da sé. */
export function sortPages(pages: readonly Page[]): Page[] {
  return [...pages].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedDay - a.updatedDay;
  });
}

/** Quello che il .mon vede quando chiede quali pagine esistono. */
export function pagesDigest(pages: readonly Page[]): string {
  if (pages.length === 0) return 'Non c’è ancora nessuna pagina.';
  return sortPages(pages)
    .map(
      (p) =>
        `- ${p.slug} — «${p.title}»${p.pinned ? ' (in cima)' : ''}, aggiornata il giorno ${p.updatedDay}`,
    )
    .join('\n');
}
