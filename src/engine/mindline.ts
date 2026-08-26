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

import type { CharacterData, MindlineNode, NodeKind } from './types';

export type MindlineBranchReason =
  | 'MEGA'
  | 'EVOLUZIONE'
  | 'FAMIGLIA'
  | 'ARCHETIPO'
  | 'CORPO'
  | 'MACCHINA'
  | 'AFFINITÀ'
  | 'STADIO'
  | 'TAGLIA'
  | 'RUOLO'
  | 'STILE';

export interface MindlineTransition {
  branches: boolean;
  score: number;
  reasons: MindlineBranchReason[];
}

function bodyDomain(data: CharacterData): string {
  const anatomy = `${data.family} ${data.family_archetype} ${data.affinity}`.toUpperCase();
  if (/MACHINE|MECHA|ROBOT|ANDROID|CYBORG|TECHNO|DIGITAL/.test(anatomy)) return 'MACCHINA';
  if (/UNDEAD|GHOST|SPECT|DEMON/.test(anatomy)) return 'OCCULTO';
  if (/ANGEL|CELEST|SERAPH|CHERUB/.test(anatomy)) return 'CELESTE';
  if (/PLANT|FUNG|FLORA/.test(anatomy)) return 'VEGETALE';
  if (/FISH|AMPHIB|REPT|BEAST|ANIMAL|INSECT|ARACHN/.test(anatomy)) return 'BESTIALE';
  return 'ORGANICO';
}

/**
 * Decide retroattivamente quando una trasformazione merita un nuovo ramo.
 * Usa soltanto dati già presenti in ogni MonRecord: non richiede migrazioni e
 * quindi ricostruisce anche la topologia delle forme nate prima di questa UI.
 */
export function classifyMindlineTransition(
  from: CharacterData | undefined,
  to: CharacterData | undefined,
  node: MindlineNode,
): MindlineTransition {
  if (!from || !to) return { branches: node.kind === 'branch', score: 0, reasons: [] };

  const reasons: MindlineBranchReason[] = [];
  let score = 0;
  const label = `${node.label} ${to.evolution_state?.label ?? ''}`.toUpperCase();

  if (label.includes('MEGA')) {
    score += 8;
    reasons.push('MEGA');
  } else if (node.kind === 'branch') {
    // Una nuova forma non e' automaticamente un nuovo ramo VISIVO. Se la
    // natura resta la stessa, prosegue il percorso; il ramo nasce quando
    // cambiano davvero corpo, famiglia, stadio o un'altra asse importante.
    score += 1;
    reasons.push('EVOLUZIONE');
  }
  if (from.family !== to.family) {
    score += 5;
    reasons.push('FAMIGLIA');
  }
  if (from.family_archetype !== to.family_archetype) {
    score += 3;
    reasons.push('ARCHETIPO');
  }
  const fromDomain = bodyDomain(from);
  const toDomain = bodyDomain(to);
  if (fromDomain !== toDomain) {
    score += 4;
    reasons.push(toDomain === 'MACCHINA' || fromDomain === 'MACCHINA' ? 'MACCHINA' : 'CORPO');
  }
  if ((from.humanoidity >= 5) !== (to.humanoidity >= 5)) {
    score += 3;
    reasons.push('CORPO');
  }
  if ((from.evolution_state?.stage ?? 0) !== (to.evolution_state?.stage ?? 0)) {
    score += 3;
    reasons.push('STADIO');
  }
  if (from.affinity !== to.affinity) {
    score += 2;
    reasons.push('AFFINITÀ');
  }
  if (from.size !== to.size) {
    score += 2;
    reasons.push('TAGLIA');
  }
  if (from.role !== to.role) {
    score += 1;
    reasons.push('RUOLO');
  }
  if (from.fashion !== to.fashion) {
    score += 1;
    reasons.push('STILE');
  }

  return {
    branches: score >= 4,
    score,
    reasons: [...new Set(reasons)],
  };
}

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

export function layoutMindline(
  nodes: readonly MindlineNode[],
  changesNature: (from: MindlineNode, to: MindlineNode) => boolean = () => false,
): MindlineLayout {
  const out: LayoutNode[] = [];
  const edges: { from: string; to: string }[] = [];

  const roots = nodes.filter((n) => n.parentId === null);
  let nextColumn = 0;

  function walk(node: MindlineNode, column: number, depth: number) {
    out.push({ node, column, depth });

    const kids = nodes.filter((n) => n.parentId === node.id);
    kids.forEach((kid, index) => {
      edges.push({ from: node.id, to: kid.id });

      // Un figlio normale continua il percorso. Un cambio di natura apre una
      // nuova colonna anche quando è l'unico figlio: è proprio la deviazione
      // che la Mindline deve raccontare (es. ALIEN → UNDEAD). I figli
      // alternativi restano sempre rami distinti.
      const branches = index > 0 || changesNature(node, kid);
      walk(kid, branches ? ++nextColumn : column, depth + 1);
    });
  }

  roots.forEach((root, index) => {
    // Un MON ripreso dalla teca inaugura una nuova radice. Le radici devono
    // avere colonne distinte, altrimenti due storie si disegnano una sopra
    // l'altra e la mappa sembra rotta.
    if (index > 0) nextColumn += 1;
    walk(root, nextColumn, 0);
  });

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
