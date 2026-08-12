/* ============================================================================
   06 — MON / COMPANION HOME (§12)

   🔒 Vincoli espliciti di §12/06:
   • Il .mon corrente occupa il 45–55% del viewport **iniziale**.
   • NESSUNA card generica attorno alla creatura.
   • Conversazione + composer + progressione compatta.

   «Iniziale» è la parola che regge questa schermata: a riposo la creatura
   prende metà schermo come chiede la spec, ma appena si comincia a parlare si
   ritira in una striscia e la conversazione prende il suo posto. Si torna
   indietro toccandola. La spec fissa lo stato d'ingresso, non impone che
   l'immagine occupi metà schermo mentre stai scrivendo.

   Le azioni non stanno più attorno alla creatura: stanno dentro il «+» del
   composer, che è dove si cercano in una conversazione e non costa nessuna
   riga permanente.
   ========================================================================= */

import { useEffect, useRef, useState } from 'react';
import type { Overlay } from '../App';
import { useApp, useActiveMon } from '../state/store';
import { AssetSlot, Sigil } from '../system/AssetSlot';
import { MonName, SpeciesName } from '../system/MonName';
import { IconButton, TextField } from '../system/components';
import { Icon, type IconName } from '../system/Icon';
import { displayName } from '../engine/types';
import { haptic } from '../system/haptics';
import { t } from '../i18n/it';

const ACTIONS: { icon: IconName; label: string; overlay: Overlay }[] = [
  { icon: 'camera', label: 'REGISTRA UN DATO', overlay: 'input' },
  { icon: 'scan', label: 'UMORE DI OGGI', overlay: 'scan' },
  { icon: 'dna', label: 'BIO', overlay: 'bio' },
  { icon: 'sticker', label: 'MEMORIE', overlay: 'memories' },
];

export function CompanionHomeScreen({ onGo }: { onGo: (o: Overlay) => void }) {
  const mon = useActiveMon();
  const chat = useApp((s) => s.chat);
  const evolutionSync = useApp((s) => s.progression.evolutionSync);
  const sendMessage = useApp((s) => s.sendMessage);
  const openShift = useApp((s) => s.openShift);

  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(true);
  const [actionsOpen, setActionsOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const scrollToEnd = () => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    });
  };

  // Il collasso della creatura è una conseguenza della conversazione, non un
  // comando: chi scrive vuole leggere le risposte.
  useEffect(scrollToEnd, [chat.length, expanded]);

  if (!mon) return null;

  const d = mon.data;
  const short = displayName(d.name);
  const form = d.evolution_state?.label ?? 'BASIC FORM';
  const syncFull = evolutionSync >= 1;

  const submit = () => {
    if (draft.trim().length === 0) return;
    sendMessage(draft);
    setDraft('');
    setExpanded(false);
    scrollToEnd();
  };

  const go = (o: Overlay) => {
    setActionsOpen(false);
    onGo(o);
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
            {/* Nome proprio sopra, specie e forma sotto. */}
            <p className="t-meta home__form">
              <SpeciesName /> · {form}
            </p>
          </div>
        </div>
        <IconButton icon="expand" label="Apri il profilo completo" light onClick={() => onGo('specimen')} />
      </header>

      {/* --- La creatura. Nessuna card: solo il campo e l'asset. --- */}
      <button
        type="button"
        className={`home__stage ${expanded ? '' : 'home__stage--compact'}`}
        onClick={() => {
          haptic('tick');
          setExpanded((v) => !v);
        }}
        aria-expanded={expanded}
        aria-label={expanded ? `Riduci ${short}` : `Ingrandisci ${short}`}
      >
        <AssetSlot
          monName={d.name}
          type="character_master"
          alt={`${short}, ritratto canonico`}
          className="home__art"
          compactPlaceholder={!expanded}
        />

        {/* EVOLUTION SYNC come linea sul bordo: informazione periferica finché
            non è piena, e allora diventa il fatto principale della schermata. */}
        <span
          className="home__sync"
          role="progressbar"
          aria-label={t.home.evolutionSync}
          aria-valuenow={Math.round(evolutionSync * 100)}
        >
          <span className="home__syncfill" style={{ width: `${Math.min(1, evolutionSync) * 100}%` }} />
        </span>
      </button>

      {/* --- L'annuncio. È il momento che la schermata deve rendere grande. --- */}
      {syncFull && (
        <button
          type="button"
          className="home__shift"
          onClick={() => {
            haptic('impact');
            openShift();
          }}
        >
          <span className="home__shiftpulse" aria-hidden="true" />
          <Icon name="branch" size={16} strokeWidth={2} />
          <span className="home__shifttext">
            <strong className="t-display">MINDLINE SHIFT</strong>
            <span className="t-micro">il percorso si divide — apri</span>
          </span>
          <span className="home__shiftgo" aria-hidden="true">→</span>
        </button>
      )}

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
      {actionsOpen && (
        <>
          <button
            type="button"
            className="home__scrim"
            aria-label={t.common.close}
            onClick={() => setActionsOpen(false)}
          />
          <div className="home__actions" role="menu">
            {ACTIONS.map((a) => (
              <button
                key={a.overlay}
                type="button"
                role="menuitem"
                className="home__action"
                onClick={() => {
                  haptic('tick');
                  go(a.overlay);
                }}
              >
                <Icon name={a.icon} size={18} strokeWidth={2} />
                <span className="t-meta">{a.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="composer">
        <IconButton
          icon="plus"
          label="Altre azioni"
          className={actionsOpen ? 'is-open' : ''}
          onClick={() => setActionsOpen((v) => !v)}
        />
        <TextField
          label={`Scrivi a ${short}`}
          placeholder={`${t.home.composerPlaceholder} ${short}…`}
          value={draft}
          onChange={setDraft}
          onSubmit={submit}
          onFocus={() => setExpanded(false)}
        />
        <IconButton icon="send" label="Invia" haptics="confirm" onClick={submit} disabled={draft.trim().length === 0} />
      </div>
    </div>
  );
}
