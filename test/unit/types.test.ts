import * as assert from 'assert';
import { emptyIndex, normalizeRelPath } from '../../src/store/types';

suite('types', () => {
  test('normalizeRelPath converts backslashes and strips ./', () => {
    assert.strictEqual(normalizeRelPath('src\\foo\\bar.ts'), 'src/foo/bar.ts');
    assert.strictEqual(normalizeRelPath('./src/foo.ts'), 'src/foo.ts');
  });

  test('emptyIndex returns version 1 with no bindings', () => {
    const idx = emptyIndex();
    assert.strictEqual(idx.version, 1);
    assert.deepStrictEqual(idx.bindings, []);
  });
});
