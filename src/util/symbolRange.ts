import * as vscode from 'vscode';

export type LineSpan = { startLine: number; endLine: number };

/** Best-effort symbol line lookup for common JS/TS declarations (1-based). */
export function findSymbolLine(text: string, symbol: string): number | undefined {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?function\\s+${escaped}\\b`),
    new RegExp(`(?:export\\s+)?(?:abstract\\s+)?class\\s+${escaped}\\b`),
    new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\*?\\s+${escaped}\\b`),
    new RegExp(`(?:export\\s+)?(?:const|let|var)\\s+${escaped}\\b`),
    new RegExp(`(?:export\\s+)?(?:type|interface|enum)\\s+${escaped}\\b`),
    new RegExp(`${escaped}\\s*=\\s*(?:async\\s*)?(?:function|\\()`),
  ];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const re of patterns) {
      if (re.test(lines[i])) {
        return i + 1;
      }
    }
  }
  return undefined;
}

/**
 * Resolve the 1-based inclusive line span for a named symbol.
 * Prefers DocumentSymbolProvider; falls back to declaration line + brace block /
 * previous span length.
 */
export async function resolveSymbolLineRange(
  uri: vscode.Uri,
  symbol: string,
  previousSpan?: number
): Promise<LineSpan | undefined> {
  const fromProvider = await findViaDocumentSymbols(uri, symbol);
  if (fromProvider) {
    return fromProvider;
  }

  const doc = await vscode.workspace.openTextDocument(uri);
  const startLine = findSymbolLine(doc.getText(), symbol);
  if (startLine == null) {
    return undefined;
  }

  const braced = findBraceBlockEnd(doc, startLine);
  if (braced != null) {
    return { startLine, endLine: braced };
  }

  const span = typeof previousSpan === 'number' && previousSpan >= 0 ? previousSpan : 0;
  return { startLine, endLine: startLine + span };
}

async function findViaDocumentSymbols(
  uri: vscode.Uri,
  symbol: string
): Promise<LineSpan | undefined> {
  try {
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      uri
    );
    if (!symbols?.length) {
      return undefined;
    }
    const hit = findNamedSymbol(symbols, symbol);
    if (!hit) {
      return undefined;
    }
    const range = hit.range;
    return {
      startLine: range.start.line + 1,
      endLine: range.end.line + 1,
    };
  } catch {
    return undefined;
  }
}

function findNamedSymbol(
  symbols: vscode.DocumentSymbol[],
  name: string
): vscode.DocumentSymbol | undefined {
  for (const s of symbols) {
    if (s.name === name || s.name.startsWith(name + '(') || s.name.startsWith(name + '<')) {
      return s;
    }
    const nested = findNamedSymbol(s.children ?? [], name);
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

/** Crude `{` / `}` matcher from the declaration line; returns 1-based end line. */
export function findBraceBlockEnd(
  doc: vscode.TextDocument,
  startLine1Based: number
): number | undefined {
  let depth = 0;
  let started = false;
  for (let i = startLine1Based - 1; i < doc.lineCount; i++) {
    const text = stripLineCommentsAndStrings(doc.lineAt(i).text);
    for (let j = 0; j < text.length; j++) {
      const ch = text[j];
      if (ch === '{') {
        depth++;
        started = true;
      } else if (ch === '}') {
        if (!started) {
          continue;
        }
        depth--;
        if (depth === 0) {
          return i + 1;
        }
      }
    }
  }
  return undefined;
}

function stripLineCommentsAndStrings(line: string): string {
  let out = '';
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    if (!inSingle && !inDouble && !inTemplate && ch === '/' && next === '/') {
      break;
    }
    if (!inDouble && !inTemplate && ch === "'" && line[i - 1] !== '\\') {
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && !inTemplate && ch === '"' && line[i - 1] !== '\\') {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && ch === '`' && line[i - 1] !== '\\') {
      inTemplate = !inTemplate;
      continue;
    }
    if (!inSingle && !inDouble && !inTemplate) {
      out += ch;
    }
  }
  return out;
}
