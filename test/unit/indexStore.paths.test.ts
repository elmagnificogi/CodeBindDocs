import * as assert from 'assert';
import * as vscode from 'vscode';
import { IndexStore, relativeMarkdownLink } from '../../src/store/indexStore';
import { Binding, emptyIndex } from '../../src/store/types';

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

  suite('directory bindings', () => {
    const folder = { uri: vscode.Uri.file('/workspace'), name: 'ws', index: 0 } as vscode.WorkspaceFolder;
    const store = new IndexStore(folder);

    test('suggestDocPath with directory flag appends -README', () => {
      assert.strictEqual(
        store.suggestDocPath('src/util', { directory: true }),
        'docs/cbd/util-README.md'
      );
    });

    function dirBinding(doc: string, path: string): Binding {
      return { id: doc, doc, target: { path, kind: 'directory' } };
    }

    test('findDirectoryBindingForRel matches the directory itself and files under it', () => {
      const index = emptyIndex();
      index.bindings.push(dirBinding('docs/util-README.md', 'src/util'));

      assert.strictEqual(
        store.findDirectoryBindingForRel(index, 'src/util')?.doc,
        'docs/util-README.md'
      );
      assert.strictEqual(
        store.findDirectoryBindingForRel(index, 'src/util/foo.ts')?.doc,
        'docs/util-README.md'
      );
      assert.strictEqual(store.findDirectoryBindingForRel(index, 'src/other/foo.ts'), undefined);
      // Must not false-match a sibling folder that merely shares a prefix.
      assert.strictEqual(store.findDirectoryBindingForRel(index, 'src/utilx/foo.ts'), undefined);
    });

    test('findDirectoryBindingForRel prefers the most specific nested directory binding', () => {
      const index = emptyIndex();
      index.bindings.push(
        dirBinding('docs/src-README.md', 'src'),
        dirBinding('docs/util-README.md', 'src/util')
      );

      assert.strictEqual(
        store.findDirectoryBindingForRel(index, 'src/util/foo.ts')?.doc,
        'docs/util-README.md'
      );
      assert.strictEqual(
        store.findDirectoryBindingForRel(index, 'src/other.ts')?.doc,
        'docs/src-README.md'
      );
    });
  });
});
