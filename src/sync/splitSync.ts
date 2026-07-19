import * as vscode from 'vscode';
import { IndexStore } from '../store/indexStore';
import { Binding, normalizeRelPath } from '../store/types';
import { MarkdownPane } from '../webview/markdownPane';

/**
 * Keeps a Typora-like Markdown pane open beside the active source file when a binding exists.
 * When unbound, shows an empty state with a create-binding button.
 */
export class SplitSync {
  private enabled = true;
  private syncing = false;
  private readonly pane: MarkdownPane;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly getStore: () => IndexStore | undefined,
    extensionUri: vscode.Uri
  ) {
    this.pane = new MarkdownPane(extensionUri);
    const cfg = vscode.workspace.getConfiguration('cim');
    this.enabled = cfg.get<boolean>('splitSync.enabled', true);

    this.disposables.push(
      this.pane,
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        void this.onActiveEditor(editor);
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('cim.splitSync.enabled')) {
          this.enabled = vscode.workspace
            .getConfiguration('cim')
            .get<boolean>('splitSync.enabled', true);
        }
      })
    );
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    void vscode.workspace
      .getConfiguration('cim')
      .update('splitSync.enabled', value, vscode.ConfigurationTarget.Workspace);
  }

  toggle(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  async syncNow(editor?: vscode.TextEditor): Promise<void> {
    await this.onActiveEditor(editor ?? vscode.window.activeTextEditor);
  }

  async revealDocForUri(sourceUri: vscode.Uri): Promise<boolean> {
    const store = this.getStore();
    if (!store) {
      return false;
    }
    const rel = store.toWorkspaceRelative(sourceUri);
    if (!rel) {
      return false;
    }
    const index = await store.read();
    const binding = store.findByTargetPath(index, rel);
    if (!binding) {
      return false;
    }
    await this.openDoc(store, binding, true);
    return true;
  }

  async openDocUri(docUri: vscode.Uri, forceFocus = true): Promise<void> {
    const column = this.resolveColumn();
    await this.pane.show(docUri, column, forceFocus);
  }

  private async onActiveEditor(editor: vscode.TextEditor | undefined): Promise<void> {
    if (!this.enabled || this.syncing || !editor) {
      return;
    }
    const store = this.getStore();
    if (!store) {
      return;
    }

    const uri = editor.document.uri;
    if (uri.scheme !== 'file') {
      return;
    }

    const rel = store.toWorkspaceRelative(uri);
    if (!rel || store.isUnderDocsPath(rel)) {
      return;
    }

    if (!(await store.exists())) {
      return;
    }

    const index = await store.read();
    const binding = store.findByTargetPath(index, rel);
    if (!binding) {
      if (shouldOfferBind(rel)) {
        await this.showUnbound(rel, false);
      }
      return;
    }

    await this.openDoc(store, binding, false);
  }

  private async showUnbound(sourceRel: string, forceFocus: boolean): Promise<void> {
    this.syncing = true;
    try {
      await this.pane.showUnbound(sourceRel, this.resolveColumn(), forceFocus);
    } finally {
      this.syncing = false;
    }
  }

  private resolveColumn(): vscode.ViewColumn {
    const mode = vscode.workspace
      .getConfiguration('cim')
      .get<string>('splitSync.viewColumn', 'Beside');
    if (mode === 'Two') {
      return vscode.ViewColumn.Two;
    }
    return vscode.ViewColumn.Beside;
  }

  private async openDoc(
    store: IndexStore,
    binding: Binding,
    forceFocus: boolean
  ): Promise<void> {
    const docUri = store.docUri(normalizeRelPath(binding.doc));
    if (this.pane.currentFsPath === docUri.fsPath && !forceFocus) {
      return;
    }

    this.syncing = true;
    try {
      await this.pane.show(docUri, this.resolveColumn(), forceFocus);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      void vscode.window.showWarningMessage(`CIM: 无法打开绑定文档（${msg}）`);
    } finally {
      this.syncing = false;
    }
  }
}

function shouldOfferBind(rel: string): boolean {
  const skipPrefixes = [
    'node_modules/',
    'out/',
    'dist/',
    '.git/',
    'media/vditor/',
    '.vscode/',
  ];
  if (skipPrefixes.some((p) => rel.startsWith(p) || rel.includes('/' + p))) {
    return false;
  }
  if (/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|eot|map|vsix)$/i.test(rel)) {
    return false;
  }
  if (rel === 'package-lock.json') {
    return false;
  }
  const prompt = vscode.workspace
    .getConfiguration('cim')
    .get<boolean>('splitSync.promptWhenUnbound', true);
  return prompt;
}
