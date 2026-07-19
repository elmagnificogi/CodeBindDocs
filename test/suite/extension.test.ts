import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { IndexStore } from '../../src/store/indexStore';
import { refreshBindingHash } from '../../src/drift/driftChecker';

suite('CodeBind Docs integration smoke', () => {
  test('initialize creates docs layout and AGENTS.md', async () => {
    await vscode.commands.executeCommand('cbd.initialize');
    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder, 'workspace folder required');
    const docs = path.join(folder.uri.fsPath, 'docs');
    const agents = path.join(folder.uri.fsPath, 'AGENTS.md');
    assert.ok(fs.existsSync(docs), 'docs/ should exist');
    assert.ok(fs.existsSync(agents), 'AGENTS.md should exist');
  });

  test('IndexStore scans binding frontmatter and updates rename prefix', async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder);
    const store = new IndexStore(folder);

    const sampleUri = vscode.Uri.joinPath(folder.uri, 'src', 'sample.ts');
    const docRel = 'docs/sample.md';
    const docUri = store.docUri(docRel);
    const body = `# sample\n\noverview\n`;
    const md = `---
cbd:
  target: src/foo/sample.ts
  kind: file
  symbol: hello
---
${body}`;
    await vscode.workspace.fs.createDirectory(store.docsUri);
    await vscode.workspace.fs.writeFile(docUri, Buffer.from(md, 'utf8'));

    // Ensure target file exists at old path for hash (optional)
    const oldTarget = vscode.Uri.joinPath(folder.uri, 'src', 'foo', 'sample.ts');
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder.uri, 'src', 'foo'));
    await vscode.workspace.fs.writeFile(
      oldTarget,
      Buffer.from('export function hello() { return 1; }\n', 'utf8')
    );

    store.invalidateCache();
    let index = await store.read();
    const found = index.bindings.find((b) => b.doc === docRel || b.doc.endsWith('sample.md'));
    assert.ok(found, 'binding should be scanned');
    assert.strictEqual(found!.target.path, 'src/foo/sample.ts');

    const n = await store.updateTargetPath('src/foo', 'src/bar');
    assert.ok(n >= 1, 'prefix rename should update bindings');
    store.invalidateCache();
    index = await store.read();
    const updated = index.bindings.find((b) => b.doc === found!.doc);
    assert.strictEqual(updated?.target.path, 'src/bar/sample.ts');

    // Move file for hash refresh
    const newTarget = vscode.Uri.joinPath(folder.uri, 'src', 'bar', 'sample.ts');
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder.uri, 'src', 'bar'));
    await vscode.workspace.fs.writeFile(
      newTarget,
      await vscode.workspace.fs.readFile(oldTarget)
    );

    if (updated) {
      await refreshBindingHash(store, updated);
      store.invalidateCache();
      const again = (await store.read()).bindings.find((b) => b.doc === updated.doc);
      assert.ok(again?.anchors?.[0]?.contentHash, 'contentHash should be set');
    }

    void sampleUri;
  });
});
