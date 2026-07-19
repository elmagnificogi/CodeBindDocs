import * as assert from 'assert';
import { isBindableSourceRel } from '../../src/util/bindableSources';
import { IndexStore } from '../../src/store/indexStore';

suite('bindableSources', () => {
  const store = {
    isUnderDocsPath(rel: string) {
      return rel === 'docs' || rel.startsWith('docs/');
    },
  } as unknown as IndexStore;

  test('accepts normal source paths', () => {
    assert.strictEqual(isBindableSourceRel('src/extension.ts', store), true);
    assert.strictEqual(isBindableSourceRel('src/util/foo.ts', store), true);
  });

  test('rejects docs, skip prefixes, binaries, lockfile', () => {
    assert.strictEqual(isBindableSourceRel('docs/a.md', store), false);
    assert.strictEqual(isBindableSourceRel('node_modules/x/index.js', store), false);
    assert.strictEqual(isBindableSourceRel('out/extension.js', store), false);
    assert.strictEqual(isBindableSourceRel('media/vditor/dist/index.js', store), false);
    assert.strictEqual(isBindableSourceRel('icon.png', store), false);
    assert.strictEqual(isBindableSourceRel('package-lock.json', store), false);
  });
});
