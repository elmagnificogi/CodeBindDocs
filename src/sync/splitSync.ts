import * as vscode from 'vscode';
import { DriftIssue } from '../drift/driftChecker';
import { IndexStore } from '../store/indexStore';
import { Binding, normalizeRelPath } from '../store/types';
import { isBindableSourceRel } from '../util/bindableSources';
import { MarkdownPane } from '../webview/markdownPane';

/**
 * Keeps a Typora-like Markdown pane open beside the active source file when a binding exists.
 * Supports file-level and range (code-block) YAML bindings; cursor line picks the tightest range.
 */
export class SplitSync {
  private enabled = true;
  private syncing = false;
  private readonly pane: MarkdownPane;
  private readonly disposables: vscode.Disposable[] = [];
  private selectionTimer: NodeJS.Timeout | undefined;
  private readonly statusBar: vscode.StatusBarItem;

  constructor(
    private readonly getStore: () => IndexStore | undefined,
    extensionUri: vscode.Uri,
    getDriftIssues: () => DriftIssue[] = () => [],
    refreshDrift: () => Promise<void> = async () => undefined
  ) {
    this.pane = new MarkdownPane(extensionUri, getStore, getDriftIssues, refreshDrift);
    const cfg = vscode.workspace.getConfiguration('cim');
    this.enabled = cfg.get<boolean>('splitSync.enabled', true);

    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
    this.statusBar.command = 'cim.revealBoundDoc';
    this.statusBar.tooltip = '打开当前文件的 CIM 旁路文档';

    this.disposables.push(
      this.pane,
      this.statusBar,
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        void this.onActiveEditor(editor);
      }),
      vscode.window.onDidChangeTextEditorSelection((e) => {
        if (e.textEditor !== vscode.window.activeTextEditor) {
          return;
        }
        if (this.selectionTimer) {
          clearTimeout(this.selectionTimer);
        }
        this.selectionTimer = setTimeout(() => {
          void this.syncForEditor(e.textEditor, false);
        }, 120);
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('cim.splitSync.enabled')) {
          this.enabled = vscode.workspace
            .getConfiguration('cim')
            .get<boolean>('splitSync.enabled', true);
        }
      })
    );

    // Restored tabs are often already active before listeners attach, so no
    // onDidChangeActiveTextEditor fires — retry sync after activate.
    this.scheduleStartupSync();
  }

  dispose(): void {
    if (this.selectionTimer) {
      clearTimeout(this.selectionTimer);
    }
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

  /** Sync current or first visible file editor to the doc pane. */
  async syncNow(editor?: vscode.TextEditor): Promise<void> {
    const target =
      editor ??
      vscode.window.activeTextEditor ??
      vscode.window.visibleTextEditors.find((e) => e.document.uri.scheme === 'file');
    await this.onActiveEditor(target);
  }

  private scheduleStartupSync(): void {
    for (const ms of [0, 150, 500, 1500]) {
      const handle = setTimeout(() => {
        void this.syncNow();
      }, ms);
      this.disposables.push({ dispose: () => clearTimeout(handle) });
    }
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
    const editor = vscode.window.visibleTextEditors.find(
      (e) => e.document.uri.fsPath === sourceUri.fsPath
    );
    const line = (editor?.selection.active.line ?? 0) + 1;
    const index = await store.read();
    const binding =
      store.resolveBindingForLine(index, rel, line) ?? store.findByTargetPath(index, rel);
    if (!binding) {
      return false;
    }
    await this.openDoc(store, binding, true);
    return true;
  }

  async openDocUri(docUri: vscode.Uri, forceFocus = true): Promise<void> {
    await this.pane.show(docUri, this.resolveColumn(), forceFocus);
  }

  async openHome(forceFocus = true): Promise<void> {
    await this.pane.showHome(this.resolveColumn(), forceFocus);
  }

  /** Ensure Vditor starts warming when the pane already exists (e.g. during bind dialogs). */
  async warmEditor(): Promise<void> {
    await this.pane.warmIr();
  }

  /** Doc currently shown in the pane (workspace-relative), if any. */
  currentDocRel(): string | undefined {
    return this.pane.currentDocRel;
  }

  isHome(): boolean {
    return this.pane.isHome;
  }

  releaseDoc(docRel: string): void {
    this.pane.releaseDoc(docRel);
  }

  /** Sync pane for a workspace-relative source path (unbound if no bindings left). */
  async syncForSourceRel(sourceRel: string, forceFocus = false): Promise<void> {
    const store = this.getStore();
    if (!store) {
      return;
    }
    const rel = normalizeRelPath(sourceRel);
    if (!rel || store.isUnderDocsPath(rel)) {
      return;
    }
    if (!(await store.exists())) {
      return;
    }
    const index = await store.read();
    const forFile = store.findBindingsForTarget(index, rel);
    if (!forFile.length) {
      await this.showUnbound(rel, forceFocus, shouldOfferBind(rel, store));
      return;
    }
    const editor = vscode.window.visibleTextEditors.find(
      (e) => store.toWorkspaceRelative(e.document.uri) === rel
    );
    const line = (editor?.selection.active.line ?? 0) + 1;
    const binding =
      store.resolveBindingForLine(index, rel, line) ??
      forFile.find((b) => b.target.kind === 'file') ??
      forFile[0];
    await this.openDoc(store, binding, forceFocus);
  }

  private async onActiveEditor(editor: vscode.TextEditor | undefined): Promise<void> {
    await this.syncForEditor(editor, false);
  }

  private async syncForEditor(
    editor: vscode.TextEditor | undefined,
    forceFocus: boolean
  ): Promise<void> {
    if (!this.enabled || this.syncing || !editor) {
      this.updateStatusBar(undefined);
      return;
    }
    const store = this.getStore();
    if (!store) {
      this.updateStatusBar(undefined);
      return;
    }

    const uri = editor.document.uri;
    if (uri.scheme !== 'file') {
      this.updateStatusBar(undefined);
      return;
    }

    const rel = store.toWorkspaceRelative(uri);
    if (!rel || store.isUnderDocsPath(rel)) {
      this.updateStatusBar(undefined);
      return;
    }

    if (!(await store.exists())) {
      this.updateStatusBar(undefined);
      return;
    }

    const index = await store.read();
    const forFile = store.findBindingsForTarget(index, rel);
    if (!forFile.length) {
      this.updateStatusBar(undefined);
      // Always leave the previous doc; otherwise switching package.json → package-lock.json
      // (and other skip-list files) keeps showing the old binding.
      await this.showUnbound(rel, forceFocus, shouldOfferBind(rel, store));
      return;
    }

    this.updateStatusBar(forFile.length);
    const line = editor.selection.active.line + 1;
    const binding =
      store.resolveBindingForLine(index, rel, line) ??
      forFile.find((b) => b.target.kind === 'file') ??
      forFile[0];

    await this.openDoc(store, binding, forceFocus);
  }

  private updateStatusBar(bindingCount: number | undefined): void {
    if (!bindingCount) {
      this.statusBar.hide();
      return;
    }
    this.statusBar.text =
      bindingCount > 1 ? `$(book) CIM (${bindingCount})` : '$(book) CIM 文档';
    this.statusBar.show();
  }

  private async showUnbound(
    sourceRel: string,
    forceFocus: boolean,
    canCreate = true
  ): Promise<void> {
    this.syncing = true;
    try {
      await this.pane.showUnbound(sourceRel, this.resolveColumn(), forceFocus, canCreate);
    } finally {
      this.syncing = false;
    }
  }

  private resolveColumn(): vscode.ViewColumn {
    // Keep the CIM pane in its current group — Beside/Two on reveal resizes splits.
    const existing = this.pane.viewColumn;
    if (existing != null) {
      return existing;
    }
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

function shouldOfferBind(rel: string, store: IndexStore): boolean {
  if (!isBindableSourceRel(rel, store)) {
    return false;
  }
  const prompt = vscode.workspace
    .getConfiguration('cim')
    .get<boolean>('splitSync.promptWhenUnbound', true);
  return prompt;
}
