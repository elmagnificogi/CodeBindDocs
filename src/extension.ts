import * as vscode from 'vscode';
import { scaffoldAgentFiles } from './agent/scaffold';
import { DriftChecker, refreshBindingHash } from './drift/driftChecker';
import { getWorkspaceStore, IndexStore } from './store/indexStore';
import { Binding, normalizeRelPath } from './store/types';
import { SplitSync } from './sync/splitSync';
import { BindingItem, CimTreeProvider } from './views/cimTreeProvider';
import { CimCodeLensProvider } from './views/cimCodeLens';
import {
  disposeRangePicker,
  pickLineRangeInEditor,
  registerRangePickerCommands,
} from './util/rangePicker';

let splitSync: SplitSync | undefined;
let driftChecker: DriftChecker | undefined;
let treeProvider: CimTreeProvider | undefined;
let codeLensProvider: CimCodeLensProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const getStore = () => getWorkspaceStore();

  registerRangePickerCommands(context);

  splitSync = new SplitSync(
    getStore,
    context.extensionUri,
    () => driftChecker?.getIssues() ?? [],
    async () => {
      await driftChecker?.scanAll();
    }
  );
  driftChecker = new DriftChecker(getStore);
  treeProvider = new CimTreeProvider(getStore);
  codeLensProvider = new CimCodeLensProvider(getStore);

  context.subscriptions.push(
    splitSync,
    driftChecker,
    vscode.window.registerTreeDataProvider('cim.bindings', treeProvider),
    vscode.languages.registerCodeLensProvider({ scheme: 'file' }, codeLensProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cim.initialize', () => initialize(getStore)),
    vscode.commands.registerCommand('cim.bindCurrentFile', (sourceRel?: string) =>
      bindCurrentFile(getStore, sourceRel)
    ),
    vscode.commands.registerCommand('cim.revealBoundDoc', () => revealBoundDoc()),
    vscode.commands.registerCommand('cim.toggleSplitSync', () => toggleSplitSync()),
    vscode.commands.registerCommand('cim.refreshTree', () => refreshAll()),
    vscode.commands.registerCommand('cim.openTarget', (item?: BindingItem) => openTarget(getStore, item)),
    vscode.commands.registerCommand('cim.openDoc', (item?: BindingItem) => openDoc(getStore, item)),
    vscode.commands.registerCommand('cim.openDocsIndex', () => openDocsIndex(getStore)),
    vscode.commands.registerCommand('cim.deleteDoc', (item?: BindingItem | { docRel?: string }) =>
      deleteDoc(getStore, item)
    ),
    vscode.commands.registerCommand('cim.rebindDoc', (item?: BindingItem | { docRel?: string }) =>
      rebindDoc(getStore, item)
    ),
    vscode.commands.registerCommand('cim.showDriftIssues', () =>
      driftChecker?.showIssuesPicker()
    ),
    vscode.commands.registerCommand(
      'cim.refreshDocHash',
      (item?: BindingItem | { docRel?: string }) => refreshDocHash(getStore, item)
    ),
    vscode.commands.registerCommand('cim.refreshAllDocHashes', () =>
      refreshAllDocHashes()
    )
  );

  void bootstrap(getStore);
}

export function deactivate(): void {
  disposeRangePicker();
  splitSync = undefined;
  driftChecker = undefined;
  treeProvider = undefined;
  codeLensProvider = undefined;
}

async function bootstrap(getStore: () => IndexStore | undefined): Promise<void> {
  const store = getStore();
  if (store && (await store.exists())) {
    await store.writeDocsIndex();
    await driftChecker?.scanAll();
    treeProvider?.refresh();
    codeLensProvider?.refresh();
    // After index is ready, sync restored editor (may still be settling).
    await splitSync?.syncNow();
    setTimeout(() => void splitSync?.syncNow(), 300);
    setTimeout(() => void splitSync?.syncNow(), 1000);
  }
}

