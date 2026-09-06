import { getStore } from './_shared/localStore';
import { authorize } from './_shared/auth';
import { generateImage, IMAGE_SIZES, IMAGE_QUALITIES, type ImageSize, type ImageQuality } from './_shared/providers';
import { resolveRoute } from './_shared/routing';
import { checkCap, recordSpend } from './_shared/spend';
import { sendPushNotification } from './_shared/pushDelivery';

type AssetItem = {
  type: string;
  assetId: string;
  prompt: string;
  size: ImageSize;
  /** 🔷 Dichiarata dal tipo di asset: sticker e doodle si vedono piccoli. */
  quality?: string;
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
const TOY_PIPELINE_VERSION = '2';
const store = () => getStore('vinzmon-evolution');
const permanentStore = () => getStore({ name: 'vinzmon-assets', consistency: 'strong' });
const jobKey = (id: string) => `job:${id}`;
const assetKey = (id: string, assetId: string) => `asset:${id}:${assetId}`;
const permanentAssetKey = (name: string, assetId: string) => `asset:${encodeURIComponent(name)}:${encodeURIComponent(assetId)}`;

function bytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function base64(buffer: ArrayBuffer): string {
  const input = new Uint8Array(buffer);
  let output = '';
  for (let offset = 0; offset < input.length; offset += 0x8000) {
    output += String.fromCharCode(...input.subarray(offset, offset + 0x8000));
  }
  return btoa(output);
}

function saferPrompt(prompt: string): string {
  return [
    'Create a fully clothed, family-friendly collectible character asset. No nudity, sexual content, suggestive presentation, violence, or graphic content. Preserve the supplied character design and pose without adding mature themes.',
    prompt
      .replace(/ALLURING/gi, 'POISED')
      .replace(/Elegant magnetic presence, self-aware but not overtly sexual\./gi, 'Confident, composed, family-friendly presence.')
      .replace(/^.*(?:sexual|seductive|erotic).*$/gim, ''),
  ].join('\n\n');
}

function effectivePrompt(item: AssetItem): string {
  if (item.type !== 'character_toy') return item.prompt;
  return [
    'NON-NEGOTIABLE MEDIUM CHANGE: the output must be a studio photograph of a real, manufactured three-dimensional collectible toy. Preserve the CHARACTER DESIGN, but DO NOT preserve the CEL illustration medium.',
    'The result must show obvious sculpted depth, physical thickness, molded volumes, painted PVC/vinyl surfaces, realistic material response and a grounding shadow. No inked outlines, no cel shading, no anime illustration rendering, no flat drawing, no concept-art background. Use a pure optical-white seamless studio background.',
    'If the result could be mistaken for the attached 2D illustration, it has failed. Convert the same character into a visibly physical object.',
    item.prompt,
  ].join('\n\n');
}

async function generateWithRetry(routeModel: string, item: AssetItem, reference: string | null, quality?: ImageQuality) {
  const prompt = effectivePrompt(item);
  const background = item.type === 'character_toy' ? 'opaque' : 'transparent';
  let result = await generateImage(routeModel, prompt, item.size, reference, background, quality);
  for (let retry = 1; !result.ok && retry <= 3; retry += 1) {
    /* Credenziali e tetto di spesa non cambiano ripetendo la stessa chiamata. */
    if (/401|API_KEY mancante|tetto mensile/i.test(result.error ?? '')) break;
    const retryPrompt = /moderation|safety|sexual/i.test(result.error ?? '')
      ? saferPrompt(prompt)
      : prompt;
    await new Promise((resolve) => setTimeout(resolve, retry * 1000));
    result = await generateImage(routeModel, retryPrompt, item.size, reference, background, quality);
  }
  return result;
}

async function save(job: Job): Promise<void> {
  job.updatedAt = new Date().toISOString();
  await store().setJSON(jobKey(job.id), job);
}

async function sendReadyPush(candidateName: string): Promise<void> {
  try {
    await sendPushNotification({ title: 'VINZ.MON pronto', body: `${candidateName.replace(/\.mon$/i, '')} ha completato la trasformazione.`, tag: 'vinzmon-evolution-ready' });
  } catch (error) {
    console.warn('[evolution] notifica push non inviata:', error);
  }
}

export default async function evolutionBackground(request: Request): Promise<void> {
  if (!authorize(request).ok) return;

  let body: { jobId?: string; candidateName?: string; imageModel?: string | null; quality?: string; items?: AssetItem[] };
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
  /* 🔒 Validata contro il catalogo, come la misura: arriva dal browser. Un
     valore inventato torna a `undefined`, cioè al predefinito del fornitore —
     mai un errore per un parametro di comodità. */
  const quality = IMAGE_QUALITIES.includes(body.quality as ImageQuality)
    ? (body.quality as ImageQuality)
    : undefined;
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

  /* Un retry riparte dal primo asset mancante. Gli asset già conclusi sono
     permanenti e non vanno né rigenerati né ripagati. */
  let master: string | null = null;
  const savedMaster = await permanentStore().get(
    permanentAssetKey(candidateName, 'master_01'),
    { type: 'arrayBuffer' },
  );
  if (savedMaster) master = base64(savedMaster);
  for (const item of items) {
    const key = permanentAssetKey(candidateName, item.assetId);
    const metadata = await permanentStore().getMetadata(key);
    /* I vecchi toy potevano essere semplici CEL salvati nello slot giusto.
       Non li consideriamo conclusi: vengono rigenerati senza rifare il MON. */
    if (item.type === 'character_toy' && metadata?.metadata?.toyPipelineVersion !== TOY_PIPELINE_VERSION) continue;
    const existing = await permanentStore().get(key, { type: 'arrayBuffer' });
    if (!existing) continue;
    await store().set(assetKey(id, item.assetId), existing);
    job.assets.push({ type: item.type, assetId: item.assetId });
    job.done += 1;
    if (item.type === 'character_master') master = base64(existing);
  }
  await save(job);

  for (const item of items) {
    if (job.assets.some((asset) => asset.assetId === item.assetId)) continue;
    const cap = await checkCap();
    if (cap.blocked) {
      job.status = 'error';
      job.error = 'Tetto mensile raggiunto';
      await save(job);
      return;
    }

    job.label = item.type === 'character_master' ? 'CHARACTER MASTER CEL' : item.type === 'character_toy' ? 'CHARACTER MASTER TOY' : item.type === 'bio_doodle' ? 'BIO DOODLE' : 'STICKER / REACTION';
    await save(job);

    /* 🔒 PRECEDENZA: la bozza di DEV vince su quella dichiarata dall'asset.
       Durante le prove si abbassa TUTTO, compresi master e toy che in
       produzione restano pieni. Fuori dalle prove decide l'asset, che è
       l'unico che sa a che dimensione finisce sotto gli occhi. */
    const itemQuality = IMAGE_QUALITIES.includes(item.quality as ImageQuality)
      ? (item.quality as ImageQuality)
      : undefined;
    const result = await generateWithRetry(
      route.model,
      item,
      item.type === 'character_master' ? null : master,
      quality ?? itemQuality,
    );
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
    await permanentStore().set(
      permanentAssetKey(candidateName, item.assetId),
      imageBuffer,
      { metadata: {
        contentType: 'image/png',
        ...(item.type === 'character_toy' ? { toyPipelineVersion: TOY_PIPELINE_VERSION } : {}),
      } },
    );
    await recordSpend('image', route.model, result.usage, { action: 'image_generation', subsystem: 'evolution' });
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
