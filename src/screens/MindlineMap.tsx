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

import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent, type WheelEvent } from 'react';
import type { Overlay } from '../App';
import { useApp } from '../state/store';
import { AssetSlot, useAssetUrl } from '../system/AssetSlot';
import { MonName, MonNameTspan } from '../system/MonName';
import { Button, Row, ScreenHead, SystemLabel } from '../system/components';
import { classifyMindlineTransition, layoutMindline, nodeKindLabel } from '../engine/mindline';
import { displayName } from '../engine/types';
import { haptic } from '../system/haptics';
import { t } from '../i18n/it';
import { EXPRESSION_SPEC } from '../engine/assets';

const COL_W = 156;
const ROW_H = 150;
// Il primo nodo deve poter stare davvero al centro anche quando l'albero è
// ancora corto. Un semplice scroll non può creare spazio prima di x=0/y=0.
const PAD_X = 270;
const PAD_Y = 260;
/** Spazio riservato all'etichetta a destra dell'ultimo nodo. */
const LABEL_W = 184;
const TAIL_H = 240;
const MIN_ZOOM = 0.55;
const MAX_ZOOM = 1.65;
const ZOOM_STEP = 0.15;

function MapSticker({ monName, index, x, y }: { monName: string; index: number; x: number; y: number }) {
  const sheet = useAssetUrl(monName, 'reaction_pack');
  const toy = useAssetUrl(monName, 'character_toy');
  const master = useAssetUrl(monName, 'character_master');
  const n = index % EXPRESSION_SPEC.frames;
  const col = n % EXPRESSION_SPEC.columns;
  const row = Math.floor(n / EXPRESSION_SPEC.columns);
  const fallback = toy ?? master;
  const clipId = `mindline-sticker-${index}`;

  if (!sheet) {
    return (
      <g className="mindline__sticker mindline__sticker--fallback" aria-hidden="true">
        <rect x={x - 29} y={y - 29} width={58} height={58} fill="#fff" />
        {fallback && <image href={fallback} x={x - 29} y={y - 29} width={58} height={58} preserveAspectRatio="xMidYMid meet" />}
      </g>
    );
  }

  return (
    <g className="mindline__sticker" aria-hidden="true" clipPath={`url(#${clipId})`}>
      <defs>
        <clipPath id={clipId}>
          <rect x={x - 29} y={y - 29} width={58} height={58} />
        </clipPath>
      </defs>
      <image
        href={sheet}
        x={x - 29 - col * 58}
        y={y - 29 - row * 58}
        width={EXPRESSION_SPEC.columns * 58}
        height={EXPRESSION_SPEC.rows * 58}
        preserveAspectRatio="none"
        className="mindline__stickerart"
      />
    </g>
  );
}

