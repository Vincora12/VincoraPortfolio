/* ============================================================================
   DEV → CREATURA → CATALOGHI (§20.3)

   🔷 «Nel dev mettimi una sezione con tutte le famiglie e gli stili che si
   attivano, così posso attivare e spegnere io quello che mi piace dopo varie
   prove.»

   E il MASTER CHARACTER SYSTEM v1.1 §12 lo chiede per iscritto sui designer:
   «Approval means the designer remains in the active library; rejection
   removes it from active selection.»

   ════════════════════════════════════════════════════════════════════════════
   🔒 SPEGNERE NON CANCELLA NIENTE.

   Una voce spenta resta nel catalogo e i .mon già nati con quella voce restano
   identici. Cambia solo che non viene più estratta. La schermata lo dice in
   testa, perché la paura di rovinare qualcosa è la ragione per cui uno non
   prova — e questa sezione esiste per far provare.
   ════════════════════════════════════════════════════════════════════════════

   ⚠️ E NON SI PUÒ SPEGNERE TUTTO: `catalogTuning` rifiuta in blocco e dice
   perché. Le Family devono restarne almeno due — con una sola ogni creatura
   nasce della stessa specie e il motore smette di essere un motore.
   ========================================================================= */

import { useState } from 'react';
import { Button } from '../system/components';
import {
  AXES,
  CATALOG_AXES,
  catalogSummary,
  enabled,
  isEnabled,
  isOffByDefault,
  resetCatalog,
  setCatalogEnabled,
  type CatalogAxis,
} from '../engine/catalogTuning';
import { DESIGN_DNA, DESIGN_DNA_RETIRED, designDnaDef } from '../engine/generation-config';

export function CatalogSection() {
  /* Il registro vive fuori da React (lo legge il motore, non un componente):
     questo contatore serve solo a far ridisegnare la schermata dopo un tocco. */
  const [, bump] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [open, setOpen] = useState<CatalogAxis>('family');

  const toggle = (axis: CatalogAxis, id: string) => {
    const problems = setCatalogEnabled(axis, id, !isEnabled(axis, id));
    setProblem(problems[0] ?? null);
    bump((n) => n + 1);
  };

  const summary = catalogSummary();

  return (
    <div className="dev__section">
      <p className="t-micro dev__note">
        Spegnere non cancella: la voce resta, e i .mon già nati con quella
        restano come sono. Cambia solo che non viene più estratta per le
        creature che devono ancora nascere.
      </p>

      {/* Il riepilogo prima del dettaglio: apri questa schermata per sapere
          «cosa ho spento», non per leggere centoventi voci. */}
      <p className="t-meta dev__label">ACCESI</p>
      <div className="cat__summary">
        {summary.map((s) => (
          <button
            key={s.axis}
            type="button"
            className="cat__chip"
            aria-current={open === s.axis ? 'true' : undefined}
            onClick={() => setOpen(s.axis)}
          >
            <span className="t-micro">{AXES[s.axis].label}</span>
            <strong className={s.on < s.total ? 'cat__count cat__count--cut' : 'cat__count'}>
              {s.on}/{s.total}
            </strong>
          </button>
        ))}
      </div>

      {problem && <p className="t-micro cat__bad">{problem}</p>}

      <p className="t-meta dev__label">{AXES[open].label}</p>
      <p className="t-micro dev__note">{AXES[open].it}</p>

      <ul className="cat__list">
        {AXES[open].all.map((id) => {
          const on = isEnabled(open, id);
          return (
            <li key={id}>
              <button
                type="button"
                className="cat__row"
                aria-pressed={on}
                onClick={() => toggle(open, id)}
              >
                <span className="cat__box" aria-hidden="true">
                  {on ? '×' : ''}
                </span>
                <span className="t-meta cat__name">{id}</span>
                {isOffByDefault(open, id) && (
                  <span className="t-micro cat__note">spenta di partenza — si può riaccendere</span>
                )}
                {open === 'design' && (
                  <span className="t-micro cat__note">
                    densità {designDnaDef(id).density}/5 · {designDnaDef(id).it}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {/* 🔒 I ritirati si VEDONO, spenti e non riaccendibili. Un nome tolto da
          un elenco non lascia traccia: fra sei mesi qualcuno rilegge un
          documento vecchio, non lo trova qui, e lo rimette pensando che manchi
          per sbaglio. Kaneko era attivo nelle versioni precedenti del master;
          la v1.1 lo dichiara NOT ACTIVE / DO NOT SELECT. */}
      {open === 'design' && (
        <>
          <p className="t-meta dev__label">FUORI DALLA LIBRERIA</p>
          <ul className="cat__list">
            {DESIGN_DNA_RETIRED.map((id) => (
              <li key={id} className="cat__row cat__row--retired">
                <span className="cat__box" aria-hidden="true" />
                <span className="t-meta cat__name">{id}</span>
                <span className="t-micro cat__note">
                  il master v1.1 lo dichiara NOT ACTIVE: non si riaccende da qui
                </span>
              </li>
            ))}
          </ul>
          <p className="t-micro dev__note">
            Per provarli uno alla volta (master §12): lascia acceso un designer
            solo, blocca la resa su una sola voce, e genera. Cambia soltanto la
            costruzione — così quello che vedi è dovuto al designer e non a
            dodici cose insieme.
          </p>
        </>
      )}

      <div className="dev__row">
        <Button small onClick={() => { resetCatalog(open); setProblem(null); bump((n) => n + 1); }}>
          RIPORTA {AXES[open].label} AI PREDEFINITI
        </Button>
        <Button small onClick={() => { resetCatalog(); setProblem(null); bump((n) => n + 1); }}>
          TUTTO AI PREDEFINITI
        </Button>
      </div>

      {/* Il conto che serve davvero: quante creature diverse restano possibili
          dopo aver spento. È il numero che rende una potatura una scelta
          invece che un capriccio. */}
      <p className="t-micro dev__note cat__space">
        Combinazioni ancora possibili:{' '}
        <strong>{combinations().toLocaleString('it-IT')}</strong>
        {DESIGN_DNA.length > 0 && ` · designer accesi: ${enabled('design').length}`}
      </p>
    </div>
  );
}

/**
 * Il prodotto delle voci accese sugli assi indipendenti.
 *
 * ⚠️ È una STIMA per eccesso e va detto: gli assi non sono davvero
 * indipendenti — l'archetipo dipende dalla Family, e alcune combinazioni le
 * regole anatomiche le scartano. Serve a vedere l'ordine di grandezza mentre
 * spegni, non a dichiarare un numero esatto.
 */
function combinations(): number {
  return CATALOG_AXES.reduce((n, axis) => n * Math.max(1, enabled(axis).length), 1);
}
