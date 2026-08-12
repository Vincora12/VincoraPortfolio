/* ============================================================================
   05 — FIRST ENCOUNTER  /  14 — NEW ENCOUNTER (§12)

   Rivelazione del .mon. Board S06 e S14: campo nero, hero art, titolo,
   un solo bottone.

   L'asset ENCOUNTER HERO quasi certamente non esiste ancora: in quel caso lo
   slot dichiara che cosa manca invece di inventare un'immagine (§18A, §21.2),
   e la schermata resta comunque percorribile (§26).
   ========================================================================= */

import { useApp, useActiveMon } from '../state/store';
import { AssetSlot, Sigil } from '../system/AssetSlot';
import { MonName, SpeciesName } from '../system/MonName';
import { Button, SystemLabel } from '../system/components';
import { displayName } from '../engine/types';
import { t } from '../i18n/it';

export function EncounterScreen({ variant }: { variant: 'first' | 'new' }) {
  const mon = useActiveMon();
  const enterLive = useApp((s) => s.enterLive);

  if (!mon) return null;

  const d = mon.data;
  const short = displayName(d.name);
  const form = d.evolution_state?.label ?? 'BASIC FORM';

  return (
    <div className="screen screen--ink encounter">
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
            <MonName name={d.name} />
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
          <Sigil seed={mon.sigil} size={40} monName={d.name} />
        </div>

        <Button variant="primary" block onClick={enterLive}>
          {t.encounter.welcome}
        </Button>
      </div>
    </div>
  );
}
