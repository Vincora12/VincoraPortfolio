export interface ReconciliationRow {
  id?: string;
  text: string;
  source: 'custom' | 'mem0';
  provenance?: Record<string, unknown>;
  confidence?: number;
  updatedAt?: string;
}

export interface MemoryReconciliation {
  counts: { custom: number; mem0: number; exactDuplicates: number; possibleConflicts: number; customOnly: number; mem0Only: number };
  exactDuplicates: Array<{ customId?: string; mem0Id?: string }>;
  possibleConflicts: Array<{ customId?: string; mem0Id?: string; reason: string }>;
  customOnly: string[];
  mem0Only: string[];
  safeToSwitchWriter: boolean;
}

const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const terms = (text: string) => new Set(normalize(text).split(' ').filter((term) => term.length >= 3));
const overlap = (a: string, b: string) => {
  const left = terms(a); const right = terms(b);
  if (!left.size || !right.size) return 0;
  return [...left].filter((term) => right.has(term)).length / Math.min(left.size, right.size);
};

/** Read-only comparison. It never writes either source and never chooses a winner automatically. */
export function reconcileMemoryRows(custom: ReconciliationRow[], mem0: ReconciliationRow[]): MemoryReconciliation {
  const exactDuplicates: MemoryReconciliation['exactDuplicates'] = [];
  const possibleConflicts: MemoryReconciliation['possibleConflicts'] = [];
  const matchedCustom = new Set<number>();
  const matchedMem0 = new Set<number>();
  for (let ci = 0; ci < custom.length; ci += 1) {
    for (let mi = 0; mi < mem0.length; mi += 1) {
      if (matchedMem0.has(mi)) continue;
      const left = normalize(custom[ci].text); const right = normalize(mem0[mi].text);
      if (left && left === right) {
        exactDuplicates.push({ customId: custom[ci].id, mem0Id: mem0[mi].id });
        matchedCustom.add(ci); matchedMem0.add(mi); break;
      }
      const similarity = overlap(left, right);
      if (similarity >= 0.7) {
        possibleConflicts.push({ customId: custom[ci].id, mem0Id: mem0[mi].id, reason: 'high lexical overlap requires human review' });
        matchedCustom.add(ci); matchedMem0.add(mi); break;
      }
    }
  }
  const customOnly = custom.flatMap((row, index) => matchedCustom.has(index) ? [] : [row.id ?? `custom:${index}`]);
  const mem0Only = mem0.flatMap((row, index) => matchedMem0.has(index) ? [] : [row.id ?? `mem0:${index}`]);
  return {
    counts: { custom: custom.length, mem0: mem0.length, exactDuplicates: exactDuplicates.length, possibleConflicts: possibleConflicts.length, customOnly: customOnly.length, mem0Only: mem0Only.length },
    exactDuplicates, possibleConflicts, customOnly, mem0Only,
    safeToSwitchWriter: possibleConflicts.length === 0 && customOnly.length === 0 && mem0Only.length === 0,
  };
}
