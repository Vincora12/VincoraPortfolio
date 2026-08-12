/* ============================================================================
   12 — EVOLUTION (§12)

   "Current .mon changes while preserving identity; XP is spent according to
    final economy."

   §7.2 — la STESSA identità evolve. La schermata deve rendere evidente la
   continuità: stesso nome, stessa Family, stesso Character DNA. Cambia la
   forma, non chi è.
   ========================================================================= */

import type { ReactNode } from 'react';
import { useApp, useActiveMon } from '../state/store';
import { AssetSlot, Sigil } from '../system/AssetSlot';
import { MonName } from '../system/MonName';
import { Button, ScreenHead, SystemLabel } from '../system/components';
import { displayName } from '../engine/types';
import { t } from '../i18n/it';

export function EvolutionScreen() {
  const mon = useActiveMon();
  const enterLive = useApp((s) => s.enterLive);

  if (!mon) return null;

  const d = mon.data;
  const short = displayName(d.name);
  const evo = d.evolutionState;
  const from = evo?.previousLabels[evo.previousLabels.length - 1] ?? 'BASIC FORM';
  const to = evo?.label ?? 'BASIC FORM';

  return (
    <div className="screen">
      <ScreenHead title={t.evolution.title} sub={`${short} · ${t.evolution.same}`} />

      <div className="screen__body evolution">
        <div className="evolution__stage">
          <AssetSlot
            monName={d.name}
            type="character_master"
            alt={`${short}, nuova forma`}
            className="evolution__art"
          />
        </div>

        {/* Il passaggio di forma, esplicito. */}
        <div className="evolution__transition">
          <div className="evolution__step">
            <span className="t-micro">{t.evolution.from}</span>
            <span className="t-display evolution__label evolution__label--past">{from}</span>
          </div>
          <span className="evolution__arrow" aria-hidden="true">
            →
          </span>
          <div className="evolution__step">
            <span className="t-micro">{t.evolution.to}</span>
            <span className="t-display evolution__label">{to}</span>
          </div>
        </div>

        {/* Ciò che NON è cambiato: è il punto della schermata. */}
        <section className="evolution__kept">
          <p className="t-meta">RESTA INVARIATO</p>
          <div className="evolution__keptgrid">
            <Kept label="NOME" value={<MonName name={d.name} />} />
            <Kept label="FAMILY" value={`${d.family} / ${d.familyArchetype}`} />
            <Kept label="AFFINITY" value={d.affinity} />
            <Kept label="SIZE" value={d.size} />
            <Kept label="ROLE" value={d.role} />
            <Kept label="APPEARANCE" value={d.appearance} />
          </div>
          <p className="t-micro evolution__note">
            Il Character DNA non cambia con l'evoluzione: è la stessa identità a
            uno stadio successivo.
          </p>
        </section>

        <div className="evolution__tags">
          <SystemLabel tone="character">STADIO {evo?.stage ?? 0}</SystemLabel>
          <SystemLabel>{d.rarity}</SystemLabel>
          <span className="evolution__sigil">
            <Sigil seed={mon.sigil} size={24} monName={d.name} />
          </span>
        </div>

        {/* §21.2 — la nuova forma nasce con gli slot asset vuoti: vanno
            rigenerati. Lo diciamo, invece di mostrare la forma vecchia. */}
        <p className="t-small evolution__assets">
          La forma è cambiata: gli asset visivi vanno rigenerati. Esporta un
          nuovo pacchetto Asset Request dal profilo.
        </p>
      </div>

      <footer className="screen__foot">
        <Button variant="primary" block onClick={enterLive}>
          {t.evolution.done}
        </Button>
      </footer>
    </div>
  );
}

function Kept({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="kept">
      <span className="t-micro kept__label">{label}</span>
      <span className="kept__value t-small">{value}</span>
    </div>
  );
}
