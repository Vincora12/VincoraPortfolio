/* ============================================================================
   LE PAGINE E I PROMEMORIA NELLO STATO (§21.2, §21.3)

   Sta in un file suo e non dentro `store.ts` per una ragione precisa: queste
   sono le PRIME cose che il .mon scrive da solo. Tutto il resto dello stato lo
   scrive l'app in risposta a un tuo gesto — chiudi un giorno, mandi un
   messaggio, confermi un'evoluzione. Qui no: qui decide lui.

   🔒 E siccome decide lui, ogni scrittura passa da un controllo che può dire
   di no. Una pagina senza titolo, un markdown da mezzo megabyte o la
   venticinquesima pagina non entrano nello stato: tornano indietro come
   errore, il modello lo legge e si corregge. È la differenza fra «il .mon ha
   sbagliato e me l'ha detto» e «il salvataggio ha smesso di funzionare».
   ========================================================================= */

import {
  MAX_PAGES,
  makePage,
  pageProblems,
  replaceSection,
  type NewPage,
  type Page,
} from '../engine/pages';

/* --- Promemoria -------------------------------------------------------------
   🔷 «Ricordami di prendere le misure ogni lunedì.»

   ⚠️ NON è un secondo canale di notifiche. Il .mon ha già un modo di parlare
   per primo (§13.10), con quattro regole che gli impediscono di diventare
   assillante. Un promemoria si infila LÌ DENTRO, come una cosa in più che può
   dire quel giorno — e resta soggetto alla regola più importante di tutte:
   una cosa al giorno, mai un rimprovero.
   -------------------------------------------------------------------------- */

export interface Reminder {
  id: string;
  text: string;
  /** Giorno di gioco in cui va detto. */
  dueDay: number;
  /** Se si ripete, ogni quanti giorni. `null` = una volta sola. */
  everyDays: number | null;
  /** Giorno in cui è stato detto l'ultima volta. */
  saidOnDay: number | null;
  createdDay: number;
}

export const MAX_REMINDERS = 12;

/** Il promemoria da dire oggi, se ce n'è uno. Il più vecchio scaduto vince. */
export function dueReminder(reminders: readonly Reminder[], day: number): Reminder | null {
  const due = reminders
    .filter((r) => r.dueDay <= day && r.saidOnDay !== day)
    .sort((a, b) => a.dueDay - b.dueDay);
  return due[0] ?? null;
}

/**
 * Dopo averlo detto: quello che si ripete torna in coda, l'altro sparisce.
 *
 * 🔒 Un promemoria che si ripete NON si accumula quando l'app resta chiusa: la
 * prossima scadenza si calcola da OGGI, non dalla precedente. Altrimenti dopo
 * due settimane di silenzio ti troveresti quattordici promemoria in fila, che
 * è il modo più veloce di far disinstallare un'app.
 */
export function afterSaying(reminders: readonly Reminder[], id: string, day: number): Reminder[] {
  return reminders.flatMap((r) => {
    if (r.id !== id) return [r];
    if (r.everyDays === null) return [];
    return [{ ...r, dueDay: day + r.everyDays, saidOnDay: day }];
  });
}

/* --- Scritture, con i loro no ------------------------------------------------ */

export interface WriteOutcome {
  ok: boolean;
  slug?: string;
  error?: string;
}

export function addPage(
  pages: readonly Page[],
  input: NewPage,
  ctx: { day: number; monName: string | null },
): { pages: Page[]; outcome: WriteOutcome } {
  if (pages.length >= MAX_PAGES) {
    return {
      pages: [...pages],
      outcome: {
        ok: false,
        error: `Ci sono già ${MAX_PAGES} pagine, che è il massimo. Aggiornane una che c’è invece di farne un’altra.`,
      },
    };
  }

  const page = makePage(input, { day: ctx.day, monName: ctx.monName, taken: pages.map((p) => p.slug) });
  const problems = pageProblems(page);
  if (problems.length > 0) {
    return { pages: [...pages], outcome: { ok: false, error: problems.join(' ') } };
  }

  return { pages: [...pages, page], outcome: { ok: true, slug: page.slug } };
}

export function editPage(
  pages: readonly Page[],
  slug: string,
  heading: string,
  body: string,
  day: number,
): { pages: Page[]; outcome: WriteOutcome } {
  const idx = pages.findIndex(
    (p) => p.slug === slug || p.title.toLowerCase() === slug.toLowerCase(),
  );
  if (idx === -1) {
    return { pages: [...pages], outcome: { ok: false, error: `Non c’è nessuna pagina «${slug}».` } };
  }
  if (heading.trim().length === 0) {
    return { pages: [...pages], outcome: { ok: false, error: 'Manca il titolo della sezione.' } };
  }

  const current = pages[idx]!;
  const next: Page = {
    ...current,
    markdown: replaceSection(current.markdown, heading, body),
    updatedDay: day,
  };

  const problems = pageProblems(next);
  if (problems.length > 0) {
    return { pages: [...pages], outcome: { ok: false, error: problems.join(' ') } };
  }

  const out = [...pages];
  out[idx] = next;
  return { pages: out, outcome: { ok: true, slug: next.slug } };
}

export function addReminder(
  reminders: readonly Reminder[],
  text: string,
  inDays: number,
  everyDays: number | null,
  day: number,
): { reminders: Reminder[]; outcome: WriteOutcome } {
  if (reminders.length >= MAX_REMINDERS) {
    return {
      reminders: [...reminders],
      outcome: { ok: false, error: `Ci sono già ${MAX_REMINDERS} promemoria, che è il massimo.` },
    };
  }

  const clean = text.trim().slice(0, 200);
  if (clean.length === 0) {
    return { reminders: [...reminders], outcome: { ok: false, error: 'Il promemoria è vuoto.' } };
  }

  /* Un «ogni giorno» sarebbe una notifica quotidiana, cioè la cosa che §13.10
     vieta con quattro regole. Il minimo è due giorni. */
  const every = everyDays === null ? null : Math.max(2, Math.min(365, everyDays));

  return {
    reminders: [
      ...reminders,
      {
        id: `rem_${day}_${reminders.length}_${Date.now().toString(36).slice(-4)}`,
        text: clean,
        dueDay: day + Math.max(0, Math.min(365, inDays)),
        everyDays: every,
        saidOnDay: null,
        createdDay: day,
      },
    ],
    outcome: { ok: true },
  };
}
