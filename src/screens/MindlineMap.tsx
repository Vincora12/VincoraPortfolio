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

import { useState } from 'react';
import type { Overlay } from '../App';
import { useApp } from '../state/store';
import { AssetSlot } from '../system/AssetSlot';
import { MonName, MonNameTspan } from '../system/MonName';
import { Button, Row, ScreenHead, SystemLabel } from '../system/components';
import { layoutMindline, nodeKindLabel } from '../engine/mindline';
import { displayName } from '../engine/types';
import { haptic } from '../system/haptics';
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

  // Il pannello di dettaglio esiste solo quando si è scelto un nodo: senza
  // selezione la topologia si guarda intera, che è il punto della schermata.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const natureOf = (monName: string) => {
    const data = mons[monName]?.data;
    return data ? `${data.family}|${data.family_archetype}` : '';
  };
  const layout = layoutMindline(nodes, (from, to) => natureOf(from.monName) !== natureOf(to.monName));
  const activeNodeId = activeMonName ? mons[activeMonName]?.data.mindline_node : null;
  const chapter = Math.max(1, ...nodes.map((n) => n.chapter));
  const selected = nodes.find((n) => n.id === selectedId) ?? null;

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
              const picked = node.id === selectedId;
              const r = active ? 13 : 9;
              const parent = node.parentId ? nodes.find((item) => item.id === node.parentId) : null;
              const fromFamily = parent ? mons[parent.monName]?.data.family : null;
              const toFamily = mons[node.monName]?.data.family;
              const changedFamily = Boolean(fromFamily && toFamily && fromFamily !== toFamily);

              return (
                <g
                  key={node.id}
                  className={`mindline__node ${active ? 'mindline__node--active' : ''} ${
                    picked ? 'mindline__node--picked' : ''
                  }`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Nodo ${displayName(node.monName)}`}
                  onClick={() => {
                    haptic('tick');
                    setSelectedId(picked ? null : node.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedId(picked ? null : node.id);
                    }
                  }}
                >
                  {/* Bersaglio di tocco: il marcatore è piccolo, il dito no. */}
                  <circle cx={x} cy={y} r={26} fill="transparent" />
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
                    {changedFamily ? `${fromFamily} → ${toFamily}` : `${toFamily ?? nodeKindLabel(node.kind)} · G${node.day}`}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {selected === null ? (
          <p className="mindline__hint t-micro">{t.mindline.hint}</p>
        ) : (
          <section className="mindline__panel">
            <button
              type="button"
              className="mindline__close"
              aria-label={t.common.close}
              onClick={() => setSelectedId(null)}
            >
              ×
            </button>

            <div className="noderow noderow--static">
              <span className="noderow__portrait">
                {mons[selected.monName] && (
                  <AssetSlot
                    monName={selected.monName}
                    type="character_toy"
                    fallbackTypes={['character_master']}
                    alt={displayName(selected.monName)}
                    fit="cover"
                    compactPlaceholder
                  />
                )}
              </span>
              <span className="noderow__text">
                <span className="noderow__name t-display">
                  <MonName name={selected.monName} />
                </span>
                <span className="t-micro">
                  {nodeKindLabel(selected.kind)} · {t.mindline.chapter} {selected.chapter} · G
                  {selected.day}
                </span>
              </span>
              {selected.id === activeNodeId && <SystemLabel tone="character">ATTIVO</SystemLabel>}
            </div>

            {selected.id === activeNodeId ? (
              <div className="rowlist">
                <Row label="SPECIMEN" value="apri →" onClick={() => onGo('specimen')} />
                <Row label="HERITAGE DNA" value="apri →" onClick={() => onGo('heritage')} />
                <Row label="EVOLUTION TIMELINE" value="apri →" onClick={() => onGo('history')} />
              </div>
            ) : (
              <Button variant="secondary" block onClick={() => restoreNode(selected.id)}>
                {t.mindline.restore}
              </Button>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
