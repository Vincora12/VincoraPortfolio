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
import { useApp, useActiveMon, useGrowth, useIncubation } from '../state/store';
import { IdleMon, Sticker } from '../system/LiveMon';
import { EggVessel } from '../system/EggVessel';
import { MonName, SpeciesName } from '../system/MonName';
import { Sigil } from '../system/AssetSlot';
import { Button, HoldButton, Row } from '../system/components';
import { BioPanel } from './BioPanel';
import { birthStatsFor } from '../engine/birthStats';
import { STAT_LABELS, formatSignal } from '../engine/health';
import { displayName, type MonRecord } from '../engine/types';
import { haptic } from '../system/haptics';
import { t } from '../i18n/it';
import { GenerationDial } from '../system/GenerationDial';

export function SplashScreen({ onEnter, previewMonName }: { onEnter: () => void; previewMonName?: string }) {
  const phase = useApp((s) => s.phase);
  const activeMon = useActiveMon();
  const previewMon = useApp((s) => previewMonName ? (s.mons[previewMonName] ?? null) : null);
  const mon = previewMon ?? activeMon;
  const inc = useIncubation();
  const health = useApp((s) => s.health);
  const evolutionJob = useApp((s) => s.evolutionJob);
  const revealFormEvolution = useApp((s) => s.revealFormEvolution);
  const openFormEvolution = useApp((s) => s.openFormEvolution);
  const retryFormEvolution = useApp((s) => s.retryFormEvolution);
  const { formEvolutionReady } = useGrowth();

  /* Il tocco sull'uovo. `pokes` rimonta il componente, e rimontarlo fa
     ripartire l'animazione di salto dall'inizio: è il modo più semplice di
     far succedere una cosa adesso invece che al prossimo ciclo.

     ⚠️ Sta PRIMA del `return null` qui sotto. Uno `useState` dopo un'uscita
     condizionale cambia l'ordine degli hook fra un render e l'altro, e React
     se ne accorge solo a schermo — TypeScript no. */
  const [pokes, setPokes] = useState(0);

  const incubating = !previewMonName && phase === 'incubation';
  const firstHatchJob = !previewMonName && !incubating && evolutionJob?.kind === 'hatch'
    ? evolutionJob
    : null;
  if (!incubating && !mon) return null;

  const enter = () => {
    haptic('tick');
    onEnter();
  };

  const poke = () => {
    haptic('tick');
    setPokes((n) => n + 1);
  };

  /* Il primo MON non viene mai mostrato a pezzi. Il record deve esistere per
     consentire al backend di costruirne gli asset, ma nome, scheda e slot
     vuoti restano dietro questa soglia fino alla conclusione del lavoro. */
  if (firstHatchJob) {
    return (
      <div className="splash hatchwait" aria-live="polite">
        <div className="hatchwait__center">
          {firstHatchJob.status === 'running' ? (
            <>
              <GenerationDial done={firstHatchJob.done} total={firstHatchJob.total} />
              <strong className="t-display">IL TUO PRIMO MON STA NASCENDO</strong>
              <div className="hatchwait__track" aria-label={`In corso: ${firstHatchJob.label}`}>
                <span className="t-meta">{firstHatchJob.label}</span>
              </div>
            </>
          ) : firstHatchJob.status === 'ready' ? (
            <>
              <strong className="t-display">IL TUO PRIMO MON È PRONTO</strong>
              <Button block variant="character" onClick={revealFormEvolution}>
                SCOPRILO
              </Button>
            </>
          ) : (
            <>
              <strong className="t-display">LA CREAZIONE SI È FERMATA</strong>
              <span className="t-small">{firstHatchJob.error}</span>
              <Button block variant="character" onClick={retryFormEvolution}>
                RIPROVA
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="splash">
      {!previewMonName && !incubating && evolutionJob?.status === 'ready' ? (
        <HoldButton className="splash__evolution-hold" onComplete={revealFormEvolution}>
          {evolutionJob.kind === 'hatch' ? 'PRIMO MON PRONTO' : 'NUOVO MON PRONTO'}
        </HoldButton>
      ) : !previewMonName && !incubating && (evolutionJob || formEvolutionReady) ? (
        <button
          type="button"
          className={`splash__evolution ${evolutionJob ? `splash__evolution--${evolutionJob.status}` : ''}`}
          disabled={evolutionJob?.status === 'running'}
          onClick={() => evolutionJob?.status === 'error' ? retryFormEvolution() : !evolutionJob ? openFormEvolution() : undefined}
        >
          <span className="splash__evolution-copy">
            <strong className="t-meta">
              {!evolutionJob
                ? 'EVOLUZIONE DISPONIBILE'
                : evolutionJob.status === 'running'
                  ? evolutionJob.kind === 'hatch' ? 'PRIMO MON IN CREAZIONE' : 'NUOVO MON IN CREAZIONE'
                  : 'GENERAZIONE INTERROTTA'}
            </strong>
            <span className="t-micro">{evolutionJob?.label ?? 'TOCCA PER SCEGLIERE'}</span>
          </span>
          {evolutionJob?.status === 'running'
            ? <GenerationDial done={evolutionJob.done} total={evolutionJob.total} />
            : <span className="splash__evolution-arrow" aria-hidden="true">→</span>}
        </button>
      ) : null}
      {/* ══════════════════════════════════════════════════════════════════════
          🔷 «Nome in alto. Sulla foto adesivi attaccati delle varie
             espressioni, come se fosse sticker, in basso. Poi abbiamo bio e
             doodle e altre cose su di lui, tutto nella prima schermata a
             scorrimento.»

          🔶 L'ORDINE È CAMBIATO, E IL CAMBIO HA UNA RAGIONE OLTRE AL GUSTO.
          Il nome stava SOTTO la figura: si guardava una creatura senza sapere
          chi fosse e poi si scopriva come si chiamava. Sopra, la pagina si
          legge come una scheda — prima di chi parliamo, poi la sua faccia,
          poi cosa c'è da sapere.

          🔒 In incubazione il nome non c'è ancora, e non si inventa un
          segnaposto: al suo posto sta il conto dei giorni, che è l'unica cosa
          vera in quel momento.
          ══════════════════════════════════════════════════════════════════ */}
      <div className="splash__id" data-pezzo="nome">
        {/* 🔶 QUI C'ERA UN ADESIVO, IN ALTO A SINISTRA, ED È USCITO.

            🔷 «Attenzione: mettili in punti dove, anche se il testo è più
               lungo, non viene coperto. Tipo in alto a sinistra non lo
               metterei.»

            Ha ragione, e la ragione è misurabile: il nome è generato, va da 4
            a 9 caratteri di stem, e `MonName fit` gli fa occupare tutta la
            larghezza disponibile. Un nome corto lascia i lati liberi, uno
            lungo no — e siccome il corpo si adatta, il nome CRESCE fino a
            riempire lo spazio invece di lasciarne. Quel posto è sicuro solo
            per certi nomi, e quali nomi escano non lo decidiamo noi.

            🔒 È il posto dove l'adesivo NON va, e lo dico qui perché è dove
            si tornerebbe a metterlo. */}
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

      {/* La foto. Tutto lo spazio va alla creatura: è il motivo per cui la
          schermata esiste.

          ⚠️ NON è un pulsante. Lo era, e apriva la chat — ma un tocco che
          parte da qui compete con lo scroll della pagina, e su un telefono
          vince sempre il tocco per sbaglio. Alla chat si va dalla porta. */}
      <div className="splash__stage" data-pezzo="foto">
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
          <>
            {/* 🔷 v1.11 §23.3 — la creatura non gira: respira. Qui c'era il
                visore a trascinamento, uscito insieme al suo asset.

                🔶 E adesso sta ferma: «non farlo fluttuare, tienilo fisso».
                Togliere `still` è tutto quello che serve per riavere il
                respiro. */}
            {/* ⚠️ L'INVOLUCRO NON È DECORATIVO: stringe sulla foto vera, e gli
                adesivi si ancorano a LUI, non al riquadro alto mezza videata.
                Ancorati al riquadro restavano sospesi sotto la creatura. */}
            <div className="splash__photo">
              <IdleMon monName={mon!.data.name} alt={displayName(mon!.data.name)} still />
              {/* A cavallo dei bordi, non allineati dentro: è la differenza fra
                  un adesivo attaccato e una didascalia. */}
              <Sticker monName={mon!.data.name} alt={displayName(mon!.data.name)} n={1} className="stick--photoL" />
              <Sticker monName={mon!.data.name} alt={displayName(mon!.data.name)} n={2} className="stick--photoR" />
              <Sticker monName={mon!.data.name} alt={displayName(mon!.data.name)} n={3} className="stick--photoC" />
            </div>
          </>
        )}
      </div>

      {/* Durante l'incubazione questa resta l'unica porta disponibile. Dopo la
          nascita PARLAGLI esce: la Chat ha già la propria voce nel nav fisso e
          qui lo spazio appartiene interamente alla creatura e agli sticker. */}
      {incubating && (
        <div className="splash__door">
          <button type="button" className="splash__enter" onClick={enter}>
            <span className="t-display">{t.splash.chat}</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      )}

      {/* ======================================================================
          QUELLO CHE STA SOTTO.

          🔒 LA REGOLA DI COSA SCENDE QUI: sotto la foto va quello che il
          personaggio È. Quello che è storia o macchinario resta dov'è —
          l'Heritage sta nella Mindline, perché parla di chi c'era PRIMA di
          lui, non di lui; il calendario e la timeline hanno la loro tab.

          Senza una regola, «tutto in una pagina» diventa un cruscotto.
          ==================================================================== */}
      {!incubating && mon && <MonDossier health={health} mon={mon} />}
    </div>
  );
}

/* --- Il dossier sotto la faccia -------------------------------------------- */

function MonDossier({ health, mon }: { health: Parameters<typeof birthStatsFor>[0]; mon: MonRecord }) {
  const d = mon.data;
  const birth = birthStatsFor(health, d.generated_at_day);

  return (
    <div className="dossier" data-pezzo="dossier">
      {/* --- BIO E DOODLE, PER PRIMI -----------------------------------------
          🔷 «Poi abbiamo bio e doodle e altre cose su di lui.»

          🔶 QUI C'ERA UN BLOCCO «LA SUA STORIA» CHE STAMPAVA LA SOLA PRIMA
          RIGA della bio, ed è uscito. Non l'ho spostato: era un riassunto di
          una cosa che esiste già intera altrove, e due versioni della stessa
          bio in due schermate diverse invecchiano separate.

          🔒 È LO STESSO `BioPanel` DELLA SCHEDA, non una copia impaginata
          uguale. Il quaderno — racconto, appunti, disegno, cose che si porta
          dietro, etichette — si scrive in un posto solo: se domani cambia,
          cambia in tutti e due i posti perché è lo stesso componente.

          ⚠️ E IL DOODLE RESTA DENTRO DI LUI, non lo tiro fuori per metterlo
          in cima. GB §12: il doodle è il linguaggio della BIO, non un
          Appearance — sta a metà pagina perché è un disegno fatto mentre si
          scriveva, e in cima diventerebbe una copertina.
          -------------------------------------------------------------------- */}
      <section className="dossier__block dossier__block--stickered" data-pezzo="bio">
        {/* 🔒 STA NELLA FASCIA VUOTA SOPRA L'ETICHETTA, non addosso al testo:
            il blocco qui sotto si apre uno spazio apposta (vedi
            `.dossier__block--stickered`), e l'adesivo ci vive dentro. Lo
            spazio non è decorativo — è la condizione perché il testo, per
            quanto cresca, non incontri mai l'adesivo. */}
        <Sticker monName={d.name} alt={displayName(d.name)} n={0} className="stick--bio" />
        <p className="t-meta dossier__label">{t.bio.title}</p>
        <BioPanel
          mon={mon}
          sticker={
            <Sticker monName={d.name} alt={displayName(d.name)} n={4} className="stick--doodle" />
          }
        />
      </section>

      {/* --- LE STATISTICHE, CONGELATE ---------------------------------------
          La differenza con la schermata ME è tutto il punto e va detta a
          parole, non lasciata dedurre: là ci sono i tuoi numeri di OGGI, qui
          quelli del giorno in cui è nato lui. Un .mon è la fotografia di un
          momento, e questi numeri sono la sua anatomia — se seguissero i tuoi
          di adesso sarebbe un grafico della tua salute con sopra una faccia.
          -------------------------------------------------------------------- */}
      <section className="dossier__block" data-pezzo="statistiche">
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

      <section className="dossier__block" data-pezzo="identita">
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
        {/* 🔒 PERCHÉ È FATTO COSÌ, sotto le etichette che lo dicono. Stava in
            fondo al blocco «la sua storia», che è uscito, e non è una cosa
            che si butta con la scatola: è l'unica riga dell'app che collega
            questi assi ai giorni che li hanno prodotti. */}
        <p className="t-micro dossier__note">{d.generation_reason_summary}</p>
      </section>

      {/* 🔒 IL SIGILLO STA DA SOLO IN MEZZO A UNA RIGA VUOTA: è l'ultimo
          punto della pagina dove c'è spazio vero, e l'unico posto del dossier
          dove un adesivo non finisce addosso a una riga di testo. */}
      <div className="dossier__sigil" data-pezzo="sigillo">
        <Sigil seed={mon.sigil} size={40} />
        <Sticker monName={d.name} alt={displayName(d.name)} n={5} className="stick--sigil" />
      </div>
    </div>
  );
}
