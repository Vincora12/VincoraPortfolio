/* ============================================================================
   DEV → RARITÀ (§20.1)

   🔷 «Vedo ancora che SINGULAR è una volta su tremila. Ribilancia in modo che
   quelli rari siano molto meno rari. E nel DEV mettimi un tool per modificare
   questa cosa, così posso anche io modificare un po' di valori.»

   ════════════════════════════════════════════════════════════════════════════
   PERCHÉ QUESTO PANNELLO CAMPIONA UNA VOLTA E POI RICALCOLA A MANO.

   La domanda vera non è «quanto esce SINGULAR», è «quanto uscirebbe SE
   spostassi la soglia a 79». Rigenerare quattrocento creature a ogni battuta
   di tastiera sarebbe lento e — peggio — darebbe un numero diverso ogni volta
   per via del caso, quindi non sapresti mai se è cambiato perché hai spostato
   la soglia o perché è andata così.

   🔒 Quindi si campiona UNA volta, e i punteggi restano fermi. Poi le bande si
   ricalcolano su quel campione a ogni cifra che scrivi. Quello che vedi
   muoversi è solo l'effetto della tua modifica.
   ════════════════════════════════════════════════════════════════════════════

   ⚠️ Le percentuali che escono da qui sono quelle di ADESSO: contano la tua
   profondità di Mindline, il tuo bond, i tuoi dati. All'inizio della partita i
   livelli alti sono chiusi e le vedrai a zero anche con le soglie a terra —
   non è il pannello che sbaglia, sono i cancelli di §15 che fanno il loro
   lavoro. La riga «senza cancelli» dice cosa uscirebbe a partita matura.
   ========================================================================= */

import { useMemo, useState } from 'react';
import { useApp } from '../state/store';
import { Button } from '../system/components';
import { RARITIES, type Rarity } from '../engine/generation-config';
import {
  DEFAULT_THRESHOLDS,
  bandShares,
  isRarityTuned,
  rarityThresholds,
  thresholdProblems,
  type RarityThresholds,
} from '../engine/rarityTuning';

/** Quante nascite simulare. Abbastanza da vedere una banda all'1%. */
const SAMPLE = 500;

/** Forme in una vita: una ogni 28 giorni per cinquant'anni. */
const FORMS_IN_A_LIFETIME = 650;

