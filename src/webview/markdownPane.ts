import * as vscode from 'vscode';
import { DriftIssue } from '../drift/driftChecker';
import { joinMarkdown, splitMarkdown } from '../store/frontmatter';
import { IndexStore } from '../store/indexStore';
import { normalizeRelPath } from '../store/types';
import { protectHrInFences, unprotectHrInFences } from './mdProtect';

type DocMode = 'ir' | 'source';

type DocListItem = {
  doc: string;
  target: string;
  title: string;
  kind?: 'file' | 'range' | 'index';
  startLine?: number;
  endLine?: number;
  symbol?: string;
};

type MissingItem = {
  kind: 'missing-target' | 'missing-doc' | 'hash' | 'range' | 'symbol' | 'overlap';
  target: string;
  doc: string;
  message: string;
};

type SourceJump = {
  path: string;
  kind: 'file' | 'range';
  startLine?: number;
  endLine?: number;
};

type HostToWeb =
  | {
      type: 'load';
      title: string;
      markdown: string;
      mode: DocMode;
      docRel: string;
      deletable: boolean;
      /** When set, show「定位源码」and jump to this range/file. */
      sourceJump?: SourceJump;
      canBack: boolean;
      canForward: boolean;
    }
  | {
      type: 'unbound';
      sourceRel: string;
      canCreate: boolean;
      canBack: boolean;
      canForward: boolean;
    }
  | {
      type: 'home';
      docsPath: string;
      docs: DocListItem[];
      missing: MissingItem[];
      /** Soft reminders: source changed, check if docs need sync (not mandatory). */
      hints: MissingItem[];
      canBack: boolean;
      canForward: boolean;
    }
  | { type: 'warmIr' };

type WebToHost =
  | { type: 'ready' }
  | { type: 'markdownChanged'; markdown: string }
  | { type: 'switchMode'; mode: DocMode; markdown?: string }
  | { type: 'createBind'; sourceRel: string }
  | { type: 'navHome' }
  | { type: 'navBack' }
  | { type: 'navForward' }
  | { type: 'openDoc'; docRel: string }
  | { type: 'deleteDoc'; docRel: string }
  | { type: 'openTarget'; sourceRel: string; startLine?: number; endLine?: number }
  | { type: 'rebindDoc'; docRel: string }
  | { type: 'retightenRange'; docRel: string }
  | { type: 'refreshHash'; docRel: string }
  | { type: 'refreshAllHashes' };

type NavEntry =
  | { kind: 'home' }
  | { kind: 'doc'; docRel: string }
  | { kind: 'unbound'; sourceRel: string };

/**
 * Typora-like Markdown pane with Home catalog and Back/Forward history.
 */
