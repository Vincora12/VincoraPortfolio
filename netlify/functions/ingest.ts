/* ============================================================================
   LA PORTA DELLE SHORTCUT (MASTER SPEC v1.13 §21)

   🔷 «Vorrei in futuro usare anche le Shortcut di iPhone.»

   È la stessa cosa del collegare i dati veri, e vale la pena vederlo adesso
   invece che scoprirlo fra sei mesi:

     App Salute → Shortcut (automazione serale) → questa porta → il .mon

   Una Shortcut sa leggere l'app Salute e sa fare una richiesta HTTP. Con
   questa funzione in piedi, un'automazione che gira alle 23 gli manda passi,
   allenamento e sonno **senza che tu apra niente**. E lo stesso vale per un
   pulsante sulla schermata Home per dettargli la cena, o per un'automazione
   che parte quando esci dalla palestra.

   ⚠️ COSTA QUASI NIENTE FARLO ADESSO E IL DOPPIO FARLO DOPO. Il backend
   nasceva comunque; questa è una porta in più su una casa che si stava già
   costruendo. Farla dopo significherebbe rimettere le mani su
   autenticazione, salvataggio e formato dei dati quando saranno già in uso.

   ════════════════════════════════════════════════════════════════════════════
   🔒 QUELLO CHE QUESTA PORTA NON PUÒ FARE, ED È LA REGOLA DI §5.

   Può riempire cibo e allenamento, che sono cose misurabili.
   NON può riempire l'UMORE. Mai.

   «The system should not silently fabricate subjective information such as
   Mood.» Nessun sensore sa come stai, e un'app che lo deduce dai passi ti sta
   raccontando una cosa su di te che non ha modo di sapere. L'umore lo dichiari
   tu, scrivendo — o resta sconosciuto, che è un valore legittimo.

   Se una Shortcut manda un campo `mood`, viene ignorato in silenzio. Non è
   una dimenticanza: è il punto.
   ════════════════════════════════════════════════════════════════════════════
   ========================================================================= */

import { getStore } from '@netlify/blobs';
import { authorize, denied, json } from './_shared/auth';

/** Quello che una Shortcut può dire. Volutamente poco. */
interface Incoming {
  /** Data del giorno a cui si riferisce, `YYYY-MM-DD`. Assente = oggi. */
  date?: string;
  /** Passi del giorno. */
  steps?: number;
  /** Minuti di allenamento rilevati. */
  workoutMinutes?: number;
  /** Ore di sonno. */
  sleepHours?: number;
  /** Testo libero: «stasera pesce e verdure». Entra come un messaggio. */
  note?: string;
}

/** Un giorno di dati in arrivo, come l'app lo legge. */
export interface IngestedDay {
  date: string;
  steps?: number;
  workoutMinutes?: number;
  sleepHours?: number;
  notes: string[];
  receivedAt: string;
}

const store = () => getStore('vinzmon-ingest');

const today = () => new Date().toISOString().slice(0, 10);
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Un numero plausibile, o niente. Un sensore che impazzisce non deve entrare. */
function sane(value: unknown, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (value < 0 || value > max) return undefined;
  return Math.round(value);
}

export default async function handler(request: Request): Promise<Response> {
  const auth = authorize(request);
  if (!auth.ok) {
    console.warn('[ingest] richiesta rifiutata:', auth.reason);
    return denied();
  }

  /* GET serve all'app: si prende quello che le Shortcut hanno lasciato da
     quando ha guardato l'ultima volta. È il verso giusto — il server non
     spinge niente verso il telefono, il telefono chiede quando è pronto. */
  if (request.method === 'GET') {
    const list = await store().list();
    const days: IngestedDay[] = [];
    for (const blob of list.blobs.slice(-14)) {
      const day = (await store().get(blob.key, { type: 'json' })) as IngestedDay | null;
      if (day) days.push(day);
    }
    return json({ days: days.sort((a, b) => a.date.localeCompare(b.date)) });
  }

  if (request.method !== 'POST') return json({ error: 'solo GET e POST' }, 405);

  let body: Incoming;
  try {
    body = (await request.json()) as Incoming;
  } catch {
    return json({ error: 'body non leggibile' }, 400);
  }

  const date = body.date && isDate(body.date) ? body.date : today();
  const existing = ((await store().get(date, { type: 'json' })) as IngestedDay | null) ?? {
    date,
    notes: [],
    receivedAt: '',
  };

  const steps = sane(body.steps, 200_000);
  const workoutMinutes = sane(body.workoutMinutes, 1_000);
  const sleepHours = sane(body.sleepHours, 24);

  /* I dati si SOMMANO al giorno, non lo sostituiscono: una Shortcut può
     scrivere più volte nella stessa giornata — una a mezzogiorno, una la sera
     — e la seconda non deve cancellare la prima. Per i numeri vince l'ultimo
     valore noto (i sensori danno totali, non incrementi); le note si
     accumulano, perché sono cose diverse che hai detto. */
  const day: IngestedDay = {
    date,
    steps: steps ?? existing.steps,
    workoutMinutes: workoutMinutes ?? existing.workoutMinutes,
    sleepHours: sleepHours ?? existing.sleepHours,
    notes: [...existing.notes],
    receivedAt: new Date().toISOString(),
  };

  const note = (body.note ?? '').trim().slice(0, 500);
  if (note.length > 0 && !day.notes.includes(note)) day.notes.push(note);
  day.notes = day.notes.slice(-10);

  await store().setJSON(date, day);

  /* La risposta è breve di proposito: una Shortcut la può mostrare come
     notifica, e «ricevuto, 8432 passi» è una notifica utile. Un JSON grosso
     su una notifica di iPhone è rumore. */
  return json({ ok: true, date, summary: summarize(day) });
}

function summarize(day: IngestedDay): string {
  const bits: string[] = [];
  if (day.steps !== undefined) bits.push(`${day.steps} passi`);
  if (day.workoutMinutes !== undefined) bits.push(`${day.workoutMinutes} min di allenamento`);
  if (day.sleepHours !== undefined) bits.push(`${day.sleepHours} h di sonno`);
  if (day.notes.length > 0) bits.push(`${day.notes.length} nota/e`);
  return bits.length > 0 ? bits.join(' · ') : 'niente di nuovo';
}

export const config = { path: '/api/ingest' };
