import { getStore } from '@netlify/blobs';
import { authorize } from './_shared/auth';
import { generateImage, IMAGE_SIZES, type ImageSize } from './_shared/providers';
import { resolveRoute } from './_shared/routing';
import { checkCap, recordSpend } from './_shared/spend';

type DuelItem = { seed: number; prompt: string; size: ImageSize };
type DuelJob = {
  id: string;
  status: 'running' | 'ready' | 'error';
  done: number;
  total: number;
  label: string;
  error: string | null;
  assets: number[];
  updatedAt: string;
};

const store = () => getStore({ name: 'vinzlab-duels', consistency: 'strong' });
const jobKey = (id: string) => `job:${id}`;
const assetKey = (id: string, seed: number) => `asset:${id}:${seed}`;

function bytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

async function save(job: DuelJob): Promise<void> {
  job.updatedAt = new Date().toISOString();
  await store().setJSON(jobKey(job.id), job);
}

async function generateWithRetry(model: string, item: DuelItem) {
  let result = await generateImage(model, item.prompt, item.size, null, 'transparent');
  for (let retry = 1; !result.ok && retry <= 3; retry += 1) {
    if (/401|API_KEY mancante|tetto mensile/i.test(result.error ?? '')) break;
    await new Promise((resolve) => setTimeout(resolve, retry * 1000));
    result = await generateImage(model, item.prompt, item.size, null, 'transparent');
  }
  return result;
}

export default async function labDuelBackground(request: Request): Promise<void> {
  if (!authorize(request).ok) return;

  let body: { jobId?: string; imageModel?: string | null; items?: DuelItem[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return;
  }

  const id = body.jobId?.trim() ?? '';
  const items = body.items ?? [];
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(id) || items.length < 1 || items.length > 24) return;
  if (items.some((item) => !Number.isInteger(item.seed) || !item.prompt || item.prompt.length > 100_000 || !IMAGE_SIZES.includes(item.size))) return;

  const route = resolveRoute('image', body.imageModel);
  const job: DuelJob = {
    id,
    status: 'running',
    done: 0,
    total: items.length,
    label: `DISEGNO 0/${items.length}`,
    error: null,
    assets: [],
    updatedAt: new Date().toISOString(),
  };
  await save(job);

  for (const item of items) {
    const existing = await store().getMetadata(assetKey(id, item.seed));
    if (existing) {
      job.assets.push(item.seed);
      job.done += 1;
      continue;
    }

    const cap = await checkCap();
    if (cap.blocked) {
      job.status = 'error';
      job.error = 'Tetto mensile raggiunto';
      await save(job);
      return;
    }

    job.label = `DISEGNO ${job.done + 1}/${job.total}`;
    await save(job);
    const result = await generateWithRetry(route.model, item);
    if (!result.ok || !result.data) {
      job.status = 'error';
      job.error = result.error?.slice(0, 400) ?? 'Generazione immagine non riuscita';
      await save(job);
      return;
    }

    const imageBytes = bytes(result.data);
    const imageBuffer = imageBytes.buffer.slice(
      imageBytes.byteOffset,
      imageBytes.byteOffset + imageBytes.byteLength,
    ) as ArrayBuffer;
    await store().set(assetKey(id, item.seed), imageBuffer, { metadata: { contentType: 'image/png' } });
    await recordSpend('image', route.model, result.usage);
    job.assets.push(item.seed);
    job.done += 1;
    await save(job);
  }

  job.status = 'ready';
  job.label = `${job.total} CREATURE PRONTE`;
  await save(job);
}

export const config = { path: '/api/lab-duel-background' };
