import * as vscode from 'vscode';
import { IndexStore } from '../store/indexStore';
import { CbdIndex, normalizeRelPath } from '../store/types';

const SKIP_PREFIXES = [
  'node_modules/',
  'out/',
  'dist/',
  '.git/',
  'media/vditor/',
  '.vscode/',
];

const SOURCE_GLOB = '**/*.{ts,tsx,js,jsx,mjs,cjs,py,go,rs,java,kt,cs}';
const SOURCE_EXCLUDE =
  '{**/node_modules/**,**/out/**,**/dist/**,**/.git/**,**/media/vditor/**,**/.vscode/**}';

/** Whether a workspace-relative path is a reasonable bind target (not docs/skip). */
export function isBindableSourceRel(rel: string, store: IndexStore): boolean {
  const norm = normalizeRelPath(rel);
  if (!norm || store.isUnderDocsPath(norm)) {
    return false;
  }
  if (SKIP_PREFIXES.some((p) => norm.startsWith(p) || norm.includes('/' + p))) {
    return false;
  }
  if (/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|eot|map|vsix)$/i.test(norm)) {
    return false;
  }
  if (norm === 'package-lock.json') {
    return false;
  }
  return true;
}

export type CoverageReport = {
  /** Distinct source paths that have at least one binding. */
  boundCount: number;
  /** Bindable sources with no binding. */
  unbound: string[];
  /** boundCount + unbound.length */
  total: number;
};

/** Scan workspace for bindable sources missing a CodeBind Docs binding. */
export async function scanBindingCoverage(
  store: IndexStore,
  index: CbdIndex
): Promise<CoverageReport> {
  const bound = new Set(
    index.bindings.map((b) => normalizeRelPath(b.target.path)).filter(Boolean)
  );

  const uris = await vscode.workspace.findFiles(SOURCE_GLOB, SOURCE_EXCLUDE);
  const unbound: string[] = [];
  for (const uri of uris) {
    const rel = store.toWorkspaceRelative(uri);
    if (!rel || !isBindableSourceRel(rel, store)) {
      continue;
    }
    if (!bound.has(normalizeRelPath(rel))) {
      unbound.push(normalizeRelPath(rel));
    }
  }
  unbound.sort((a, b) => a.localeCompare(b));

  const boundExisting = [...bound].filter((p) => isBindableSourceRel(p, store));
  return {
    boundCount: boundExisting.length,
    unbound,
    total: boundExisting.length + unbound.length,
  };
}
