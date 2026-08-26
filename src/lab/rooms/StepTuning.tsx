/* ============================================================================
   I COMANDI DI UN PASSO DEL FLUSSO

   🔷 «Devo poter provare questo flow e devo anche poterlo modificare. Poter
      controllare com'è il valore degli occhiali — da sole, da vista, quali
      sono gli occhiali nel mio DNA — e dirti: fai in modo che escano di più
      quelli da vista. E quindi poi lo provo.»

   Due tipi di manopola, perché sono due domande diverse:

     ACCESO / SPENTO   per i cataloghi (Family, affinità, ruolo, stile, umore,
                       resa, designer). Passa da `catalogTuning`, che è quello
                       che il motore legge davvero.

     PESO 0 → 5        per gli assi che prima non si potevano toccare per
                       niente, occhiali compresi. Passa da `axisTuning`.

   ⚠️ E «PROVA» NON È UNA DEMO. Genera davvero N creature col generatore vero
   e conta cosa è uscito. È l'unico modo di rispondere alla domanda che uno si
   fa dopo aver spostato un cursore — «ha funzionato?» — senza aspettare
   settimane di creature vere.

   🔒 Le creature della prova NON entrano nella storia: nascono, si contano e
   si buttano.
   ========================================================================= */

import { useState } from 'react';
import { useApp } from '../../state/store';
import {
  PESO_MAX,
  resetAxis,
  setWeight,
  tuned,
  weightOf,
  type WeightedAxis,
} from '../../engine/axisTuning';
import {
  AXES,
  isEnabled,
  isOffByDefault,
  resetCatalog,
  setCatalogEnabled,
  type CatalogAxis,
} from '../../engine/catalogTuning';
import { StepAB } from './StepAB';
import type { BersaglioAB } from './testMon';
import '../skin/flow-tuning.css';

/** Da dove leggere il valore uscito, per contare la distribuzione. */
type Lettore = (d: Record<string, unknown>) => string | null;

export type AsseDelPasso =
  | { tipo: 'catalogo'; asse: CatalogAxis; leggi: Lettore }
  | { tipo: 'peso'; asse: WeightedAxis; voci: readonly { id: string; it: string }[]; leggi: Lettore };

/**
 * Il valore che le tue modifiche favoriscono di più.
 *
 * 🔒 Serve a proporre B da solo: se hai appena spinto OPTICAL EDITORIAL a ×5,
 * il confronto che vuoi è contro quello — non contro il primo della lista.
 * Se non hai spinto niente, non si propone niente e scegli tu.
 */
function piuSpinto(a: Extract<AsseDelPasso, { tipo: 'peso' }>): string | null {
  let top: { id: string; w: number } | null = null;
  for (const v of a.voci) {
    const w = weightOf(a.asse, v.id);
    if (w > 1 && (!top || w > top.w)) top = { id: v.id, w };
  }
  return top?.id ?? null;
}

