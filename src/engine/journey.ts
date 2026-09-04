/* ============================================================================
   CORE EXTRACTION PHASE 3 — Journey domain boundary (Mon State + World + Story
   Ledger).

   🔒 WHY THIS LIVES HERE, NOT UNDER netlify/functions/_shared/core/.

   Phase 1/2's Memory boundary earned a server module because there was a real
   backend CHOICE to hide from callers (ME Model vs Mem0). Traced before
   writing anything here: Mon State/World/Ledger have no such choice today.
   `/api/state` (netlify/functions/state.ts) stores `state: unknown` — fully
   opaque, never parsed server-side — and `writeNarratorWithAi`
   (src/ai/narratorPrompt.ts) receives an already-rendered prompt string built
   client-side, never structured World/Ledger data. There is exactly one
   persistence path (the opaque blob) and zero server-side domain logic to
   centralize. Building a new Netlify Function that parses that opaque blob
   would either duplicate these types server-side (a second place to keep in
   sync) or force a real schema onto a blob that's deliberately opaque —
   "migrate persistence," explicitly out of scope this phase.

   What DOES provide real ownership: this relationship logic
   (resolveActiveMon/validateJourneyCoherence/projectJourneyState) was
   duplicated three times before this file existed — `activeRecord()` and
   `useActiveMon()` in src/state/store.ts both independently reimplemented
   "activeMonName ? mons[activeMonName] ?? null : null", and no code anywhere
   validated Mon/World coherence at all. Centralizing it here, in the same
   pure `engine/` layer as world.ts/progression.ts (no React, no Zustand, no
   DOM/window/localStorage — verified, same class of file CORE_BOUNDARY.md
   already treats as Core-eligible), means any future client sharing this
   module — not just this Zustand store — gets the same answer. Store.ts's
   two duplicates now delegate here instead of reimplementing it a third way.
   ========================================================================= */

import type { MonRecord } from './types';
import type { StoryLedger, World } from './world';

/** The smallest projection future clients (Desktop, House.mon, a wearable) need to answer
 *  "what is VINZ.MON's current journey" — never the full opaque AppState. */
export interface JourneyState {
  activeMon: MonRecord | null;
  world: World | null;
  ledger: StoryLedger;
}

/** Resolves the active Mon from the same two fields every caller in this codebase already has:
 *  the Mon dictionary and the active name. One implementation, not three. */
export function resolveActiveMon(mons: Record<string, MonRecord>, activeMonName: string | null): MonRecord | null {
  return activeMonName ? (mons[activeMonName] ?? null) : null;
}

export interface JourneyCoherenceReport {
  /** true when activeMonName is null (nothing to resolve) OR resolves to a real record. */
  activeMonResolved: boolean;
  /** true whenever an active Mon exists but no World is attached — see worldPresent below for what this means. */
  activeMonWithoutWorld: boolean;
  /**
   * ⚠️ Traced, not assumed: `MonRecord.worldId` has ZERO readers anywhere in this codebase today
   * (confirmed by a repo-wide search — every hit is a write site). `world` is one global field on
   * AppState, not a map keyed by Mon, so "coherence" between the active Mon and the current World
   * is structural by construction today, not an active join this code enforces. This field says
   * whether the active Mon even carries a worldId to compare, so a future reader isn't left
   * guessing why `worldIdMatchesCurrentWorld` is 'not-applicable'.
   */
  worldIdDeclaredOnActiveMon: boolean;
  /** 'not-applicable' when there's no active Mon, no World, or the active Mon has no worldId. */
  worldIdMatchesCurrentWorld: boolean | 'not-applicable';
  /** Human-readable findings, most for awareness (e.g. "no World yet") rather than hard failures —
   *  see worldBlock(null) in world.ts, which already renders this state honestly to the narrator. */
  issues: string[];
}

/**
 * Encodes the actual invariants this domain has today — not the ones a future World-transition
 * mechanic (RISE) would need once it exists. See docs/CORE_EXTRACTION_PHASE3_2026-09-04.md for
 * the traced discrepancy between the "RISE moves to a new World" assumption and current code,
 * where mega-evolution keeps the same World.id and only adds a canon event.
 */
export function validateJourneyCoherence(
  mons: Record<string, MonRecord>,
  activeMonName: string | null,
  world: World | null,
): JourneyCoherenceReport {
  const issues: string[] = [];
  const activeMon = resolveActiveMon(mons, activeMonName);
  const activeMonResolved = activeMonName === null || activeMon !== null;
  if (activeMonName !== null && activeMon === null) {
    issues.push(`activeMonName "${activeMonName}" non ha un record corrispondente in mons`);
  }

  const activeMonWithoutWorld = activeMon !== null && world === null;
  if (activeMonWithoutWorld) {
    issues.push('un Mon è attivo ma non esiste ancora un World — stato legittimo pre-hatch o salvataggio precedente a World; worldBlock(null) lo gestisce già onestamente');
  }

  const worldIdDeclaredOnActiveMon = Boolean(activeMon?.worldId);
  let worldIdMatchesCurrentWorld: boolean | 'not-applicable' = 'not-applicable';
  if (worldIdDeclaredOnActiveMon && world) {
    worldIdMatchesCurrentWorld = activeMon!.worldId === world.id;
    if (!worldIdMatchesCurrentWorld) {
      issues.push(`worldId del Mon attivo (${activeMon!.worldId}) non combacia con il World corrente (${world.id}) — nessun codice oggi legge worldId per farne uso, quindi questo non blocca nulla, ma è la prima verifica che se ne accorgerebbe`);
    }
  }

  return { activeMonResolved, activeMonWithoutWorld, worldIdDeclaredOnActiveMon, worldIdMatchesCurrentWorld, issues };
}

/** The backend-neutral (here: storage-shape-neutral) domain projection — {activeMon, world,
 *  ledger}, never the whole opaque AppState blob. */
export function projectJourneyState(input: {
  mons: Record<string, MonRecord>;
  activeMonName: string | null;
  world: World | null;
  ledger: StoryLedger;
}): JourneyState {
  return {
    activeMon: resolveActiveMon(input.mons, input.activeMonName),
    world: input.world,
    ledger: input.ledger,
  };
}