async function initialize(getStore: () => IndexStore | undefined): Promise<void> {
  const store = getStore();
  if (!store) {
    void vscode.window.showErrorMessage('CIM: 请先打开一个工作区文件夹。');
    return;
  }

  await store.ensureLayout();
  await scaffoldAgentFiles(store.workspaceFolder.uri);

  const index = await store.read();
  if (index.bindings.length === 0) {
    const welcomeUri = store.docUri(`${store.docsPath}/welcome.md`);
    try {
      await vscode.workspace.fs.stat(welcomeUri);
    } catch {
      const text = `# 欢迎使用 CIM

本工作区使用 \`${store.docsPath}/*.md\` 的 YAML 文件头声明绑定（可用设置 \`cim.docsPath\` 修改目录）。

用 **CIM: Bind Doc to Current File** 为源文件创建文档；切换源文件即可分栏同步。

示例文件头：

\`\`\`yaml
---
cim:
  target: src/example.ts
  kind: file
---
\`\`\`
`;
      await vscode.workspace.fs.writeFile(welcomeUri, Buffer.from(text, 'utf8'));
    }
  }

  await store.writeDocsIndex();
  treeProvider?.refresh();
  await driftChecker?.scanAll();
  void vscode.window.showInformationMessage(
    `CIM: 已初始化文档目录 \`${store.docsPath}/\` 与 Agent 脚手架。`
  );
}

async function bindCurrentFile(
  getStore: () => IndexStore | undefined,
  sourceRelArg?: string
): Promise<void> {
  const store = getStore();
  if (!store) {
    void vscode.window.showErrorMessage('CIM: 请先打开一个工作区文件夹。');
    return;
  }

  let rel = sourceRelArg?.replace(/\\/g, '/');
  let sourceUri: vscode.Uri | undefined;
  let editor = vscode.window.activeTextEditor;

  if (rel) {
    sourceUri = store.targetUri(rel);
    if (editor && store.toWorkspaceRelative(editor.document.uri) !== rel) {
      editor = vscode.window.visibleTextEditors.find(
        (e) => store.toWorkspaceRelative(e.document.uri) === rel
      );
    }
  } else {
    if (!editor || editor.document.uri.scheme !== 'file') {
      void vscode.window.showErrorMessage('CIM: 请先聚焦一个源文件。');
      return;
    }
    sourceUri = editor.document.uri;
    rel = store.toWorkspaceRelative(sourceUri);
  }

  if (!rel || !sourceUri) {
    void vscode.window.showErrorMessage('CIM: 文件不在工作区内。');
    return;
  }
  if (store.isUnderDocsPath(rel)) {
    void vscode.window.showErrorMessage(`CIM: 不能绑定文档目录（${store.docsPath}/）内的文件。`);
    return;
  }

  await store.ensureLayout();
  await scaffoldAgentFiles(store.workspaceFolder.uri);

  const kindPick = await vscode.window.showQuickPick(
    [
      {
        label: '整文件',
        description: 'cim.kind: file',
        bindKind: 'file' as const,
      },
      {
        label: '代码块（稍后在编辑器中选区）',
        description: 'cim.kind: range + startLine/endLine',
        bindKind: 'range' as const,
      },
    ],
    { placeHolder: '选择绑定粒度' }
  );
  if (!kindPick) {
    return;
  }

  let startLine: number | undefined;
  let endLine: number | undefined;
  let symbol: string | undefined;

  if (kindPick.bindKind === 'range') {
    const range = await pickLineRangeInEditor(sourceUri, {
      message: `请在「${rel}」中选中要绑定的代码块，然后点击状态栏「确认代码块选区」。`,
    });
    if (!range) {
      return;
    }
    startLine = range.startLine;
    endLine = range.endLine;
    symbol = await vscode.window.showInputBox({
      prompt: `代码块符号名（可选，当前 L${startLine}-${endLine}）`,
      placeHolder: '例如 activate',
    });
    if (symbol === undefined) {
      return;
    }
    symbol = symbol.trim() || undefined;
  }

  store.invalidateCache();
  const index = await store.read();
  const forFile = store.findBindingsForTarget(index, rel);

  if (kindPick.bindKind === 'file') {
    const existing = forFile.find((b) => b.target.kind === 'file');
    if (existing) {
      const choice = await vscode.window.showInformationMessage(
        `该文件已有整文件绑定：${existing.doc}。打开？`,
        '打开',
        '刷新 contentHash'
      );
      if (choice === '打开') {
        await splitSync?.revealDocForUri(sourceUri);
      } else if (choice === '刷新 contentHash') {
        await refreshBindingHash(store, existing);
        await driftChecker?.scanAll();
        treeProvider?.refresh();
        codeLensProvider?.refresh();
      }
      return;
    }
  } else {
    const existing = forFile.find(
      (b) =>
        b.target.kind === 'range' &&
        b.target.startLine === startLine &&
        b.target.endLine === endLine
    );
    if (existing) {
      const choice = await vscode.window.showInformationMessage(
        `该选区已有绑定：${existing.doc}。打开？`,
        '打开'
      );
      if (choice === '打开') {
        await splitSync?.openDocUri(store.docUri(existing.doc), true);
      }
      return;
    }
  }

  const baseSuggest = store.suggestDocPath(rel).replace(/\.md$/, '');
  const suggested =
    kindPick.bindKind === 'range'
      ? `${baseSuggest}-${symbol || `L${startLine}-${endLine}`}.md`
      : `${baseSuggest}.md`;

  const docRel = await vscode.window.showInputBox({
    prompt: `新建关联文档路径（工作区相对，默认在 ${store.docsPath}/）`,
    value: suggested,
    validateInput: (v) => (v.trim() ? undefined : '路径必填'),
  });
  if (!docRel) {
    return;
  }

  const title =
    kindPick.bindKind === 'range'
      ? `${rel.split('/').pop()} ${symbol ?? `L${startLine}-${endLine}`}`
      : (rel.split('/').pop() ?? rel);
  const hash = await store.hashFileContent(sourceUri);
  const binding: Binding = {
    id: normalizeRelPath(docRel.trim()),
    target: {
      path: rel,
      kind: kindPick.bindKind,
      startLine,
      endLine,
    },
    doc: docRel.trim().replace(/\\/g, '/'),
    anchors: [{ contentHash: hash, symbol }],
  };

  // One write + open first; index/scan in background so the pane can paint immediately.
  const runWrite = async () => {
    await store.writeBinding(binding, { refreshIndex: false, title });
  };
  if (driftChecker) {
    await driftChecker.runWithoutSaveHandling(runWrite);
  } else {
    await runWrite();
  }

  await splitSync?.openDocUri(store.docUri(binding.doc), true);
  const scope =
    kindPick.bindKind === 'range' ? `L${startLine}-${endLine}` : '整文件';
  void vscode.window.showInformationMessage(`CIM: 已绑定 ${rel}（${scope}）→ ${binding.doc}`);

  void (async () => {
    try {
      await store.writeDocsIndex();
      treeProvider?.refresh();
      codeLensProvider?.refresh();
      await driftChecker?.scanAll({ notify: false });
    } catch {
      // background housekeeping must not block the editor
    }
  })();
}

