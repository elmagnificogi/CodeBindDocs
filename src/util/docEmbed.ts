import * as path from 'path';
import * as vscode from 'vscode';
import { splitMarkdown } from '../store/frontmatter';
import { IndexStore } from '../store/indexStore';
import { normalizeRelPath } from '../store/types';

export type IncludeSpec = {
  doc: string;
  heading?: string;
  startLine?: number;
  endLine?: number;
};

/**
 * Expand `cbd-include` fences into `cbd-include-view` fences with embedded
 * body (readonly preview). Save path collapses them back.
 *
 * Author syntax:
 * ````
 * ```cbd-include
 * doc: docs/foo.md
 * heading: 概述
 * lines: 10-40
 * ```
 * ````
 */
export async function expandDocIncludes(
  markdown: string,
  store: IndexStore,
  currentDocRel: string
): Promise<string> {
  return replaceFences(markdown, 'cbd-include', 'cbd-include-view', async (metaBlock) => {
    const spec = parseIncludeMeta(metaBlock);
    if (!spec?.doc) {
      return null;
    }
    const resolved = resolveIncludeDoc(currentDocRel, spec.doc, store);
    const body = await loadIncludeBody(store, resolved, spec);
    const meta = serializeIncludeMeta({ ...spec, doc: resolved });
    const note = `> **嵌入（只读）** \`${resolved}\`${
      spec.heading ? ` · 标题「${spec.heading}」` : ''
    }${
      spec.startLine && spec.endLine ? ` · L${spec.startLine}-${spec.endLine}` : ''
    }\n>\n`;
    const quoted = body
      .split(/\r?\n/)
      .map((line) => `> ${line}`)
      .join('\n');
    return `${meta}\n\n${note}${quoted}`;
  });
}

/** Collapse `cbd-include-view` back to compact `cbd-include` fences. */
export function collapseDocIncludes(markdown: string): string {
  return replaceFencesSync(markdown, 'cbd-include-view', 'cbd-include', (inner) => {
    const spec = parseIncludeMeta(inner);
    if (!spec?.doc) {
      return null;
    }
    return serializeIncludeMeta(spec);
  });
}

export function parseIncludeMeta(block: string): IncludeSpec | undefined {
  const lines = block.split(/\r?\n/);
  const spec: IncludeSpec = { doc: '' };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      continue;
    }
    if (line.startsWith('>')) {
      break;
    }
    const m = /^(\w+)\s*:\s*(.+)$/.exec(line);
    if (!m) {
      continue;
    }
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'doc' || key === 'path' || key === 'file') {
      spec.doc = val.replace(/^<|>$/g, '');
    } else if (key === 'heading' || key === 'section' || key === 'title') {
      spec.heading = val.replace(/^#+\s*/, '');
    } else if (key === 'lines' || key === 'line') {
      const lm = /^(\d+)\s*[-–—]\s*(\d+)$/.exec(val);
      if (lm) {
        spec.startLine = Number(lm[1]);
        spec.endLine = Number(lm[2]);
      }
    } else if (key === 'startline' || key === 'start') {
      spec.startLine = Number(val);
    } else if (key === 'endline' || key === 'end') {
      spec.endLine = Number(val);
    }
  }
  return spec.doc ? spec : undefined;
}

export function serializeIncludeMeta(spec: IncludeSpec): string {
  const lines = [`doc: ${spec.doc}`];
  if (spec.heading) {
    lines.push(`heading: ${spec.heading}`);
  }
  if (typeof spec.startLine === 'number' && typeof spec.endLine === 'number') {
    lines.push(`lines: ${spec.startLine}-${spec.endLine}`);
  }
  return lines.join('\n');
}

function resolveIncludeDoc(currentDocRel: string, link: string, store: IndexStore): string {
  const cleaned = normalizeRelPath(link.trim());
  if (!cleaned) {
    return cleaned;
  }
  if (cleaned.startsWith(store.docsPath + '/') || cleaned === store.docsPath) {
    return cleaned;
  }
  if (!cleaned.includes('/')) {
    return normalizeRelPath(`${store.docsPath}/${cleaned}`);
  }
  const docDir = path.posix.dirname(normalizeRelPath(currentDocRel));
  const base = docDir === '.' ? '' : docDir;
  return normalizeRelPath(path.posix.join(base, cleaned));
}