export class MarkdownPane {
  private panel: vscode.WebviewPanel | undefined;
  private currentUri: vscode.Uri | undefined;
  private unboundSourceRel: string | undefined;
  private unboundCanCreate = true;
  private viewingHome = false;
  private header: string | undefined;
  private writing = false;
  private saveTimer: NodeJS.Timeout | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private mode: DocMode = 'ir';
  private history: NavEntry[] = [];
  private historyIndex = -1;
  private navigatingHistory = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly getStore: () => IndexStore | undefined,
    private readonly getDriftIssues: () => DriftIssue[] = () => [],
    private readonly refreshDrift: () => Promise<void> = async () => undefined
  ) {
    this.mode = this.readModeSetting();

    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('cim.docPane.mode')) {
          this.mode = this.readModeSetting();
        }
      }),
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (this.writing || !this.currentUri || this.viewingHome) {
          return;
        }
        if (doc.uri.fsPath === this.currentUri.fsPath) {
          void this.reloadFromDisk();
        }
      })
    );
  }

  private readModeSetting(): DocMode {
    const raw = vscode.workspace
      .getConfiguration('cim')
      .get<string>('docPane.mode', 'ir');
    if (raw === 'source' || raw === 'sv') {
      return 'source';
    }
    return 'ir';
  }

  dispose(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.panel?.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  get currentFsPath(): string | undefined {
    return this.currentUri?.fsPath;
  }

  /** Workspace-relative path of the doc currently loaded (not home/unbound). */
  get currentDocRel(): string | undefined {
    if (!this.currentUri || this.viewingHome || this.unboundSourceRel) {
      return undefined;
    }
    return this.getStore()?.toWorkspaceRelative(this.currentUri);
  }

  get isHome(): boolean {
    return this.viewingHome;
  }

  get currentUnboundSource(): string | undefined {
    return this.unboundSourceRel;
  }

  /** Cancel autosave and detach if the pane is showing this doc (before file delete). */
  releaseDoc(docWorkspaceRel: string): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
    }
    const cur = this.currentDocRel;
    if (cur && normalizeRelPath(cur) === normalizeRelPath(docWorkspaceRel)) {
      this.currentUri = undefined;
      this.header = undefined;
    }
  }

  /** Current editor group of the CIM pane, if already open. */
  get viewColumn(): vscode.ViewColumn | undefined {
    return this.panel?.viewColumn;
  }

  /**
   * Prefer the pane's existing column so reveal() does not create/resize splits.
   * Only use the requested column when creating the panel for the first time.
   */
  private stayColumn(requested: vscode.ViewColumn): vscode.ViewColumn {
    return this.panel?.viewColumn ?? requested;
  }

  async show(docUri: vscode.Uri, column: vscode.ViewColumn, forceFocus: boolean): Promise<void> {
    const store = this.getStore();
    const docRel = store?.toWorkspaceRelative(docUri);
    const col = this.stayColumn(column);

    if (
      this.panel &&
      this.currentUri?.fsPath === docUri.fsPath &&
      !this.viewingHome &&
      !this.unboundSourceRel
    ) {
      if (forceFocus) {
        this.panel.reveal(col, false);
      }
      return;
    }

    this.unboundSourceRel = undefined;
    this.viewingHome = false;
    this.currentUri = docUri;
    await this.ensurePanel(col, !forceFocus);

    if (docRel && !this.navigatingHistory) {
      this.pushHistory({ kind: 'doc', docRel: normalizeRelPath(docRel) });
    }

    await this.reloadFromDisk();
    if (forceFocus) {
      this.panel?.reveal(this.stayColumn(col), false);
    }
  }

  async showUnbound(
    sourceRel: string,
    column: vscode.ViewColumn,
    forceFocus: boolean,
    canCreate = true
  ): Promise<void> {
    const col = this.stayColumn(column);
    if (
      this.unboundSourceRel === sourceRel &&
      this.panel &&
      !this.currentUri &&
      !this.viewingHome
    ) {
      if (forceFocus) {
        this.panel.reveal(col, false);
      }
      return;
    }

    this.currentUri = undefined;
    this.header = undefined;
    this.viewingHome = false;
    this.unboundSourceRel = sourceRel;
    this.unboundCanCreate = canCreate;
    await this.ensurePanel(col, !forceFocus);

    if (!this.navigatingHistory) {
      this.pushHistory({ kind: 'unbound', sourceRel });
    }

    this.panel!.title = 'CIM · 无关联文档';
    await this.panel!.webview.postMessage({
      type: 'unbound',
      sourceRel,
      canCreate,
      ...this.navFlags(),
    } satisfies HostToWeb);
    if (forceFocus) {
      this.panel?.reveal(this.stayColumn(col), false);
    }
  }

  async showHome(column: vscode.ViewColumn, forceFocus = true): Promise<void> {
    await this.flushPendingSave();
    this.currentUri = undefined;
    this.header = undefined;
    this.unboundSourceRel = undefined;
    this.viewingHome = true;
    const col = this.stayColumn(column);
    await this.ensurePanel(col, !forceFocus);

    if (!this.navigatingHistory) {
      this.pushHistory({ kind: 'home' });
    }

    await this.refreshDrift();
    await this.postHome();
    if (forceFocus) {
      this.panel?.reveal(this.stayColumn(col), false);
    }
  }

  private navFlags(): { canBack: boolean; canForward: boolean } {
    return {
      canBack: this.historyIndex > 0,
      canForward: this.historyIndex >= 0 && this.historyIndex < this.history.length - 1,
    };
  }

  private pushHistory(entry: NavEntry): void {
    const cur = this.history[this.historyIndex];
    if (cur && sameNav(cur, entry)) {
      return;
    }
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(entry);
    this.historyIndex = this.history.length - 1;
  }

  private async restoreHistory(entry: NavEntry): Promise<void> {
    this.navigatingHistory = true;
    try {
      const column = this.panel?.viewColumn ?? vscode.ViewColumn.Beside;
      if (entry.kind === 'home') {
        await this.showHome(column, false);
      } else if (entry.kind === 'doc') {
        const store = this.getStore();
        if (!store) {
          return;
        }
        await this.show(store.docUri(entry.docRel), column, false);
      } else {
        await this.showUnbound(entry.sourceRel, column, false);
      }
    } finally {
      this.navigatingHistory = false;
      await this.postNavOnly();
    }
  }

  private async postNavOnly(): Promise<void> {
    // reload current view payload already includes flags; for home/unbound we re-send
    if (this.viewingHome) {
      await this.postHome();
    } else if (this.unboundSourceRel && !this.currentUri) {
      await this.panel?.webview.postMessage({
        type: 'unbound',
        sourceRel: this.unboundSourceRel,
        canCreate: this.unboundCanCreate,
        ...this.navFlags(),
      } satisfies HostToWeb);
    } else if (this.currentUri) {
      await this.reloadFromDisk();
    }
  }

  private async postHome(): Promise<void> {
    const store = this.getStore();
    const docs: DocListItem[] = [];
    const missing: MissingItem[] = [];
    const hints: MissingItem[] = [];
    let docsPath = 'docs';
    if (store) {
      docsPath = store.docsPath;
      if (await store.exists()) {
        const index = await store.read();
        for (const b of index.bindings) {
          docs.push({
            doc: b.doc,
            target: b.target.path,
            title: b.doc.split('/').pop() ?? b.doc,
            kind: b.target.kind === 'range' ? 'range' : 'file',
            startLine: b.target.startLine,
            endLine: b.target.endLine,
            symbol: b.anchors?.[0]?.symbol,
          });
        }
        docs.unshift({
          doc: store.indexDocPath,
          target: '(汇总)',
          title: 'cim-index.md',
          kind: 'index',
        });
      }
    }

    for (const issue of this.getDriftIssues()) {
      if (issue.kind === 'hash') {
        hints.push({
          kind: issue.kind,
          target: issue.targetPath,
          doc: issue.doc,
          message: issue.message,
        });
        continue;
      }
      if (
        issue.kind !== 'missing-target' &&
        issue.kind !== 'missing-doc' &&
        issue.kind !== 'range' &&
        issue.kind !== 'symbol' &&
        issue.kind !== 'overlap'
      ) {
        continue;
      }
      missing.push({
        kind: issue.kind,
        target: issue.targetPath,
        doc: issue.doc,
        message: issue.message,
      });
    }

    this.panel!.title = 'CIM · 主页';
    await this.panel!.webview.postMessage({
      type: 'home',
      docsPath,
      docs,
      missing,
      hints,
      ...this.navFlags(),
    } satisfies HostToWeb);
  }

  /** Pre-create Vditor off-screen so the first doc open skips cold init. */
  async warmIr(): Promise<void> {
    // Never create a new editor group just to warm — that resizes splits mid-dialog.
    if (!this.panel) {
      return;
    }
    await this.panel.webview.postMessage({ type: 'warmIr' } satisfies HostToWeb);
  }

  get isOpen(): boolean {
    return Boolean(this.panel);
  }

  private async ensurePanel(column: vscode.ViewColumn, preserveFocus: boolean): Promise<void> {
    if (this.panel) {
      // Never move an existing panel into Beside/Two — that resizes editor groups.
      const col = this.panel.viewColumn ?? column;
      this.panel.reveal(col, preserveFocus);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'cim.markdownPane',
      'CIM Doc',
      { viewColumn: column, preserveFocus },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
      }
    );

    this.panel.webview.html = this.getHtml(this.panel.webview);

    this.panel.webview.onDidReceiveMessage(async (msg: WebToHost) => {
      if (msg.type === 'ready') {
        if (this.viewingHome) {
          await this.postHome();
        } else if (this.unboundSourceRel && !this.currentUri) {
          await this.panel?.webview.postMessage({
            type: 'unbound',
            sourceRel: this.unboundSourceRel,
            canCreate: this.unboundCanCreate,
            ...this.navFlags(),
          } satisfies HostToWeb);
        } else {
          await this.reloadFromDisk();
        }
        return;
      }
      if (msg.type === 'createBind') {
        await vscode.commands.executeCommand('cim.bindCurrentFile', msg.sourceRel);
        return;
      }
      if (msg.type === 'navHome') {
        await this.flushPendingSave();
        await this.showHome(this.panel?.viewColumn ?? vscode.ViewColumn.Beside, true);
        return;
      }
      if (msg.type === 'navBack') {
        if (this.historyIndex <= 0) {
          return;
        }
        await this.flushPendingSave();
        this.historyIndex -= 1;
        await this.restoreHistory(this.history[this.historyIndex]);
        return;
      }
      if (msg.type === 'navForward') {
        if (this.historyIndex >= this.history.length - 1) {
          return;
        }
        await this.flushPendingSave();
        this.historyIndex += 1;
        await this.restoreHistory(this.history[this.historyIndex]);
        return;
      }
      if (msg.type === 'openDoc') {
        const store = this.getStore();
        if (!store) {
          return;
        }
        await this.flushPendingSave();
        const uri = store.docUri(normalizeRelPath(msg.docRel));
        await this.show(uri, this.panel?.viewColumn ?? vscode.ViewColumn.Beside, true);
        return;
      }
      if (msg.type === 'deleteDoc') {
        await vscode.commands.executeCommand('cim.deleteDoc', {
          docRel: msg.docRel,
        });
        return;
      }
      if (msg.type === 'rebindDoc') {
        await vscode.commands.executeCommand('cim.rebindDoc', {
          docRel: msg.docRel,
        });
        return;
      }
      if (msg.type === 'retightenRange') {
        await vscode.commands.executeCommand('cim.retightenRange', {
          docRel: msg.docRel,
        });
        return;
      }
      if (msg.type === 'refreshHash') {
        await vscode.commands.executeCommand('cim.refreshDocHash', {
          docRel: msg.docRel,
        });
        return;
      }
      if (msg.type === 'refreshAllHashes') {
        await vscode.commands.executeCommand('cim.refreshAllDocHashes');
        return;
      }
      if (msg.type === 'openTarget') {
        await vscode.commands.executeCommand('cim.revealSourceRange', {
          sourceRel: msg.sourceRel,
          startLine: msg.startLine,
          endLine: msg.endLine,
        });
        return;
      }
      if (msg.type === 'switchMode') {
        // Webview already switched locally; only persist preference + content.
        if (typeof msg.markdown === 'string' && this.currentUri) {
          this.scheduleSave(msg.markdown);
        }
        this.mode = msg.mode;
        void vscode.workspace
          .getConfiguration('cim')
          .update('docPane.mode', msg.mode, vscode.ConfigurationTarget.Workspace);
        return;
      }
      if (msg.type === 'markdownChanged') {
        this.scheduleSave(msg.markdown);
      }
    });

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.currentUri = undefined;
      this.unboundSourceRel = undefined;
      this.viewingHome = false;
      this.header = undefined;
      this.history = [];
      this.historyIndex = -1;
    });
  }

  private async flushPendingSave(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
    }
  }

  private async reloadFromDisk(): Promise<void> {
    if (!this.panel || !this.currentUri) {
      return;
    }
    try {
      const store = this.getStore();
      const docRel = store?.toWorkspaceRelative(this.currentUri) ?? '';
      const raw = await vscode.workspace.fs.readFile(this.currentUri);
      const text = Buffer.from(raw).toString('utf8');
      const { header, body } = splitMarkdown(text);
      this.header = header;
      const title = this.currentUri.path.split('/').pop() ?? 'CIM Doc';
      this.panel.title = `CIM · ${title}`;
      const deletable = Boolean(
        store && docRel && store.isUnderDocsPath(docRel) && !store.isIndexDoc(docRel)
      );
      let sourceJump: SourceJump | undefined;
      if (store && docRel && !store.isIndexDoc(docRel)) {
        try {
          const index = await store.read();
          const binding = store.findByDocPath(index, docRel);
          if (binding) {
            sourceJump = {
              path: binding.target.path,
              kind: binding.target.kind === 'range' ? 'range' : 'file',
              startLine: binding.target.startLine,
              endLine: binding.target.endLine,
            };
          }
        } catch {
          // ignore
        }
      }
      const payload: HostToWeb = {
        type: 'load',
        title,
        // Protect bare --- inside code fences so Vditor IR does not stall.
        markdown: protectHrInFences(body),
        mode: this.mode,
        docRel,
        deletable,
        sourceJump,
        ...this.navFlags(),
      };
      await this.panel.webview.postMessage(payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      void vscode.window.showWarningMessage(`CIM: 无法加载文档（${msg}）`);
    }
  }

  private scheduleSave(markdown: string): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      void this.saveBody(unprotectHrInFences(markdown));
    }, 400);
  }

  private async saveBody(body: string): Promise<void> {
    if (!this.currentUri) {
      return;
    }
    this.writing = true;
    try {
      const cleaned = unprotectHrInFences(body);
      const content = joinMarkdown(
        this.header,
        cleaned.endsWith('\n') ? cleaned : cleaned + '\n'
      );
      await vscode.workspace.fs.writeFile(this.currentUri, Buffer.from(content, 'utf8'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      void vscode.window.showWarningMessage(`CIM: 保存文档失败（${msg}）`);
    } finally {
      this.writing = false;
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const vditorRoot = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'vditor')
    );
    const vditorJs = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'vditor', 'dist', 'index.min.js')
    );
    const vditorCss = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'vditor', 'dist', 'index.css')
    );

    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource} data:`,
      `img-src ${webview.cspSource} https: data:`,
      `connect-src ${webview.cspSource}`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${vditorCss}" />
  <style>
    html, body {
      margin: 0; height: 100%; overflow: hidden;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
    }
    .bar {
      display: flex; gap: 6px; align-items: center; flex-wrap: wrap;
      padding: 6px 10px;
      border-bottom: 1px solid var(--vscode-panel-border, #444);
      background: var(--vscode-editor-background);
    }
    .bar button, .cta {
      border: none; border-radius: 4px; padding: 3px 10px; cursor: pointer; font-size: 12px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .bar button:disabled { opacity: 0.35; cursor: default; }
    .bar button.active, .cta.primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .bar button.danger {
      background: #c72e2e !important;
      color: #fff !important;
    }
    .bar button.danger:hover {
      background: #a82525 !important;
    }
    .doc-list .actions button.danger {
      background: #c72e2e !important;
      color: #fff !important;
    }
    .doc-list .actions button.danger:hover {
      background: #a82525 !important;
    }
    .hidden-mode { display: none !important; }
    .cta.primary { padding: 8px 16px; font-size: 13px; }
    .bar .sep {
      width: 1px; height: 16px; background: var(--vscode-panel-border, #444); margin: 0 2px;
    }
    .bar .hint { margin-left: auto; opacity: 0.55; font-size: 11px; }
    #wrap { position: relative; height: 100%; }
    #vditorIr { height: 100%; border: none !important; }
    #vditorIr.hidden-mode, #mdSource.hidden-mode { display: none !important; }
    #mdSource {
      box-sizing: border-box; width: 100%; height: 100%;
      margin: 0; padding: 12px 14px; border: none; resize: none; outline: none;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
      line-height: 1.5; tab-size: 2;
    }
    .vditor, .vditor-ir, .vditor-reset {
      background: var(--vscode-editor-background) !important;
      color: var(--vscode-editor-foreground) !important;
      border-color: var(--vscode-panel-border, #444) !important;
    }
    /* Hide Vditor IR gutter labels (H1/H2/H3 …) */
    .vditor-ir .vditor-reset > h1:before,
    .vditor-ir .vditor-reset > h2:before,
    .vditor-ir .vditor-reset > h3:before,
    .vditor-ir .vditor-reset > h4:before,
    .vditor-ir .vditor-reset > h5:before,
    .vditor-ir .vditor-reset > h6:before {
      content: none !important;
      display: none !important;
    }
    #unbound, #home {
      display: none; height: calc(100% - 34px); overflow: auto;
      padding: 24px 28px 40px;
    }
    #unbound.visible, #home.visible { display: block; }
    #unbound.center {
      display: none; height: calc(100% - 34px);
      align-items: center; justify-content: center;
      flex-direction: column; gap: 14px; text-align: center;
    }
    #unbound.center.visible { display: flex; }
    #editorRoot { height: calc(100% - 34px); }
    /* Off-screen warm: keep real layout so Vditor can init without display:none. */
    #editorRoot.warming {
      position: fixed !important;
      left: -12000px !important;
      top: 0 !important;
      width: 900px !important;
      height: 700px !important;
      opacity: 0 !important;
      pointer-events: none !important;
      z-index: -1 !important;
      display: block !important;
    }
    #editorRoot.hidden { display: none; }
    #homeBar.hidden, #editorBar.hidden { display: none; }
    #homeBar { display: none; }
    #homeBar.visible { display: flex; }
    #unbound h2, #home h2 { margin: 0 0 8px; font-weight: 600; font-size: 16px; }
    #unbound p, #home p { margin: 0 0 16px; opacity: 0.75; font-size: 13px; line-height: 1.5; }
    #unbound code, #home code {
      font-family: var(--vscode-editor-font-family);
      background: rgba(127,127,127,0.15); padding: 1px 6px; border-radius: 3px;
    }
    .doc-list { list-style: none; padding: 0; margin: 0; }
    .doc-list li { margin: 0 0 8px; }
    .doc-list a {
      display: block; padding: 10px 12px; border-radius: 6px; text-decoration: none;
      color: var(--vscode-textLink-foreground);
      background: rgba(127,127,127,0.08);
      border: 1px solid var(--vscode-panel-border, transparent);
    }
    .doc-list a:hover { background: rgba(127,127,127,0.16); }
    .doc-list .meta { display: block; margin-top: 4px; opacity: 0.65; font-size: 12px; color: var(--vscode-editor-foreground); }
    .bound-tree { list-style: none; padding: 0; margin: 0; }
    .bound-tree ul { list-style: none; padding: 0 0 0 14px; margin: 2px 0 6px;
      border-left: 1px solid var(--vscode-panel-border, rgba(127,127,127,0.35)); }
    .bound-tree ul.collapsed { display: none; }
    .bound-tree .folder-row {
      display: flex; align-items: center; gap: 6px;
      padding: 4px 2px; font-size: 12px; font-weight: 600;
      font-family: var(--vscode-editor-font-family);
      opacity: 0.8; user-select: none; cursor: pointer; border-radius: 4px;
    }
    .bound-tree .folder-row:hover { opacity: 1; background: rgba(127,127,127,0.1); }
    .bound-tree .folder-row .twist {
      display: inline-block; width: 12px; opacity: 0.55; font-size: 10px;
    }
    .bound-tree .file-row {
      margin: 0 0 6px;
    }
    .bound-tree .file-label {
      display: inline-block; padding: 2px 4px; font-size: 12px; border-radius: 4px;
      font-family: var(--vscode-editor-font-family);
      color: var(--vscode-textLink-foreground);
      cursor: pointer; user-select: none;
    }
    .bound-tree .file-label:hover {
      background: rgba(127,127,127,0.12); text-decoration: underline;
    }
    .bound-tree .leaf a {
      display: block; padding: 8px 10px; border-radius: 6px; text-decoration: none;
      color: var(--vscode-textLink-foreground);
      background: rgba(127,127,127,0.08);
      border: 1px solid var(--vscode-panel-border, transparent);
      margin: 0 0 4px;
    }
    .bound-tree .leaf a:hover { background: rgba(127,127,127,0.16); }
    .bound-tree .leaf .meta {
      display: block; margin-top: 3px; opacity: 0.65; font-size: 12px;
      color: var(--vscode-editor-foreground);
    }
    .bound-tree .index-item { margin-bottom: 12px; }
    .doc-list .actions { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
    .doc-list .actions button {
      border: none; border-radius: 4px; padding: 4px 10px; cursor: pointer; font-size: 12px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .doc-list .actions button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .missing-card {
      display: block; padding: 10px 12px; border-radius: 6px;
      background: rgba(241, 76, 76, 0.08);
      border: 1px solid var(--vscode-inputValidation-warningBorder, rgba(241,76,76,0.35));
      color: var(--vscode-editor-foreground);
    }
    .missing-card .badge {
      display: inline-block; font-size: 11px; padding: 1px 6px; border-radius: 3px; margin-bottom: 6px;
      background: rgba(241, 76, 76, 0.18);
      color: var(--vscode-errorForeground, #f14c4c);
    }
    .hint-card {
      display: block; padding: 10px 12px; border-radius: 6px;
      background: rgba(127, 127, 127, 0.08);
      border: 1px solid var(--vscode-panel-border, rgba(127,127,127,0.25));
      color: var(--vscode-editor-foreground);
    }
    .hint-card .badge {
      display: inline-block; font-size: 11px; padding: 1px 6px; border-radius: 3px; margin-bottom: 6px;
      background: rgba(127, 127, 127, 0.2);
      color: var(--vscode-descriptionForeground, inherit);
    }
    #missingSection, #hintSection { margin-bottom: 28px; }
    #missingSection.hidden-mode, #hintSection.hidden-mode { display: none !important; }
    #missingSection h2 { color: var(--vscode-errorForeground, #f14c4c); }
    #hintSection h2 { font-weight: 600; opacity: 0.9; }
  </style>
</head>
<body>
  <div id="navBar" class="bar">
    <button type="button" id="btnBack" title="后退" disabled>← 后退</button>
    <button type="button" id="btnForward" title="前进" disabled>前进 →</button>
    <button type="button" id="btnHome" title="文档主页">主页</button>
    <span class="sep"></span>
    <span id="editorBar">
      <button type="button" id="btnIr" class="active">即时渲染</button>
      <button type="button" id="btnSource">源码</button>
      <span class="sep"></span>
      <button type="button" id="btnRevealSource" class="hidden-mode" title="在左侧打开并选中绑定的源码范围">定位源码</button>
      <button type="button" id="btnDelete" class="danger hidden-mode" title="删除此文档">删除</button>
    </span>
    <span class="hint" id="hint">输入 Markdown 即时渲染 · YAML 头已隐藏</span>
  </div>
  <div id="editorRoot">
    <div id="wrap">
      <div id="vditorIr"></div>
      <textarea id="mdSource" class="hidden-mode" spellcheck="false" aria-label="Markdown 源码"></textarea>
    </div>
  </div>
  <div id="home">
    <h2>文档主页</h2>
    <p>文档目录 <code id="homeDocsPath"></code> · 点击下方链接打开对应文档</p>
    <div id="missingSection" class="hidden-mode">
      <h2>绑定提醒</h2>
      <p>以下绑定缺失或行范围/符号可能失效，建议处理。</p>
      <ul class="doc-list" id="missingList"></ul>
    </div>
    <div id="hintSection" class="hidden-mode">
      <h2>文档核对提醒</h2>
      <p>源码已变，请确认旁路文档是否仍准确。<strong>仅提醒，可忽略</strong>；核对完毕后可「标记已核对」清除提示。</p>
      <p id="hashBulkRow" class="hidden-mode" style="margin:0 0 12px">
        <button type="button" id="btnRefreshAllHashes" class="cta">全部标记已核对</button>
      </p>
      <ul class="doc-list" id="hintList"></ul>
    </div>
    <h2 id="boundHeading">已绑定文档</h2>
    <p style="margin-top:-8px">按源文件目录树排列 · 点文件夹折叠 · 点源文件名打开源码 · 点文档打开旁路文档</p>
    <ul class="bound-tree" id="docList"></ul>
  </div>
  <div id="unbound" class="center">
    <h2>无关联文档</h2>
    <p>当前文件 <code id="unboundPath"></code> 尚未绑定 CIM 文档。</p>
    <button type="button" class="cta primary" id="btnCreate">新建关联文档</button>
  </div>
  <script src="${vditorJs}"></script>
  <script>
    const vscodeApi = acquireVsCodeApi();
    const btnIr = document.getElementById('btnIr');
    const btnSource = document.getElementById('btnSource');
    const btnDelete = document.getElementById('btnDelete');
    const btnRevealSource = document.getElementById('btnRevealSource');
    const btnBack = document.getElementById('btnBack');
    const btnForward = document.getElementById('btnForward');
    const btnHome = document.getElementById('btnHome');
    const editorRoot = document.getElementById('editorRoot');
    const editorBar = document.getElementById('editorBar');
    const homeEl = document.getElementById('home');
    const unboundEl = document.getElementById('unbound');
    const unboundPath = document.getElementById('unboundPath');
    const btnCreate = document.getElementById('btnCreate');
    const docList = document.getElementById('docList');
    const missingSection = document.getElementById('missingSection');
    const missingList = document.getElementById('missingList');
    const hintSection = document.getElementById('hintSection');
    const hintList = document.getElementById('hintList');
    const hashBulkRow = document.getElementById('hashBulkRow');
    const btnRefreshAllHashes = document.getElementById('btnRefreshAllHashes');
    btnRefreshAllHashes.addEventListener('click', function () {
      vscodeApi.postMessage({ type: 'refreshAllHashes' });
    });
    const homeDocsPath = document.getElementById('homeDocsPath');
    const hint = document.getElementById('hint');
    const mdSource = document.getElementById('mdSource');
    let vditor = null;
    let irReady = false;
    let pendingIrReveal = false;
    let warmTimer = null;
    let mode = 'ir';
    let applying = false;
    let pendingMarkdown = '';
    let unboundSourceRel = '';
    let currentDocRel = '';
    let sourceJump = null;

    function isDark() {
      return document.body.classList.contains('vscode-dark')
        || document.body.classList.contains('vscode-high-contrast');
    }

    function setModeButtons() {
      btnIr.classList.toggle('active', mode === 'ir');
      btnSource.classList.toggle('active', mode === 'source');
    }

    function setDeleteVisible(visible) {
      btnDelete.classList.toggle('hidden-mode', !visible);
    }

    function setRevealSourceVisible(jump) {
      sourceJump = jump || null;
      const show = !!(jump && jump.path);
      btnRevealSource.classList.toggle('hidden-mode', !show);
      if (show && jump.kind === 'range' && jump.startLine != null) {
        btnRevealSource.title =
          '定位源码 L' + jump.startLine + (jump.endLine != null ? '-' + jump.endLine : '');
        btnRevealSource.textContent = '定位源码';
      } else if (show) {
        btnRevealSource.title = '打开绑定的源文件';
        btnRevealSource.textContent = '打开源码';
      }
    }

    function setNav(canBack, canForward) {
      btnBack.disabled = !canBack;
      btnForward.disabled = !canForward;
    }

    /** Park editor off-screen (keep Vditor alive) or fully hide if not created yet. */
    function parkEditor() {
      editorBar.classList.add('hidden');
      if (vditor || editorRoot.classList.contains('warming')) {
        editorRoot.classList.remove('hidden');
        editorRoot.classList.add('warming');
      } else {
        editorRoot.classList.remove('warming');
        editorRoot.classList.add('hidden');
      }
    }

    function hideAll() {
      unboundEl.classList.remove('visible');
      homeEl.classList.remove('visible');
      parkEditor();
    }

    function scheduleWarmIr(immediate) {
      if (vditor) return;
      if (warmTimer) {
        clearTimeout(warmTimer);
        warmTimer = null;
      }
      const run = function () {
        warmTimer = null;
        if (vditor) return;
        editorRoot.classList.remove('hidden');
        editorRoot.classList.add('warming');
        ensureIr('');
      };
      if (immediate) run();
      else warmTimer = setTimeout(run, 80);
    }

    function showUnbound(sourceRel, canBack, canForward, canCreate) {
      hideAll();
      unboundSourceRel = sourceRel || '';
      currentDocRel = '';
      setDeleteVisible(false);
      setRevealSourceVisible(null);
      unboundPath.textContent = unboundSourceRel;
      unboundEl.classList.add('visible');
      const allowCreate = canCreate !== false;
      btnCreate.style.display = allowCreate ? '' : 'none';
      hint.textContent = allowCreate
        ? '无关联文档 · 可新建绑定或返回主页'
        : '无关联文档 · 此类文件默认不提示新建绑定';
      setNav(canBack, canForward);
      scheduleWarmIr(false);
    }

    function driftBadge(kind) {
      if (kind === 'missing-doc') return '文档缺失';
      if (kind === 'missing-target') return '源文件缺失';
      if (kind === 'hash') return '源码已变';
      if (kind === 'overlap') return '范围重叠';
      if (kind === 'range') return '行范围失效';
      if (kind === 'symbol') return '符号变动';
      return kind || '提醒';
    }

    function appendBtn(parent, label, className, onClick) {
      const btn = document.createElement('button');
      btn.type = 'button';
      if (className) btn.className = className;
      btn.textContent = label;
      btn.addEventListener('click', onClick);
      parent.appendChild(btn);
    }

    function showHome(docsPath, docs, missing, hints, canBack, canForward) {
      hideAll();
      currentDocRel = '';
      setDeleteVisible(false);
      setRevealSourceVisible(null);
      homeDocsPath.textContent = (docsPath || 'docs') + '/';
      docList.innerHTML = '';
      missingList.innerHTML = '';
      hintList.innerHTML = '';

      const missingItems = missing || [];
      if (missingItems.length) {
        missingSection.classList.remove('hidden-mode');
        missingItems.forEach(function (item) {
          const li = document.createElement('li');
          const card = document.createElement('div');
          card.className = 'missing-card';
          const badge = document.createElement('span');
          badge.className = 'badge';
          badge.textContent = driftBadge(item.kind);
          const title = document.createElement('strong');
          title.textContent =
            item.kind === 'missing-doc' ? item.target : (item.doc || item.target);
          const meta = document.createElement('span');
          meta.className = 'meta';
          meta.textContent = item.message;
          const actions = document.createElement('div');
          actions.className = 'actions';

          if (item.kind === 'missing-doc') {
            appendBtn(actions, '重新绑定', null, function () {
              vscodeApi.postMessage({ type: 'createBind', sourceRel: item.target });
            });
            appendBtn(actions, '打开源文件', 'secondary', function () {
              vscodeApi.postMessage({ type: 'openTarget', sourceRel: item.target });
            });
          } else if (item.kind === 'missing-target') {
            appendBtn(actions, '重新绑定', null, function () {
              vscodeApi.postMessage({ type: 'rebindDoc', docRel: item.doc });
            });
            appendBtn(actions, '打开此文档', 'secondary', function () {
              vscodeApi.postMessage({ type: 'openDoc', docRel: item.doc });
            });
            appendBtn(actions, '删除失效文档', 'danger', function () {
              vscodeApi.postMessage({ type: 'deleteDoc', docRel: item.doc });
            });
          } else if (item.kind === 'overlap') {
            appendBtn(actions, '打开文档', null, function () {
              vscodeApi.postMessage({ type: 'openDoc', docRel: item.doc });
            });
            appendBtn(actions, '定位源码', 'secondary', function () {
              vscodeApi.postMessage({ type: 'openTarget', sourceRel: item.target });
            });
            appendBtn(actions, '重新绑定', 'secondary', function () {
              vscodeApi.postMessage({ type: 'rebindDoc', docRel: item.doc });
            });
          } else if (item.kind === 'symbol' || item.kind === 'range') {
            const canRetighten = String(item.message || '').indexOf('未找到符号') < 0;
            if (canRetighten) {
              appendBtn(actions, '按 symbol 重算行号', null, function () {
                vscodeApi.postMessage({ type: 'retightenRange', docRel: item.doc });
              });
            }
            appendBtn(actions, '重新绑定', canRetighten ? 'secondary' : null, function () {
              vscodeApi.postMessage({ type: 'rebindDoc', docRel: item.doc });
            });
            appendBtn(actions, '打开文档', 'secondary', function () {
              vscodeApi.postMessage({ type: 'openDoc', docRel: item.doc });
            });
          } else {
            appendBtn(actions, '重新绑定', null, function () {
              vscodeApi.postMessage({ type: 'rebindDoc', docRel: item.doc });
            });
            appendBtn(actions, '打开文档', 'secondary', function () {
              vscodeApi.postMessage({ type: 'openDoc', docRel: item.doc });
            });
          }

          card.appendChild(badge);
          card.appendChild(document.createElement('br'));
          card.appendChild(title);
          card.appendChild(meta);
          card.appendChild(actions);
          li.appendChild(card);
          missingList.appendChild(li);
        });
      } else {
        missingSection.classList.add('hidden-mode');
      }

      const hintItems = hints || [];
      if (hintItems.length) {
        hintSection.classList.remove('hidden-mode');
        hashBulkRow.classList.toggle('hidden-mode', hintItems.length < 2);
        hintItems.forEach(function (item) {
          const li = document.createElement('li');
          const card = document.createElement('div');
          card.className = 'hint-card';
          const badge = document.createElement('span');
          badge.className = 'badge';
          badge.textContent = driftBadge('hash');
          const title = document.createElement('strong');
          title.textContent = item.doc || item.target;
          const meta = document.createElement('span');
          meta.className = 'meta';
          meta.textContent = item.message || ('源文件 ' + item.target + ' 已修改');
          const actions = document.createElement('div');
          actions.className = 'actions';
          appendBtn(actions, '打开文档核对', null, function () {
            vscodeApi.postMessage({ type: 'openDoc', docRel: item.doc });
          });
          appendBtn(actions, '标记已核对', 'secondary', function () {
            vscodeApi.postMessage({ type: 'refreshHash', docRel: item.doc });
          });
          card.appendChild(badge);
          card.appendChild(document.createElement('br'));
          card.appendChild(title);
          card.appendChild(meta);
          card.appendChild(actions);
          li.appendChild(card);
          hintList.appendChild(li);
        });
      } else {
        hintSection.classList.add('hidden-mode');
        hashBulkRow.classList.add('hidden-mode');
      }

      if (!docs || !docs.length) {
        const li = document.createElement('li');
        li.textContent = '暂无绑定文档。打开源文件后可新建关联。';
        docList.appendChild(li);
      } else {
        renderBoundTree(docList, docs);
      }
      homeEl.classList.add('visible');
      if (missingItems.length) {
        hint.textContent = '主页 · ' + missingItems.length + ' 项绑定提醒';
      } else if (hintItems.length) {
        hint.textContent = '主页 · ' + hintItems.length + ' 项文档核对提醒（可忽略）';
      } else {
        hint.textContent = '主页 · 选择文档打开';
      }
      setNav(canBack, canForward);
      scheduleWarmIr(false);
    }

    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function bindingKindLabel(item) {
      if (item.kind === 'range' && item.startLine != null && item.endLine != null) {
        return item.symbol
          ? 'range L' + item.startLine + '-' + item.endLine + ' · ' + item.symbol
          : 'range L' + item.startLine + '-' + item.endLine;
      }
      if (item.kind === 'index') return '汇总';
      return 'file';
    }

    function makeDocLink(item) {
      const a = document.createElement('a');
      a.href = '#';
      a.dataset.doc = item.doc;
      a.innerHTML = '<strong>' + escapeHtml(item.title || item.doc) + '</strong>'
        + '<span class="meta">' + escapeHtml(item.doc)
        + ' · ' + escapeHtml(bindingKindLabel(item)) + '</span>';
      a.addEventListener('click', function (e) {
        e.preventDefault();
        vscodeApi.postMessage({ type: 'openDoc', docRel: item.doc });
      });
      return a;
    }

    /** Build a directory tree from binding target paths (workspace-relative). */
    function loadBoundTreeCollapsed() {
      try {
        const st = vscodeApi.getState() || {};
        return new Set(Array.isArray(st.boundTreeCollapsed) ? st.boundTreeCollapsed : []);
      } catch (_) {
        return new Set();
      }
    }

    function saveBoundTreeCollapsed(collapsed) {
      try {
        const prev = vscodeApi.getState() || {};
        vscodeApi.setState(Object.assign({}, prev, {
          boundTreeCollapsed: Array.from(collapsed)
        }));
      } catch (_) {}
    }

    function renderBoundTree(container, docs) {
      const indexItems = [];
      const root = { name: '', children: new Map(), bindings: [] };
      const collapsedFolders = loadBoundTreeCollapsed();

      docs.forEach(function (item) {
        if (item.kind === 'index' || item.target === '(汇总)') {
          indexItems.push(item);
          return;
        }
        const parts = String(item.target || '').split('/').filter(Boolean);
        if (!parts.length) {
          root.bindings.push(item);
          return;
        }
        let node = root;
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          const isLeaf = i === parts.length - 1;
          if (!node.children.has(part)) {
            node.children.set(part, {
              name: part,
              children: new Map(),
              bindings: [],
              isFile: false,
            });
          }
          const child = node.children.get(part);
          if (isLeaf) {
            child.isFile = true;
            child.bindings.push(item);
          }
          node = child;
        }
      });

      indexItems.forEach(function (item) {
        const li = document.createElement('li');
        li.className = 'index-item leaf';
        li.appendChild(makeDocLink(item));
        container.appendChild(li);
      });

      function renderNode(node, parentEl, pathPrefix) {
        const entries = Array.from(node.children.values()).sort(function (a, b) {
          if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
          return a.name.localeCompare(b.name);
        });
        entries.forEach(function (child) {
          const li = document.createElement('li');
          const childPath = pathPrefix ? pathPrefix + '/' + child.name : child.name;
          if (!child.isFile) {
            const isCollapsed = collapsedFolders.has(childPath);
            const row = document.createElement('div');
            row.className = 'folder-row';
            row.setAttribute('role', 'button');
            row.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
            row.title = (isCollapsed ? '展开' : '折叠') + ' ' + childPath;
            const twist = document.createElement('span');
            twist.className = 'twist';
            twist.textContent = isCollapsed ? '▸' : '▾';
            const name = document.createElement('span');
            name.textContent = child.name + '/';
            row.appendChild(twist);
            row.appendChild(name);
            li.appendChild(row);
            const ul = document.createElement('ul');
            if (isCollapsed) ul.classList.add('collapsed');
            renderNode(child, ul, childPath);
            li.appendChild(ul);
            row.addEventListener('click', function () {
              const nowCollapsed = ul.classList.toggle('collapsed');
              twist.textContent = nowCollapsed ? '▸' : '▾';
              row.setAttribute('aria-expanded', nowCollapsed ? 'false' : 'true');
              row.title = (nowCollapsed ? '展开' : '折叠') + ' ' + childPath;
              if (nowCollapsed) collapsedFolders.add(childPath);
              else collapsedFolders.delete(childPath);
              saveBoundTreeCollapsed(collapsedFolders);
            });
          } else {
            li.className = 'file-row';
            const sourcePath =
              (child.bindings[0] && child.bindings[0].target) || childPath;
            const label = document.createElement('span');
            label.className = 'file-label';
            label.setAttribute('role', 'link');
            label.title = '打开源文件 ' + sourcePath;
            label.textContent = child.name;
            label.addEventListener('click', function (e) {
              e.preventDefault();
              vscodeApi.postMessage({ type: 'openTarget', sourceRel: sourcePath });
            });
            li.appendChild(label);
            const ul = document.createElement('ul');
            child.bindings
              .slice()
              .sort(function (a, b) { return String(a.doc).localeCompare(String(b.doc)); })
              .forEach(function (binding) {
                const leaf = document.createElement('li');
                leaf.className = 'leaf';
                leaf.appendChild(makeDocLink(binding));
                ul.appendChild(leaf);
              });
            li.appendChild(ul);
          }
          parentEl.appendChild(li);
        });
        node.bindings.forEach(function (binding) {
          const leaf = document.createElement('li');
          leaf.className = 'leaf';
          leaf.appendChild(makeDocLink(binding));
          parentEl.appendChild(leaf);
        });
      }

      renderNode(root, container, '');
    }

    function showModePane(want) {
      document.getElementById('vditorIr').classList.toggle('hidden-mode', want !== 'ir');
      mdSource.classList.toggle('hidden-mode', want !== 'source');
    }

    function updateHint() {
      hint.textContent = mode === 'source'
        ? 'Markdown 源码 · YAML 头已隐藏 · 可直接编辑'
        : '输入 Markdown 即时渲染 · YAML 头已隐藏';
    }

    function showEditor(canBack, canForward) {
      unboundEl.classList.remove('visible');
      homeEl.classList.remove('visible');
      editorRoot.classList.remove('hidden');
      editorRoot.classList.remove('warming');
      editorBar.classList.remove('hidden');
      updateHint();
      setNav(canBack, canForward);
      if (mode === 'ir' && vditor && irReady) {
        try { vditor.resize(Math.max(240, window.innerHeight - 40)); } catch (_) {}
      }
    }

    function currentValue() {
      if (mode === 'source' || pendingIrReveal) {
        return mdSource.value;
      }
      if (vditor) {
        try { return vditor.getValue(); } catch (_) { return pendingMarkdown; }
      }
      return pendingMarkdown;
    }

    function ensureIr(initialValue) {
      if (vditor) {
        return false;
      }
      applying = true;
      irReady = false;
      document.getElementById('vditorIr').innerHTML = '';
      vditor = new Vditor('vditorIr', {
        height: Math.max(240, window.innerHeight - 40),
        mode: 'ir',
        value: initialValue || '',
        cdn: '${vditorRoot}',
        cache: { enable: false },
        toolbarConfig: { pin: true, hide: false },
        toolbar: [
          'headings', 'bold', 'italic', 'strike', '|',
          'list', 'ordered-list', 'check', '|',
          'quote', 'code', 'inline-code', 'link', 'table', '|',
          'undo', 'redo'
        ],
        theme: isDark() ? 'dark' : 'classic',
        preview: {
          theme: { current: isDark() ? 'dark' : 'light' },
          // hljs is expensive on first paint; plain IR is enough for docs.
          hljs: { enable: false }
        },
        after: function () {
          applying = false;
          irReady = true;
          try { vditor.resize(Math.max(240, window.innerHeight - 40)); } catch (_) {}
          if (pendingIrReveal && mode === 'ir') {
            pendingIrReveal = false;
            // Content already applied via constructor value or setIrValue under the source cover.
            showModePane('ir');
          }
        },
        input: function (value) {
          if (applying) return;
          pendingMarkdown = value;
          vscodeApi.postMessage({ type: 'markdownChanged', markdown: value });
        }
      });
      return true;
    }

    function setIrValue(markdown) {
      if (!vditor) return;
      applying = true;
      try { vditor.setValue(markdown || '', true); } catch (_) {}
      // Yield so the source cover stays visible during the heavy parse.
      setTimeout(function () { applying = false; }, 0);
    }

    function setSourceValue(markdown) {
      applying = true;
      mdSource.value = markdown || '';
      pendingMarkdown = mdSource.value;
      applying = false;
    }

    function revealIrWhenQuiet() {
      if (mode !== 'ir') return;
      pendingIrReveal = false;
      showModePane('ir');
      try { vditor && vditor.resize(Math.max(240, window.innerHeight - 40)); } catch (_) {}
    }

    function applyMarkdown(markdown, nextMode, canBack, canForward, docRel, deletable, jump) {
      pendingMarkdown = markdown || '';
      currentDocRel = docRel || '';
      setDeleteVisible(!!deletable);
      setRevealSourceVisible(jump);
      mode = nextMode === 'source' || nextMode === 'sv' ? 'source' : 'ir';
      setModeButtons();
      showEditor(canBack, canForward);
      if (mode === 'source') {
        pendingIrReveal = false;
        setSourceValue(pendingMarkdown);
        showModePane('source');
        return;
      }
      // Always keep source as a cover until IR has content ready — avoids blank IR flash.
      setSourceValue(pendingMarkdown);
      showModePane('source');
      if (!vditor) {
        pendingIrReveal = true;
        ensureIr(pendingMarkdown);
        return;
      }
      if (!irReady) {
        pendingIrReveal = true;
        setIrValue(pendingMarkdown);
        return;
      }
      // Pre-warmed: setValue under cover, then flip (one short parse, no cold init).
      pendingIrReveal = true;
      setIrValue(pendingMarkdown);
      requestAnimationFrame(function () {
        requestAnimationFrame(revealIrWhenQuiet);
      });
    }

    function switchModeLocal(want) {
      const next = want === 'source' ? 'source' : 'ir';
      if (next === mode) {
        return;
      }
      pendingMarkdown = currentValue();
      mode = next;
      setModeButtons();
      updateHint();
      if (next === 'source') {
        pendingIrReveal = false;
        setSourceValue(pendingMarkdown);
        showModePane('source');
      } else {
        showModePane('source');
        if (!vditor) {
          pendingIrReveal = true;
          ensureIr(pendingMarkdown);
        } else if (!irReady) {
          pendingIrReveal = true;
          setIrValue(pendingMarkdown);
        } else {
          pendingIrReveal = true;
          setIrValue(pendingMarkdown);
          requestAnimationFrame(function () {
            requestAnimationFrame(revealIrWhenQuiet);
          });
        }
      }
      vscodeApi.postMessage({
        type: 'switchMode',
        mode: next,
        markdown: pendingMarkdown
      });
    }

    mdSource.addEventListener('input', function () {
      if (applying) return;
      pendingMarkdown = mdSource.value;
      vscodeApi.postMessage({ type: 'markdownChanged', markdown: pendingMarkdown });
    });

    btnIr.addEventListener('click', function () {
      switchModeLocal('ir');
    });
    btnSource.addEventListener('click', function () {
      switchModeLocal('source');
    });
    btnRevealSource.addEventListener('click', function () {
      if (!sourceJump || !sourceJump.path) return;
      vscodeApi.postMessage({
        type: 'openTarget',
        sourceRel: sourceJump.path,
        startLine: sourceJump.startLine,
        endLine: sourceJump.endLine
      });
    });
    btnDelete.addEventListener('click', function () {
      if (!currentDocRel) return;
      vscodeApi.postMessage({ type: 'deleteDoc', docRel: currentDocRel });
    });
    btnCreate.addEventListener('click', function () {
      if (!unboundSourceRel) return;
      scheduleWarmIr(true);
      vscodeApi.postMessage({ type: 'createBind', sourceRel: unboundSourceRel });
    });
    btnHome.addEventListener('click', function () {
      vscodeApi.postMessage({ type: 'navHome' });
    });
    btnBack.addEventListener('click', function () {
      vscodeApi.postMessage({ type: 'navBack' });
    });
    btnForward.addEventListener('click', function () {
      vscodeApi.postMessage({ type: 'navForward' });
    });

    window.addEventListener('resize', function () {
      if (mode !== 'ir' || !vditor) return;
      try { vditor.resize(Math.max(240, window.innerHeight - 40)); } catch (_) {}
    });

    window.addEventListener('message', function (event) {
      const msg = event.data;
      if (!msg) return;
      if (msg.type === 'warmIr') {
        scheduleWarmIr(true);
        return;
      }
      if (msg.type === 'unbound') {
        showUnbound(msg.sourceRel || '', msg.canBack, msg.canForward, msg.canCreate !== false);
        return;
      }
      if (msg.type === 'home') {
        showHome(
          msg.docsPath,
          msg.docs || [],
          msg.missing || [],
          msg.hints || [],
          msg.canBack,
          msg.canForward
        );
        return;
      }
      if (msg.type !== 'load') return;
      applyMarkdown(
        msg.markdown || '',
        msg.mode,
        msg.canBack,
        msg.canForward,
        msg.docRel || '',
        !!msg.deletable,
        msg.sourceJump || null
      );
    });

    vscodeApi.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}

function sameNav(a: NavEntry, b: NavEntry): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  if (a.kind === 'home' && b.kind === 'home') {
    return true;
  }
  if (a.kind === 'doc' && b.kind === 'doc') {
    return a.docRel === b.docRel;
  }
  if (a.kind === 'unbound' && b.kind === 'unbound') {
    return a.sourceRel === b.sourceRel;
  }
  return false;
}
