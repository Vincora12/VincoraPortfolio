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
import { IdleMon, Sticker } from '../system/LiveMon';
import { EggVessel } from '../system/EggVessel';
import { MonName, SpeciesName } from '../system/MonName';
import { Sigil } from '../system/AssetSlot';
import { Row } from '../system/components';
import { BioPanel } from './BioPanel';
import { birthStatsFor } from '../engine/birthStats';
import { STAT_LABELS, formatSignal } from '../engine/health';
import { displayName } from '../engine/types';
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
      <div className="splash__id">
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
            </div>
          </>
        )}
      </div>

      {/* 🔷 v1.15 §13.12 — L'INGRESSO È UN PULSANTE, NON UNA SUPERFICIE.

          Un pulsante con scritto cosa fa è più chiaro di una superficie che si
          tocca e basta, e non litiga con lo scroll. */}
      {/* ⚠️ L'INVOLUCRO ESISTE PER L'ADESIVO, e non poteva essere il pulsante.
          Un adesivo dentro il pulsante sarebbe parte del bersaglio: appoggiare
          il dito lì sopra aprirebbe la chat. Fuori, e con il tocco disattivato
          (vedi `.sticker`), il pulsante resta grande quanto sembra. */}
      <div className="splash__door">
        <button type="button" className="splash__enter" onClick={enter}>
          <span className="t-display">{incubating ? t.splash.chat : t.splash.talk}</span>
          <span aria-hidden="true">→</span>
        </button>
        {!incubating && mon && (
          <Sticker monName={mon.data.name} alt={displayName(mon.data.name)} n={3} className="stick--door" />
        )}
      </div>

      {/* ======================================================================
          QUELLO CHE STA SOTTO.

          🔒 LA REGOLA DI COSA SCENDE QUI: sotto la foto va quello che il
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
      <section className="dossier__block dossier__block--stickered">
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
        {/* 🔒 PERCHÉ È FATTO COSÌ, sotto le etichette che lo dicono. Stava in
            fondo al blocco «la sua storia», che è uscito, e non è una cosa
            che si butta con la scatola: è l'unica riga dell'app che collega
            questi assi ai giorni che li hanno prodotti. */}
        <p className="t-micro dossier__note">{d.generation_reason_summary}</p>
      </section>

      {/* 🔒 IL SIGILLO STA DA SOLO IN MEZZO A UNA RIGA VUOTA: è l'ultimo
          punto della pagina dove c'è spazio vero, e l'unico posto del dossier
          dove un adesivo non finisce addosso a una riga di testo. */}
      <div className="dossier__sigil">
        <Sigil seed={mon.sigil} size={40} />
        <Sticker monName={d.name} alt={displayName(d.name)} n={5} className="stick--sigil" />
      </div>
    </div>
  );
}
