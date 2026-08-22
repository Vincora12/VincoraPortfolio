import { getStore } from '@netlify/blobs';
import { authorize } from './_shared/auth';
import { generateImage, IMAGE_SIZES, type ImageSize } from './_shared/providers';
import { resolveRoute } from './_shared/routing';
import { checkCap, recordSpend } from './_shared/spend';
import webpush from 'web-push';

type AssetItem = {
  type: string;
  assetId: string;
  prompt: string;
  size: ImageSize;
};

type Job = {
  id: string;
  candidateName: string;
  status: 'running' | 'ready' | 'error';
  done: number;
  total: number;
  label: string;
  error: string | null;
  assets: { type: string; assetId: string }[];
  updatedAt: string;
};

const ALLOWED_ASSETS = new Set(['master_01', 'toy_01', 'doodle_01', 'reactions_01']);
const store = () => getStore('vinzmon-evolution');
const jobKey = (id: string) => `job:${id}`;
const assetKey = (id: string, assetId: string) => `asset:${id}:${assetId}`;

function bytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

async function save(job: Job): Promise<void> {
  job.updatedAt = new Date().toISOString();
  await store().setJSON(jobKey(job.id), job);
}

async function sendReadyPush(candidateName: string): Promise<void> {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return;
  const subscription = await getStore('vinzmon-push').get('subscription', { type: 'json' });
  if (!subscription) return;
  webpush.setVapidDetails('mailto:vincenzotortora9517@gmail.com', publicKey, privateKey);
  try {
    await webpush.sendNotification(
      subscription as webpush.PushSubscription,
      JSON.stringify({ title: 'VINZ.MON pronto', body: `${candidateName.replace(/\.mon$/i, '')} ha completato la trasformazione.` }),
    );
  } catch (error) {
    console.warn('[evolution] notifica push non inviata:', error);
  }
}

export default async function evolutionBackground(request: Request): Promise<void> {
  if (!authorize(request).ok) return;

  let body: { jobId?: string; candidateName?: string; imageModel?: string | null; items?: AssetItem[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return;
  }

  const id = body.jobId?.trim() ?? '';
  const candidateName = body.candidateName?.trim() ?? '';
  const items = body.items ?? [];
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(id) || !candidateName || items.length < 1 || items.length > 4) return;
  if (items.some((item) => !ALLOWED_ASSETS.has(item.assetId) || !IMAGE_SIZES.includes(item.size) || !item.prompt || item.prompt.length > 200_000)) return;

  const route = resolveRoute('image', body.imageModel);
  const job: Job = {
    id,
    candidateName,
    status: 'running',
    done: 0,
    total: items.length,
    label: 'PREPARAZIONE CHARACTER MASTER',
    error: null,
    assets: [],
    updatedAt: new Date().toISOString(),
  };
  await save(job);

  let master: string | null = null;
  for (const item of items) {
    const cap = await checkCap();
    if (cap.blocked) {
      job.status = 'error';
      job.error = 'Tetto mensile raggiunto';
      await save(job);
      return;
    }

    job.label = item.type === 'character_master' ? 'CHARACTER MASTER CEL' : item.type === 'character_toy' ? 'CHARACTER MASTER TOY' : item.type === 'bio_doodle' ? 'BIO DOODLE' : 'STICKER / REACTION';
    await save(job);

    const result = await generateImage(route.model, item.prompt, item.size, item.type === 'character_master' ? null : master);
    if (!result.ok || !result.data) {
      job.status = 'error';
      job.error = result.error?.slice(0, 400) ?? 'Generazione immagine non riuscita';
      await save(job);
      return;
    }

    if (item.type === 'character_master') master = result.data;
    const imageBytes = bytes(result.data);
    const imageBuffer = imageBytes.buffer.slice(
      imageBytes.byteOffset,
      imageBytes.byteOffset + imageBytes.byteLength,
    ) as ArrayBuffer;
    await store().set(assetKey(id, item.assetId), imageBuffer);
    await recordSpend('image', route.model, result.usage);
    job.assets.push({ type: item.type, assetId: item.assetId });
    job.done += 1;
    await save(job);
  }

  job.status = 'ready';
  job.label = 'NUOVO MON PRONTO';
  await save(job);
  await sendReadyPush(candidateName);
}

export const config = { path: '/api/evolution-background' };
