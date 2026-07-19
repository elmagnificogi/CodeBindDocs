import { Binding, normalizeRelPath } from '../store/types';

export type OverlapPair = {
  a: Binding;
  b: Binding;
  path: string;
};

function isRangeBinding(b: Binding): b is Binding & {
  target: { kind: 'range'; path: string; startLine: number; endLine: number };
} {
  return (
    b.target.kind === 'range' &&
    typeof b.target.startLine === 'number' &&
    typeof b.target.endLine === 'number'
  );
}

/** Inclusive 1-based line ranges overlap when they share any line. */
export function lineRangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/** Find pairwise overlapping range bindings (each pair once). */
export function findOverlappingRangePairs(bindings: Binding[]): OverlapPair[] {
  const byPath = new Map<string, Binding[]>();
  for (const b of bindings) {
    if (!isRangeBinding(b)) {
      continue;
    }
    const path = normalizeRelPath(b.target.path);
    const list = byPath.get(path) ?? [];
    list.push(b);
    byPath.set(path, list);
  }

  const pairs: OverlapPair[] = [];
  for (const [path, list] of byPath) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (
          lineRangesOverlap(
            a.target.startLine!,
            a.target.endLine!,
            b.target.startLine!,
            b.target.endLine!
          )
        ) {
          pairs.push({ a, b, path });
        }
      }
    }
  }
  return pairs;
}

/** Whether a candidate range overlaps any existing range on the same file. */
export function findOverlapsWithExisting(
  existing: Binding[],
  path: string,
  startLine: number,
  endLine: number,
  excludeDoc?: string
): Binding[] {
  const norm = normalizeRelPath(path);
  const exclude = excludeDoc ? normalizeRelPath(excludeDoc) : undefined;
  return existing.filter((b) => {
    if (!isRangeBinding(b)) {
      return false;
    }
    if (normalizeRelPath(b.target.path) !== norm) {
      return false;
    }
    if (exclude && normalizeRelPath(b.doc) === exclude) {
      return false;
    }
    return lineRangesOverlap(startLine, endLine, b.target.startLine, b.target.endLine);
  });
}
