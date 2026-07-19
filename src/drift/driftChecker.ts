import * as vscode from 'vscode';
import { IndexStore } from '../store/indexStore';
import { Binding, normalizeRelPath } from '../store/types';

export type DriftSeverity = 'info' | 'warning';

export interface DriftIssue {
  bindingId: string;
  message: string;
  severity: DriftSeverity;
  targetPath: string;
}

/**
 * Watches renames and content hashes; updates Markdown frontmatter when possible.
 */
export class DriftChecker {
  private readonly diagnosticCollection: vscode.DiagnosticCollection;
  private readonly statusBar: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];
  private issues: DriftIssue[] = [];

  constructor(private readonly getStore: () => IndexStore | undefined) {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('cim');
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    this.statusBar.command = 'cim.refreshTree';
    this.statusBar.tooltip = 'CIM binding drift';
    this.statusBar.show();

    this.disposables.push(
      this.diagnosticCollection,
      this.statusBar,
      vscode.workspace.onDidRenameFiles((e) => void this.onRename(e)),
      vscode.workspace.onDidSaveTextDocument((doc) => void this.onSave(doc)),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('cim.docsPath') || e.affectsConfiguration('cim.assetsPath')) {
          this.getStore()?.invalidateCache();
          void this.scanAll();
        }
      })
    );
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  getIssues(): DriftIssue[] {
    return this.issues;
  }

  async scanAll(): Promise<DriftIssue[]> {
    const store = this.getStore();
    if (!store || !(await store.exists())) {
      this.issues = [];
      this.applyDiagnostics(store, []);
      this.updateStatus();
      return [];
    }

    store.invalidateCache();
    const index = await store.read();
    const found: DriftIssue[] = [];

    for (const binding of index.bindings) {
      const targetUri = store.targetUri(binding.target.path);
      try {
        await vscode.workspace.fs.stat(targetUri);
      } catch {
        found.push({
          bindingId: binding.id,
          targetPath: binding.target.path,
          severity: 'warning',
          message: `绑定源文件缺失: ${binding.target.path}`,
        });
        continue;
      }

      try {
        await vscode.workspace.fs.stat(store.docUri(binding.doc));
      } catch {
        found.push({
          bindingId: binding.id,
          targetPath: binding.target.path,
          severity: 'warning',
          message: `绑定文档缺失: ${binding.doc}`,
        });
        continue;
      }

      const hashIssues = await this.checkAnchors(store, binding, targetUri);
      found.push(...hashIssues);
    }

    this.issues = found;
    this.applyDiagnostics(store, found);
    this.updateStatus();
    return found;
  }

  private async checkAnchors(
    store: IndexStore,
    binding: Binding,
    targetUri: vscode.Uri
  ): Promise<DriftIssue[]> {
    if (!binding.anchors?.length) {
      return [];
    }
    const currentHash = await store.hashFileContent(targetUri);
    const out: DriftIssue[] = [];
    for (const anchor of binding.anchors) {
      if (anchor.contentHash && anchor.contentHash !== currentHash) {
        out.push({
          bindingId: binding.id,
          targetPath: binding.target.path,
          severity: 'info',
          message: `源文件内容已变（相对 contentHash，${anchor.symbol ?? 'file'}）`,
        });
      }
    }
    if (
      binding.target.kind === 'range' &&
      typeof binding.target.startLine === 'number' &&
      typeof binding.target.endLine === 'number'
    ) {
      const doc = await vscode.workspace.openTextDocument(targetUri);
      if (
        binding.target.startLine < 1 ||
        binding.target.endLine > doc.lineCount ||
        binding.target.startLine > binding.target.endLine
      ) {
        out.push({
          bindingId: binding.id,
          targetPath: binding.target.path,
          severity: 'warning',
          message: `行范围 ${binding.target.startLine}-${binding.target.endLine} 越界（共 ${doc.lineCount} 行）`,
        });
      }
    }
    return out;
  }

  private async onRename(e: vscode.FileRenameEvent): Promise<void> {
    const store = this.getStore();
    if (!store || !(await store.exists())) {
      return;
    }

    let changed = false;
    for (const file of e.files) {
      const oldRel = store.toWorkspaceRelative(file.oldUri);
      const newRel = store.toWorkspaceRelative(file.newUri);
      if (!oldRel || !newRel) {
        continue;
      }
      if (await store.updateTargetPath(oldRel, newRel)) {
        changed = true;
      }
    }

    if (changed) {
      void vscode.window.showInformationMessage('CIM: 已根据改名更新文档头中的 target。');
    }
    await this.scanAll();
  }

  private async onSave(doc: vscode.TextDocument): Promise<void> {
    const store = this.getStore();
    if (!store) {
      return;
    }
    const rel = store.toWorkspaceRelative(doc.uri);
    if (!rel) {
      return;
    }
    if (store.isUnderDocsPath(rel) && rel.endsWith('.md')) {
      if (store.isIndexDoc(rel)) {
        return;
      }
      store.invalidateCache();
      await this.scanAll();
      await store.writeDocsIndex();
      return;
    }
    const index = await store.read();
    if (store.findByTargetPath(index, rel)) {
      await this.scanAll();
    }
  }

  private applyDiagnostics(store: IndexStore | undefined, issues: DriftIssue[]): void {
    this.diagnosticCollection.clear();
    if (!store) {
      return;
    }
    const byPath = new Map<string, vscode.Diagnostic[]>();
    for (const issue of issues) {
      const uri = store.targetUri(issue.targetPath);
      const severity =
        issue.severity === 'warning'
          ? vscode.DiagnosticSeverity.Warning
          : vscode.DiagnosticSeverity.Information;
      const diag = new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 1),
        `CIM: ${issue.message}`,
        severity
      );
      diag.source = 'CIM';
      const list = byPath.get(uri.toString()) ?? [];
      list.push(diag);
      byPath.set(uri.toString(), list);
    }
    for (const [uriStr, diags] of byPath) {
      this.diagnosticCollection.set(vscode.Uri.parse(uriStr), diags);
    }
  }

  private updateStatus(): void {
    const warnings = this.issues.filter((i) => i.severity === 'warning').length;
    const infos = this.issues.filter((i) => i.severity === 'info').length;
    if (warnings === 0 && infos === 0) {
      this.statusBar.text = '$(book) CIM';
      this.statusBar.backgroundColor = undefined;
    } else if (warnings > 0) {
      this.statusBar.text = `$(warning) CIM ${warnings}`;
      this.statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      this.statusBar.text = `$(info) CIM ${infos}`;
      this.statusBar.backgroundColor = undefined;
    }
  }
}

/** Refresh file-level contentHash in Markdown frontmatter after bind. */
export async function refreshBindingHash(
  store: IndexStore,
  binding: Binding
): Promise<void> {
  const targetUri = store.targetUri(binding.target.path);
  const hash = await store.hashFileContent(targetUri);
  if (!binding.anchors?.length) {
    binding.anchors = [{ contentHash: hash }];
  } else {
    for (const a of binding.anchors) {
      a.contentHash = hash;
    }
  }
  await store.writeBinding(binding);
}
