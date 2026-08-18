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
import type { BioFile } from '../engine/types';

export function BioSection() {
  const mon = useActiveMon();
  const token = useApp((s) => s.token);
  const writeBio = useApp((s) => s.writeBio);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  if (!mon) return null;

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
            disabled={busy || !token}
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
