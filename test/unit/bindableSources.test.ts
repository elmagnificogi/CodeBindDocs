import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  isBindableDirectoryRel,
  isBindableSourceRel,
  scanBindingCoverage,
} from '../../src/util/bindableSources';
import { IndexStore } from '../../src/store/indexStore';
import { CbdIndex } from '../../src/store/types';

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

  test('isBindableDirectoryRel accepts normal source folders', () => {
    assert.strictEqual(isBindableDirectoryRel('src/util', store), true);
    assert.strictEqual(isBindableDirectoryRel('src', store), true);
  });

  test('isBindableDirectoryRel rejects docs and skip-prefix folders', () => {
    assert.strictEqual(isBindableDirectoryRel('docs', store), false);
    assert.strictEqual(isBindableDirectoryRel('docs/sub', store), false);
    assert.strictEqual(isBindableDirectoryRel('node_modules', store), false);
    assert.strictEqual(isBindableDirectoryRel('.git', store), false);
    assert.strictEqual(isBindableDirectoryRel('', store), false);
  });

  test('scanBindingCoverage ignores directory bindings when counting files', async () => {
    const orig = vscode.workspace.findFiles;
    vscode.workspace.findFiles = async () =>
      ['src/a.ts', 'src/b.ts'].map((p) => ({ fsPath: p, scheme: 'file' })) as vscode.Uri[];
    const coverageStore = {
      isUnderDocsPath(rel: string) {
        return rel === 'docs/cbd' || rel.startsWith('docs/cbd/');
      },
      toWorkspaceRelative(uri: { fsPath: string }) {
        return uri.fsPath.replace(/\\/g, '/');
      },
    } as unknown as IndexStore;
    const index: CbdIndex = {
      version: 1,
      bindings: [
        {
          id: 'dir',
          doc: 'docs/cbd/src-README.md',
          target: { path: 'src', kind: 'directory' },
        },
        {
          id: 'file',
          doc: 'docs/cbd/a.md',
          target: { path: 'src/a.ts', kind: 'file' },
        },
      ],
    };
    try {
      const report = await scanBindingCoverage(coverageStore, index);
      assert.strictEqual(report.boundCount, 1);
      assert.deepStrictEqual(report.unbound, ['src/b.ts']);
      assert.strictEqual(report.total, 2);
    } finally {
      vscode.workspace.findFiles = orig;
    }
  });
});
