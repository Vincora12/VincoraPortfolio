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
import { AssetSlot, Sigil, useAssetUrl } from '../system/AssetSlot';
import { MonName, SpeciesName } from '../system/MonName';
import { Button, SystemLabel } from '../system/components';
import { displayName } from '../engine/types';
import { t } from '../i18n/it';

/* ============================================================================
   §22.4/§22.5 — LA FACCIA SI APPROVA PRIMA DI FARE IL RESTO

   🔷 «Quando genero il nuovo mon, lui genera la prima immagine, solo la
   prima, per mostrarmelo con tutta l'animazione del nome. E se mi piace
   continua, se no lo faccio rigenerare con lo stesso prompt.»

   🔒 IL PROMPT NON CAMBIA MAI. «Rifalla» non cerca un personaggio diverso:
   chiede di nuovo la stessa cosa, perché a volte l'immagine esce storta. Se
   cambiasse il prompt sarebbe un'altra creatura, e la creatura l'hanno decisa
   i tuoi dati — non il fatto che la prima resa non ti convincesse.

   ⚠️ E si può SEMPRE andare avanti, anche senza immagine. Senza chiave,
   offline o col tetto pieno il pulsante resta e porta dentro: §26 — nessun
   asset mancante blocca il flusso.
   ========================================================================= */

function FaceGate({ monName, onDone }: { monName: string; onDone: () => void }) {
  const generate = useApp((s) => s.generateAssetsFor);
  const rate = useApp((s) => s.rateMon);
  const rating = useApp((s) => s.mons[monName]?.rating ?? null);
  const progress = useApp((s) => s.assetProgress);
  const portrait = useAssetUrl(monName, 'profile_portrait');
  const [redoing, setRedoing] = useState(false);

  const working = progress?.monName === monName;
  const noKey = progress?.failure === 'no-token';

  const keep = () => {
    /* Il resto parte adesso, e non blocca: si entra subito e le altre facce
       arrivano mentre già parlate. */
    generate(monName);
    onDone();
  };

  const redo = () => {
    setRedoing(true);
    generate(monName, { only: ['profile_portrait'], replace: true });
    window.setTimeout(() => setRedoing(false), 1200);
  };

  return (
    <div className="facegate">
      {/* ⚠️ Il voto NON dipende dall'immagine. Prima era legato al ritratto, e
          senza chiave non compariva mai: ma quello che giudichi è la CREATURA
          — nome, famiglia, rarità, il perché è venuta così — e quella c'è dal
          primo istante. L'immagine è una delle cose che la compongono, non la
          condizione per averne un'opinione. */}
      {(
        <div className="facegate__rate">
          <span className="t-micro">{rating === null ? t.face.ratePrompt : t.face.rated}</span>
          <span className="facegate__stars" role="group" aria-label={t.face.ratePrompt}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={`facegate__star ${rating !== null && n <= rating ? 'facegate__star--on' : ''}`}
                aria-label={`${n} su 5`}
                aria-pressed={rating === n}
                onClick={() => rate(monName, rating === n ? null : n)}
              >
                {n <= (rating ?? 0) ? '\u25A0' : '\u25A1'}
              </button>
            ))}
          </span>
        </div>
      )}

      {working && !portrait && <p className="t-micro facegate__note">{t.face.arriving}</p>}
      {noKey && <p className="t-micro facegate__note">{t.face.needsToken}</p>}

      <div className="facegate__actions">
        {portrait && (
          <Button variant="secondary" small onClick={redo} disabled={redoing || working}>
            {redoing || working ? t.face.redoing : t.face.redo}
          </Button>
        )}
        <Button variant="primary" block onClick={keep}>
          {portrait ? t.face.keep : t.encounter.welcome}
        </Button>
      </div>

      {portrait && <p className="t-micro facegate__note">{t.face.rest}</p>}
    </div>
  );
}

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
        {/* 🔷 §22.4 — alla nascita esiste SOLO il ritratto: gli altri cinque
            si chiedono dopo che hai detto di sì. Quindi la catena parte da lì
            e non dall'hero, che a questo punto non c'è ancora. */}
        <AssetSlot
          monName={d.name}
          type="encounter_hero"
          fallbackTypes={['character_master', 'profile_portrait']}
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

        <FaceGate monName={d.name} onDone={enterLive} />
      </div>
    </div>
  );
}
