import { Binding, BindingKind, normalizeRelPath } from './types';

export interface CimFrontmatter {
  target: string;
  kind: BindingKind;
  startLine?: number;
  endLine?: number;
  symbol?: string;
  contentHash?: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Split raw header (including fences) from body so edits can preserve YAML as-is. */
export function splitMarkdown(markdown: string): { header: string | undefined; body: string } {
  const match = FRONTMATTER_RE.exec(markdown);
  if (!match) {
    return { header: undefined, body: markdown };
  }
  let header = match[0];
  if (!header.endsWith('\n')) {
    header += '\n';
  }
  return { header, body: markdown.slice(match[0].length) };
}

export function joinMarkdown(header: string | undefined, body: string): string {
  const normalized = body.replace(/^\uFEFF/, '');
  if (!header) {
    return normalized;
  }
  return header + normalized;
}

/** Parse YAML-ish `cim:` block from Markdown frontmatter. */
export function parseCimFrontmatter(markdown: string): {
  meta: CimFrontmatter | undefined;
  body: string;
} {
  const match = FRONTMATTER_RE.exec(markdown);
  if (!match) {
    return { meta: undefined, body: markdown };
  }

  const yaml = match[1];
  const body = markdown.slice(match[0].length);
  const meta = parseCimYaml(yaml);
  return { meta, body };
}

function parseCimYaml(yaml: string): CimFrontmatter | undefined {
  const lines = yaml.split(/\r?\n/);
  let inCim = false;
  const values: Record<string, string> = {};

  for (const raw of lines) {
    const line = raw.replace(/\t/g, '  ');
    if (!inCim) {
      if (/^cim:\s*$/.test(line.trimEnd()) || /^cim:\s*\S/.test(line)) {
        inCim = true;
        const inline = line.match(/^cim:\s+(\S.*)$/);
        if (inline) {
          // unsupported inline map; ignore
        }
      }
      continue;
    }

    if (/^\S/.test(line) && !/^\s/.test(raw)) {
      // left the cim: indentation block
      break;
    }

    const m = line.match(/^\s+([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.*?)\s*$/);
    if (!m) {
      continue;
    }
    const key = m[1];
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    values[key] = val;
  }

  const target = values.target?.trim();
  if (!target) {
    return undefined;
  }

  const kind: BindingKind = values.kind === 'range' ? 'range' : 'file';
  const meta: CimFrontmatter = {
    target: normalizeRelPath(target),
    kind,
  };

  if (values.startLine) {
    meta.startLine = Number(values.startLine);
  }
  if (values.endLine) {
    meta.endLine = Number(values.endLine);
  }
  if (values.symbol) {
    meta.symbol = values.symbol;
  }
  if (values.contentHash) {
    meta.contentHash = values.contentHash;
  }
  return meta;
}

export function serializeCimFrontmatter(meta: CimFrontmatter, body: string): string {
  const lines = ['---', 'cim:', `  target: ${meta.target}`, `  kind: ${meta.kind}`];
  if (meta.kind === 'range') {
    if (typeof meta.startLine === 'number') {
      lines.push(`  startLine: ${meta.startLine}`);
    }
    if (typeof meta.endLine === 'number') {
      lines.push(`  endLine: ${meta.endLine}`);
    }
  }
  if (meta.symbol) {
    lines.push(`  symbol: ${meta.symbol}`);
  }
  if (meta.contentHash) {
    lines.push(`  contentHash: ${meta.contentHash}`);
  }
  lines.push('---', '');
  const normalizedBody = body.replace(/^\uFEFF/, '').replace(/^\r?\n/, '');
  return lines.join('\n') + normalizedBody;
}

export function frontmatterToBinding(docRelFromCim: string, meta: CimFrontmatter): Binding {
  return {
    id: normalizeRelPath(docRelFromCim),
    doc: normalizeRelPath(docRelFromCim),
    target: {
      path: meta.target,
      kind: meta.kind,
      startLine: meta.startLine,
      endLine: meta.endLine,
    },
    anchors: meta.contentHash || meta.symbol
      ? [{ symbol: meta.symbol, contentHash: meta.contentHash }]
      : [],
  };
}

export function bindingToFrontmatter(binding: Binding): CimFrontmatter {
  const anchor = binding.anchors?.[0];
  return {
    target: normalizeRelPath(binding.target.path),
    kind: binding.target.kind,
    startLine: binding.target.startLine,
    endLine: binding.target.endLine,
    symbol: anchor?.symbol,
    contentHash: anchor?.contentHash,
  };
}