export function RaritySection() {
  const sampleRarity = useApp((s) => s.sampleRarity);
  const tuneRarity = useApp((s) => s.tuneRarity);
  /* Sottoscrive la taratura salvata: serve a far ridisegnare la scheda quando
     «Applica» va a buon fine, visto che le soglie vere vivono fuori da React. */
  const saved = useApp((s) => s.dev.rarityThresholds);

  /* Le soglie stanno nel modulo di taratura, non qui: il motore deve leggere
     le stesse che vedi, non una copia che vive in un componente React. */
  const [draft, setDraft] = useState<RarityThresholds>(() => ({ ...rarityThresholds() }));
  const [sample, setSample] = useState<{ scores: number[]; rarities: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const problems = useMemo(() => thresholdProblems(draft), [draft]);

  /* Cosa uscirebbe con le soglie scritte adesso, sul campione già misurato.
     Ignora i cancelli di sblocco: è la distribuzione del PUNTEGGIO. */
  const predicted = useMemo(
    () => (sample ? bandShares(sample.scores, draft) : null),
    [sample, draft],
  );

  /* Cosa è uscito davvero, cancelli compresi. */
  const actual = useMemo(() => {
    if (!sample) return null;
    const out = {} as Record<string, number>;
    for (const r of sample.rarities) out[r] = (out[r] ?? 0) + 1;
    return out;
  }, [sample]);

  const run = () => {
    setBusy(true);
    // Un giro di event loop, o il pulsante non fa in tempo a mostrarsi premuto.
    setTimeout(() => {
      setSample(sampleRarity(SAMPLE));
      setBusy(false);
    }, 0);
  };

  const apply = () => {
    if (tuneRarity(draft).length === 0) setDraft({ ...rarityThresholds() });
  };

  const reset = () => {
    tuneRarity(null);
    setDraft({ ...rarityThresholds() });
  };

  const active = rarityThresholds();
  const dirty = RARITIES.some((r) => draft[r] !== active[r]);
  const tuned = saved !== null || isRarityTuned();

  return (
    <div className="dev__section">
      <p className="t-meta dev__label">SOGLIE DI PUNTEGGIO</p>
      <p className="t-small dev__note">
        La rarità è la banda in cui cade il punteggio, limitata da quello che hai
        sbloccato. Alzare una soglia rende quel livello più raro; abbassarla lo
        rende più comune. Le soglie devono restare in ordine crescente.
      </p>

      <div className="rarity__grid">
        {RARITIES.map((r) => (
          <label key={r} className="rarity__field">
            <span className="t-meta rarity__name">{r}</span>
            <input
              className="dev__numberinput"
              type="number"
              min={0}
              max={100}
              inputMode="numeric"
              value={draft[r]}
              disabled={r === 'COMMON'}
              onChange={(e) =>
                setDraft((d) => ({ ...d, [r]: Number(e.target.value) } as RarityThresholds))
              }
            />
            <span className="t-micro rarity__default">
              {draft[r] === DEFAULT_THRESHOLDS[r] ? 'di partenza' : `era ${DEFAULT_THRESHOLDS[r]}`}
            </span>
          </label>
        ))}
      </div>

      {problems.length > 0 && (
        <ul className="rarity__problems">
          {problems.map((p) => (
            <li key={p} className="t-small">
              {p}
            </li>
          ))}
        </ul>
      )}

      <div className="dev__control dev__control--row">
        <Button onClick={apply} disabled={problems.length > 0 || !dirty}>
          Applica
        </Button>
        <Button variant="secondary" onClick={reset} disabled={!tuned && !dirty}>
          Valori di partenza
        </Button>
      </div>

      <p className="t-micro dev__note">
        Una taratura vale per le creature che devono ancora nascere. Quelle già
        nate portano scritta la versione con cui sono venute al mondo e non
        cambiano mai.
      </p>

      <hr className="rarity__rule" />

      <p className="t-meta dev__label">PROVA SU {SAMPLE} NASCITE</p>
      <p className="t-small dev__note">
        Simula partendo dalla tua situazione di adesso. Non nasce niente: sono
        creature che vivono il tempo di dire che punteggio avrebbero preso.
      </p>

      <div className="dev__control">
        <Button block onClick={run} disabled={busy}>
          {busy ? 'Sto simulando…' : sample ? 'Rifai il campione' : `Simula ${SAMPLE} nascite`}
        </Button>
      </div>

      {sample && predicted && actual && (
        <>
          <p className="t-meta dev__label">CON LE SOGLIE SCRITTE SOPRA</p>
          <p className="t-micro dev__note">
            Solo il punteggio, senza i cancelli di sblocco: è quello che uscirebbe
            a partita matura. Si aggiorna mentre scrivi.
          </p>
          <div className="dist">
            {RARITIES.map((r) => (
              <RarityRow
                key={r}
                name={r}
                share={predicted[r]}
                threshold={draft[r]}
              />
            ))}
          </div>

          <p className="t-meta dev__label">USCITO DAVVERO, ADESSO</p>
          <p className="t-micro dev__note">
            Cancelli di sblocco compresi. Se un livello è a zero e sopra non lo è,
            vuol dire che non l'hai ancora sbloccato.
          </p>
          <div className="dist">
            {RARITIES.map((r) => (
              <RarityRow key={r} name={r} share={(actual[r] ?? 0) / SAMPLE} />
            ))}
          </div>

          <ScoreHistogram scores={sample.scores} thresholds={draft} />
        </>
      )}
    </div>
  );
}

/* --- Una riga di distribuzione --------------------------------------------- */

function RarityRow({
  name,
  share,
  threshold,
}: {
  name: Rarity;
  share: number;
  threshold?: number;
}) {
  const pct = share * 100;
  const inALifetime = Math.round(share * FORMS_IN_A_LIFETIME);

  return (
    <div className="dist__row">
      <span className="t-micro dist__key">
        {name}
        {threshold !== undefined && threshold > 0 ? ` ${threshold}+` : ''}
      </span>
      <span className="dist__bar">
        <span className="dist__fill" style={{ width: `${Math.min(100, pct)}%` }} />
      </span>
      <span className="t-micro dist__n">{pct < 0.2 && pct > 0 ? '<1' : Math.round(pct)}%</span>
      <span className="t-micro rarity__life">
        {/* Il numero che conta davvero: una forma ogni 28 giorni vuol dire
            circa tredici all'anno, cioè seicentocinquanta in una vita. «2%»
            non dice niente; «tredici volte in tutta la vita» sì. */}
        {inALifetime === 0 ? 'mai' : `${inALifetime}×`}
      </span>
    </div>
  );
}

/* --- Istogramma dei punteggi ------------------------------------------------ */

/**
 * Dove si accumulano davvero i punteggi. È la cosa che spiega perché una
 * soglia spostata di due punti cambia tutto: la distribuzione è stretta, non
 * larga, e le bande stanno tutte dentro una ventina di punti.
 */
function ScoreHistogram({
  scores,
  thresholds,
}: {
  scores: number[];
  thresholds: RarityThresholds;
}) {
  const { bins, lo, max } = useMemo(() => {
    const min = Math.min(...scores);
    const hi = Math.max(...scores);
    const from = Math.max(0, min - 1);
    const to = Math.min(100, hi + 1);
    const out: { score: number; n: number }[] = [];
    for (let v = from; v <= to; v++) out.push({ score: v, n: 0 });
    for (const s of scores) {
      const idx = Math.round(s) - from;
      if (out[idx]) out[idx]!.n += 1;
    }
    return { bins: out, lo: from, max: Math.max(...out.map((b) => b.n), 1) };
  }, [scores]);

  const cuts = new Map<number, Rarity>();
  for (const r of RARITIES) if (thresholds[r] > 0) cuts.set(thresholds[r], r);

  return (
    <>
      <p className="t-meta dev__label">DOVE CADONO I PUNTEGGI</p>
      <p className="t-micro dev__note">
        Ogni colonna è un punto di punteggio. Le tacche nere sono le tue soglie:
        una soglia messa dove la colonna è alta sposta molte creature.
      </p>
      <div className="rarity__hist">
        {bins.map((b) => (
          <span
            key={b.score}
            className={`rarity__bin ${cuts.has(b.score) ? 'rarity__bin--cut' : ''}`}
            style={{ height: `${(b.n / max) * 100}%` }}
            title={`${b.score} punti · ${b.n} nascite${cuts.has(b.score) ? ` · soglia ${cuts.get(b.score)}` : ''}`}
          />
        ))}
      </div>
      <div className="rarity__histaxis t-micro">
        <span>{lo}</span>
        <span>{lo + bins.length - 1}</span>
      </div>
    </>
  );
}
