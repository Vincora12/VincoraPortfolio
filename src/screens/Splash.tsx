/* ============================================================================
   00 — INGRESSO (MASTER SPEC §13.1, riscritta in v1.10 §13.7)

   Una schermata sola, con dentro quello che ti stava aspettando: l'uovo che
   respira durante l'incubazione, il .mon che si muove dopo. Niente dati,
   niente barre, niente riassunto della giornata.

   È l'unica superficie del prodotto che non serve a fare qualcosa. Serve a
   stabilire CHI ti stava aspettando prima che tu cominci a leggere numeri —
   e per un'app che dice di essere «companion-first, dashboard-second» (§2)
   è la differenza fra dirlo e farlo.

   🔷 v1.10 — DUE CAMBI, e il secondo corregge una regola che avevo scritto io.

   1. Compare anche durante l'INCUBAZIONE, con l'uovo. Prima esisteva solo
      dopo la nascita, e i primi sette giorni — quelli che decidono se l'app
      viene riaperta — non avevano nessun momento di presenza.

   2. NON entra più da sé dopo qualche secondo. §13.1 lo prevedeva perché la
      schermata non aveva nessuna via d'uscita visibile: era un saluto muto, e
      restarci bloccati sarebbe stato un difetto. Adesso c'è un ingresso
      dichiarato — si entra quando si decide di entrare, e si può restare a
      guardare quanto si vuole. Una schermata che ti butta fuori dopo quattro
      secondi non è un posto dove stare.
   ========================================================================= */

import { useState } from 'react';
import { useApp, useActiveMon, useIncubation } from '../state/store';
import { IdleMon } from '../system/LiveMon';
import { EggVessel } from '../system/EggVessel';
import { MonName, SpeciesName } from '../system/MonName';
import { Sigil } from '../system/AssetSlot';
import { Row } from '../system/components';
import { birthStatsFor } from '../engine/birthStats';
import { STAT_LABELS, formatSignal } from '../engine/health';
import { displayName, readableBio } from '../engine/types';
import { haptic } from '../system/haptics';
import { t } from '../i18n/it';

export function SplashScreen({ onEnter }: { onEnter: () => void }) {
  const phase = useApp((s) => s.phase);
  const mon = useActiveMon();
  const inc = useIncubation();
  const health = useApp((s) => s.health);

  /* Il tocco sull'uovo. `pokes` rimonta il componente, e rimontarlo fa
     ripartire l'animazione di salto dall'inizio: è il modo più semplice di
     far succedere una cosa adesso invece che al prossimo ciclo.

     ⚠️ Sta PRIMA del `return null` qui sotto. Uno `useState` dopo un'uscita
     condizionale cambia l'ordine degli hook fra un render e l'altro, e React
     se ne accorge solo a schermo — TypeScript no. */
  const [pokes, setPokes] = useState(0);

  const incubating = phase === 'incubation';
  if (!incubating && !mon) return null;

  const enter = () => {
    haptic('tick');
    onEnter();
  };

  const poke = () => {
    haptic('tick');
    setPokes((n) => n + 1);
  };

  return (
    <div className="splash">
      {/* Tutto lo spazio va alla creatura: è il motivo per cui la schermata
          esiste.

          ⚠️ NON è un pulsante. Lo era, e apriva la chat — ma dentro c'è un
          visore che si trascina per ruotare, e un trascinamento dentro un
          pulsante finisce sempre in un click involontario. Adesso la creatura
          risponde al gesto che le appartiene, e alla chat si va dalla porta. */}
      <div className="splash__stage">
        {incubating ? (
          /* Toccare l'uovo lo fa saltare. Non porta da nessuna parte, ed è il
             punto: un'app viva ha almeno una cosa che risponde per il gusto
             di rispondere. */
          <button
            type="button"
            className="splash__poke"
            onClick={poke}
            aria-label="Tocca l’uovo"
          >
            <EggVessel
              key={pokes}
              progress={inc.progress}
              days={inc.day}
              total={inc.total}
              size={260}
              lively
            />
          </button>
        ) : (
          /* 🔷 v1.11 §23.3 — la creatura non gira: respira. Qui c'era il
             visore a trascinamento, uscito insieme al suo asset — otto viste
             coerenti erano il pezzo più caro del pacchetto in cambio di un
             gesto che si prova una volta. Un ciclo leggero in loop fa lo
             stesso lavoro meglio, con quattro frame invece di otto. */
          <IdleMon monName={mon!.data.name} alt={displayName(mon!.data.name)} />
        )}
      </div>

      <div className="splash__id">
        {incubating ? (
          <>
            <span className="t-display splash__name">{t.incubation.title}</span>
            <span className="t-meta splash__form">
              {inc.day} / {inc.total} {t.incubation.day}
            </span>
          </>
        ) : (
          <>
            <span className="t-display splash__name">
              <MonName name={mon!.data.name} fit />
            </span>
            <span className="t-meta splash__form">
              <SpeciesName /> · {mon!.data.evolution_state?.label ?? 'BASIC FORM'}
            </span>
          </>
        )}
      </div>

      {/* 🔷 v1.15 §13.12 — L'INGRESSO È UN PULSANTE, NON UNA SUPERFICIE.

          Da quando la pagina scorre, «tocca il personaggio per entrare»
          sarebbe un gesto che compete con lo scroll: il dito parte sulla
          creatura, la pagina si muove, e ti ritrovi in chat senza averlo
          chiesto. Su iPhone succede tutte le volte.

          Un pulsante con scritto cosa fa è anche più chiaro di una superficie
          che si tocca e basta — la perdita è zero. */}
      <button type="button" className="splash__enter" onClick={enter}>
        <span className="t-display">{incubating ? t.splash.chat : t.splash.talk}</span>
        <span aria-hidden="true">→</span>
      </button>

      {/* ======================================================================
          🔷 v1.15 §13.12 — QUELLO CHE STA SOTTO.

          Qui c'era un tasto in alto a destra che portava al profilo: un'icona
          senza nome verso un posto che non sapevi prima di arrivarci. Stessa
          malattia della freccia di invio, stessa cura — sparisce, e la roba
          che c'era dietro scende qui.

          🔒 LA REGOLA DI COSA SCENDE: sotto il personaggio va quello che il
          personaggio È. Quello che è storia o macchinario resta dov'è —
          l'Heritage sta nella Mindline, perché parla di chi c'era PRIMA di
          lui, non di lui; il calendario e la timeline hanno la loro tab.

          Senza una regola, «tutto in una pagina» diventa un cruscotto.
          ==================================================================== */}
      {!incubating && mon && <MonDossier health={health} />}
    </div>
  );
}

