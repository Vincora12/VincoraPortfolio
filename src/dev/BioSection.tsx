/* ============================================================================
   LA BIO — QUELLA DEL MOTORE E QUELLA SCRITTA (§8.1)

   🔷 «Mi interessano le immagini e generare il personaggio, la bio, la storia.»

   Stessa forma di PROMPT IMMAGINI, e per la stessa ragione: la prova che serve
   è il CONFRONTO. Cinque frasi fisse con i buchi riempiti contro un racconto
   scritto sui fatti, sulla stessa creatura, senza tenere niente a mente.
   ========================================================================= */

import { useState } from 'react';
import { useActiveMon, useApp } from '../state/store';
import { Button, SystemLabel } from '../system/components';
import { CopyButton } from '../system/CopyButton';
import { NoMon } from './NoMon';
import type { BioFile } from '../engine/types';

export function BioSection() {
  const mon = useActiveMon();
  const token = useApp((s) => s.token);
  const writeBio = useApp((s) => s.writeBio);
  const writeNarrator = useApp((s) => s.writeNarrator);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [narratorBusy, setNarratorBusy] = useState(false);
  const [narratorProblem, setNarratorProblem] = useState<string | null>(null);

  if (!mon) return <NoMon what="la bio" />;

  const written = mon.writtenBio ?? null;
  const shown: BioFile = written && !showRaw ? written : mon.bio;

  return (
    <div className="dev__section">
      <p className="t-meta dev__label">BIO (§8.1)</p>
      <p className="t-micro dev__note">
        {written
          ? showRaw
            ? `concatenata · ${mon.bio.story.length} caratteri`
            : `scritta dall’AI · ${written.story.length} caratteri (prima ${mon.bio.story.length})`
          : `concatenata · ${mon.bio.story.length} caratteri · cinque frasi fisse coi buchi riempiti`}
      </p>

      <div className="dev__grid">
        <CopyButton text={asText(shown)} label="COPIA" />
        {written ? (
          <Button small onClick={() => setShowRaw((v) => !v)}>
            {showRaw ? 'VEDI QUELLA SCRITTA' : 'VEDI QUELLA DI PRIMA'}
          </Button>
        ) : (
          <Button
            small
            loading={busy}
            disabled={!token}
            onClick={() => {
              setBusy(true);
              setProblem(null);
              void writeBio(mon.data.name)
                .then((why) => setProblem(why))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? 'SCRIVE…' : 'FALLA RISCRIVERE'}
          </Button>
        )}
      </div>

      {!token && !written && (
        <p className="t-micro dev__note">Per riscriverla serve il segreto: ATTIVA VINZ.MON.</p>
      )}
      {problem && (
        <p className="t-small">
          <SystemLabel tone="alert">NON RISCRITTA</SystemLabel> {problem}
        </p>
      )}

      {/* 🔒 Si scrive una volta sola, e va detto QUI: altrimenti sembra che il
          pulsante sia sparito per un guasto. */}
      {written && (
        <p className="t-micro dev__note">
          Si scrive una volta sola per creatura. Per un altro giro, genera un
          altro .mon.
        </p>
      )}

      <pre className="dev__json dev__prompt">{asText(shown)}</pre>

      {/* VINZMON_NARRATIVE_ROLE_IMPLEMENTATION_BRIEF §10 — la voce con cui
          VINZ.MON, da narratore, racconta l'arrivo di questa forma. Diversa
          dalla bio sopra: qui parla il sistema, non il .mon. */}
      <p className="t-meta dev__label" style={{ marginTop: 16 }}>NARRATORE (§10 brief narrativo)</p>
      <p className="t-micro dev__note">
        {mon.narratorLine
          ? 'scritta alla nascita di questa forma (AI o fallback deterministico)'
          : 'non ancora scritta — sulle creature nate prima di questo strato'}
      </p>

      <div className="dev__grid">
        {mon.narratorLine && <CopyButton text={mon.narratorLine} label="COPIA" />}
        {!mon.narratorLine && (
          <Button
            small
            loading={narratorBusy}
            onClick={() => {
              setNarratorBusy(true);
              setNarratorProblem(null);
              void writeNarrator(mon.data.name)
                .then((why) => setNarratorProblem(why))
                .finally(() => setNarratorBusy(false));
            }}
          >
            {narratorBusy ? 'SCRIVE…' : 'FALLA SCRIVERE'}
          </Button>
        )}
      </div>

      {narratorProblem && (
        <p className="t-small">
          <SystemLabel tone="alert">FALLBACK USATO</SystemLabel> {narratorProblem}
        </p>
      )}

      {mon.narratorLine && <pre className="dev__json dev__prompt">{mon.narratorLine}</pre>}
    </div>
  );
}

function asText(bio: BioFile): string {
  return [
    bio.story,
    '',
    'APPUNTI',
    ...bio.annotations.map((a) => `↳ ${a}`),
    '',
    'DETTAGLI',
    ...bio.rememberedDetails.map((r) => `↳ ${r}`),
  ].join('\n');
}
