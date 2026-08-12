/* ============================================================================
   06 — MON / COMPANION HOME (§12)

   🔒 Vincoli espliciti di §12/06:
   • Il .mon corrente occupa il 45–55% del viewport iniziale.
   • NESSUNA card generica attorno alla creatura.
   • Conversazione + composer + progressione compatta.

   §11 — questa è la superficie della relazione: identità, stato, Bond/XP,
   contesto di evoluzione, conversazione, scorciatoie verso Specimen e Bio.
   ========================================================================= */

import { useRef, useState } from 'react';
import type { Overlay } from '../App';
import { useApp, useActiveMon } from '../state/store';
import { AssetSlot, Sigil } from '../system/AssetSlot';
import { MonName } from '../system/MonName';
import { IconButton, SegmentedBar, SystemLabel, TextField } from '../system/components';
import { Icon } from '../system/Icon';
import { displayName } from '../engine/types';
import { t } from '../i18n/it';

export function CompanionHomeScreen({ onGo }: { onGo: (o: Overlay) => void }) {
  const mon = useActiveMon();
  const chat = useApp((s) => s.chat);
  const progression = useApp((s) => s.progression);
  const sendMessage = useApp((s) => s.sendMessage);
  const openShift = useApp((s) => s.openShift);

  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  if (!mon) return null;

  const d = mon.data;
  const short = displayName(d.name);
  const form = d.evolution_state?.label ?? 'BASIC FORM';
  const syncFull = progression.evolutionSync >= 1;

  const submit = () => {
    if (draft.trim().length === 0) return;
    sendMessage(draft);
    setDraft('');
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    });
  };

  return (
    <div className="screen home">
      {/* --- Intestazione: identità e stato, senza scatola attorno --- */}
      <header className="home__head">
        <div className="home__identity">
          <span className="home__sigil">
            <Sigil seed={mon.sigil} size={22} monName={d.name} />
          </span>
          <div>
            <h1 className="home__name t-display">
              <MonName name={d.name} />
            </h1>
            <p className="t-meta home__form">{form}</p>
          </div>
        </div>
        <IconButton icon="expand" label="Apri il profilo completo" light onClick={() => onGo('specimen')} />
      </header>

      {/* --- La creatura. Nessuna card: solo il campo e l'asset. --- */}
      <div className="home__stage">
        <AssetSlot
          monName={d.name}
          type="character_master"
          alt={`${short}, ritratto canonico`}
          className="home__art"
        />

        <div className="home__hud">
          <SegmentedBar
            value={progression.evolutionSync}
            segments={16}
            label={t.home.evolutionSync}
            readout={`${Math.round(progression.evolutionSync * 100)}%`}
          />
        </div>

        {/* La scorciatoia verso lo shift compare solo quando ha senso. */}
        {syncFull && (
          <button type="button" className="home__shift" onClick={openShift}>
            <Icon name="branch" size={14} strokeWidth={2} />
            MINDLINE SHIFT DISPONIBILE
          </button>
        )}

        <div className="home__side">
          <IconButton icon="dna" label="Apri la bio" light small onClick={() => onGo('bio')} />
          <IconButton icon="sticker" label="Apri le memorie" light small onClick={() => onGo('memories')} />
          <IconButton icon="camera" label="Apri gli input" light small onClick={() => onGo('input')} />
          <IconButton icon="scan" label="Apri il daily scan" light small onClick={() => onGo('scan')} />
        </div>
      </div>

      {/* --- Conversazione --- */}
      <div className="home__chat" ref={listRef}>
        {chat.map((m) => (
          <div key={m.id} className={`bubble bubble--${m.from}`}>
            <p className="bubble__text">{m.text}</p>
            {m.fallback && m.from === 'mon' && (
              // §17 — le superfici che dipenderanno da AI dichiarano quando
              // stanno usando il fallback deterministico.
              <span className="bubble__flag t-micro">{t.home.fallbackNotice}</span>
            )}
          </div>
        ))}
      </div>

      {/* --- Composer: oggetto persistente maggiore (§10.4) --- */}
      <div className="composer">
        <IconButton icon="plus" label="Apri gli input universali" onClick={() => onGo('input')} />
        <TextField
          label={`Scrivi a ${short}`}
          placeholder={`${t.home.composerPlaceholder} ${short}…`}
          value={draft}
          onChange={setDraft}
          onSubmit={submit}
        />
        <IconButton icon="send" label="Invia" onClick={submit} disabled={draft.trim().length === 0} />
      </div>

      <div className="home__meta t-micro">
        <SystemLabel>{d.rarity}</SystemLabel>
        <SystemLabel>{d.affinity}</SystemLabel>
        <span>
          {t.common.xp} {progression.xp}
        </span>
        <span>
          {t.home.bond} {Math.round(progression.bond * 100)}%
        </span>
      </div>
    </div>
  );
}
