import * as vscode from 'vscode';
import { IndexStore } from '../store/indexStore';
import { Binding, normalizeRelPath } from '../store/types';
import { scanBindingCoverage } from '../util/bindableSources';

export type CbdTreeItem =
  | IndexPageItem
  | SectionItem
  | BindingItem
  | UnboundSourceItem
  | UnboundMoreItem
  | UnboundEmptyItem;

export class IndexPageItem extends vscode.TreeItem {
  constructor(docsPath: string) {
    super('文档汇总 (cbd-index)', vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'index';
    this.description = `${docsPath}/cbd-index.md`;
    this.tooltip = '查看全部绑定文档的目录页';
    this.iconPath = new vscode.ThemeIcon('book');
    this.command = {
      command: 'cbd.openDocsIndex',
      title: 'Open Docs Index',
    };
  }
}

export class SectionItem extends vscode.TreeItem {
  constructor(
    public readonly sectionId: 'bound' | 'unbound',
    label: string,
    count: number
  ) {
    super(
      label,
      sectionId === 'unbound'
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.Expanded
    );
    this.contextValue = 'section';
    this.description = String(count);
    this.iconPath = new vscode.ThemeIcon(
      sectionId === 'bound' ? 'link' : 'new-file'
    );
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
      command: 'cbd.openTarget',
      title: 'Open Source',
      arguments: [this],
    };
  }
}

export class UnboundSourceItem extends vscode.TreeItem {
  constructor(public readonly sourceRel: string) {
    super(sourceRel, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'unbound';
    this.tooltip = `尚未绑定 · ${sourceRel}`;
    this.iconPath = new vscode.ThemeIcon('file-code');
    this.command = {
      command: 'cbd.bindCurrentFile',
      title: 'Bind',
      arguments: [sourceRel],
    };
  }
}

export class UnboundMoreItem extends vscode.TreeItem {
  constructor(remaining: number) {
    super(`还有 ${remaining} 个未绑定…`, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'unboundMore';
    this.tooltip = '完整列表见文档主页「绑定覆盖率」';
    this.iconPath = new vscode.ThemeIcon('ellipsis');
    this.command = {
      command: 'cbd.openDocsIndex',
      title: 'Open Docs Index',
    };
  }
}

export class UnboundEmptyItem extends vscode.TreeItem {
  constructor() {
    super('全部已覆盖', vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'unboundEmpty';
    this.iconPath = new vscode.ThemeIcon('check');
  }
}

const UNBOUND_TREE_LIMIT = 40;

export class CbdTreeProvider implements vscode.TreeDataProvider<CbdTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<CbdTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private boundCache: BindingItem[] = [];
  private unboundCache: string[] = [];

  constructor(private readonly getStore: () => IndexStore | undefined) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: CbdTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: CbdTreeItem): Promise<CbdTreeItem[]> {
    const store = this.getStore();
    if (!store || !(await store.exists())) {
      return [];
    }

    if (!element) {
      const index = await store.read();
      this.boundCache = index.bindings
        .slice()
        .sort((a, b) => a.target.path.localeCompare(b.target.path))
        .map((b) => new BindingItem(b));

      try {
        const coverage = await scanBindingCoverage(store, index);
        this.unboundCache = coverage.unbound;
      } catch {
        this.unboundCache = [];
      }

      return [
        new IndexPageItem(store.docsPath),
        new SectionItem('bound', '已绑定', this.boundCache.length),
        new SectionItem('unbound', '待绑定', this.unboundCache.length),
      ];
    }

    if (element instanceof SectionItem) {
      if (element.sectionId === 'bound') {
        return this.boundCache;
      }
      const slice = this.unboundCache.slice(0, UNBOUND_TREE_LIMIT);
      const items: CbdTreeItem[] = slice.map((p) => new UnboundSourceItem(p));
      if (this.unboundCache.length > UNBOUND_TREE_LIMIT) {
        items.push(new UnboundMoreItem(this.unboundCache.length - UNBOUND_TREE_LIMIT));
      }
      if (!items.length) {
        return [new UnboundEmptyItem()];
      }
      return items;
    }

    return [];
  }
}
