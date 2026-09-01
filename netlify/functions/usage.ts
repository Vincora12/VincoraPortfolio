import { authorize, denied, json } from './_shared/auth';
import { getStore } from '@netlify/blobs';
import {
  CAP_MAX_USD,
  CAP_MIN_USD,
  currentMonth,
  readMonthlyCap,
  validMonthlyCap,
  writeMonthlyCap,
  type Ledger,
  type UsageEvent,
} from './_shared/spend';

const store = () => getStore('vinzmon-spend');

async function allEvents(): Promise<UsageEvent[]> {
  const { blobs } = await store().list();
  const events: UsageEvent[] = [];
  for (const blob of blobs) {
    if (!/^\d{4}-\d{2}$/.test(blob.key)) continue;
    const ledger = await store().get(blob.key, { type: 'json' }) as Ledger | null;
    if (ledger?.events) events.push(...ledger.events);
  }
  return events.filter((event) => event && typeof event.timestamp === 'string');
}

function aggregate(events: UsageEvent[], key: (event: UsageEvent) => string) {
  const result: Record<string, { calls: number; costUsd: number; inputTokens: number; outputTokens: number; images: number }> = {};
  for (const event of events) {
    const name = key(event) || 'unknown';
    const item = result[name] ??= { calls: 0, costUsd: 0, inputTokens: 0, outputTokens: 0, images: 0 };
    item.calls += 1;
    item.costUsd += event.estimatedCostUsd;
    item.inputTokens += event.inputTokens;
    item.outputTokens += event.outputTokens;
    item.images += event.images;
  }
  return result;
}

/**
 * La spesa giorno per giorno del mese in corso.
 *
 * Un array lungo quanto i giorni già passati, non quanto il mese: un grafico
 * con mezza tela vuota racconta un calo che non è successo. Le giornate senza
 * chiamate restano a zero, che è un'informazione vera.
 */
function dailySpend(inMonth: UsageEvent[], month: string): { day: number; costUsd: number }[] {
  const today = new Date();
  const isCurrentMonth = currentMonth(today) === month;
  const days = isCurrentMonth
    ? today.getUTCDate()
    : new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const totals = new Array<number>(days).fill(0);
  for (const event of inMonth) {
    const day = Number(event.timestamp.slice(8, 10));
    if (day >= 1 && day <= days) totals[day - 1]! += event.estimatedCostUsd;
  }
  return totals.map((costUsd, index) => ({ day: index + 1, costUsd }));
}

export default async function handler(request: Request): Promise<Response> {
  if (!authorize(request).ok) return denied();

  /* 🔒 Il tetto si CAMBIA da qui, con lo stesso segreto con cui si legge. Non
     è un endpoint nuovo perché non è un'informazione nuova: è la stessa cosa
     che la GET già racconta, scritta invece che letta. */
  if (request.method === 'PUT') {
    let body: { monthlyCapUsd?: unknown };
    try {
      body = (await request.json()) as { monthlyCapUsd?: unknown };
    } catch {
      return json({ error: 'body non leggibile' }, 400);
    }
    const value = typeof body.monthlyCapUsd === 'number' ? body.monthlyCapUsd : Number.NaN;
    if (!validMonthlyCap(value)) {
      return json(
        { error: 'tetto non valido', reason: `serve un numero fra ${CAP_MIN_USD} e ${CAP_MAX_USD}` },
        400,
      );
    }
    /* Arrotondato al centesimo: i soldi hanno due decimali, e un tetto con
       quattordici cifre decimali non è più preciso, è solo illeggibile. */
    const saved = await writeMonthlyCap(Math.round(value * 100) / 100);
    return json({ monthlyCapUsd: saved.usd, capSource: saved.source, updatedAt: saved.updatedAt });
  }

  if (request.method !== 'GET') return json({ error: 'solo GET/PUT' }, 405);
  const events = (await allEvents()).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const now = Date.now();
  const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
  const weekStart = now - 7 * 24 * 60 * 60 * 1000;
  const month = currentMonth();
  const inToday = events.filter((event) => Date.parse(event.timestamp) >= todayStart.getTime());
  const inWeek = events.filter((event) => Date.parse(event.timestamp) >= weekStart);
  const inMonth = events.filter((event) => event.timestamp.startsWith(month));
  const total = (items: UsageEvent[]) => ({
    calls: items.length,
    costUsd: items.reduce((sum, event) => sum + event.estimatedCostUsd, 0),
    inputTokens: items.reduce((sum, event) => sum + event.inputTokens, 0),
    outputTokens: items.reduce((sum, event) => sum + event.outputTokens, 0),
    images: items.reduce((sum, event) => sum + event.images, 0),
  });
  /* ⚠️ LO STESSO TETTO CHE BLOCCA. Non una copia, non una costante: la
     funzione che legge `checkCap()`. Se questa riga tornasse a leggere una
     costante, il LAB tornerebbe a mostrare un numero e il server ad
     applicarne un altro — che è esattamente il guasto da cui si parte. */
  const cap = await readMonthlyCap();
  const spentUsd = total(inMonth).costUsd;
  return json({
    today: total(inToday),
    last7Days: total(inWeek),
    month: total(inMonth),
    spentUsd,
    monthlyCapUsd: cap.usd,
    capSource: cap.source,
    ...(cap.updatedAt ? { capUpdatedAt: cap.updatedAt } : {}),
    capMinUsd: CAP_MIN_USD,
    capMaxUsd: CAP_MAX_USD,
    remainingUsd: Math.max(0, cap.usd - spentUsd),
    /* Un tetto a zero non ha una percentuale: dividere per zero darebbe
       Infinity, e una barra infinita non dice niente. Sfondato è sfondato. */
    percentUsed: cap.usd > 0 ? (spentUsd / cap.usd) * 100 : 100,
    capped: spentUsd >= cap.usd,
    monthKey: month,
    daily: dailySpend(inMonth, month),
    byCapability: aggregate(inMonth, (event) => event.action),
    byModel: aggregate(inMonth, (event) => `${event.provider}/${event.model}`),
    recentEvents: events.slice(0, 100),
  });
}

export const config = { path: '/api/usage' };
