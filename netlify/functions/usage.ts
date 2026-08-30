import { authorize, denied, json } from './_shared/auth';
import { getStore } from '@netlify/blobs';
import { currentMonth, MONTHLY_CAP_USD, type Ledger, type UsageEvent } from './_shared/spend';

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

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'solo GET' }, 405);
  if (!authorize(request).ok) return denied();
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
  return json({
    today: total(inToday),
    last7Days: total(inWeek),
    month: total(inMonth),
    monthlyCapUsd: MONTHLY_CAP_USD,
    remainingUsd: Math.max(0, MONTHLY_CAP_USD - total(inMonth).costUsd),
    byCapability: aggregate(inMonth, (event) => event.action),
    byModel: aggregate(inMonth, (event) => `${event.provider}/${event.model}`),
    recentEvents: events.slice(0, 100),
  });
}

export const config = { path: '/api/usage' };
