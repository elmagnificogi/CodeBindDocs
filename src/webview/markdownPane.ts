import * as vscode from 'vscode';
import { joinMarkdown, splitMarkdown } from '../store/frontmatter';

type DocMode = 'ir' | 'sv';

type HostToWeb =
  | {
      type: 'load';
      title: string;
      markdown: string;
      mode: DocMode;
    }
  | {
      type: 'unbound';
      sourceRel: string;
    };

type WebToHost =
  | { type: 'ready' }
  | { type: 'markdownChanged'; markdown: string }
  | { type: 'switchMode'; mode: DocMode; markdown?: string }
  | { type: 'createBind'; sourceRel: string };

/**
 * Typora-like Markdown pane via Vditor IR (instant rendering).
 * Also shows an "unbound" empty state with a create-binding button.
 */
export class MarkdownPane {
  private panel: vscode.WebviewPanel | undefined;
  private currentUri: vscode.Uri | undefined;
  private unboundSourceRel: string | undefined;
  private header: string | undefined;
  private writing = false;
  private saveTimer: NodeJS.Timeout | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private mode: DocMode = 'ir';

  constructor(private readonly extensionUri: vscode.Uri) {
    this.mode = this.readModeSetting();

    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('cim.docPane.mode')) {
          this.mode = this.readModeSetting();
        }
      }),
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (this.writing || !this.currentUri) {
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
      return 'sv';
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

  get currentUnboundSource(): string | undefined {
    return this.unboundSourceRel;
  }

  async show(docUri: vscode.Uri, column: vscode.ViewColumn, forceFocus: boolean): Promise<void> {
    this.unboundSourceRel = undefined;
    if (this.panel && this.currentUri?.fsPath === docUri.fsPath) {
      if (forceFocus) {
        this.panel.reveal(column, false);
      }
      return;
    }

    this.currentUri = docUri;
    await this.ensurePanel(column, !forceFocus);
    await this.reloadFromDisk();
    if (forceFocus) {
      this.panel?.reveal(column, false);
    }
  }

  async showUnbound(
    sourceRel: string,
    column: vscode.ViewColumn,
    forceFocus: boolean
  ): Promise<void> {
    if (this.unboundSourceRel === sourceRel && this.panel && !this.currentUri) {
      if (forceFocus) {
        this.panel.reveal(column, false);
      }
      return;
    }

    this.currentUri = undefined;
    this.header = undefined;
    this.unboundSourceRel = sourceRel;
    await this.ensurePanel(column, !forceFocus);
    this.panel!.title = 'CIM · 无关联文档';
    await this.panel!.webview.postMessage({
      type: 'unbound',
      sourceRel,
    } satisfies HostToWeb);
    if (forceFocus) {
      this.panel?.reveal(column, false);
    }
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
        if (this.unboundSourceRel && !this.currentUri) {
          await this.panel?.webview.postMessage({
            type: 'unbound',
            sourceRel: this.unboundSourceRel,
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
      if (msg.type === 'switchMode') {
        if (this.saveTimer) {
          clearTimeout(this.saveTimer);
          this.saveTimer = undefined;
        }
        if (typeof msg.markdown === 'string') {
          await this.saveBody(msg.markdown);
        }
        this.mode = msg.mode;
        void vscode.workspace
          .getConfiguration('cim')
          .update('docPane.mode', msg.mode, vscode.ConfigurationTarget.Workspace);
        await this.reloadFromDisk();
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
      this.header = undefined;
    });
  }

  private async reloadFromDisk(): Promise<void> {
    if (!this.panel || !this.currentUri) {
      return;
    }
    try {
      const raw = await vscode.workspace.fs.readFile(this.currentUri);
      const text = Buffer.from(raw).toString('utf8');
      const { header, body } = splitMarkdown(text);
      this.header = header;
      const title = this.currentUri.path.split('/').pop() ?? 'CIM Doc';
      this.panel.title = `CIM · ${title}`;
      const payload: HostToWeb = {
        type: 'load',
        title,
        markdown: body,
        mode: this.mode,
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
      void this.saveBody(markdown);
    }, 400);
  }

  private async saveBody(body: string): Promise<void> {
    if (!this.currentUri) {
      return;
    }
    this.writing = true;
    try {
      const content = joinMarkdown(this.header, body.endsWith('\n') ? body : body + '\n');
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
      display: flex; gap: 6px; align-items: center;
      padding: 6px 10px;
      border-bottom: 1px solid var(--vscode-panel-border, #444);
      background: var(--vscode-editor-background);
    }
    .bar button, .cta {
      border: none; border-radius: 4px; padding: 3px 10px; cursor: pointer; font-size: 12px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .bar button.active, .cta.primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      padding: 8px 16px;
      font-size: 13px;
    }
    .bar .hint { margin-left: auto; opacity: 0.55; font-size: 11px; }
    #wrap { height: calc(100% - 34px); }
    #vditor { border: none !important; }
    .vditor, .vditor-ir, .vditor-sv, .vditor-reset {
      background: var(--vscode-editor-background) !important;
      color: var(--vscode-editor-foreground) !important;
      border-color: var(--vscode-panel-border, #444) !important;
    }
    #unbound {
      display: none; height: 100%;
      align-items: center; justify-content: center;
      flex-direction: column; gap: 14px; padding: 32px; text-align: center;
    }
    #unbound.visible { display: flex; }
    #editorRoot { height: 100%; }
    #editorRoot.hidden { display: none; }
    #unbound h2 { margin: 0; font-weight: 600; font-size: 16px; }
    #unbound p { margin: 0; opacity: 0.75; font-size: 13px; max-width: 420px; line-height: 1.5; }
    #unbound code {
      font-family: var(--vscode-editor-font-family);
      background: rgba(127,127,127,0.15); padding: 1px 6px; border-radius: 3px;
    }
  </style>
</head>
<body>
  <div id="editorRoot">
    <div class="bar">
      <button type="button" id="btnIr" class="active">即时渲染</button>
      <button type="button" id="btnSv">分屏源码</button>
      <span class="hint">输入 Markdown（如 # / **）会即时变成渲染效果 · YAML 头已隐藏</span>
    </div>
    <div id="wrap"><div id="vditor"></div></div>
  </div>
  <div id="unbound">
    <h2>无关联文档</h2>
    <p>当前文件 <code id="unboundPath"></code> 尚未绑定 CIM 文档。</p>
    <button type="button" class="cta primary" id="btnCreate">新建关联文档</button>
  </div>
  <script src="${vditorJs}"></script>
  <script>
    const vscodeApi = acquireVsCodeApi();
    const btnIr = document.getElementById('btnIr');
    const btnSv = document.getElementById('btnSv');
    const editorRoot = document.getElementById('editorRoot');
    const unboundEl = document.getElementById('unbound');
    const unboundPath = document.getElementById('unboundPath');
    const btnCreate = document.getElementById('btnCreate');
    let vditor = null;
    let mode = 'ir';
    let applying = false;
    let pendingMarkdown = '';
    let unboundSourceRel = '';

    function isDark() {
      return document.body.classList.contains('vscode-dark')
        || document.body.classList.contains('vscode-high-contrast');
    }

    function setButtons() {
      btnIr.classList.toggle('active', mode === 'ir');
      btnSv.classList.toggle('active', mode === 'sv');
    }

    function showUnbound(sourceRel) {
      unboundSourceRel = sourceRel || '';
      unboundPath.textContent = unboundSourceRel;
      unboundEl.classList.add('visible');
      editorRoot.classList.add('hidden');
    }

    function showEditor() {
      unboundEl.classList.remove('visible');
      editorRoot.classList.remove('hidden');
    }

    function currentValue() {
      if (vditor) {
        try { return vditor.getValue(); } catch (_) { return pendingMarkdown; }
      }
      return pendingMarkdown;
    }

    function createEditor(markdown, nextMode) {
      showEditor();
      pendingMarkdown = markdown || '';
      mode = nextMode === 'sv' ? 'sv' : 'ir';
      setButtons();
      if (vditor) {
        try { vditor.destroy(); } catch (_) {}
        vditor = null;
      }
      const el = document.getElementById('vditor');
      el.innerHTML = '';
      applying = true;
      vditor = new Vditor('vditor', {
        height: Math.max(240, window.innerHeight - 40),
        mode: mode,
        value: pendingMarkdown,
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
    }

    btnIr.addEventListener('click', function () {
      if (mode === 'ir') return;
      vscodeApi.postMessage({ type: 'switchMode', mode: 'ir', markdown: currentValue() });
    });
    btnSv.addEventListener('click', function () {
      if (mode === 'sv') return;
      vscodeApi.postMessage({ type: 'switchMode', mode: 'sv', markdown: currentValue() });
    });
    btnCreate.addEventListener('click', function () {
      if (!unboundSourceRel) return;
      vscodeApi.postMessage({ type: 'createBind', sourceRel: unboundSourceRel });
    });

    window.addEventListener('resize', function () {
      if (!vditor) return;
      try { vditor.resize(Math.max(240, window.innerHeight - 40)); } catch (_) {}
    });

    window.addEventListener('message', function (event) {
      const msg = event.data;
      if (!msg) return;
      if (msg.type === 'unbound') {
        showUnbound(msg.sourceRel || '');
        return;
      }
      if (msg.type !== 'load') return;
      const next = msg.mode === 'sv' ? 'sv' : 'ir';
      if (!vditor || next !== mode || unboundEl.classList.contains('visible')) {
        createEditor(msg.markdown || '', next);
      } else {
        applying = true;
        pendingMarkdown = msg.markdown || '';
        vditor.setValue(pendingMarkdown);
        applying = false;
      }
    });

    vscodeApi.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}
