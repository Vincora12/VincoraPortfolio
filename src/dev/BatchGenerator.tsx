/* ============================================================================
   BATCH GENERATION (§20.2)

   🔒 §20.2:
   • "Provide a GENERATE 10 .MON or equivalent batch tool in dev mode."
   • "Batch generation produces STRUCTURED CHARACTER DATA ONLY by default;
     visual asset production is requested only for selected candidates."
   • "Use batch tests to evaluate variation, duplicated concepts, rarity
     distribution, Family/Affinity balance, Heritage coherence and naming
     quality."

   Ogni voce di quell'elenco ha una lettura corrispondente qui sotto.
   ========================================================================= */

import { useMemo, useState } from 'react';
import { useApp } from '../state/store';
import { Button, SystemLabel } from '../system/components';
import { isValidMonName } from '../engine/naming';

export function BatchGenerator() {
  const batch = useApp((s) => s.batch);
  const generateBatch = useApp((s) => s.generateBatch);
  const clearBatch = useApp((s) => s.clearBatch);
  const [expanded, setExpanded] = useState(false);

  const stats = useMemo(() => {
    if (batch.length === 0) return null;

    const count = <T extends string>(key: (c: (typeof batch)[number]) => T) => {
      const map = new Map<T, number>();
      for (const c of batch) map.set(key(c), (map.get(key(c)) ?? 0) + 1);
      return [...map.entries()].sort((a, b) => b[1] - a[1]);
    };

    // Un "concetto" è la combinazione degli assi che definiscono la creatura,
    // esclusi gli assi di styling: due candidati con lo stesso concetto sono
    // di fatto la stessa idea.
    const concepts = new Set(
      batch.map((c) => [c.family, c.archetype, c.affinity, c.size, c.role].join('|')),
    );

    const names = batch.map((c) => c.name);

    return {
      families: count((c) => c.family),
      affinities: count((c) => c.affinity),
      rarities: count((c) => c.rarity),
      appearances: count((c) => c.appearance),
      uniqueConcepts: concepts.size,
      duplicateNames: names.length - new Set(names).size,
      invalidNames: names.filter((n) => !isValidMonName(n)),
      withHeritage: batch.filter((c) => c.heritageCount > 0).length,
      heritageOutOfRange: batch.filter((c) => c.heritageCount > 3).length,
      avgScore: batch.reduce((s, c) => s + c.score, 0) / batch.length,
    };
  }, [batch]);

  return (
    <div className="batch">
      <p className="t-meta dev__label">GENERAZIONE BATCH</p>
      <p className="t-micro dev__note">
        Produce solo dati strutturati. Nessuna immagine viene richiesta: gli
        asset si chiedono dopo, e solo per i candidati selezionati.
      </p>

      <div className="dev__grid">
        <Button small onClick={() => generateBatch(10)}>GENERATE 10</Button>
        <Button small onClick={() => generateBatch(50)}>GENERATE 50</Button>
        <Button small onClick={() => generateBatch(200)}>GENERATE 200</Button>
        <Button small variant="ghost" onClick={clearBatch} disabled={batch.length === 0}>
          PULISCI
        </Button>
      </div>

      {stats && (
        <>
          {/* --- Controlli di qualità, uno per criterio di §20.2 --- */}
          <div className="batch__checks">
            <Check
              ok={stats.invalidNames.length === 0}
              label="GENOMA DEI NOMI"
              detail={
                stats.invalidNames.length === 0
                  ? 'tutti V… Z… .mon'
                  : stats.invalidNames.slice(0, 3).join(', ')
              }
            />
            <Check
              ok={stats.duplicateNames === 0}
              label="NOMI UNIVOCI"
              detail={`${stats.duplicateNames} duplicati`}
            />
            <Check
              ok={stats.heritageOutOfRange === 0}
              label="HERITAGE 1–3"
              detail={`${stats.withHeritage}/${batch.length} da branch`}
            />
            <Check
              ok={stats.uniqueConcepts / batch.length > 0.85}
              label="VARIANZA"
              detail={`${stats.uniqueConcepts}/${batch.length} concetti distinti`}
            />
          </div>

          <Distribution title="FAMILY" rows={stats.families} total={batch.length} />
          <Distribution title="AFFINITY" rows={stats.affinities} total={batch.length} />
          <Distribution title="RARITY" rows={stats.rarities} total={batch.length} />
          <Distribution title="APPEARANCE" rows={stats.appearances} total={batch.length} />

          <p className="t-micro dev__note">
            Punteggio medio di rarità: {stats.avgScore.toFixed(2)}
          </p>

          <Button block small onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'NASCONDI' : 'MOSTRA'} I {batch.length} CANDIDATI
          </Button>

          {expanded && (
            <ul className="batch__list">
              {batch.map((c) => (
                <li key={c.name + c.seed} className="batch__item">
                  <span className="batch__name t-display">{c.name}</span>
                  <span className="t-micro">
                    {c.family}/{c.archetype} · {c.affinity} · {c.size} · {c.role} ·{' '}
                    {c.appearance}
                  </span>
                  <span className="batch__tags">
                    <SystemLabel>{c.rarity}</SystemLabel>
                    {c.heritageCount > 0 && (
                      <SystemLabel tone="character">H{c.heritageCount}</SystemLabel>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function Check({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="batch__check">
      {/* Il colore non veicola l'esito da solo: c'è anche OK / FAIL (§17). */}
      <SystemLabel tone={ok ? 'positive' : 'alert'}>{ok ? 'OK' : 'FAIL'}</SystemLabel>
      <span className="t-meta">{label}</span>
      <span className="t-micro batch__detail">{detail}</span>
    </div>
  );
}

function Distribution({
  title,
  rows,
  total,
}: {
  title: string;
  rows: [string, number][];
  total: number;
}) {
  return (
    <div className="dist">
      <p className="t-meta">{title}</p>
      {rows.map(([key, n]) => (
        <div key={key} className="dist__row">
          <span className="t-micro dist__key">{key}</span>
          <span className="dist__bar" aria-hidden="true">
            <span className="dist__fill" style={{ width: `${(n / total) * 100}%` }} />
          </span>
          <span className="t-micro dist__n">{n}</span>
        </div>
      ))}
    </div>
  );
}