/* --- Il dossier sotto la faccia -------------------------------------------- */

function MonDossier({ health }: { health: Parameters<typeof birthStatsFor>[0] }) {
  const mon = useActiveMon()!;
  const d = mon.data;
  const birth = birthStatsFor(health, d.generated_at_day);

  return (
    <div className="dossier">
      {/* --- LE STATISTICHE, CONGELATE ---------------------------------------
          La differenza con la schermata ME è tutto il punto e va detta a
          parole, non lasciata dedurre: là ci sono i tuoi numeri di OGGI, qui
          quelli del giorno in cui è nato lui. Un .mon è la fotografia di un
          momento, e questi numeri sono la sua anatomia — se seguissero i tuoi
          di adesso sarebbe un grafico della tua salute con sopra una faccia.
          -------------------------------------------------------------------- */}
      <section className="dossier__block">
        <p className="t-meta dossier__label">{t.splash.stats}</p>

        {birth.lost ? (
          <p className="t-small dossier__note">{t.splash.statsLost}</p>
        ) : birth.known === 0 ? (
          <p className="t-small dossier__note">{t.splash.statsUnknown}</p>
        ) : (
          <ul className="dossier__stats">
            {birth.stats.map((s) => (
              <li key={s.key} className="statline">
                <span className="statline__key t-meta">{s.key}</span>
                <span className="statline__track" aria-hidden="true">
                  {s.bar !== null && (
                    <span className="statline__fill" style={{ width: `${s.bar}%` }} />
                  )}
                </span>
                <span className="statline__value t-micro">{formatSignal(s.value)}</span>
                <span className="sr-only">{STAT_LABELS[s.key]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="dossier__block">
        <p className="t-meta dossier__label">{t.splash.identity}</p>
        <div className="rowlist">
          <Row label="FAMILY" value={`${d.family} // ${d.family_archetype}`} />
          <Row label="AFFINITY" value={d.affinity} />
          <Row label="SIZE" value={d.size} />
          <Row label="ROLE" value={d.role} />
          <Row label="FASHION" value={d.fashion} />
          <Row label="RARITÀ" value={d.rarity} />
          <Row label="TEMPERAMENTO" value={d.mood_secondary ? `${d.mood_primary} · ${d.mood_secondary}` : d.mood_primary} />
        </div>
      </section>

      <section className="dossier__block">
        <p className="t-meta dossier__label">{t.splash.story}</p>
        <p className="t-small dossier__story">{readableBio(mon).story}</p>
        <p className="t-micro dossier__note">{d.generation_reason_summary}</p>
      </section>

      <div className="dossier__sigil">
        <Sigil seed={mon.sigil} size={40} />
      </div>
    </div>
  );
}
