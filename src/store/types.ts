export type BindingKind = 'file' | 'range' | 'directory';

export interface BindingTarget {
  /** Path relative to workspace root, using forward slashes. */
  path: string;
  kind: BindingKind;
  /** 1-based inclusive line range when kind === 'range'. */
  startLine?: number;
  endLine?: number;
}

export interface BindingAnchor {
  symbol?: string;
  startHint?: number;
  contentHash?: string;
}

export interface Binding {
  id: string;
  target: BindingTarget;
  /** Path relative to docs/, e.g. `docs/extension.md`. */
  doc: string;
  anchors?: BindingAnchor[];
}

export interface CbdIndex {
  version: 1;
  bindings: Binding[];
}

export function emptyIndex(): CbdIndex {
  return { version: 1, bindings: [] };
}

export function normalizeRelPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}
