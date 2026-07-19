import * as vscode from 'vscode';
import { IndexStore } from '../store/indexStore';

/**
 * CodeLens on bound source files:
 * - file-level: top-of-file「打开 CodeBind Docs 文档」
 * - range: at startLine with symbol / line label
 */
export class CbdCodeLensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChange.event;

  constructor(private readonly getStore: () => IndexStore | undefined) {}

  refresh(): void {
    this._onDidChange.fire();
  }

  async provideCodeLenses(
    document: vscode.TextDocument
  ): Promise<vscode.CodeLens[]> {
    const store = this.getStore();
    if (!store || document.uri.scheme !== 'file') {
      return [];
    }
    const rel = store.toWorkspaceRelative(document.uri);
    if (!rel || store.isUnderDocsPath(rel) || !(await store.exists())) {
      return [];
    }

    const index = await store.read();
    const bindings = store.findBindingsForTarget(index, rel);
    if (!bindings.length) {
      return [];
    }

    const lenses: vscode.CodeLens[] = [];
    const fileBindings = bindings.filter((b) => b.target.kind !== 'range');
    const rangeBindings = bindings.filter(
      (b) =>
        b.target.kind === 'range' &&
        typeof b.target.startLine === 'number' &&
        typeof b.target.endLine === 'number'
    );

    // File-level (or first binding) — prominent top-of-file entry.
    const primary = fileBindings[0] ?? rangeBindings[0];
    if (primary) {
      const top = new vscode.Range(0, 0, 0, 0);
      const extra =
        bindings.length > 1 ? `（${bindings.length} 篇）` : '';
      lenses.push(
        new vscode.CodeLens(top, {
          title: `CBD: 打开文档${extra}`,
          command: 'cbd.revealBoundDoc',
          arguments: [],
        })
      );
    }

    for (const b of rangeBindings) {
      const line = Math.max(0, (b.target.startLine ?? 1) - 1);
      const range = new vscode.Range(line, 0, line, 0);
      const symbol = b.anchors?.[0]?.symbol;
      const label = symbol
        ? `CBD: ${symbol} (${b.target.startLine}-${b.target.endLine})`
        : `CodeBind Docs 代码块文档 L${b.target.startLine}-${b.target.endLine}`;
      lenses.push(
        new vscode.CodeLens(range, {
          title: label,
          command: 'cbd.openDoc',
          arguments: [{ binding: b }],
        })
      );
    }

    return lenses;
  }
}