export function StepTuning({ assi }: { assi: AsseDelPasso[] }) {
  const [, ridisegna] = useState(0);
  const [prova, setProva] = useState<{ asse: string; conte: [string, number][]; totale: number } | null>(null);
  const [gira, setGira] = useState(false);

  const tocca = () => ridisegna((n) => n + 1);

  /* ==========================================================================
     LA PROVA

     Prova rapida da 5 creature: verifica subito se il filtro scelto viene
     rispettato. Non sostituisce la verifica statistica completa.
     ====================================================================== */
  const generaEConta = async (a: AsseDelPasso) => {
    setGira(true);
    try {
      const { generateFirstMon } = await import('../../engine/characterGenerator');
      const { generatorInput } = await import('../../state/store');
      const { randomSeed } = await import('../../engine/rng');
      const input = generatorInput(useApp.getState());

      const conte = new Map<string, number>();
      const N = 5;
      for (let i = 0; i < N; i++) {
        const r = generateFirstMon({
          input,
          mindlineNodeId: 'lab-prova',
          originNodeId: null,
          lineageNames: [],
          seed: randomSeed(),
          devUnlockAll: false,
          hiddenEvent: false,
        });
        const v = a.leggi(r.record.data as unknown as Record<string, unknown>);
        if (v) conte.set(v, (conte.get(v) ?? 0) + 1);
      }

      setProva({
        asse: a.asse,
        conte: [...conte.entries()].sort((x, y) => y[1] - x[1]),
        totale: N,
      });
    } finally {
      setGira(false);
    }
  };

  return (
    <>
      {assi.map((a) => (
        <div className="tune" key={a.asse}>
          <div className="tune__head">
            <b>
              {a.tipo === 'catalogo' ? AXES[a.asse].label : a.asse.toUpperCase()}
              {a.tipo === 'peso' && tuned(a.asse) ? ' · TARATO' : ''}
            </b>
            <small>
              {a.tipo === 'catalogo'
                ? AXES[a.asse].it
                : 'quanto spesso deve uscire · 1 = come le altre, 0 = mai'}
            </small>
          </div>

          {a.tipo === 'catalogo'
            ? AXES[a.asse].all.map((id) => {
                const on = isEnabled(a.asse, id);
                return (
                  <div className={`tune__row ${on ? '' : 'tune__row--off'}`} key={id}>
                    <span>{id}</span>
                    <button
                      type="button"
                      className={`tune__toggle ${on ? '' : 'tune__toggle--off'}`}
                      onClick={() => {
                        setCatalogEnabled(a.asse, id, !on);
                        tocca();
                      }}
                    >
                      {on ? 'ACCESO' : 'SPENTO'}
                    </button>
                    <code>{isOffByDefault(a.asse, id) ? 'off·def' : ''}</code>
                  </div>
                );
              })
            : a.voci.map((v) => {
                const w = weightOf(a.asse, v.id);
                return (
                  <div
                    className={`tune__row ${w === 0 ? 'tune__row--off' : ''} ${w > 1 ? 'tune__row--up' : ''}`}
                    key={v.id}
                  >
                    <span title={v.it}>{v.id}</span>
                    <input
                      type="range"
                      min={0}
                      max={PESO_MAX}
                      step={0.5}
                      value={w}
                      aria-label={`peso di ${v.id}`}
                      onChange={(e) => {
                        setWeight(a.asse, v.id, Number(e.target.value));
                        tocca();
                      }}
                    />
                    <code>{w === 0 ? 'mai' : `×${w}`}</code>
                  </div>
                );
              })}

          <div className="dev__row" style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button
              type="button"
              className="btn dark"
              style={{ flex: 1 }}
              onClick={() => void generaEConta(a)}
              disabled={gira}
            >
              {gira ? 'GENERO 5…' : 'PROVA · 5 CREATURE'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (a.tipo === 'catalogo') resetCatalog(a.asse);
                else resetAxis(a.asse);
                tocca();
              }}
            >
              RIMETTI A POSTO
            </button>
          </div>

          {/* 🔷 «Genera A/B test dopo aver modificato i singoli valori.»
              Solo sugli assi a peso: sono quelli che il .mon di prova possiede
              come UN campo suo, che si può scambiare tenendo fermo il resto.
              Su un catalogo (Family, ruolo…) cambiare il valore vorrebbe dire
              cambiare la creatura, non un suo dettaglio — e allora non è più
              un A/B controllato. */}
          {a.tipo === 'peso' && (
            <StepAB
              bersaglio={a.asse as BersaglioAB}
              voci={a.voci}
              proposto={piuSpinto(a)}
            />
          )}

          {prova && prova.asse === a.asse && (
            <div className="tune__dist">
              <div className="tune__head">
                <b>COSA È USCITO · {prova.totale} CREATURE</b>
                <small>generate adesso, e buttate</small>
              </div>
              {prova.conte.map(([id, n]) => (
                <div className="tune__distrow" key={id}>
                  <span>{id}</span>
                  <span className="tune__distbar">
                    <i style={{ width: `${(n / prova.totale) * 100}%` }} />
                  </span>
                  <span>{((n / prova.totale) * 100).toFixed(1)}%</span>
                </div>
              ))}
              {prova.conte.length === 0 && (
                <p className="hint">Nessuna delle 5 ha toccato questo asse: prova ancora o verifica se la Family estratta lo prevede.</p>
              )}
            </div>
          )}
        </div>
      ))}
    </>
  );
}
