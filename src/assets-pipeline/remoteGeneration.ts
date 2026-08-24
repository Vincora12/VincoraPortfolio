import type { AssetType, MonRecord } from '../engine/types';
import { generationOrder, assetTypeDef } from '../engine/assets';
import { promptFor } from './promptFor';
import { importAssetFile } from './assetStore';

export type RemoteEvolutionStatus = {
  id: string;
  status: 'running' | 'ready' | 'error';
  done: number;
  total: number;
  label: string;
  error: string | null;
  assets: { type: AssetType; assetId: string }[];
};

const headers = (token: string) => ({ 'content-type': 'application/json', authorization: `Bearer ${token}` });

export async function queueRemoteGeneration(token: string, jobId: string, record: MonRecord, imageModel?: string | null, onlyTypes?: AssetType[]): Promise<void> {
  const wanted = onlyTypes ? new Set(onlyTypes) : null;
  const items = generationOrder().filter((def) => !wanted || wanted.has(def.type)).map((def) => ({
    type: def.type,
    assetId: def.assetId,
    prompt: promptFor(record, def.type).text,
    size: def.size,
  }));
  const response = await fetch('/api/evolution-background', {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ jobId, candidateName: record.data.name, imageModel, items }),
  });
  if (!response.ok && response.status !== 202) throw new Error(`Avvio server non riuscito (${response.status})`);
}

export async function pollRemoteGeneration(
  token: string,
  jobId: string,
  record: MonRecord,
  onProgress: (job: RemoteEvolutionStatus) => void,
): Promise<{ made: AssetType[]; error: string | null }> {
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    const response = await fetch(`/api/evolution-job?jobId=${encodeURIComponent(jobId)}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (response.status === 404) {
      await new Promise((resolve) => setTimeout(resolve, 1800));
      continue;
    }
    if (!response.ok) return { made: [], error: `Controllo server non riuscito (${response.status})` };
    const job = (await response.json()) as RemoteEvolutionStatus;
    onProgress(job);
    if (job.status === 'error') return { made: [], error: job.error ?? 'Generazione interrotta' };
    if (job.status === 'ready') {
      const made: AssetType[] = [];
      for (const asset of job.assets) {
        const image = await fetch(`/api/evolution-job?jobId=${encodeURIComponent(jobId)}&assetId=${encodeURIComponent(asset.assetId)}`, {
          headers: { authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!image.ok) return { made, error: `Download ${asset.assetId} non riuscito` };
        const blob = await image.blob();
        const def = assetTypeDef(asset.type);
        await importAssetFile(record, new File([blob], `${def.assetId}.png`, { type: 'image/png' }), def.assetId);
        made.push(asset.type);
      }
      return { made, error: null };
    }
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  return { made: [], error: 'Il lavoro server non ha terminato entro venti minuti' };
}

/** Aggiorna soltanto la rappresentazione principale Toy. Il Character Master
 * CEL già approvato resta la reference e nessun nodo/evoluzione viene creato. */
export async function refreshToyAsset(
  token: string,
  record: MonRecord,
  imageModel?: string | null,
): Promise<void> {
  const jobId = crypto.randomUUID();
  await queueRemoteGeneration(token, jobId, record, imageModel, ['character_toy']);
  const result = await pollRemoteGeneration(token, jobId, record, () => undefined);
  if (result.error) throw new Error(result.error);
  if (!result.made.includes('character_toy')) throw new Error('Toy non ricevuto dal server');
}
