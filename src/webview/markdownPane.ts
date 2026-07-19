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
};

type MissingItem = {
  kind: 'missing-target' | 'missing-doc';
  target: string;
  doc: string;
  message: string;
};

type HostToWeb =
  | {
      type: 'load';
      title: string;
      markdown: string;
      mode: DocMode;
      docRel: string;
      deletable: boolean;
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
      canBack: boolean;
      canForward: boolean;
    };

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
  | { type: 'openTarget'; sourceRel: string }
  | { type: 'rebindDoc'; docRel: string };

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

  async show(docUri: vscode.Uri, column: vscode.ViewColumn, forceFocus: boolean): Promise<void> {
    const store = this.getStore();
    const docRel = store?.toWorkspaceRelative(docUri);

    if (
      this.panel &&
      this.currentUri?.fsPath === docUri.fsPath &&
      !this.viewingHome &&
      !this.unboundSourceRel
    ) {
      if (forceFocus) {
        this.panel.reveal(column, false);
      }
      return;
    }

    this.unboundSourceRel = undefined;
    this.viewingHome = false;
    this.currentUri = docUri;
    await this.ensurePanel(column, !forceFocus);

    if (docRel && !this.navigatingHistory) {
      this.pushHistory({ kind: 'doc', docRel: normalizeRelPath(docRel) });
    }

    await this.reloadFromDisk();
    if (forceFocus) {
      this.panel?.reveal(column, false);
    }
  }

  async showUnbound(
    sourceRel: string,
    column: vscode.ViewColumn,
    forceFocus: boolean,
    canCreate = true
  ): Promise<void> {
    if (
      this.unboundSourceRel === sourceRel &&
      this.panel &&
      !this.currentUri &&
      !this.viewingHome
    ) {
      if (forceFocus) {
        this.panel.reveal(column, false);
      }
      return;
    }

    this.currentUri = undefined;
    this.header = undefined;
    this.viewingHome = false;
    this.unboundSourceRel = sourceRel;
    this.unboundCanCreate = canCreate;
    await this.ensurePanel(column, !forceFocus);

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
      this.panel?.reveal(column, false);
    }
  }

  async showHome(column: vscode.ViewColumn, forceFocus = true): Promise<void> {
    await this.flushPendingSave();
    this.currentUri = undefined;
    this.header = undefined;
    this.unboundSourceRel = undefined;
    this.viewingHome = true;
    await this.ensurePanel(column, !forceFocus);

    if (!this.navigatingHistory) {
      this.pushHistory({ kind: 'home' });
    }

    await this.refreshDrift();
    await this.postHome();
    if (forceFocus) {
      this.panel?.reveal(column, false);
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
          });
        }
        docs.unshift({
          doc: store.indexDocPath,
          target: '(汇总)',
          title: 'cim-index.md',
        });
      }
    }

    for (const issue of this.getDriftIssues()) {
      if (issue.kind !== 'missing-target' && issue.kind !== 'missing-doc') {
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
      ...this.navFlags(),
    } satisfies HostToWeb);
  }

  private async ensurePanel(column: vscode.ViewColumn, preserveFocus: boolean): Promise<void> {
    if (this.panel) {
      this.panel.reveal(column, preserveFocus);
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
      if (msg.type === 'openTarget') {
        const store = this.getStore();
        if (!store) {
          return;
        }
        const uri = store.targetUri(normalizeRelPath(msg.sourceRel));
        try {
          const doc = await vscode.workspace.openTextDocument(uri);
          await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One });
        } catch {
          void vscode.window.showWarningMessage(`CIM: 无法打开源文件 ${msg.sourceRel}`);
        }
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
      const payload: HostToWeb = {
        type: 'load',
        title,
        // Protect bare --- inside code fences so Vditor IR does not stall.
        markdown: protectHrInFences(body),
        mode: this.mode,
        docRel,
        deletable,
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
    #editorRoot.hidden, #homeBar.hidden, #editorBar.hidden { display: none; }
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
    #missingSection { margin-bottom: 28px; }
    #missingSection.hidden-mode { display: none !important; }
    #missingSection h2 { color: var(--vscode-errorForeground, #f14c4c); }
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
      <h2>绑定缺失</h2>
      <p>以下绑定的源文件或文档已不存在，请重新绑定或清理失效项。</p>
      <ul class="doc-list" id="missingList"></ul>
    </div>
    <h2 id="boundHeading">已绑定文档</h2>
    <ul class="doc-list" id="docList"></ul>
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
    const homeDocsPath = document.getElementById('homeDocsPath');
    const hint = document.getElementById('hint');
    const mdSource = document.getElementById('mdSource');
    let vditor = null;
    let mode = 'ir';
    let applying = false;
    let pendingMarkdown = '';
    let unboundSourceRel = '';
    let currentDocRel = '';

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

    function setNav(canBack, canForward) {
      btnBack.disabled = !canBack;
      btnForward.disabled = !canForward;
    }

    function hideAll() {
      unboundEl.classList.remove('visible');
      homeEl.classList.remove('visible');
      editorRoot.classList.add('hidden');
      editorBar.classList.add('hidden');
    }

    function showUnbound(sourceRel, canBack, canForward, canCreate) {
      hideAll();
      unboundSourceRel = sourceRel || '';
      currentDocRel = '';
      setDeleteVisible(false);
      unboundPath.textContent = unboundSourceRel;
      unboundEl.classList.add('visible');
      const allowCreate = canCreate !== false;
      btnCreate.style.display = allowCreate ? '' : 'none';
      hint.textContent = allowCreate
        ? '无关联文档 · 可新建绑定或返回主页'
        : '无关联文档 · 此类文件默认不提示新建绑定';
      setNav(canBack, canForward);
    }

    function showHome(docsPath, docs, missing, canBack, canForward) {
      hideAll();
      currentDocRel = '';
      setDeleteVisible(false);
      homeDocsPath.textContent = (docsPath || 'docs') + '/';
      docList.innerHTML = '';
      missingList.innerHTML = '';

      const missingItems = missing || [];
      if (missingItems.length) {
        missingSection.classList.remove('hidden-mode');
        missingItems.forEach(function (item) {
          const li = document.createElement('li');
          const card = document.createElement('div');
          card.className = 'missing-card';
          const badge = document.createElement('span');
          badge.className = 'badge';
          badge.textContent = item.kind === 'missing-doc' ? '文档缺失' : '源文件缺失';
          const title = document.createElement('strong');
          title.textContent = item.kind === 'missing-doc' ? item.target : item.doc;
          const meta = document.createElement('span');
          meta.className = 'meta';
          meta.textContent = item.message;
          const actions = document.createElement('div');
          actions.className = 'actions';
          if (item.kind === 'missing-doc') {
            const rebind = document.createElement('button');
            rebind.type = 'button';
            rebind.textContent = '重新绑定';
            rebind.addEventListener('click', function () {
              vscodeApi.postMessage({ type: 'createBind', sourceRel: item.target });
            });
            const openSrc = document.createElement('button');
            openSrc.type = 'button';
            openSrc.className = 'secondary';
            openSrc.textContent = '打开源文件';
            openSrc.addEventListener('click', function () {
              vscodeApi.postMessage({ type: 'openTarget', sourceRel: item.target });
            });
            actions.appendChild(rebind);
            actions.appendChild(openSrc);
          } else {
            const rebind = document.createElement('button');
            rebind.type = 'button';
            rebind.textContent = '重新绑定';
            rebind.addEventListener('click', function () {
              vscodeApi.postMessage({ type: 'rebindDoc', docRel: item.doc });
            });
            const openDocBtn = document.createElement('button');
            openDocBtn.type = 'button';
            openDocBtn.className = 'secondary';
            openDocBtn.textContent = '打开此文档';
            openDocBtn.addEventListener('click', function () {
              vscodeApi.postMessage({ type: 'openDoc', docRel: item.doc });
            });
            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'danger';
            del.textContent = '删除失效文档';
            del.addEventListener('click', function () {
              vscodeApi.postMessage({ type: 'deleteDoc', docRel: item.doc });
            });
            actions.appendChild(rebind);
            actions.appendChild(openDocBtn);
            actions.appendChild(del);
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

      if (!docs || !docs.length) {
        const li = document.createElement('li');
        li.textContent = '暂无绑定文档。打开源文件后可新建关联。';
        docList.appendChild(li);
      } else {
        docs.forEach(function (item) {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = '#';
          a.dataset.doc = item.doc;
          a.innerHTML = '<strong>' + escapeHtml(item.title || item.doc) + '</strong>'
            + '<span class="meta">' + escapeHtml(item.doc)
            + (item.target ? ' ← ' + escapeHtml(item.target) : '')
            + '</span>';
          a.addEventListener('click', function (e) {
            e.preventDefault();
            vscodeApi.postMessage({ type: 'openDoc', docRel: item.doc });
          });
          li.appendChild(a);
          docList.appendChild(li);
        });
      }
      homeEl.classList.add('visible');
      hint.textContent = missingItems.length
        ? ('主页 · ' + missingItems.length + ' 项绑定缺失')
        : '主页 · 选择文档打开';
      setNav(canBack, canForward);
      warmEditor();
    }

    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
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
      editorBar.classList.remove('hidden');
      updateHint();
      setNav(canBack, canForward);
      if (mode === 'ir' && vditor) {
        try { vditor.resize(Math.max(240, window.innerHeight - 40)); } catch (_) {}
      }
    }

    function currentValue() {
      if (mode === 'source') {
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
      document.getElementById('vditorIr').innerHTML = '';
      vditor = new Vditor('vditorIr', {
        height: Math.max(240, window.innerHeight - 40),
        mode: 'ir',
        value: initialValue || '',
        cdn: '${vditorRoot}',
        cache: { enable: false },
        toolbarConfig: { pin: true },
        toolbar: [
          'headings', 'bold', 'italic', 'strike', '|',
          'list', 'ordered-list', 'check', '|',
          'quote', 'code', 'inline-code', 'link', 'table', '|',
          'undo', 'redo'
        ],
        theme: isDark() ? 'dark' : 'classic',
        preview: {
          theme: { current: isDark() ? 'dark' : 'light' },
          hljs: { style: isDark() ? 'native' : 'github' }
        },
        after: function () { applying = false; },
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
      setTimeout(function () { applying = false; }, 50);
    }

    function setSourceValue(markdown) {
      applying = true;
      mdSource.value = markdown || '';
      pendingMarkdown = mdSource.value;
      applying = false;
    }

    function applyMarkdown(markdown, nextMode, canBack, canForward, docRel, deletable) {
      pendingMarkdown = markdown || '';
      currentDocRel = docRel || '';
      setDeleteVisible(!!deletable);
      mode = nextMode === 'source' || nextMode === 'sv' ? 'source' : 'ir';
      setModeButtons();
      showModePane(mode);
      showEditor(canBack, canForward);
      if (mode === 'source') {
        setSourceValue(pendingMarkdown);
        return;
      }
      if (!ensureIr(pendingMarkdown)) {
        setIrValue(pendingMarkdown);
      }
    }

    function switchModeLocal(want) {
      const next = want === 'source' ? 'source' : 'ir';
      if (next === mode) {
        return;
      }
      pendingMarkdown = currentValue();
      mode = next;
      setModeButtons();
      showModePane(next);
      updateHint();
      if (next === 'source') {
        setSourceValue(pendingMarkdown);
      } else {
        if (!ensureIr(pendingMarkdown)) {
          setIrValue(pendingMarkdown);
        }
        try { vditor.resize(Math.max(240, window.innerHeight - 40)); } catch (_) {}
      }
      vscodeApi.postMessage({
        type: 'switchMode',
        mode: next,
        markdown: pendingMarkdown
      });
    }

    function warmEditor() {
      if (vditor || mode === 'source') return;
      try {
        pendingMarkdown = '';
        ensureIr('');
        showModePane('ir');
      } catch (_) {}
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
    btnDelete.addEventListener('click', function () {
      if (!currentDocRel) return;
      vscodeApi.postMessage({ type: 'deleteDoc', docRel: currentDocRel });
    });
    btnCreate.addEventListener('click', function () {
      if (!unboundSourceRel) return;
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
      if (msg.type === 'unbound') {
        showUnbound(msg.sourceRel || '', msg.canBack, msg.canForward, msg.canCreate !== false);
        return;
      }
      if (msg.type === 'home') {
        showHome(msg.docsPath, msg.docs || [], msg.missing || [], msg.canBack, msg.canForward);
        return;
      }
      if (msg.type !== 'load') return;
      applyMarkdown(
        msg.markdown || '',
        msg.mode,
        msg.canBack,
        msg.canForward,
        msg.docRel || '',
        !!msg.deletable
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
