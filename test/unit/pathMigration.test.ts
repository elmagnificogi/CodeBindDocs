import * as assert from 'assert';
import { planMoves } from '../../src/store/pathMigration';

suite('pathMigration', () => {
  test('planMoves rewrites the old prefix to the new one', () => {
    const { moves, conflicts } = planMoves(
      ['docs/a.md', 'docs/sub/b.md'],
      'docs',
      'docs/cbd',
      () => false
    );
    assert.deepStrictEqual(
      moves,
      [
        { from: 'docs/a.md', to: 'docs/cbd/a.md' },
        { from: 'docs/sub/b.md', to: 'docs/cbd/sub/b.md' },
      ]
    );
    assert.deepStrictEqual(conflicts, []);
  });

  test('planMoves ignores paths not under the old prefix', () => {
    const { moves } = planMoves(
      ['docs/a.md', 'other/b.md'],
      'docs',
      'docs/cbd',
      () => false
    );
    assert.deepStrictEqual(moves, [{ from: 'docs/a.md', to: 'docs/cbd/a.md' }]);
  });

  test('planMoves does not false-match a sibling folder that shares a prefix', () => {
    const { moves } = planMoves(['docsx/a.md'], 'docs', 'docs/cbd', () => false);
    assert.deepStrictEqual(moves, []);
  });

  test('planMoves reports conflicts and excludes them from moves', () => {
    const { moves, conflicts } = planMoves(
      ['docs/a.md', 'docs/b.md'],
      'docs',
      'docs/cbd',
      (dest) => dest === 'docs/cbd/b.md'
    );
    assert.deepStrictEqual(moves, [{ from: 'docs/a.md', to: 'docs/cbd/a.md' }]);
    assert.deepStrictEqual(conflicts, ['docs/cbd/b.md']);
  });

  test('planMoves handles the old path itself being a single file', () => {
    const { moves } = planMoves(['docs.md'], 'docs.md', 'documentation.md', () => false);
    assert.deepStrictEqual(moves, [{ from: 'docs.md', to: 'documentation.md' }]);
  });
});
