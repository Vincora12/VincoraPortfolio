/* ============================================================================
   DEV → COSTI (MASTER SPEC v1.9 §18.1)

   §18 chiedeva «log cost by request/subsystem in DEV». Questo lo mostra.

   🔴 «Io non vedo quanto speso fin ora anche se ho azzerato il gioco i soldi
   spesi devono rimanere.» Il numero VERO già esisteva e già sopravvive a
   RICOMINCIA DA CAPO — vive sul server (`spend.ts`, Netlify Blobs, una chiave
   per mese), non nella partita, e `resetAll` non lo tocca. Ma questa schermata
   non lo mostrava: mostrava solo il conto di sessione, che è un'altra cosa e
   sta sotto. E diceva pure una bugia — «immagini non collegate» — scritta
   quando la pipeline immagini era ancora manuale (§22 di un'epoca precedente).
   Oggi le immagini si generano davvero, costano davvero, e sono la voce più
   grossa: `evolution-background.ts` e `lab-duel-background.ts` le registrano
   sullo stesso ledger.

   Due avvertenze che restano vere e stanno in schermata, non solo qui:

   1. **I prezzi sono cablati e stimati.** Sono l'unico dato del progetto che
      non posso verificare dal codice: cambiano quando vuole chi vende il
      modello. Vanno ricontrollati sul listino.
   2. **Il conto di SESSIONE, sotto, non è quello reale.** Conta solo testo,
      vive in un array in memoria (`usage.ts`), e ricaricare la pagina lo
      azzera — utile per capire cosa è appena successo, non quanto hai speso
      in totale. Il numero che conta è quello in cima.
   ========================================================================= */

import { useEffect, useState } from 'react';
import { useSyncExternalStore } from 'react';
import { useApp } from '../state/store';
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

/** Il numero vero: quanto ha speso questo mese, letto dal server. Sopravvive a
    RICOMINCIA DA CAPO perché non vive nella partita — vive in `spend.ts`. */
function RealSpend() {
  const token = useApp((s) => s.token);
  const [state, setState] = useState<
    { spentUsd: number; capUsd: number; month: string } | null | 'loading' | 'error'
  >('loading');

  useEffect(() => {
    if (!token) {
      setState('error');
      return;
    }
    let cancelled = false;
    void import('../ai/backend').then(({ loadSetup }) =>
      loadSetup(token).then(({ data }) => {
        if (cancelled) return;
        setState(
          data && typeof data.spentUsd === 'number' && typeof data.capUsd === 'number'
            ? { spentUsd: data.spentUsd, capUsd: data.capUsd, month: data.month ?? '' }
            : 'error',
        );
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state === 'loading') {
    return <p className="t-micro dev__note">sto chiedendo al server…</p>;
  }
  if (state === 'error' || !state) {
    return (
      <p className="t-micro dev__note">
        il server non risponde — senza token non c'è niente da chiedere.
      </p>
    );
  }

  const ratio = state.capUsd > 0 ? state.spentUsd / state.capUsd : 0;
  return (
    <>
      <div className="rowlist">
        <Row
          label={`SPESO A ${state.month.toUpperCase()}`}
          value={`$${state.spentUsd.toFixed(2)} su $${state.capUsd.toFixed(2)}`}
        />
      </div>
      {ratio >= 0.75 && (
        <p className="t-micro dev__note">
          <SystemLabel tone={ratio >= 1 ? 'alert' : 'warning'}>
            {ratio >= 1 ? 'TETTO RAGGIUNTO' : 'VICINO AL TETTO'}
          </SystemLabel>{' '}
          {ratio >= 1
            ? 'il server rifiuta nuove chiamate finché non cambia il mese.'
            : 'oltre il 75% del tetto mensile.'}
        </p>
      )}
      <p className="t-micro dev__note">
        Vive sul server, conta TUTTO — testo e immagini — e RICOMINCIA DA CAPO
        non lo tocca: quello cancella la partita, non i soldi già spesi.
      </p>
    </>
  );
}

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
      <p className="t-meta dev__label">QUANTO HAI SPESO — IL NUMERO VERO</p>
      <RealSpend />

      <p className="t-meta dev__label">
        QUESTA SESSIONE (stima parziale — solo testo, solo questo browser)
      </p>
      <div className="rowlist">
        <Row label="CHIAMATE" value={String(totals.calls)} />
        <Row label="TOKEN IN INGRESSO" value={totals.inputTokens.toLocaleString('it-IT')} />
        <Row label="TOKEN IN USCITA" value={totals.outputTokens.toLocaleString('it-IT')} />
        <Row label="STIMA" value={formatCost(totals.cost)} />
      </div>

      <p className="t-micro dev__note">
        Prezzi cablati e stimati, non letti da un listino: vanno ricontrollati
        prima di farci un ragionamento. Questo conto NON include le immagini
        (vedi sotto) e ricaricare la pagina lo azzera: è utile per capire cosa
        è appena successo in questa scheda, non quanto hai speso davvero — per
        quello c'è il numero in cima.
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
        <SystemLabel tone="character">COLLEGATA E A PAGAMENTO</SystemLabel>
        <p className="t-small dev__note">
          {/* 🔴 Diceva «NON COLLEGATA» — vero quando la pipeline era manuale
              (§22 di un'epoca precedente), falso oggi: le immagini si
              generano davvero e sono la voce di costo più grossa. */}
          Genera davvero, chiamata per chiamata: `evolution-background.ts` per
          l'evoluzione, `lab-duel-background.ts` per il duello del LAB. Ogni
          chiamata paga e finisce nel numero vero in cima a questa pagina, MAI
          nel conto di sessione qui sopra — quello non le vede.
        </p>
        <p className="t-small dev__note">
          Quanto costano per creatura, e come abbassarle in bozza, sono in
          DEV → MODELLI. Qui c'è solo quanto ne sono già uscite: {totalFrames()}{' '}
          frame possibili per un .mon completo, contando anche i tre asset
          storici che oggi non si generano più (segnati LEGACY sotto).
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
