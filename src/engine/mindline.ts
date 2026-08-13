/* ============================================================================
   MINDLINE (§7, §17 di §12)

   🔒 SUPERSEDING RULE (§7): la lineage si vive come un percorso dentro la
   mente di VINZ, non come una scala di evoluzione da gioco di mostri.

   🔒 §7.4 — linguaggio visivo: topologia di rete + diagramma della metro +
   ramo Git + vecchia UI di sistema. È una traccia TECNICA dei percorsi presi.
   NON deve somigliare a un overworld fantasy, a un sentiero illustrato o a
   una mappa d'avventura.

   Questo modulo tiene il grafo e ne calcola il layout. Il disegno sta nella
   schermata; qui non c'è nessuna decisione estetica se non la topologia.
   ========================================================================= */

import type { MindlineNode, NodeKind } from './types';

export function makeNodeId(index: number): string {
  return `node_${String(index).padStart(3, '0')}`;
}

export function createNode(params: {
  index: number;
  kind: NodeKind;
  monName: string;
  parentId: string | null;
  day: number;
  chapter: number;
  label: string;
}): MindlineNode {
  return {
    id: makeNodeId(params.index),
    kind: params.kind,
    monName: params.monName,
    parentId: params.parentId,
    day: params.day,
    chapter: params.chapter,
    label: params.label,
  };
}

/** Catena dal nodo indicato fino all'origine, dal più recente al più antico. */
export function ancestryOf(nodes: readonly MindlineNode[], nodeId: string): MindlineNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: MindlineNode[] = [];
  let current = byId.get(nodeId);

  while (current) {
    out.push(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return out;
}

/** Figli diretti di un nodo. */
export function childrenOf(nodes: readonly MindlineNode[], nodeId: string): MindlineNode[] {
  return nodes.filter((n) => n.parentId === nodeId);
}

/**
 * Il capitolo avanza a ogni BRANCH: un nuovo ramo è un nuovo capitolo della
 * Mindline (board S12: "MINDLINE — CHAPTER 2").
 */
export function nextChapter(nodes: readonly MindlineNode[], kind: NodeKind): number {
  const current = nodes.length === 0 ? 1 : Math.max(...nodes.map((n) => n.chapter));
  return kind === 'branch' ? current + 1 : current;
}

/* --- Layout della topologia ------------------------------------------------
   Coordinate normalizzate: la schermata le scala. Il layout è a colonne per
   ramo e a righe per profondità — grammatica da diagramma di rete e da grafo
   Git, non da mappa illustrata (§7.4).
   -------------------------------------------------------------------------- */

export interface LayoutNode {
  node: MindlineNode;
  /** Colonna del ramo, 0 = tronco principale. */
  column: number;
  /** Profondità lungo il percorso. */
  depth: number;
}

export interface MindlineLayout {
  nodes: LayoutNode[];
  edges: { from: string; to: string }[];
  columns: number;
  depth: number;
}

export function layoutMindline(nodes: readonly MindlineNode[]): MindlineLayout {
  const out: LayoutNode[] = [];
  const edges: { from: string; to: string }[] = [];

  const roots = nodes.filter((n) => n.parentId === null);
  let nextColumn = 0;

  function walk(node: MindlineNode, column: number, depth: number) {
    out.push({ node, column, depth });

    const kids = nodes.filter((n) => n.parentId === node.id);
    let continuedHere = false;

    kids.forEach((kid) => {
      edges.push({ from: node.id, to: kid.id });

      // Il tipo del nodo decide la colonna, non l'ordine di nascita: un
      // micro-growth prosegue la colonna, un cambio di forma ne apre una
      // nuova. È la grammatica da grafo Git richiesta da §7.4 — altrimenti un
      // cambio di forma verrebbe disegnato in linea retta come una crescita.
      const isContinuation = kid.kind !== 'branch' && !continuedHere;
      if (isContinuation) continuedHere = true;

      walk(kid, isContinuation ? column : ++nextColumn, depth + 1);
    });
  }

  roots.forEach((root) => walk(root, nextColumn, 0));

  return {
    nodes: out,
    edges,
    columns: Math.max(1, nextColumn + 1),
    depth: Math.max(1, ...out.map((n) => n.depth + 1)),
  };
}

/** Etichetta tecnica del nodo, nel registro da UI di sistema. */
export function nodeKindLabel(kind: NodeKind): string {
  switch (kind) {
    case 'origin':
      return 'ORIGIN';
    case 'evolution':
      return 'CONTINUE';
    case 'branch':
      return 'BRANCH';
  }
}
