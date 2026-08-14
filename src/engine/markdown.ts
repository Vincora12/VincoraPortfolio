/* ============================================================================
   MARKDOWN → BLOCCHI (§21.2)

   ════════════════════════════════════════════════════════════════════════════
   ⚠️ PERCHÉ NON SI TRASFORMA IN HTML, MAI.

   Il modo normale di mostrare markdown è produrre una stringa di HTML e
   piantarla nella pagina. Qui non si può, e non è pignoleria: questa app tiene
   nel browser mesi della tua vita — umore, ricordi, salute, protocollo. Una
   stringa di HTML scritta da un modello e inserita nella stessa pagina può
   leggersi tutto e mandarlo altrove. Basta una risposta manipolata, o un
   giorno storto del fornitore.

   🔒 Quindi qui si PARSA, e basta: entra testo, esce una lista di blocchi
   descritti. Chi disegna sono componenti React, che mettono il testo dentro
   nodi di testo. Non esiste un punto in cui del markup arriva dal modello e
   diventa struttura — non perché lo controlliamo bene, ma perché la strada non
   c'è proprio.
   ════════════════════════════════════════════════════════════════════════════

   Il dialetto è volutamente piccolo: titoli, elenchi, spunte, citazioni,
   tabelle, righe e un po' di enfasi. Serve a una pagina della dieta o a un
   itinerario, non a un sito. Quello che non è previsto resta testo.
   ========================================================================= */

/* --- Testo con enfasi -------------------------------------------------------- */

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'em'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; href: string };

/* --- Blocchi ---------------------------------------------------------------- */

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; content: Inline[] }
  | { kind: 'paragraph'; content: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }
  | { kind: 'checklist'; items: { done: boolean; content: Inline[] }[] }
  | { kind: 'quote'; content: Inline[] }
  | { kind: 'table'; head: Inline[][]; rows: Inline[][][] }
  | { kind: 'code'; text: string }
  | { kind: 'rule' };

/* ----------------------------------------------------------------------------
   INDIRIZZI AMMESSI

   🔒 Solo `http`, `https` e `mailto`. Un link `javascript:` in un documento
   scritto da un modello è il modo più corto per eseguire codice dentro l'app,
   e un link `data:` il modo più corto per aprire una pagina finta che sembra
   la nostra. Quello che non passa resta scritto come testo: si legge, non si
   clicca.
   -------------------------------------------------------------------------- */

const SAFE_SCHEME = /^(https?:|mailto:)/i;

export function isSafeHref(href: string): boolean {
  const trimmed = href.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) return false;
  if (trimmed.startsWith('/') || trimmed.startsWith('#')) return true;
  return SAFE_SCHEME.test(trimmed);
}

/* --- Enfasi ------------------------------------------------------------------
   Un solo passaggio con un'espressione sola: cercare `**` e poi `*` in due
   giri farebbe sì che il secondo giro mangi le stelle già consumate dal primo.
   -------------------------------------------------------------------------- */

const INLINE =
  /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)\s]+)\))/;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let rest = text;

  while (rest.length > 0) {
    const m = INLINE.exec(rest);
    if (!m || m.index === undefined) break;

    if (m.index > 0) out.push({ kind: 'text', text: rest.slice(0, m.index) });

    if (m[2] !== undefined) out.push({ kind: 'strong', text: m[2] });
    else if (m[4] !== undefined) out.push({ kind: 'em', text: m[4] });
    else if (m[6] !== undefined) out.push({ kind: 'code', text: m[6] });
    else if (m[8] !== undefined && m[9] !== undefined) {
      const href = m[9];
      // Un indirizzo non ammesso non sparisce: resta la scritta, senza link.
      if (isSafeHref(href)) out.push({ kind: 'link', text: m[8], href: href.trim() });
      else out.push({ kind: 'text', text: m[8] });
    }

    rest = rest.slice(m.index + m[0].length);
  }

  if (rest.length > 0) out.push({ kind: 'text', text: rest });
  return out.length > 0 ? out : [{ kind: 'text', text }];
}

