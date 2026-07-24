import * as vscode from 'vscode';
import { IndexStore } from '../store/indexStore';
import { Binding, normalizeRelPath } from '../store/types';
import { findOverlappingRangePairs } from '../util/rangeOverlap';
import { findSymbolLine, resolveSymbolLineRange } from '../util/symbolRange';

export type DriftSeverity = 'info' | 'warning';

export type DriftKind =
  | 'missing-target'
  | 'missing-doc'
  | 'hash'
  | 'range'
  | 'symbol'
  | 'renamed'
  | 'overlap';

export interface DriftIssue {
  bindingId: string;
  message: string;
  severity: DriftSeverity;
  kind: DriftKind;
  targetPath: string;
  doc: string;
}

/**
 * Watches renames and content/range/symbol drift; prompts when bindings may need update.
 */
export class DriftChecker {
  private readonly diagnosticCollection: vscode.DiagnosticCollection;
  private readonly statusBar: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];
  private issues: DriftIssue[] = [];
  /** Avoid repeating the same toast until the issue clears or changes. */
  private notifiedKeys = new Set<string>();
  /** Skip onSave side-effects during programmatic batch writes (bind / rebind). */
  private suspendSaveHandling = 0;

  constructor(private readonly getStore: () => IndexStore | undefined) {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('cbd');
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    this.statusBar.command = 'cbd.showDriftIssues';
    this.statusBar.tooltip = 'CodeBind Docs 绑定漂移 — 点击查看';
    this.statusBar.show();

    this.disposables.push(
      this.diagnosticCollection,
      this.statusBar,
      vscode.workspace.onDidRenameFiles((e) => void this.onRename(e)),
      vscode.workspace.onDidSaveTextDocument((doc) => void this.onSave(doc)),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('cbd.docsPath') || e.affectsConfiguration('cbd.assetsPath')) {
          this.getStore()?.invalidateCache();
          void this.scanAll({ notify: false });
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

  /** Run work without reacting to Markdown saves (avoids nested scanAll / index rewrite). */
  async runWithoutSaveHandling<T>(fn: () => Promise<T>): Promise<T> {
    this.suspendSaveHandling++;
    try {
      return await fn();
    } finally {
      this.suspendSaveHandling--;
    }
  }

  async scanAll(options?: {
    notify?: boolean;
    focusTarget?: string;
  }): Promise<DriftIssue[]> {
    const store = this.getStore();
    if (!store || !(await store.exists())) {
      this.issues = [];
      this.notifiedKeys.clear();
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
          doc: binding.doc,
          kind: 'missing-target',
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
          doc: binding.doc,
          kind: 'missing-doc',
          severity: 'warning',
          message: `绑定文档缺失: ${binding.doc}`,
        });
        continue;
      }

      if (binding.target.kind === 'directory') {
        // No single-content anchor for a directory — existence is checked above.
        continue;
      }

      const hashIssues = await this.checkAnchors(store, binding, targetUri);
      found.push(...hashIssues);
    }

    for (const pair of findOverlappingRangePairs(index.bindings)) {
      const aRange = `L${pair.a.target.startLine}-${pair.a.target.endLine}`;
      const bRange = `L${pair.b.target.startLine}-${pair.b.target.endLine}`;
      found.push({
        bindingId: pair.a.id,
        targetPath: pair.path,
        doc: pair.a.doc,
        kind: 'overlap',
        severity: 'warning',
        message: `代码块范围与「${pair.b.doc}」重叠（${aRange} ∩ ${bRange}）`,
      });
    }

    const previousKeys = new Set(this.notifiedKeys);
    this.issues = found;
    // Drop notified keys that no longer apply
    const currentKeys = new Set(found.map(issueKey));
    for (const key of [...this.notifiedKeys]) {
      if (!currentKeys.has(key)) {
        this.notifiedKeys.delete(key);
      }
    }

    this.applyDiagnostics(store, found);
    this.updateStatus();

    if (options?.notify === true) {
      await this.notifyNewIssues(found, previousKeys, options?.focusTarget);
    }
    return found;
  }

  /** Interactive list of current drift issues (status bar / command). */
  async showIssuesPicker(): Promise<void> {
    await this.scanAll({ notify: false });
    if (!this.issues.length) {
      void vscode.window.showInformationMessage('CBD: 当前没有绑定漂移。');
      return;
    }

    const hashCount = this.issues.filter((i) => i.kind === 'hash').length;
    type PickItem = {
      label: string;
      description?: string;
      detail?: string;
      issue?: DriftIssue;
      bulkHash?: boolean;
    };
    const items: PickItem[] = [];
    if (hashCount > 0) {
      items.push({
        label: '$(check) 全部标记已核对',
        description: `${hashCount} 项 · 可选`,
        detail: '核对过文档后可更新 contentHash，清除提醒；不强制',
        bulkHash: true,
      });
    }
    for (const issue of this.issues) {
      items.push({
        label: driftKindLabel(issue.kind),
        description: issue.targetPath,
        detail: `${issue.message} → ${issue.doc}`,
        issue,
      });
    }

    const picked = await vscode.window.showQuickPick(items, {
      title: 'CodeBind Docs 绑定变更提示',
      placeHolder: '选择一项进行处理',
    });
    if (!picked) {
      return;
    }
    if (picked.bulkHash) {
      await this.refreshAllHashes();
      return;
    }
    if (picked.issue) {
      await this.promptIssueActions(picked.issue, true);
    }
  }

  /** Refresh contentHash for every binding that currently has hash drift. */
  async refreshAllHashes(): Promise<number> {
    const store = this.getStore();
    if (!store) {
      return 0;
    }
    await this.scanAll({ notify: false });
    const hashIssues = this.issues.filter((i) => i.kind === 'hash');
    if (!hashIssues.length) {
      void vscode.window.showInformationMessage('CBD: 当前没有待核对的源码变更提醒。');
      return 0;
    }
    const index = await store.read();
    let n = 0;
    for (const issue of hashIssues) {
      const binding = index.bindings.find((b) => b.doc === issue.doc);
      if (!binding) {
        continue;
      }
      try {
        await refreshBindingHash(store, binding);
        this.notifiedKeys.delete(issueKey(issue));
        n++;
      } catch {
        // skip missing targets etc.
      }
    }
    await store.writeDocsIndex();
    await this.scanAll({ notify: false });
    void vscode.window.showInformationMessage(`CBD: 已标记 ${n} 个文档为已核对`);
    return n;
  }

  /**
   * Recalculate range start/end from binding symbol (DocumentSymbol or heuristic).
   * Returns the new span, or undefined if the symbol cannot be resolved.
   */
  async retightenBindingBySymbol(docRel: string): Promise<{ startLine: number; endLine: number } | undefined> {
    const store = this.getStore();
    if (!store) {
      return undefined;
    }
    const index = await store.read();
    const binding = index.bindings.find((b) => normalizeRelPath(b.doc) === normalizeRelPath(docRel));
    if (!binding) {
      void vscode.window.showWarningMessage(`CBD: 未找到绑定 ${docRel}`);
      return undefined;
    }
    const symbol = binding.anchors?.[0]?.symbol?.trim();
    if (!symbol) {
      void vscode.window.showWarningMessage('CBD: 该绑定没有 symbol，无法按符号重算行号。');
      return undefined;
    }
    if (binding.target.kind !== 'range') {
      void vscode.window.showWarningMessage('CBD: 仅代码块（range）绑定支持按 symbol 重算。');
      return undefined;
    }

    const prevStart = binding.target.startLine;
    const prevEnd = binding.target.endLine;
    const previousSpan =
      typeof prevStart === 'number' && typeof prevEnd === 'number'
        ? Math.max(0, prevEnd - prevStart)
        : undefined;

    const targetUri = store.targetUri(binding.target.path);
    let span;
    try {
      span = await resolveSymbolLineRange(targetUri, symbol, previousSpan);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      void vscode.window.showErrorMessage(`CBD: 重算行号失败（${msg}）`);
      return undefined;
    }
    if (!span) {
      void vscode.window.showWarningMessage(`CBD: 未找到符号「${symbol}」，请改绑或手改行号。`);
      return undefined;
    }

    const oldLabel =
      typeof prevStart === 'number' && typeof prevEnd === 'number'
        ? `L${prevStart}-${prevEnd}`
        : '原范围';
    if (span.startLine === prevStart && span.endLine === prevEnd) {
      void vscode.window.showInformationMessage(
        `CBD: ${docRel} 行号已是最新（${oldLabel} · ${symbol}）`
      );
      await refreshBindingHash(store, binding);
      await this.scanAll({ notify: false });
      return span;
    }

    binding.target.startLine = span.startLine;
    binding.target.endLine = span.endLine;
    await this.runWithoutSaveHandling(async () => {
      await refreshBindingHash(store, binding);
    });
    await store.writeDocsIndex();
    this.notifiedKeys.clear();
    await this.scanAll({ notify: false });
    void vscode.window.showInformationMessage(
      `CBD: 已按「${symbol}」重算 ${docRel}：${oldLabel} → L${span.startLine}-${span.endLine}`
    );
    return span;
  }

  private async checkAnchors(
    store: IndexStore,
    binding: Binding,
    targetUri: vscode.Uri
  ): Promise<DriftIssue[]> {
    const out: DriftIssue[] = [];
    const textDoc = await vscode.workspace.openTextDocument(targetUri);
    const currentHash = await store.hashFileContent(targetUri);
    const anchor = binding.anchors?.[0];
    const symbol = anchor?.symbol;

    if (anchor?.contentHash && anchor.contentHash !== currentHash) {
      out.push({
        bindingId: binding.id,
        targetPath: binding.target.path,
        doc: binding.doc,
        kind: 'hash',
        severity: 'info',
        message: `源码已修改，请确认旁路文档是否仍准确（${symbol ?? '整文件'}）· 仅提醒，可忽略`,
      });
    }

    if (
      binding.target.kind === 'range' &&
      typeof binding.target.startLine === 'number' &&
      typeof binding.target.endLine === 'number'
    ) {
      const { startLine, endLine } = binding.target;
      if (startLine < 1 || endLine > textDoc.lineCount || startLine > endLine) {
        out.push({
          bindingId: binding.id,
          targetPath: binding.target.path,
          doc: binding.doc,
          kind: 'range',
          severity: 'warning',
          message: `行范围 L${startLine}-${endLine} 越界（文件共 ${textDoc.lineCount} 行）`,
        });
      } else if (symbol) {
        const foundLine = findSymbolLine(textDoc.getText(), symbol);
        if (foundLine == null) {
          out.push({
            bindingId: binding.id,
            targetPath: binding.target.path,
            doc: binding.doc,
            kind: 'symbol',
            severity: 'warning',
            message: `未找到符号「${symbol}」，代码块绑定可能已失效`,
          });
        } else if (foundLine < startLine || foundLine > endLine) {
          out.push({
            bindingId: binding.id,
            targetPath: binding.target.path,
            doc: binding.doc,
            kind: 'symbol',
            severity: 'warning',
            message: `符号「${symbol}」现位于 L${foundLine}，不在绑定范围 L${startLine}-${endLine}`,
          });
        }
      }
    } else if (symbol && binding.target.kind === 'file') {
      const foundLine = findSymbolLine(textDoc.getText(), symbol);
      if (foundLine == null && anchor?.contentHash && anchor.contentHash !== currentHash) {
        out.push({
          bindingId: binding.id,
          targetPath: binding.target.path,
          doc: binding.doc,
          kind: 'symbol',
          severity: 'info',
          message: `未找到符号「${symbol}」（文件内容亦已变化）`,
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

    const updated: string[] = [];
    let bindingHits = 0;

    for (const file of e.files) {
      const oldRel = store.toWorkspaceRelative(file.oldUri);
      const newRel = store.toWorkspaceRelative(file.newUri);
      if (!oldRel || !newRel) {
        continue;
      }
      if (store.isUnderDocsPath(oldRel) || store.isUnderDocsPath(newRel)) {
        // Doc renames are picked up by rescan (binding id = path).
        continue;
      }
      const n = await store.updateTargetPath(oldRel, newRel);
      if (n > 0) {
        bindingHits += n;
        updated.push(`${oldRel} → ${newRel}（${n} 条绑定）`);
      }
    }

    if (updated.length) {
      const choice = await vscode.window.showInformationMessage(
        `CBD: 已根据改名更新绑定路径（共 ${bindingHits} 条）：\n${updated
          .slice(0, 3)
          .join('\n')}${updated.length > 3 ? `\n…共 ${updated.length} 个改名项` : ''}`,
        '打开文档主页',
        '查看漂移'
      );
      if (choice === '打开文档主页') {
        await vscode.commands.executeCommand('cbd.openDocsIndex');
      } else if (choice === '查看漂移') {
        await this.showIssuesPicker();
      }
    }

    await store.writeDocsIndex();
    await this.scanAll({ notify: true });
  }

  private async onSave(doc: vscode.TextDocument): Promise<void> {
    if (this.suspendSaveHandling > 0) {
      return;
    }
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
      // Debounce: index rewrite is owned by the writer (writeBinding / bind flow).
      await this.scanAll({ notify: false });
      return;
    }
    const index = await store.read();
    if (store.findBindingsForTarget(index, rel).length) {
      await this.scanAll({ notify: true, focusTarget: rel });
    }
  }

  private async notifyNewIssues(
    found: DriftIssue[],
    previousNotified: Set<string>,
    focusTarget?: string
  ): Promise<void> {
    const actionable = found.filter(
      (i) =>
        i.kind === 'hash' ||
        i.kind === 'range' ||
        i.kind === 'symbol' ||
        i.kind === 'overlap' ||
        i.kind === 'missing-target' ||
        i.kind === 'missing-doc'
    );
    // Save-focused: only toast for the saved target. Prefer symbol/range retighten over hash.
    // Global scan: warnings only (not mere hash info).
    const candidates = focusTarget
      ? actionable
          .filter((i) => normalizeRelPath(i.targetPath) === normalizeRelPath(focusTarget))
          .sort((a, b) => issueNotifyPriority(a) - issueNotifyPriority(b))
      : actionable.filter((i) => i.severity === 'warning');

    for (const issue of candidates) {
      const key = issueKey(issue);
      if (this.notifiedKeys.has(key) && previousNotified.has(key)) {
        continue;
      }
      this.notifiedKeys.add(key);
      await this.promptIssueActions(issue, false);
      // One toast per save/scan burst to avoid spam
      break;
    }
  }

  private async promptIssueActions(issue: DriftIssue, force: boolean): Promise<void> {
    // Hash drift is a soft reminder only — never pressure rebind / mandatory hash update.
    if (issue.kind === 'hash') {
      // Soft reminder: save toast only offers dismiss / open; mark-checked is optional in picker.
      const actions = force
        ? ['打开文档核对', '标记已核对', '知道了']
        : ['知道了', '打开文档核对'];
      const otherHash = this.issues.filter((i) => i.kind === 'hash' && i.doc !== issue.doc).length;
      if (otherHash > 0 && force) {
        actions.splice(2, 0, '全部标记已核对');
      }
      const pick = await vscode.window.showInformationMessage(
        `CodeBind Docs 提醒（可忽略）\n${issue.message}\n文档：${issue.doc}`,
        ...actions
      );
      if (!pick || pick === '知道了') {
        return;
      }
      if (pick === '全部标记已核对') {
        await this.refreshAllHashes();
        return;
      }
      if (pick === '标记已核对') {
        const store = this.getStore();
        if (!store) {
          return;
        }
        const index = await store.read();
        const binding = index.bindings.find((b) => b.doc === issue.doc);
        if (binding) {
          await refreshBindingHash(store, binding);
          this.notifiedKeys.delete(issueKey(issue));
          await this.scanAll({ notify: false });
          void vscode.window.showInformationMessage(`CBD: 已清除 ${issue.doc} 的源码变更提醒`);
        }
        return;
      }
      if (pick === '打开文档核对') {
        await vscode.commands.executeCommand('cbd.openDoc', {
          binding: {
            doc: issue.doc,
            id: issue.doc,
            target: { path: issue.targetPath, kind: 'file' },
          },
        });
      }
      return;
    }

    const actions: string[] = [];
    if (issue.kind === 'missing-doc') {
      actions.push('重新绑定');
    } else if (issue.kind === 'missing-target') {
      actions.push('重新绑定', '删除文档');
    } else if (issue.kind === 'symbol' || issue.kind === 'range') {
      if (!issue.message.includes('未找到符号')) {
        // Primary action — first button is the default affordance.
        actions.push('按 symbol 重算行号');
      }
      actions.push('打开文档', '重新绑定');
    } else if (issue.kind === 'overlap') {
      actions.push('重新绑定');
    }
    if (issue.kind === 'missing-doc') {
      actions.push('打开源文件');
    } else if (
      issue.kind !== 'missing-target' &&
      issue.kind !== 'symbol' &&
      issue.kind !== 'range'
    ) {
      actions.push('打开文档');
    }
    actions.push('忽略');

    const title =
      issue.kind === 'range' || issue.kind === 'symbol'
        ? `CodeBind Docs：建议按 symbol 重算行号`
        : issue.kind === 'overlap'
          ? `CodeBind Docs 绑定关系可能已变更`
          : `CodeBind Docs 绑定异常`;

    const pick = await vscode.window.showWarningMessage(
      `${title}\n${issue.message}\n文档：${issue.doc}`,
      ...(force ? actions : actions.filter((a) => a !== '忽略').concat('忽略'))
    );

    if (!pick || pick === '忽略') {
      return;
    }
    if (pick === '按 symbol 重算行号') {
      await this.retightenBindingBySymbol(issue.doc);
      return;
    }
    if (pick === '重新绑定') {
      if (issue.kind === 'missing-doc') {
        await vscode.commands.executeCommand('cbd.bindCurrentFile', issue.targetPath);
      } else {
        await vscode.commands.executeCommand('cbd.rebindDoc', { docRel: issue.doc });
      }
      return;
    }
    if (pick === '打开文档') {
      await vscode.commands.executeCommand('cbd.openDoc', {
        binding: { doc: issue.doc, id: issue.doc, target: { path: issue.targetPath, kind: 'file' } },
      });
      return;
    }
    if (pick === '打开源文件') {
      const store = this.getStore();
      if (!store) {
        return;
      }
      const uri = store.targetUri(issue.targetPath);
      try {
        const textDoc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(textDoc, { viewColumn: vscode.ViewColumn.One });
      } catch {
        void vscode.window.showWarningMessage(`CBD: 无法打开 ${issue.targetPath}`);
      }
      return;
    }
    if (pick === '删除文档') {
      await vscode.commands.executeCommand('cbd.deleteDoc', { docRel: issue.doc });
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
        `CBD: ${issue.message}`,
        severity
      );
      diag.source = 'CodeBind Docs';
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
      this.statusBar.text = '$(book) CBD';
      this.statusBar.backgroundColor = undefined;
      this.statusBar.tooltip = 'CodeBind Docs 绑定漂移 — 点击查看';
    } else if (warnings > 0) {
      this.statusBar.text = `$(warning) CodeBind Docs 绑定 ${warnings}`;
      this.statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      this.statusBar.tooltip = 'CodeBind Docs 绑定异常 — 点击处理';
    } else {
      this.statusBar.text = `$(info) CodeBind Docs 核对 ${infos}`;
      this.statusBar.backgroundColor = undefined;
      this.statusBar.tooltip = '源码变更提醒（可忽略）— 点击查看';
    }
  }
}

function issueNotifyPriority(issue: DriftIssue): number {
  // Lower = notify first on save.
  switch (issue.kind) {
    case 'symbol':
      return 0;
    case 'range':
      return 1;
    case 'overlap':
      return 2;
    case 'missing-doc':
    case 'missing-target':
      return 3;
    case 'hash':
      return 9;
    default:
      return 5;
  }
}

function issueKey(issue: DriftIssue): string {
  return `${issue.kind}|${issue.doc}|${issue.targetPath}|${issue.message}`;
}

function driftKindLabel(kind: DriftKind): string {
  switch (kind) {
    case 'missing-target':
      return '源文件缺失';
    case 'missing-doc':
      return '文档缺失';
    case 'hash':
      return '文档核对提醒';
    case 'overlap':
      return '范围重叠';
    case 'range':
      return '行范围失效';
    case 'symbol':
      return '符号变动';
    case 'renamed':
      return '路径已改';
    default:
      return kind;
  }
}

/** Refresh file-level contentHash in Markdown frontmatter after bind. */
export async function refreshBindingHash(
  store: IndexStore,
  binding: Binding
): Promise<void> {
  if (binding.target.kind === 'directory') {
    // Directories have no single content to hash.
    return;
  }
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

/** @deprecated import from util/symbolRange — re-exported for existing callers. */
export { findSymbolLine } from '../util/symbolRange';
