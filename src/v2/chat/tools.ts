/* ============================================================================
   GLI STRUMENTI VINZ DI V2

   🔒 READ-FIRST. Questa prima versione LEGGE e basta: nessuna scrittura in
   memoria, nessun filesystem, nessun terminale, nessun accesso ai segreti. Ogni
   strumento dichiara uno schema, ha un tetto di tempo e restituisce un risultato
   che si può guardare nel dettaglio attività della chat.

   ⚠️ Non sono simulazioni. `vinz_get_active_mon` legge lo store vero di VINZ —
   lo stesso da cui la Current disegna la scheda del .mon — e `vinz_get_status`
   interroga davvero il Local Core con il token salvato. Se il Core non risponde,
   lo strumento lo dice; non inventa uno stato.
   ========================================================================= */

import { displayName } from '@/engine/types';
import { useApp } from '@/state/store';

export interface ToolSpec {
  name: string;
  description: string;
  parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
}

export interface ToolOutcome {
  ok: boolean;
  result: string;
  error?: string;
}

const TIMEOUT_MS = 8_000;

export const VINZ_TOOLS: ToolSpec[] = [
  {
    name: 'vinz_get_active_mon',
    description:
      'Restituisce il .mon attivo di VINZ.MON: nome, famiglia, archetipo, affinità, ruolo, umore, rarità e giorno di nascita. Da usare quando la domanda riguarda la creatura attiva.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'vinz_get_status',
    description:
      'Restituisce lo stato del sistema VINZ.MON: fase corrente, giorno, presenza del token e raggiungibilità del Local Core Server. Da usare per capire se il sistema è attivo e sincronizzato.',
    parameters: { type: 'object', properties: {} },
  },
];

function activeMon(): ToolOutcome {
  const state = useApp.getState();
  const name = state.activeMonName;
  const record = name ? state.mons[name] : null;

  if (!record) {
    return { ok: true, result: JSON.stringify({ active: false, reason: 'Nessun .mon attivo in questo salvataggio.' }) };
  }

  const data = record.data;
  return {
    ok: true,
    result: JSON.stringify({
      active: true,
      name: data.name,
      displayName: displayName(data.name),
      family: data.family,
      familyArchetype: data.family_archetype,
      affinity: data.affinity,
      role: data.role,
      size: data.size,
      moodPrimary: data.mood_primary,
      moodSecondary: data.mood_secondary,
      rarity: data.rarity,
      rarityScore: data.rarity_score,
      season: data.season,
      bornOnDay: record.bornOnDay,
      retiredOnDay: record.retiredOnDay,
      worldId: record.worldId ?? null,
      rating: record.rating ?? null,
    }),
  };
}

async function status(): Promise<ToolOutcome> {
  const state = useApp.getState();
  const token = state.token;

  let core: Record<string, unknown> = { reachable: false, reason: 'Nessun token: il Core non è stato interrogato.' };

  if (token) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch('/api/state', {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: controller.signal,
      });
      if (response.ok) {
        const body = (await response.json()) as { day?: number; savedAt?: string | null; revision?: unknown };
        core = { reachable: true, savedDay: body.day ?? null, savedAt: body.savedAt ?? null };
      } else {
        core = { reachable: false, httpStatus: response.status };
      }
    } catch (error) {
      core = { reachable: false, reason: error instanceof Error ? error.message : 'richiesta fallita' };
    } finally {
      window.clearTimeout(timer);
    }
  }

  return {
    ok: true,
    result: JSON.stringify({
      app: 'VINZ.MON',
      variant: 'Vinz.mon_v2',
      phase: state.phase,
      day: state.day,
      activeMon: state.activeMonName ? displayName(state.activeMonName) : null,
      tokenPresent: Boolean(token),
      localCore: core,
    }),
  };
}

export async function runVinzTool(name: string, _args: Record<string, unknown>): Promise<ToolOutcome> {
  switch (name) {
    case 'vinz_get_active_mon':
      return activeMon();
    case 'vinz_get_status':
      return status();
    default:
      return { ok: false, result: '', error: `Strumento sconosciuto: ${name}` };
  }
}
