import * as vscode from 'vscode';
import { IndexStore } from '../store/indexStore';
import { Binding, normalizeRelPath } from '../store/types';

export type CimTreeItem = IndexPageItem | BindingItem;

export class IndexPageItem extends vscode.TreeItem {
  constructor(docsPath: string) {
    super('文档汇总 (cim-index)', vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'index';
    this.description = `${docsPath}/cim-index.md`;
    this.tooltip = '查看全部绑定文档的目录页';
    this.iconPath = new vscode.ThemeIcon('book');
    this.command = {
      command: 'cim.openDocsIndex',
      title: 'Open Docs Index',
    };
  }
}

export class BindingItem extends vscode.TreeItem {
  constructor(public readonly binding: Binding) {
    super(normalizeRelPath(binding.target.path), vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'binding';
    if (
      binding.target.kind === 'range' &&
      typeof binding.target.startLine === 'number' &&
      typeof binding.target.endLine === 'number'
    ) {
      const sym = binding.anchors?.[0]?.symbol;
      this.description = `${binding.doc}  L${binding.target.startLine}-${binding.target.endLine}${
        sym ? ` · ${sym}` : ''
      }`;
    } else {
      this.description = binding.doc;
    }
    this.tooltip = `${binding.target.path} → ${binding.doc}`;
    this.iconPath = new vscode.ThemeIcon(
      binding.target.kind === 'range' ? 'symbol-method' : 'link'
    );
    this.command = {
      command: 'cim.openTarget',
      title: 'Open Source',
      arguments: [this],
    };
  }
}

export class CimTreeProvider implements vscode.TreeDataProvider<CimTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<CimTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly getStore: () => IndexStore | undefined) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: CimTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<CimTreeItem[]> {
    const store = this.getStore();
    if (!store || !(await store.exists())) {
      return [];
    }
    const index = await store.read();
    const bindings = index.bindings
      .slice()
      .sort((a, b) => a.target.path.localeCompare(b.target.path))
      .map((b) => new BindingItem(b));
    return [new IndexPageItem(store.docsPath), ...bindings];
  }
}