/* --- Blocchi ---------------------------------------------------------------- */

const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;
const NUMBERED = /^\d+[.)]\s+(.*)$/;
const CHECK = /^[-*]\s+\[([ xX])\]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const RULE = /^(-{3,}|_{3,}|\*{3,})$/;
const TABLE_SEP = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/;

const cells = (line: string): string[] =>
  line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

/** Quanto markdown si accetta di disegnare. Oltre, è un errore di qualcuno. */
export const MAX_MARKDOWN_CHARS = 40_000;

export function parseMarkdown(src: string): Block[] {
  const lines = src.slice(0, MAX_MARKDOWN_CHARS).replace(/\r\n/g, '\n').split('\n');
  const out: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      i++;
      continue;
    }

    if (RULE.test(trimmed)) {
      out.push({ kind: 'rule' });
      i++;
      continue;
    }

    // Blocco di codice: tutto quello che sta dentro resta com'è.
    if (trimmed.startsWith('```')) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith('```')) {
        body.push(lines[i]!);
        i++;
      }
      i++; // la chiusura
      out.push({ kind: 'code', text: body.join('\n') });
      continue;
    }

    const h = HEADING.exec(trimmed);
    if (h) {
      out.push({
        kind: 'heading',
        level: Math.min(3, h[1]!.length) as 1 | 2 | 3,
        content: parseInline(h[2]!),
      });
      i++;
      continue;
    }

    // Tabella: la riga dopo l'intestazione deve essere il separatore, o non
    // è una tabella ma un paragrafo che contiene delle barre verticali.
    if (trimmed.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]!.trim())) {
      const head = cells(trimmed).map(parseInline);
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && lines[i]!.trim().includes('|')) {
        rows.push(cells(lines[i]!.trim()).map(parseInline));
        i++;
      }
      out.push({ kind: 'table', head, rows });
      continue;
    }

    // Spunte prima degli elenchi: `- [ ] cosa` è anche un punto elenco.
    if (CHECK.test(trimmed)) {
      const items: { done: boolean; content: Inline[] }[] = [];
      while (i < lines.length) {
        const c = CHECK.exec(lines[i]!.trim());
        if (!c) break;
        items.push({ done: c[1]!.toLowerCase() === 'x', content: parseInline(c[2]!) });
        i++;
      }
      out.push({ kind: 'checklist', items });
      continue;
    }

    if (BULLET.test(trimmed) || NUMBERED.test(trimmed)) {
      const ordered = NUMBERED.test(trimmed);
      const items: Inline[][] = [];
      while (i < lines.length) {
        const t = lines[i]!.trim();
        const m = ordered ? NUMBERED.exec(t) : BULLET.exec(t);
        if (!m) break;
        items.push(parseInline(m[1]!));
        i++;
      }
      out.push({ kind: 'list', ordered, items });
      continue;
    }

    const q = QUOTE.exec(trimmed);
    if (q) {
      const body: string[] = [q[1]!];
      i++;
      while (i < lines.length) {
        const more = QUOTE.exec(lines[i]!.trim());
        if (!more) break;
        body.push(more[1]!);
        i++;
      }
      out.push({ kind: 'quote', content: parseInline(body.join(' ')) });
      continue;
    }

    // Paragrafo: righe consecutive che non aprono nient'altro.
    const body: string[] = [trimmed];
    i++;
    while (i < lines.length) {
      const t = lines[i]!.trim();
      if (
        t.length === 0 ||
        HEADING.test(t) ||
        BULLET.test(t) ||
        NUMBERED.test(t) ||
        QUOTE.test(t) ||
        RULE.test(t) ||
        t.startsWith('```')
      ) {
        break;
      }
      body.push(t);
      i++;
    }
    out.push({ kind: 'paragraph', content: parseInline(body.join(' ')) });
  }

  return out;
}

/** Il primo titolo del documento, per non chiedere due volte lo stesso nome. */
export function firstHeading(src: string): string | null {
  for (const line of src.split('\n')) {
    const h = HEADING.exec(line.trim());
    if (h) return h[2]!.trim();
  }
  return null;
}