async function revealBoundDoc(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showErrorMessage('CIM: 没有活动编辑器。');
    return;
  }
  const ok = await splitSync?.revealDocForUri(editor.document.uri);
  if (!ok) {
    const choice = await vscode.window.showInformationMessage(
      'CIM: 该文件无关联文档。',
      '新建关联文档'
    );
    if (choice === '新建关联文档') {
      await bindCurrentFile(getWorkspaceStore);
    }
  }
}

function toggleSplitSync(): void {
  const enabled = splitSync?.toggle() ?? false;
  void vscode.window.showInformationMessage(
    enabled ? 'CIM: 分栏同步已开启' : 'CIM: 分栏同步已关闭'
  );
}

async function refreshAll(): Promise<void> {
  const store = getWorkspaceStore();
  store?.invalidateCache();
  if (store) {
    await store.writeDocsIndex();
  }
  treeProvider?.refresh();
  codeLensProvider?.refresh();
  await driftChecker?.scanAll();
  await splitSync?.syncNow();
}

async function openDocsIndex(getStore: () => IndexStore | undefined): Promise<void> {
  const store = getStore();
  if (!store) {
    void vscode.window.showErrorMessage('CIM: 请先打开一个工作区文件夹。');
    return;
  }
  await store.ensureLayout();
  await store.writeDocsIndex();
  treeProvider?.refresh();
  await splitSync?.openHome(true);
}

async function openTarget(
  getStore: () => IndexStore | undefined,
  item?: BindingItem
): Promise<void> {
  const store = getStore();
  if (!store || !item) {
    return;
  }
  const uri = store.targetUri(item.binding.target.path);
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc, {
    viewColumn: vscode.ViewColumn.One,
  });
  if (
    item.binding.target.kind === 'range' &&
    typeof item.binding.target.startLine === 'number'
  ) {
    const line = Math.max(0, item.binding.target.startLine - 1);
    const pos = new vscode.Position(line, 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
  }
}

