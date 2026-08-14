/* ============================================================================
   05 — FIRST ENCOUNTER  /  14 — NEW ENCOUNTER (§12)

   Rivelazione del .mon. Board S06 e S14: campo nero, hero art, titolo,
   un solo bottone.

   L'asset ENCOUNTER HERO quasi certamente non esiste ancora: in quel caso lo
   slot dichiara che cosa manca invece di inventare un'immagine (§18A, §21.2),
   e la schermata resta comunque percorribile (§26).
   ========================================================================= */

import { useEffect, useState } from 'react';
import { useApp, useActiveMon } from '../state/store';
import { AssetSlot, Sigil } from '../system/AssetSlot';
import { MonName, SpeciesName } from '../system/MonName';
import { Button, SystemLabel } from '../system/components';
import { displayName } from '../engine/types';
import { t } from '../i18n/it';

export function EncounterScreen({ variant }: { variant: 'first' | 'new' }) {
  const mon = useActiveMon();
  const enterLive = useApp((s) => s.enterLive);

  /* 🔶 v1.9 §13.2 — la rivelazione ha tre battute, non una.

     Prima la schermata mostrava tutto insieme: arte, nome, rarità, tag. Dopo
     sette giorni di attesa è poco. Adesso il nero regge un attimo, poi arriva
     il nome, poi si scopre la creatura, e solo alla fine i dati. Nessuna delle
     tre battute dura abbastanza da diventare un'attesa, e si saltano tutte al
     primo tocco: un momento che non si può saltare diventa un ostacolo alla
     seconda volta che lo vedi. */
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    const ids = [
      window.setTimeout(() => setBeat(1), 700),
      window.setTimeout(() => setBeat(2), 1900),
    ];
    return () => ids.forEach(window.clearTimeout);
  }, []);

  if (!mon) return null;

  const d = mon.data;
  const short = displayName(d.name);
  const form = d.evolution_state?.label ?? 'BASIC FORM';

  return (
    <div
      className={`screen screen--ink encounter encounter--beat${beat}`}
      onClick={() => setBeat(2)}
    >
      {/* La battuta 0–1: campo nero e il nome che arriva battendo. */}
      {beat < 2 && (
        <div className="encounter__curtain" role="presentation">
          {beat >= 1 && (
            <>
              <span className="encounter__kicker t-meta">
                {variant === 'first' ? t.encounter.firstTitle : t.encounter.newTitle}
              </span>
              <span className="encounter__bigname t-display">
                <MonName name={d.name} fit />
              </span>
            </>
          )}
        </div>
      )}

      <div className="encounter__stage">
        <AssetSlot
          monName={d.name}
          type="encounter_hero"
          fallbackTypes={['character_master']}
          alt={`${short}, arte di rivelazione`}
          className="encounter__art"
        />
      </div>

      <div className="encounter__overlay">
        <header className="encounter__head">
          <p className="t-meta">
            {variant === 'first' ? t.encounter.firstTitle : t.encounter.newTitle}
          </p>
          <h1 className="t-display encounter__name">
            <MonName name={d.name} fit />
          </h1>
          <p className="t-meta encounter__form">
            <SpeciesName /> · {form}
          </p>
        </header>

        <div className="encounter__tags">
          <SystemLabel tone="character">{d.rarity}</SystemLabel>
          <SystemLabel>{d.affinity}</SystemLabel>
          <SystemLabel>{d.family}</SystemLabel>
          <SystemLabel>{d.appearance}</SystemLabel>
        </div>

        {/* §13 di §12: al branch i tratti ereditati vanno mostrati. Qui la
            nuova identità esiste già, quindi si può dire da dove viene. */}
        {d.heritage_traits.length > 0 && (
          <p className="t-small encounter__heritage">
            Porta {d.heritage_traits.length} {d.heritage_traits.length === 1 ? 'tratto' : 'tratti'} da{' '}
            {displayName(d.heritage_traits[0]!.from_mon)}.
          </p>
        )}

        <div className="encounter__sigil" aria-hidden="true">
          <Sigil seed={mon.sigil} size={40} />
        </div>

        <Button variant="primary" block onClick={enterLive}>
          {t.encounter.welcome}
        </Button>
      </div>
    </div>
  );
}
