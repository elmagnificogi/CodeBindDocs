import * as assert from 'assert';
import { relativeMarkdownLink } from '../../src/store/indexStore';

suite('indexStore.paths', () => {
  test('relativeMarkdownLink same folder', () => {
    assert.strictEqual(
      relativeMarkdownLink('docs/a.md', 'docs/b.md'),
      './b.md'
    );
  });

  test('relativeMarkdownLink nested up', () => {
    assert.strictEqual(
      relativeMarkdownLink('docs/sub/a.md', 'docs/b.md'),
      '../b.md'
    );
  });

  test('relativeMarkdownLink into nested', () => {
    assert.strictEqual(
      relativeMarkdownLink('docs/a.md', 'docs/sub/b.md'),
      './sub/b.md'
    );
  });
});