async function openDoc(
  getStore: () => IndexStore | undefined,
  item?: BindingItem | { binding: Binding }
): Promise<void> {
  const store = getStore();
  if (!store || !item?.binding) {
    return;
  }
  const uri = store.docUri(item.binding.doc);
  await splitSync?.openDocUri(uri, true);
}

async function deleteDoc(
  getStore: () => IndexStore | undefined,
  item?: BindingItem | { binding?: Binding; docRel?: string }
): Promise<void> {
  const store = getStore();
  if (!store) {
    void vscode.window.showErrorMessage('CIM: 请先打开一个工作区文件夹。');
    return;
  }

  let docRel =
    item && 'binding' in item && item.binding
      ? normalizeRelPath(item.binding.doc)
      : item && 'docRel' in item && item.docRel
        ? normalizeRelPath(item.docRel)
        : undefined;

  if (!docRel) {
    docRel = splitSync?.currentDocRel();
  }

  if (!docRel) {
    const index = await store.read();
    const picks = index.bindings.map((b) => ({
      label: b.doc,
      description: b.target.path,
      docRel: b.doc,
    }));
    if (!picks.length) {
      void vscode.window.showInformationMessage('CIM: 没有可删除的绑定文档。');
      return;
    }
    const picked = await vscode.window.showQuickPick(picks, {
      title: 'CIM: 选择要删除的文档',
      placeHolder: '删除后不可从扩展内恢复（一般进回收站）',
    });
    if (!picked) {
      return;
    }
    docRel = picked.docRel;
  }

  if (store.isIndexDoc(docRel)) {
    void vscode.window.showWarningMessage('CIM: 不能删除自动生成的 cim-index.md。');
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `确定删除文档「${docRel}」？\n绑定将解除；文件通常进入回收站。`,
    { modal: true },
    '删除'
  );
  if (confirm !== '删除') {
    return;
  }

  const wasCurrent = splitSync?.currentDocRel() === docRel;
  splitSync?.releaseDoc(docRel);
  try {
    await store.deleteDoc(docRel);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    void vscode.window.showErrorMessage(`CIM: ${msg}`);
    return;
  }

  treeProvider?.refresh();
  codeLensProvider?.refresh();
  await driftChecker?.scanAll();

  if (wasCurrent || splitSync?.isHome()) {
    // Stay in place: do not reveal with Beside (that shrinks/resizes editor groups).
    await splitSync?.openHome(false);
  } else {
    await splitSync?.syncNow();
  }
}

