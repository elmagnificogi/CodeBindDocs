import * as assert from 'assert';
import {
  relativeToDoc,
  resolveFromDoc,
  rewriteImagesForDisk,
  rewriteImagesForWebview,
  safeAssetFileName,
} from '../../src/util/docMedia';

suite('docMedia', () => {
  test('resolveFromDoc and relativeToDoc', () => {
    assert.strictEqual(resolveFromDoc('docs/foo.md', 'assets/a.png'), 'docs/assets/a.png');
    assert.strictEqual(relativeToDoc('docs/foo.md', 'docs/assets/a.png'), 'assets/a.png');
  });

  test('rewriteImagesForWebview / Disk round-trip', () => {
    const md = 'See ![alt](assets/pic.png) please';
    const { markdown, reverse } = rewriteImagesForWebview(md, 'docs/a.md', (rel) => {
      assert.strictEqual(rel, 'docs/assets/pic.png');
      return 'https://webview/fake/docs/assets/pic.png';
    });
    assert.ok(markdown.includes('https://webview/fake/docs/assets/pic.png'));
    const back = rewriteImagesForDisk(markdown, reverse);
    assert.strictEqual(back, md);
  });

  test('safeAssetFileName sanitizes names', () => {
    assert.strictEqual(safeAssetFileName('ok.png'), 'ok.png');
    assert.ok(!safeAssetFileName('a b/c?.png').includes(' '));
    assert.ok(safeAssetFileName('x').endsWith('.png'));
  });
});
