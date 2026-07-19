import * as vscode from 'vscode';

/**
 * Suggest a symbol name for a selected line range (DocumentSymbol, else first
 * declaration-like line inside the range).
 */
export async function suggestSymbolInRange(
  uri: vscode.Uri,
  startLine: number,
  endLine: number
): Promise<string | undefined> {
  try {
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      uri
    );
    if (symbols?.length) {
      const hits: { name: string; size: number }[] = [];
      const visit = (list: vscode.DocumentSymbol[]) => {
        for (const s of list) {
          const sStart = s.range.start.line + 1;
          const sEnd = s.range.end.line + 1;
          const overlaps = !(sEnd < startLine || sStart > endLine);
          if (overlaps && s.name && !s.name.startsWith('(')) {
            hits.push({ name: s.name, size: sEnd - sStart });
          }
          if (s.children?.length) {
            visit(s.children);
          }
        }
      };
      visit(symbols);
      hits.sort((a, b) => a.size - b.size);
      if (hits[0]?.name) {
        return stripSymbolNoise(hits[0].name);
      }
    }
  } catch {
    // fall through
  }

  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    const lines = doc.getText().split(/\r?\n/);
    for (let i = startLine - 1; i < endLine && i < lines.length; i++) {
      const guessed = guessDeclName(lines[i]);
      if (guessed) {
        return guessed;
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}

function stripSymbolNoise(name: string): string {
  return name.replace(/\(.*\)$/, '').replace(/\s+/g, '').trim();
}

function guessDeclName(line: string): string | undefined {
  const patterns = [
    /(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/,
    /(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/,
    /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/,
    /(?:export\s+)?(?:type|interface|enum)\s+([A-Za-z_$][\w$]*)/,
  ];
  for (const re of patterns) {
    const m = line.match(re);
    if (m?.[1]) {
      return m[1];
    }
  }
  return undefined;
}