export function MindlineMapScreen({ onGo }: { onGo: (o: Overlay) => void }) {
  const nodes = useApp((s) => s.nodes);
  const mons = useApp((s) => s.mons);
  const activeMonName = useApp((s) => s.activeMonName);
  const restoreNode = useApp((s) => s.restoreNode);

  // Il pannello di dettaglio esiste solo quando si è scelto un nodo: senza
  // selezione la topologia si guarda intera, che è il punto della schermata.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.85);
  const canvasRef = useRef<HTMLDivElement>(null);
  const centeredOnce = useRef(false);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);

  const transitions = useMemo(() => {
    const result = new Map<string, ReturnType<typeof classifyMindlineTransition>>();
    for (const node of nodes) {
      if (!node.parentId) continue;
      const parent = nodes.find((item) => item.id === node.parentId);
      result.set(
        node.id,
        classifyMindlineTransition(
          parent ? mons[parent.monName]?.data : undefined,
          mons[node.monName]?.data,
          node,
        ),
      );
    }
    return result;
  }, [mons, nodes]);

  const layout = useMemo(
    () => layoutMindline(nodes, (_from, to) => transitions.get(to.id)?.laneShift ?? 0),
    [nodes, transitions],
  );
  const activeNodeId = activeMonName ? mons[activeMonName]?.data.mindline_node : null;
  const chapter = Math.max(1, ...nodes.map((n) => n.chapter));
  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  // Le etichette stanno a destra dei nodi: senza questo margine la colonna
  // più a destra le vedrebbe tagliate dal bordo del canvas.
  const width = PAD_X * 2 + Math.max(1, layout.columns - 1) * COL_W + LABEL_W;
  const height = PAD_Y * 2 + Math.max(1, layout.depth - 1) * ROW_H + TAIL_H;

  const pos = (column: number, depth: number) => ({
    x: PAD_X + column * COL_W,
    y: PAD_Y + depth * ROW_H,
  });

  const byId = new Map(layout.nodes.map((n) => [n.node.id, n]));

  const centerCurrent = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const canvas = canvasRef.current;
    const current = activeNodeId ? byId.get(activeNodeId) : null;
    if (!canvas || !current) return;
    const point = pos(current.column, current.depth);
    canvas.scrollTo({
      left: Math.max(0, point.x * zoom - canvas.clientWidth / 2),
      top: Math.max(0, point.y * zoom - canvas.clientHeight / 2),
      behavior,
    });
  }, [activeNodeId, byId, zoom]);

  useEffect(() => {
    if (centeredOnce.current || !activeNodeId) return;
    centeredOnce.current = true;
    const frame = requestAnimationFrame(() => centerCurrent('auto'));
    return () => cancelAnimationFrame(frame);
  }, [activeNodeId, centerCurrent]);

  const changeZoom = (next: number) => {
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(next.toFixed(2)))));
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    changeZoom(zoom + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
  };

  const touchDistance = (event: TouchEvent<HTMLDivElement>) => {
    const a = event.touches[0];
    const b = event.touches[1];
    if (!a || !b) return 0;
    return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2) return;
    pinchRef.current = { distance: touchDistance(event), zoom };
  };

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2 || !pinchRef.current) return;
    event.preventDefault();
    const distance = touchDistance(event);
    if (distance <= 0 || pinchRef.current.distance <= 0) return;
    changeZoom(pinchRef.current.zoom * (distance / pinchRef.current.distance));
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length < 2) pinchRef.current = null;
  };

  return (
    <div className="screen screen--ink mindline">
      <ScreenHead
        sub={`${t.mindline.chapter} ${chapter} · ${nodes.length} ${t.mindline.nodes}`}
      />

      <div className="screen__body mindline__body">
        <div className="mindline__viewport">
          <div className="mindline__controls" aria-label="Controlli della mappa">
            <output aria-live="polite">{Math.round(zoom * 100)}%</output>
            <button type="button" className="mindline__center" onClick={() => centerCurrent()}>ATTUALE</button>
          </div>

        <div
          className="mindline__canvas"
          ref={canvasRef}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          <svg
            width={width * zoom}
            height={height * zoom}
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
              const transition = transitions.get(to.node.id);
              const changesColumn = from.column !== to.column;
              const changesNature = transition?.branches ?? false;
              const isMega = transition?.reasons.includes('MEGA') ?? false;
              const isBranch = changesColumn || changesNature;

              // Deviazione disegnata come in un diagramma della metro: si
              // scende in verticale, si stacca a 45°, si riprende in verticale.
              const dx = b.x - a.x;
              const chamfer = Math.min(Math.abs(dx), (b.y - a.y) / 3);
              const dir = Math.sign(dx);

              const d = changesColumn
                ? [
                    `M${a.x} ${a.y}`,
                    `L${a.x} ${b.y - chamfer * 2}`,
                    `L${a.x + dir * chamfer} ${b.y - chamfer}`,
                    `L${b.x - dir * chamfer} ${b.y - chamfer}`,
                    `L${b.x} ${b.y}`,
                  ].join(' ')
                : `M${a.x} ${a.y} L${b.x} ${b.y}`;

              return (
                <g key={`${e.from}-${e.to}`}>
                  <path
                    d={d}
                    fill="none"
                    stroke={isBranch ? 'var(--char-accent)' : 'var(--ink)'}
                    strokeWidth={changesColumn ? 3 : 2}
                    strokeLinejoin="miter"
                    strokeDasharray={isMega ? '7 5' : undefined}
                  />
                  {transition?.branches && transition.reasons.length > 0 && (
                    <text
                      x={changesColumn ? (a.x + b.x) / 2 + 10 : a.x + 12}
                      y={(a.y + b.y) / 2 - 7}
                      className="mindline__branchlabel"
                      fill="var(--char-accent)"
                    >
                      {transition.reasons.slice(0, 2).join(' + ')}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Ogni nodo usa una delle vere reaction del MON: la mappa resta
                tecnica nei collegamenti, ma le tappe ora hanno una faccia. */}
            {layout.nodes.map(({ node, column, depth }, nodeIndex) => {
              const { x, y } = pos(column, depth);
              const active = node.id === activeNodeId;
              const picked = node.id === selectedId;
              const parent = node.parentId ? nodes.find((item) => item.id === node.parentId) : null;
              const fromFamily = parent ? mons[parent.monName]?.data.family : null;
              const toFamily = mons[node.monName]?.data.family;
              const changedFamily = Boolean(fromFamily && toFamily && fromFamily !== toFamily);
              const data = mons[node.monName]?.data;
              const transition = transitions.get(node.id);
              const nodeMeta = transition?.branches && transition.reasons.length > 0
                ? transition.reasons.slice(0, 2).join(' · ')
                : `${data?.evolution_state?.label ?? nodeKindLabel(node.kind)} · ${data?.family_archetype ?? toFamily ?? `G${node.day}`}`;

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
                  {/* Bersaglio di tocco più ampio dello sticker. */}
                  <circle cx={x} cy={y} r={34} fill="transparent" />
                  {active && (
                    <circle cx={x} cy={y} r={38} fill="none" stroke="var(--char-accent)" strokeWidth={3} />
                  )}
                  <MapSticker monName={node.monName} index={nodeIndex} x={x} y={y} />
                  {/* La Mindline è un albero di file: qui il nome porta la sua
                      estensione. In SVG servono due tspan, non il componente. */}
                  <text x={x - 30} y={y + 45} fill="var(--ink)">
                    <MonNameTspan name={node.monName} size={11} />
                  </text>
                  <text x={x - 30} y={y + 57} className="mindline__sublabel" fill="var(--muted-strong)">
                    {changedFamily ? `${fromFamily} → ${toFamily}` : nodeMeta}
                  </text>
                  {active && <text x={x - 30} y={y - 40} className="mindline__currentlabel" fill="var(--char-accent)">MON ATTUALE</text>}
                </g>
              );
            })}
          </svg>
        </div>
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
