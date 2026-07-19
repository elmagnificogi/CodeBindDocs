import * as vscode from 'vscode';
import { IndexStore } from '../store/indexStore';

/**
 * Shows CodeLens on source lines that have a range (code-block) CIM binding.
 */
export class CimCodeLensProvider implements vscode.CodeLensProvider {
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
    const bindings = store
      .findBindingsForTarget(index, rel)
      .filter(
        (b) =>
          b.target.kind === 'range' &&
          typeof b.target.startLine === 'number' &&
          typeof b.target.endLine === 'number'
      );

    return bindings.map((b) => {
      const line = Math.max(0, (b.target.startLine ?? 1) - 1);
      const range = new vscode.Range(line, 0, line, 0);
      const symbol = b.anchors?.[0]?.symbol;
      const label = symbol
        ? `CIM: ${symbol} (${b.target.startLine}-${b.target.endLine})`
        : `CIM 代码块文档 L${b.target.startLine}-${b.target.endLine}`;
      return new vscode.CodeLens(range, {
        title: label,
        command: 'cim.openDoc',
        arguments: [{ binding: b }],
      });
    });
  }
}
