import * as vscode from 'vscode';

export type LineRange = { startLine: number; endLine: number };

type PendingPick = {
  sourceFsPath: string;
  resolve: (range: LineRange | undefined) => void;
  statusConfirm: vscode.StatusBarItem;
  statusCancel: vscode.StatusBarItem;
};

let pending: PendingPick | undefined;

/**
 * Open a source file and let the user select a range in the editor.
 * Uses status-bar actions (not a modal dialog) so the editor stays interactive.
 */
export async function pickLineRangeInEditor(
  sourceUri: vscode.Uri,
  options?: {
    preselect?: LineRange;
    message?: string;
  }
): Promise<LineRange | undefined> {
  cancelPendingPick();

  const textDoc = await vscode.workspace.openTextDocument(sourceUri);
  const editor = await vscode.window.showTextDocument(textDoc, {
    viewColumn: vscode.ViewColumn.One,
    preview: false,
    preserveFocus: false,
  });

  if (
    options?.preselect &&
    options.preselect.startLine >= 1 &&
    options.preselect.endLine >= options.preselect.startLine &&
    options.preselect.endLine <= textDoc.lineCount
  ) {
    const start = new vscode.Position(options.preselect.startLine - 1, 0);
    const endLineIdx = options.preselect.endLine - 1;
    const end = textDoc.lineAt(endLineIdx).range.end;
    editor.selection = new vscode.Selection(start, end);
    editor.revealRange(new vscode.Range(start, end), vscode.TextEditorRevealType.InCenter);
  }

  const statusConfirm = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    1000
  );
  statusConfirm.text = '$(check) CIM: 确认代码块选区';
  statusConfirm.tooltip = '在编辑器中选好代码后点击确认（可自由选区，不会弹出阻挡对话框）';
  statusConfirm.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  statusConfirm.command = 'cim.acceptRangeSelection';
  statusConfirm.show();

  const statusCancel = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    999
  );
  statusCancel.text = '$(close) CIM: 取消';
  statusCancel.command = 'cim.cancelRangeSelection';
  statusCancel.show();

  void vscode.window.showInformationMessage(
    options?.message ??
      '请在源文件中选中代码块，然后点击状态栏「确认代码块选区」（非模态，可正常编辑/选区）。'
  );

  return new Promise<LineRange | undefined>((resolve) => {
    pending = {
      sourceFsPath: sourceUri.fsPath,
      resolve,
      statusConfirm,
      statusCancel,
    };
  });
}

export function registerRangePickerCommands(
  context: vscode.ExtensionContext
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('cim.acceptRangeSelection', () => {
      if (!pending) {
        return;
      }
      const active = vscode.window.activeTextEditor;
      if (!active || active.document.uri.fsPath !== pending.sourceFsPath) {
        void vscode.window.showWarningMessage(
          'CIM: 请先聚焦目标源文件，并选中要绑定的代码后再确认。'
        );
        return;
      }
      const range = selectionToLineRange(active.selection);
      finishPending(range);
    }),
    vscode.commands.registerCommand('cim.cancelRangeSelection', () => {
      finishPending(undefined);
    })
  );
}

function selectionToLineRange(sel: vscode.Selection): LineRange {
  let startLine = sel.start.line + 1;
  let endLine =
    sel.end.character === 0 && sel.end.line > sel.start.line
      ? sel.end.line
      : sel.end.line + 1;
  if (endLine < startLine) {
    endLine = startLine;
  }
  return { startLine, endLine };
}

function finishPending(range: LineRange | undefined): void {
  if (!pending) {
    return;
  }
  const { resolve, statusConfirm, statusCancel } = pending;
  pending = undefined;
  statusConfirm.dispose();
  statusCancel.dispose();
  resolve(range);
}

function cancelPendingPick(): void {
  if (!pending) {
    return;
  }
  finishPending(undefined);
}

export function disposeRangePicker(): void {
  cancelPendingPick();
}
