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

   Il «+» del composer apre direttamente la registrazione: era un menu di
   quattro voci, ma tre erano nel posto sbagliato e la quarta era l'unica che
   si cercava davvero.
   ========================================================================= */

import { useEffect, useRef, useState } from 'react';
import type { Overlay } from '../App';
import { useApp, useActiveMon, useGrowth } from '../state/store';
import { AssetSlot, Sigil } from '../system/AssetSlot';
import { MonName, SpeciesName } from '../system/MonName';
import { MonFace } from '../system/LiveMon';
import { expressionFor } from '../engine/assets';
import { IconButton, TextField } from '../system/components';
import { Icon } from '../system/Icon';
import { displayName } from '../engine/types';
import { haptic } from '../system/haptics';
import { t } from '../i18n/it';

export function CompanionHomeScreen({ onGo }: { onGo: (o: Overlay) => void }) {
  const mon = useActiveMon();
  const chat = useApp((s) => s.chat);
  const { event, progress, microGrowthReady, formEvolutionReady } = useGrowth();
  const sendMessage = useApp((s) => s.sendMessage);
  const openShift = useApp((s) => s.openShift);

  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(true);
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
  // 🔶 Una barra sola. Il vecchio modello ne aveva tre — XP, DISC, EVOLUTION
  // SYNC — e la spec lo vieta testualmente: «Do not show three competing
  // progress bars on Home».
  const somethingReady = microGrowthReady || formEvolutionReady;

  const submit = () => {
    if (draft.trim().length === 0) return;
    sendMessage(draft);
    setDraft('');
    setExpanded(false);
    scrollToEnd();
  };

  return (
    <div className="screen home">
      {/* --- Intestazione: identità e stato, senza scatola attorno --- */}
      <header className="home__head">
        {/* 🔷 v1.10 — un bersaglio solo. C'era il blocco identità (muto) più
            un'icona «espandi» in alto a destra che in realtà apriva il
            profilo: lo stesso difetto della matita già segnalato, un glifo
            che non dice dove porta. Adesso il nome È il pulsante, con la
            freccia dentro lo stesso bersaglio. */}
        <button
          type="button"
          className="home__identity"
          onClick={() => onGo('specimen')}
          aria-label={`Apri il profilo di ${short}`}
        >
          <span className="home__sigil">
            <Sigil seed={mon.sigil} size={22} monName={d.name} />
          </span>
          <span className="home__identitytext">
            <span className="home__name t-display">
              <MonName name={d.name} />
            </span>
            {/* Nome proprio sopra, specie e forma sotto. */}
            <span className="t-meta home__form">
              <SpeciesName /> · {form}
            </span>
          </span>
          <span className="home__identitygo" aria-hidden="true">→</span>
        </button>
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

      </button>

      {/* --- 🔷 v1.10 — UN ELEMENTO SOLO, dove prima ce n'erano due.

           C'era una linea di SYNC sul bordo dello stage e, quando si riempiva,
           compariva SOTTO un banner MINDLINE SHIFT: la cosa più rumorosa dello
           schermo, piazzata fra la creatura e la conversazione, che spingeva
           giù la chat e non si poteva chiudere finché non agivi. Un annuncio
           che non si può congedare smette di essere un annuncio.

           Adesso è la linea stessa a diventare l'annuncio: sta dov'era, non
           sposta niente, e quando è piena cresce e si può toccare. --- */}
      {somethingReady ? (
        <button
          type="button"
          className="home__sync home__sync--ready"
          onClick={() => {
            haptic('impact');
            openShift();
          }}
        >
          <span className="home__syncpulse" aria-hidden="true" />
          <Icon name="branch" size={14} strokeWidth={2} />
          <span className="home__syncready t-meta">
            {formEvolutionReady ? t.home.readyForm : t.home.readyGrowth}
          </span>
          <span className="home__identitygo" aria-hidden="true">→</span>
        </button>
      ) : (
        <span
          className="home__sync"
          role="progressbar"
          aria-label={`${t.home.sync} — ${event.have} di ${event.need}`}
          aria-valuenow={event.have}
          aria-valuemax={event.need}
        >
          <span className="home__syncfill" style={{ width: `${progress * 100}%` }} />
        </span>
      )}

      {/* --- Conversazione --- */}
      <div className="home__chat" ref={listRef}>
        {chat.map((m) => (
          <div key={m.id} className={`bubblerow bubblerow--${m.from}`}>
            {/* 🔶 v1.9 §23.1 — il volto accanto a quello che dice. L'espressione
                si sceglie dal testo appena scritto, non dall'umore di fondo:
                è quello che ha appena detto a decidere che faccia fa. */}
            {m.from === 'mon' && (
              <MonFace
                monName={d.name}
                expression={expressionFor(m.text, d.mood_primary)}
                alt={short}
                size={38}
              />
            )}
            <div className={`bubble bubble--${m.from}`}>
              <p className="bubble__text">{m.text}</p>
              {/* §17 — le superfici che dipendono dall'AI dichiarano sempre cosa
                  stanno mostrando: la voce vera, o quella deterministica. */}
              {m.from === 'mon' && m.pending && (
                <span className="bubble__flag t-micro">{t.home.writing}</span>
              )}
              {m.from === 'mon' && m.fallback && !m.pending && (
                <span className="bubble__flag t-micro">{t.home.fallbackNotice}</span>
              )}
              {/* 🔶 v1.9 §5.1 — cosa è stato registrato da questo messaggio.
                  Registrare in silenzio sarebbe peggio che non registrare. */}
              {m.extracted && (
                <span className="bubble__flag bubble__flag--rec t-micro">
                  {t.home.recorded} {m.extracted.join(' · ')}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* --- Composer: oggetto persistente maggiore (§10.4) --- */}
      <div className="composer">
        {/* 🔶 v1.9 §13.3 — il «+» apre la registrazione, non un menu.

            C'era un menu con quattro voci: REGISTRA UN DATO, UMORE DI OGGI,
            BIO, MEMORIE. Tre erano posti sbagliati — la BIO appartiene al
            profilo, le memorie non vanno lette (rompono la magia) e l'umore
            non è una voce a parte, è una delle cose che si raccontano
            registrando. Restava una voce sola: il menu era un tocco in più
            per arrivare dove si voleva andare comunque. */}
        <IconButton icon="plus" label={t.input.title} onClick={() => onGo('input')} />
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
