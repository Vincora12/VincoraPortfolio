/* ============================================================================
   DEV → COSTI (MASTER SPEC v1.9 §18.1)

   §18 chiedeva «log cost by request/subsystem in DEV». Questo lo mostra.

   ⚠️ Due avvertenze che stanno in schermata e non solo qui, perché chi legge
   un numero in dollari tende a crederci:

   1. **I prezzi sono cablati e stimati.** Sono l'unico dato del progetto che
      non posso verificare dal codice: cambiano quando vuole chi vende il
      modello. Vanno ricontrollati sul listino.
   2. **Il conto vale per questa sessione.** Non è persistito: ricaricare la
      pagina azzera. È telemetria di sviluppo, non contabilità.

   Sotto c'è anche lo stato delle AI per le immagini, che è la cosa più utile
   da sapere qui dentro: **non ce ne sono**. La pipeline immagini del prototipo
   è manuale per scelta documentata (§22), e questa schermata lo dice invece di
   lasciarlo scoprire cercando un pulsante che non esiste.
   ========================================================================= */

import { useSyncExternalStore } from 'react';
import { Button, Row, SystemLabel } from '../system/components';
import {
  clearUsage,
  formatCost,
  PRICES,
  recentUsage,
  subscribeToUsage,
  usageTotals,
} from '../ai/usage';
import { ASSET_TYPES, GENERATION_STAGES, frameCount, totalFrames } from '../engine/assets';

const SUBSYSTEM_LABELS: Record<string, string> = {
  introduction: 'presentazione alla nascita',
  reply: 'risposte in chat',
  photo: 'lettura delle foto',
  image: 'generazione immagini',
};

export function CostSection() {
  // Il registro vive fuori da zustand: è telemetria, non stato di prodotto.
  const version = useSyncExternalStore(
    subscribeToUsage,
    () => usageTotals().calls,
    () => 0,
  );
  void version;

  const totals = usageTotals();
  const recent = recentUsage();

  return (
    <div className="dev__section">
      <p className="t-meta dev__label">QUESTA SESSIONE</p>
      <div className="rowlist">
        <Row label="CHIAMATE" value={String(totals.calls)} />
        <Row label="TOKEN IN INGRESSO" value={totals.inputTokens.toLocaleString('it-IT')} />
        <Row label="TOKEN IN USCITA" value={totals.outputTokens.toLocaleString('it-IT')} />
        <Row label="STIMA" value={formatCost(totals.cost)} />
      </div>

      <p className="t-micro dev__note">
        Prezzi cablati e stimati, non letti da un listino: vanno ricontrollati
        prima di farci un ragionamento. Il conto è di questa sessione e
        ricaricare la pagina lo azzera.
      </p>

      {totals.bySubsystem.length > 0 && (
        <>
          <p className="t-meta dev__label">DOVE SE NE VA</p>
          <div className="rowlist">
            {totals.bySubsystem.map((s) => (
              <Row
                key={s.subsystem}
                label={SUBSYSTEM_LABELS[s.subsystem] ?? s.subsystem}
                value={`${s.calls}× · ${formatCost(s.cost)}`}
              />
            ))}
          </div>
        </>
      )}

      {recent.length > 0 && (
        <>
          <p className="t-meta dev__label">ULTIME CHIAMATE</p>
          <div className="rowlist">
            {recent.map((e, i) => (
              <Row
                key={i}
                label={`${SUBSYSTEM_LABELS[e.subsystem] ?? e.subsystem} · ${e.model}`}
                value={`${e.inputTokens}→${e.outputTokens} · ${formatCost(e.cost)}`}
              />
            ))}
          </div>
        </>
      )}

      <Button small block variant="ghost" onClick={clearUsage} disabled={totals.calls === 0}>
        AZZERA IL CONTATORE
      </Button>

      <p className="t-meta dev__label">PREZZI USATI (🟡 DA RICONTROLLARE)</p>
      <div className="rowlist">
        {Object.entries(PRICES)
          .filter(([k]) => k !== 'default')
          .map(([model, p]) => (
            <Row key={model} label={model} value={`$${p.input} / $${p.output} per 1M`} />
          ))}
      </div>

      {/* --- Immagini --------------------------------------------------------- */}

      <p className="t-meta dev__label">AI PER LE IMMAGINI</p>
      <div className="dev__imagestate">
        <SystemLabel tone="warning">NON COLLEGATA</SystemLabel>
        <p className="t-small dev__note">
          La pipeline immagini è manuale per scelta (§22): il prototipo compila
          i prompt e li esporta, le immagini le genera una persona e le
          reimporta da DEV → ASSET. Nessuna chiamata, nessun costo.
        </p>
        <p className="t-small dev__note">
          Collegarla è un lavoro vero, non una chiave da incollare: servono un
          modello che accetti un'immagine di riferimento — senza, i {totalFrames()}{' '}
          frame di un .mon non restano lo stesso personaggio — e un posto dove
          mettere i file che non sia il browser.
        </p>
      </div>

      <p className="t-meta dev__label">COSA ANDREBBE GENERATO, E IN CHE ORDINE</p>
      {GENERATION_STAGES.map((stage) => (
        <div key={stage.stage} className="dev__stage">
          <p className="t-meta">
            STADIO {stage.stage} · {stage.label}
          </p>
          <p className="t-micro dev__note">{stage.note}</p>
          <div className="rowlist">
            {ASSET_TYPES.filter((a) => a.stage === stage.stage).map((a) => (
              <Row
                key={a.type}
                label={a.label}
                value={frameCount(a.type) === 1 ? '1 immagine' : `${frameCount(a.type)} frame`}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="rowlist">
        <Row label="TOTALE PER .MON" value={`${ASSET_TYPES.length} generazioni`} />
        <Row label="FRAME DISEGNATI" value={String(totalFrames())} />
      </div>
    </div>
  );
}
