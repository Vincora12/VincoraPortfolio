import type { CulturalDiscovery } from '../engine/culturalDiscovery';
import type { MonRecord } from '../engine/types';

/** Retry the same receipt, never create another research request for this transition. */
export async function researchCulturalDiscovery(token: string, record: MonRecord, previousTitle?: string, model?: string | null): Promise<CulturalDiscovery> {
  const payload = { transition: `${record.data.mindline_node}:${record.data.name}`, culturalIds: record.data.cultural_dna ?? [], previousTitle, model };
  const unavailable = (reason: string): CulturalDiscovery => ({ status: 'unavailable', reason, researchedAt: new Date().toISOString(), culturalIds: payload.culturalIds, sources: [] });
  try {
    for (let attempt = 0; attempt < 30; attempt++) {
      const response = await fetch('/api/cultural-discovery', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(90_000) });
      if (!response.ok) return unavailable(`research-${response.status}`);
      const result = await response.json();
      if (result.status === 'ready' || result.status === 'unavailable') return result as CulturalDiscovery;
      if (result.status !== 'pending') return unavailable('invalid-response');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    return unavailable('research-pending');
  } catch { return unavailable('research-unavailable'); }
}
