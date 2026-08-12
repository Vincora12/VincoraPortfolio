/* ============================================================================
   17 — MINDLINE (§12, §7.4)

   🔒 §7.4 — deve sembrare topologia di rete + diagramma della metro + ramo Git
   + vecchia UI di sistema. È una traccia TECNICA dei percorsi presi.
   NON deve somigliare a un overworld fantasy, a un sentiero illustrato o a una
   mappa d'avventura.

   Di conseguenza: coordinate su griglia, segmenti ortogonali con smusso a 45°
   come in un diagramma della metro, nodi come marcatori geometrici, etichette
   monospaziate. Nessun terreno, nessuna prospettiva, nessuna decorazione.
   ========================================================================= */

import type { Overlay } from '../App';
import { useApp } from '../state/store';
import { AssetSlot } from '../system/AssetSlot';
import { MonName, MonNameTspan } from '../system/MonName';
import { Row, ScreenHead, SystemLabel } from '../system/components';
import { layoutMindline, nodeKindLabel } from '../engine/mindline';
import { displayName } from '../engine/types';
import { t } from '../i18n/it';

const COL_W = 84;
const ROW_H = 92;
const PAD = 40;
/** Spazio riservato all'etichetta a destra dell'ultimo nodo. */
const LABEL_W = 150;

export function MindlineMapScreen({ onGo }: { onGo: (o: Overlay) => void }) {
  const nodes = useApp((s) => s.nodes);
  const mons = useApp((s) => s.mons);
  const activeMonName = useApp((s) => s.activeMonName);
  const restoreNode = useApp((s) => s.restoreNode);

  const layout = layoutMindline(nodes);
  const activeNodeId = activeMonName ? mons[activeMonName]?.data.mindlineNodeId : null;
  const chapter = Math.max(1, ...nodes.map((n) => n.chapter));

  // Le etichette stanno a destra dei nodi: senza questo margine la colonna
  // più a destra le vedrebbe tagliate dal bordo del canvas.
  const width = PAD * 2 + Math.max(1, layout.columns - 1) * COL_W + LABEL_W;
  const height = PAD * 2 + Math.max(1, layout.depth - 1) * ROW_H;

  const pos = (column: number, depth: number) => ({
    x: PAD + column * COL_W,
    y: PAD + depth * ROW_H,
  });

  const byId = new Map(layout.nodes.map((n) => [n.node.id, n]));

  return (
    <div className="screen screen--ink mindline">
      <ScreenHead
        title={t.mindline.title}
        sub={`${t.mindline.chapter} ${chapter} · ${nodes.length} ${t.mindline.nodes}`}
      />

      <div className="screen__body mindline__body">
        <div className="mindline__canvas">
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`Topologia della Mindline, ${nodes.length} nodi`}
          >
            {/* Griglia tecnica di fondo: è una superficie di sistema. */}
            <defs>
              <pattern id="grid" width="16" height="16" patternUnits="userSpaceOnUse">
                <path d="M16 0H0V16" fill="none" stroke="var(--hairline)" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width={width} height={height} fill="url(#grid)" />

            {/* Tracce: verticali con smusso a 45°, grammatica da metro/Git. */}
            {layout.edges.map((e) => {
              const from = byId.get(e.from);
              const to = byId.get(e.to);
              if (!from || !to) return null;

              const a = pos(from.column, from.depth);
              const b = pos(to.column, to.depth);
              const isBranch = from.column !== to.column;

              // Deviazione disegnata come in un diagramma della metro: si
              // scende in verticale, si stacca a 45°, si riprende in verticale.
              const dx = b.x - a.x;
              const chamfer = Math.min(Math.abs(dx), (b.y - a.y) / 3);
              const dir = Math.sign(dx);

              const d = isBranch
                ? [
                    `M${a.x} ${a.y}`,
                    `L${a.x} ${b.y - chamfer * 2}`,
                    `L${a.x + dir * chamfer} ${b.y - chamfer}`,
                    `L${b.x - dir * chamfer} ${b.y - chamfer}`,
                    `L${b.x} ${b.y}`,
                  ].join(' ')
                : `M${a.x} ${a.y} L${b.x} ${b.y}`;

              return (
                <path
                  key={`${e.from}-${e.to}`}
                  d={d}
                  fill="none"
                  stroke={isBranch ? 'var(--char-accent)' : 'var(--ink)'}
                  strokeWidth={2}
                  strokeLinejoin="miter"
                  strokeDasharray={isBranch ? '6 4' : undefined}
                />
              );
            })}

            {/* Nodi: marcatori geometrici, non illustrazioni. */}
            {layout.nodes.map(({ node, column, depth }) => {
              const { x, y } = pos(column, depth);
              const active = node.id === activeNodeId;
              const r = active ? 13 : 9;

              return (
                <g key={node.id}>
                  {active && (
                    <circle cx={x} cy={y} r={r + 7} fill="none" stroke="var(--char-accent)" strokeWidth={1.5} />
                  )}
                  <circle
                    cx={x}
                    cy={y}
                    r={r}
                    fill={active ? 'var(--char-primary)' : 'var(--white)'}
                    stroke="var(--ink)"
                    strokeWidth={2.5}
                  />
                  {node.kind === 'branch' && (
                    <path
                      d={`M${x - 4} ${y} L${x + 4} ${y} M${x} ${y - 4} L${x} ${y + 4}`}
                      stroke={active ? 'var(--char-on-primary)' : 'var(--ink)'}
                      strokeWidth={2}
                    />
                  )}
                  {/* La Mindline è un albero di file: qui il nome porta la sua
                      estensione. In SVG servono due tspan, non il componente. */}
                  <text x={x + r + 8} y={y + 4} fill="var(--ink)">
                    <MonNameTspan name={node.monName} size={11} />
                  </text>
                  <text x={x + r + 8} y={y + 16} className="mindline__sublabel" fill="var(--muted-strong)">
                    {nodeKindLabel(node.kind)} · G{node.day}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Elenco dei nodi: la mappa non è l'unico modo di leggere la topologia. */}
        <section className="mindline__list">
          <p className="t-meta mindline__listhead">{t.mindline.current}</p>
          <div className="rowlist">
            {[...nodes].reverse().map((n) => {
              const rec = mons[n.monName];
              const active = n.id === activeNodeId;
              return (
                <button
                  key={n.id}
                  type="button"
                  className={`noderow ${active ? 'noderow--active' : ''}`}
                  onClick={() => (active ? onGo('specimen') : restoreNode(n.id))}
                >
                  <span className="noderow__portrait">
                    {rec && (
                      <AssetSlot
                        monName={n.monName}
                        type="profile_portrait"
                        fallbackTypes={['character_master']}
                        alt={displayName(n.monName)}
                        fit="cover"
                        compactPlaceholder
                      />
                    )}
                  </span>
                  <span className="noderow__text">
                    <span className="noderow__name t-display">
                      <MonName name={n.monName} />
                    </span>
                    <span className="t-micro">
                      {n.id} · {nodeKindLabel(n.kind)} · {t.mindline.chapter} {n.chapter}
                    </span>
                  </span>
                  {active ? (
                    <SystemLabel tone="character">ATTIVO</SystemLabel>
                  ) : (
                    <SystemLabel>G{n.day}</SystemLabel>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <div className="rowlist mindline__shortcuts">
          <Row label="HERITAGE DNA" value="apri →" onClick={() => onGo('heritage')} />
          <Row label="EVOLUTION TIMELINE" value="apri →" onClick={() => onGo('history')} />
          <Row label="MEMORIE" value="apri →" onClick={() => onGo('memories')} />
        </div>
      </div>
    </div>
  );
}
