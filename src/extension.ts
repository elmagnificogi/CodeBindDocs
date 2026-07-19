import * as vscode from 'vscode';
import { scaffoldAgentFiles } from './agent/scaffold';
import { DriftChecker, refreshBindingHash } from './drift/driftChecker';
import { getWorkspaceStore, IndexStore } from './store/indexStore';
import { Binding, normalizeRelPath } from './store/types';
import { SplitSync } from './sync/splitSync';
import { BindingItem, CimTreeProvider } from './views/cimTreeProvider';

let splitSync: SplitSync | undefined;
let driftChecker: DriftChecker | undefined;
let treeProvider: CimTreeProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const getStore = () => getWorkspaceStore();

  splitSync = new SplitSync(getStore, context.extensionUri);
  driftChecker = new DriftChecker(getStore);
  treeProvider = new CimTreeProvider(getStore);

  context.subscriptions.push(
    splitSync,
    driftChecker,
    vscode.window.registerTreeDataProvider('cim.bindings', treeProvider)
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
    vscode.commands.registerCommand('cim.openDocsIndex', () => openDocsIndex(getStore))
  );

  void bootstrap(getStore);
}

export function deactivate(): void {
  splitSync = undefined;
  driftChecker = undefined;
  treeProvider = undefined;
}

async function bootstrap(getStore: () => IndexStore | undefined): Promise<void> {
  const store = getStore();
  if (store && (await store.exists())) {
    await store.writeDocsIndex();
    await driftChecker?.scanAll();
    treeProvider?.refresh();
    await splitSync?.syncNow();
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

  if (rel) {
    sourceUri = store.targetUri(rel);
  } else {
    const editor = vscode.window.activeTextEditor;
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

  store.invalidateCache();
  const index = await store.read();
  const existing = store.findByTargetPath(index, rel);
  if (existing) {
    const choice = await vscode.window.showInformationMessage(
      `已绑定到 ${existing.doc}。打开？`,
      '打开',
      '刷新 contentHash'
    );
    if (choice === '打开') {
      await splitSync?.revealDocForUri(sourceUri);
    } else if (choice === '刷新 contentHash') {
      await refreshBindingHash(store, existing);
      await driftChecker?.scanAll();
      treeProvider?.refresh();
      void vscode.window.showInformationMessage('CIM: 已刷新 contentHash。');
    }
    return;
  }

  const suggested = store.suggestDocPath(rel);
  const docRel = await vscode.window.showInputBox({
    prompt: `为 ${rel} 新建关联文档（工作区相对路径，默认在 ${store.docsPath}/）`,
    value: suggested,
    validateInput: (v) => (v.trim() ? undefined : '路径必填'),
  });
  if (!docRel) {
    return;
  }

  const title = rel.split('/').pop() ?? rel;
  const hash = await store.hashFileContent(sourceUri);
  const binding: Binding = {
    id: normalizeRelPath(docRel.trim()),
    target: { path: rel, kind: 'file' },
    doc: docRel.trim().replace(/\\/g, '/'),
    anchors: [{ contentHash: hash }],
  };

  await store.createDocIfMissing(binding.doc, title, rel, {
    contentHash: hash,
  });
  await store.writeBinding(binding);
  await store.writeDocsIndex();

  treeProvider?.refresh();
  await driftChecker?.scanAll();
  await splitSync?.revealDocForUri(sourceUri);
  void vscode.window.showInformationMessage(`CIM: 已绑定 ${rel} → ${binding.doc}`);
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
  const uri = await store.writeDocsIndex();
  treeProvider?.refresh();
  await splitSync?.openDocUri(uri, true);
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
  await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One });
}

async function openDoc(
  getStore: () => IndexStore | undefined,
  item?: BindingItem
): Promise<void> {
  const store = getStore();
  if (!store || !item) {
    return;
  }
  const uri = store.docUri(item.binding.doc);
  await splitSync?.openDocUri(uri, true);
}
