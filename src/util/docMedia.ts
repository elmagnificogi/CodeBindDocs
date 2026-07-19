import * as path from 'path';
import { normalizeRelPath } from '../store/types';

/** Resolve a Markdown link relative to the doc's directory → workspace-relative. */
export function resolveFromDoc(docRel: string, link: string): string {
  const cleaned = normalizeRelPath(link.trim().replace(/^<|>$/g, ''));
  if (!cleaned || /^(https?:|data:|vscode-webview:)/i.test(cleaned)) {
    return cleaned;
  }
  if (cleaned.startsWith('/')) {
    return normalizeRelPath(cleaned.slice(1));
  }
  const docDir = path.posix.dirname(normalizeRelPath(docRel));
  const base = docDir === '.' ? '' : docDir;
  return normalizeRelPath(path.posix.join(base, cleaned));
}

/** Path of `targetRel` relative to the directory containing `docRel`. */
export function relativeToDoc(docRel: string, targetRel: string): string {
  const docDir = path.posix.dirname(normalizeRelPath(docRel));
  const base = docDir === '.' ? '' : docDir;
  const rel = path.posix.relative(base, normalizeRelPath(targetRel));
  return rel || path.posix.basename(targetRel);
}

const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/**
 * Rewrite relative Markdown images to webview URIs for display.
 * Returns rewritten markdown and a map webviewUri → relative path (for save).
 */
export function rewriteImagesForWebview(
  markdown: string,
  docRel: string,
  toWebviewUri: (workspaceRel: string) => string
): { markdown: string; reverse: Map<string, string> } {
  const reverse = new Map<string, string>();
  const out = markdown.replace(MD_IMAGE_RE, (full, alt: string, url: string) => {
    const trimmed = url.trim();
    if (/^(https?:|data:|vscode-webview:)/i.test(trimmed)) {
      return full;
    }
    const targetRel = resolveFromDoc(docRel, trimmed);
    if (!targetRel) {
      return full;
    }
    const web = toWebviewUri(targetRel);
    reverse.set(web, relativeToDoc(docRel, targetRel));
    return full.replace(url, web);
  });
  return { markdown: out, reverse };
}

/** Rewrite webview image URIs back to relative Markdown paths. */
export function rewriteImagesForDisk(
  markdown: string,
  reverse: Map<string, string>
): string {
  if (!reverse.size) {
    return markdown;
  }
  let out = markdown;
  for (const [web, rel] of reverse) {
    if (!web) {
      continue;
    }
    out = out.split(web).join(rel);
  }
  return out;
}

/** Safe filename for pasted assets. */
export function safeAssetFileName(original: string, fallbackExt = 'png'): string {
  const base = path.posix.basename(original.replace(/\\/g, '/')) || `paste.${fallbackExt}`;
  const cleaned = base.replace(/[^\w.\-()+]+/g, '_').replace(/^\.+/, '');
  if (!cleaned || cleaned === '_' || cleaned === '.') {
    return `paste-${Date.now()}.${fallbackExt}`;
  }
  if (!path.posix.extname(cleaned)) {
    return `${cleaned}.${fallbackExt}`;
  }
  return cleaned;
}