async function rebindDoc(
  getStore: () => IndexStore | undefined,
  item?: BindingItem | { binding?: Binding; docRel?: string }
): Promise<void> {
  const store = getStore();
  if (!store) {
    void vscode.window.showErrorMessage('CIM: 请先打开一个工作区文件夹。');
    return;
  }

  let docRel =
    item && 'binding' in item && item.binding
      ? normalizeRelPath(item.binding.doc)
      : item && 'docRel' in item && item.docRel
        ? normalizeRelPath(item.docRel)
        : splitSync?.currentDocRel();

  if (!docRel) {
    void vscode.window.showWarningMessage('CIM: 请指定要重新绑定的文档。');
    return;
  }

  if (store.isIndexDoc(docRel)) {
    void vscode.window.showWarningMessage('CIM: 不能重新绑定 cim-index.md。');
    return;
  }

  const index = await store.read();
  const binding = index.bindings.find((b) => normalizeRelPath(b.doc) === docRel);
  if (!binding) {
    void vscode.window.showWarningMessage(`CIM: 未找到绑定文档 ${docRel}`);
    return;
  }

  const previousSymbol = binding.anchors?.[0]?.symbol;
  const wasRange = binding.target.kind === 'range';

  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    canSelectFolders: false,
    openLabel: '选择源文件',
    title: `为 ${docRel} 选择源文件`,
    defaultUri: store.targetUri(binding.target.path),
  });
  if (!picked?.length) {
    return;
  }

  const newRel = store.toWorkspaceRelative(picked[0]);
  if (!newRel) {
    void vscode.window.showErrorMessage('CIM: 请选择工作区内的文件。');
    return;
  }
  if (store.isUnderDocsPath(newRel)) {
    void vscode.window.showErrorMessage('CIM: 不能绑定到文档目录内的文件。');
    return;
  }

  const kindPick = await vscode.window.showQuickPick(
    [
      {
        label: '整文件',
        description: 'cim.kind: file',
        bindKind: 'file' as const,
      },
      {
        label: '代码块（稍后在编辑器中选区）',
        description: wasRange
          ? `原为 range L${binding.target.startLine}-${binding.target.endLine}`
          : 'cim.kind: range + startLine/endLine',
        bindKind: 'range' as const,
      },
    ],
    {
      title: '选择绑定粒度',
      placeHolder: wasRange ? '原文档是代码块绑定，可继续选代码块或改为整文件' : '选择绑定粒度',
    }
  );
  if (!kindPick) {
    return;
  }

  const sourceUri = store.targetUri(newRel);
  let startLine: number | undefined;
  let endLine: number | undefined;
  let symbol: string | undefined = previousSymbol;

  if (kindPick.bindKind === 'range') {
    const preselect =
      wasRange &&
      typeof binding.target.startLine === 'number' &&
      typeof binding.target.endLine === 'number'
        ? { startLine: binding.target.startLine, endLine: binding.target.endLine }
        : undefined;
    const range = await pickLineRangeInEditor(sourceUri, {
      preselect,
      message: `请在「${newRel}」中选中要绑定的代码块，然后点击状态栏「确认代码块选区」。`,
    });
    if (!range) {
      return;
    }
    startLine = range.startLine;
    endLine = range.endLine;

    const symbolInput = await vscode.window.showInputBox({
      prompt: `代码块符号名（可选，当前 L${startLine}-${endLine}）`,
      placeHolder: '例如 activate',
      value: previousSymbol ?? '',
    });
    if (symbolInput === undefined) {
      return;
    }
    symbol = symbolInput.trim() || undefined;
  }

  binding.target = {
    path: newRel,
    kind: kindPick.bindKind,
    startLine,
    endLine,
  };
  if (!binding.anchors?.length) {
    binding.anchors = [{ symbol }];
  } else {
    binding.anchors[0].symbol = symbol;
  }

  await refreshBindingHash(store, binding);
  await store.writeDocsIndex();
  treeProvider?.refresh();
  codeLensProvider?.refresh();
  await driftChecker?.scanAll();
  await splitSync?.openDocUri(store.docUri(binding.doc), true);

  const scope =
    kindPick.bindKind === 'range' ? `L${startLine}-${endLine}` : '整文件';
  void vscode.window.showInformationMessage(
    `CIM: 已将 ${docRel} 重新绑定到 ${newRel}（${scope}）`
  );
}

async function refreshDocHash(
  getStore: () => IndexStore | undefined,
  item?: BindingItem | { binding?: Binding; docRel?: string }
): Promise<void> {
  const store = getStore();
  if (!store) {
    void vscode.window.showErrorMessage('CIM: 请先打开一个工作区文件夹。');
    return;
  }

  let docRel =
    item && 'binding' in item && item.binding
      ? normalizeRelPath(item.binding.doc)
      : item && 'docRel' in item && item.docRel
        ? normalizeRelPath(item.docRel)
        : splitSync?.currentDocRel();

  if (!docRel) {
    void vscode.window.showWarningMessage('CIM: 请指定要刷新哈希的文档。');
    return;
  }

  const index = await store.read();
  const binding = index.bindings.find((b) => normalizeRelPath(b.doc) === docRel);
  if (!binding) {
    void vscode.window.showWarningMessage(`CIM: 未找到绑定 ${docRel}`);
    return;
  }

  try {
    await refreshBindingHash(store, binding);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    void vscode.window.showErrorMessage(`CIM: 刷新哈希失败（${msg}）`);
    return;
  }

  treeProvider?.refresh();
  codeLensProvider?.refresh();
  await driftChecker?.scanAll({ notify: false });
  if (splitSync?.isHome()) {
    await splitSync.openHome(false);
  }
  void vscode.window.showInformationMessage(`CIM: 已更新 ${docRel} 的 contentHash`);
}

async function refreshAllDocHashes(): Promise<void> {
  const n = await driftChecker?.refreshAllHashes();
  if (n == null) {
    return;
  }
  treeProvider?.refresh();
  codeLensProvider?.refresh();
  if (n > 0 && splitSync?.isHome()) {
    await splitSync.openHome(false);
  }
}
