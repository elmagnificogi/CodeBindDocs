import * as assert from 'assert';
import {
  findOverlappingRangePairs,
  findOverlapsWithExisting,
  lineRangesOverlap,
} from '../../src/util/rangeOverlap';
import { Binding } from '../../src/store/types';

function rangeBinding(
  doc: string,
  path: string,
  startLine: number,
  endLine: number
): Binding {
  return {
    id: doc,
    doc,
    target: { path, kind: 'range', startLine, endLine },
  };
}

suite('rangeOverlap', () => {
  test('lineRangesOverlap detects inclusive overlap', () => {
    assert.strictEqual(lineRangesOverlap(1, 5, 5, 8), true);
    assert.strictEqual(lineRangesOverlap(1, 4, 5, 8), false);
    assert.strictEqual(lineRangesOverlap(10, 20, 1, 15), true);
  });

  test('findOverlappingRangePairs finds one pair once', () => {
    const bindings = [
      rangeBinding('a.md', 'src/x.ts', 1, 10),
      rangeBinding('b.md', 'src/x.ts', 8, 15),
      rangeBinding('c.md', 'src/y.ts', 1, 3),
    ];
    const pairs = findOverlappingRangePairs(bindings);
    assert.strictEqual(pairs.length, 1);
    assert.strictEqual(pairs[0].path, 'src/x.ts');
  });

  test('findOverlapsWithExisting ignores self and other files', () => {
    const existing = [
      rangeBinding('a.md', 'src/x.ts', 1, 10),
      rangeBinding('b.md', 'src/x.ts', 20, 30),
    ];
    const hits = findOverlapsWithExisting(existing, 'src/x.ts', 8, 12, 'a.md');
    assert.strictEqual(hits.length, 0);
    const hits2 = findOverlapsWithExisting(existing, 'src/x.ts', 8, 12);
    assert.strictEqual(hits2.length, 1);
    assert.strictEqual(hits2[0].doc, 'a.md');
  });
});