async function loadIncludeBody(
  store: IndexStore,
  docRel: string,
  spec: IncludeSpec
): Promise<string> {
  try {
    const uri = store.docUri(docRel);
    const raw = await vscode.workspace.fs.readFile(uri);
    const text = Buffer.from(raw).toString('utf8');
    let body = splitMarkdown(text).body.replace(/^\uFEFF/, '');
    if (spec.heading) {
      body = extractHeadingSection(body, spec.heading);
    }
    if (typeof spec.startLine === 'number' && typeof spec.endLine === 'number') {
      const lines = body.split(/\r?\n/);
      const start = Math.max(1, spec.startLine);
      const end = Math.min(lines.length, spec.endLine);
      body = lines.slice(start - 1, end).join('\n');
    }
    body = body.trimEnd();
    if (!body.trim()) {
      return '_（嵌入内容为空）_';
    }
    const maxChars = 12000;
    if (body.length > maxChars) {
      return `${body.slice(0, maxChars)}\n\n_…已截断_`;
    }
    return body;
  } catch {
    return `_无法读取嵌入文档 \`${docRel}\`_`;
  }
}

function extractHeadingSection(body: string, heading: string): string {
  const want = heading.trim().toLowerCase();
  const wantCompact = want.replace(/[^\w\u4e00-\u9fff]+/g, '');
  const lines = body.split(/\r?\n/);
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[i]);
    if (!m) {
      continue;
    }
    const title = m[2].trim().toLowerCase();
    const titleCompact = title.replace(/[^\w\u4e00-\u9fff]+/g, '');
    if (title === want || titleCompact === wantCompact) {
      start = i;
      level = m[1].length;
      break;
    }
  }
  if (start < 0) {
    return `_未找到标题「${heading}」_`;
  }
  const out = [lines[start]];
  for (let i = start + 1; i < lines.length; i++) {
    const m = /^(#{1,6})\s+/.exec(lines[i]);
    if (m && m[1].length <= level) {
      break;
    }
    out.push(lines[i]);
  }
  return out.join('\n');
}

async function replaceFences(
  markdown: string,
  inLang: string,
  outLang: string,
  replacer: (inner: string) => Promise<string | null>
): Promise<string> {
  const openRe = new RegExp('^```' + inLang + '\\s*$');
  const lines = markdown.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!openRe.test(lines[i])) {
      out.push(lines[i]);
      i += 1;
      continue;
    }
    const inner: string[] = [];
    i += 1;
    while (i < lines.length && !/^```\s*$/.test(lines[i])) {
      inner.push(lines[i]);
      i += 1;
    }
    if (i < lines.length) {
      i += 1;
    }
    const replacement = await replacer(inner.join('\n'));
    if (replacement == null) {
      out.push('```' + inLang, ...inner, '```');
    } else {
      out.push('```' + outLang, replacement, '```');
    }
  }
  return out.join('\n');
}

function replaceFencesSync(
  markdown: string,
  inLang: string,
  outLang: string,
  replacer: (inner: string) => string | null
): string {
  const openRe = new RegExp('^```' + inLang + '\\s*$');
  const lines = markdown.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!openRe.test(lines[i])) {
      out.push(lines[i]);
      i += 1;
      continue;
    }
    const inner: string[] = [];
    i += 1;
    while (i < lines.length && !/^```\s*$/.test(lines[i])) {
      inner.push(lines[i]);
      i += 1;
    }
    if (i < lines.length) {
      i += 1;
    }
    const replacement = replacer(inner.join('\n'));
    if (replacement == null) {
      out.push('```' + inLang, ...inner, '```');
    } else {
      out.push('```' + outLang, replacement, '```');
    }
  }
  return out.join('\n');
}
