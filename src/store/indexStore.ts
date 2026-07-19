import * as vscode from 'vscode';
import * as crypto from 'crypto';
import {
  bindingToFrontmatter,
  frontmatterToBinding,
  parseCimFrontmatter,
  serializeCimFrontmatter,
} from './frontmatter';
import {
  Binding,
  CimIndex,
  emptyIndex,
  normalizeRelPath,
} from './types';

/** Default workspace-relative docs folder (configurable via `cim.docsPath`). */
export const DEFAULT_DOCS_PATH = 'docs';
/** Auto-generated overview filename inside the docs folder. */
export const INDEX_FILE_NAME = 'cim-index.md';

/**
 * Binding source of truth: YAML frontmatter in Markdown under the configured docs path.
 *
 * Default docs path: `docs/` (not under `.cim/`).
 */
export class IndexStore {
  private cache: CimIndex | undefined;
  private cacheMs = 0;

  constructor(readonly workspaceFolder: vscode.WorkspaceFolder) {}

  /** Workspace-relative docs root, e.g. `docs` or `documentation`. */
  get docsPath(): string {
    const raw = vscode.workspace
      .getConfiguration('cim')
      .get<string>('docsPath', DEFAULT_DOCS_PATH);
    const cleaned = normalizeRelPath(raw || DEFAULT_DOCS_PATH).replace(/\/+$/, '');
    return cleaned || DEFAULT_DOCS_PATH;
  }

  /** Workspace-relative assets folder. */
  get assetsPath(): string {
    const raw = vscode.workspace.getConfiguration('cim').get<string>('assetsPath', '');
    if (raw?.trim()) {
      return normalizeRelPath(raw).replace(/\/+$/, '');
    }
    return `${this.docsPath}/assets`;
  }

  /** Workspace-relative path of the generated index page. */
  get indexDocPath(): string {
    return `${this.docsPath}/${INDEX_FILE_NAME}`;
  }

  get docsUri(): vscode.Uri {
    return this.workspaceUri(this.docsPath);
  }

  get assetsUri(): vscode.Uri {
    return this.workspaceUri(this.assetsPath);
  }

  workspaceUri(rel: string): vscode.Uri {
    return vscode.Uri.joinPath(
      this.workspaceFolder.uri,
      ...normalizeRelPath(rel).split('/')
    );
  }

  targetUri(targetRel: string): vscode.Uri {
    return this.workspaceUri(targetRel);
  }

  /** Resolve a workspace-relative doc path. */
  docUri(docWorkspaceRel: string): vscode.Uri {
    return this.workspaceUri(docWorkspaceRel);
  }

  invalidateCache(): void {
    this.cache = undefined;
    this.cacheMs = 0;
  }

  isUnderDocsPath(workspaceRel: string): boolean {
    const rel = normalizeRelPath(workspaceRel);
    const root = this.docsPath;
    return rel === root || rel.startsWith(root + '/');
  }

  isIndexDoc(workspaceRel: string): boolean {
    return normalizeRelPath(workspaceRel) === this.indexDocPath;
  }

  async exists(): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(this.docsUri);
      return true;
    } catch {
      return false;
    }
  }

  async ensureLayout(): Promise<void> {
    await vscode.workspace.fs.createDirectory(this.docsUri);
    await vscode.workspace.fs.createDirectory(this.assetsUri);
  }

  /** Scan Markdown docs and build bindings from `cim:` frontmatter. */
  async read(): Promise<CimIndex> {
    const now = Date.now();
    if (this.cache && now - this.cacheMs < 500) {
      return this.cache;
    }

    const index = emptyIndex();
    const docsRoot = this.docsPath;
    const indexPath = this.indexDocPath;

    const files = await vscode.workspace.findFiles(
      new vscode.RelativePattern(this.workspaceFolder, `${docsRoot}/**/*.md`)
    );

    for (const uri of files) {
      const relFromRoot = this.toWorkspaceRelative(uri);
      if (!relFromRoot || !this.isUnderDocsPath(relFromRoot)) {
        continue;
      }
      if (relFromRoot === indexPath) {
        continue;
      }
      try {
        const raw = await vscode.workspace.fs.readFile(uri);
        const text = Buffer.from(raw).toString('utf8');
        const { meta } = parseCimFrontmatter(text);
        if (!meta) {
          continue;
        }
        index.bindings.push(frontmatterToBinding(relFromRoot, meta));
      } catch {
        // skip unreadable
      }
    }

    index.bindings.sort((a, b) => a.target.path.localeCompare(b.target.path));
    this.cache = index;
    this.cacheMs = now;
    return index;
  }

  async writeBinding(
    binding: Binding,
    options?: { refreshIndex?: boolean; title?: string; body?: string }
  ): Promise<void> {
    const uri = this.docUri(binding.doc);
    const fallbackTitle =
      options?.title ?? binding.target.path.split('/').pop() ?? binding.target.path;
    let body = options?.body ?? defaultDocBody(fallbackTitle);
    let existed = false;
    try {
      const raw = await vscode.workspace.fs.readFile(uri);
      const text = Buffer.from(raw).toString('utf8');
      existed = true;
      body = parseCimFrontmatter(text).body || body;
    } catch {
      const parent = vscode.Uri.joinPath(uri, '..');
      await vscode.workspace.fs.createDirectory(parent);
    }

    // New file: prefer explicit template body.
    if (!existed && options?.body) {
      body = options.body;
    }

    const content = serializeCimFrontmatter(bindingToFrontmatter(binding), body);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
    this.invalidateCache();
    if (options?.refreshIndex !== false) {
      await this.writeDocsIndex();
    }
  }

  /**
   * Delete a bound Markdown doc file and refresh `cim-index.md`.
   * Refuses to delete the generated index page itself.
   */
  async deleteDoc(docWorkspaceRel: string): Promise<void> {
    const rel = normalizeRelPath(docWorkspaceRel);
    if (!this.isUnderDocsPath(rel)) {
      throw new Error(`文档不在文档目录内: ${rel}`);
    }
    if (this.isIndexDoc(rel)) {
      throw new Error('不能删除自动生成的 cim-index.md');
    }
    const uri = this.docUri(rel);
    try {
      await vscode.workspace.fs.delete(uri, { useTrash: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`删除失败: ${msg}`);
    }
    this.invalidateCache();
    await this.writeDocsIndex();
  }

  /** Generate `{docsPath}/cim-index.md` — overview of all bindings. */
  async writeDocsIndex(): Promise<vscode.Uri> {
    await this.ensureLayout();
    this.invalidateCache();
    const index = await this.read();
    const indexPath = this.indexDocPath;
    const lines: string[] = [
      '# CIM 文档汇总',
      '',
      `共 **${index.bindings.length}** 个绑定。由 CIM 自动生成，请勿手改（绑定变更后会覆盖）。`,
      '',
      `文档目录：\`${this.docsPath}/\`（设置项 \`cim.docsPath\`）。`,
      '',
      '绑定声明在各文档 YAML 头的 `cim.target`；本页仅作目录。',
      '',
      '| 源文件 | 文档 | 类型 |',
      '| --- | --- | --- |',
    ];

    for (const b of index.bindings) {
      const srcLink = relativeMarkdownLink(indexPath, b.target.path);
      const docLink = relativeMarkdownLink(indexPath, b.doc);
      let kind = b.target.kind === 'range' ? 'range' : 'file';
      if (
        b.target.kind === 'range' &&
        typeof b.target.startLine === 'number' &&
        typeof b.target.endLine === 'number'
      ) {
        const sym = b.anchors?.[0]?.symbol;
        kind = sym
          ? `range L${b.target.startLine}-${b.target.endLine} (${sym})`
          : `range L${b.target.startLine}-${b.target.endLine}`;
      }
      lines.push(
        `| [\`${b.target.path}\`](${srcLink}) | [\`${b.doc}\`](${docLink}) | ${kind} |`
      );
    }

    if (index.bindings.length === 0) {
      lines.push('| _暂无_ | | |');
    }

    lines.push('', '## 快捷操作', '');
    lines.push('- 命令面板：`CIM: Open Docs Index` 打开本页');
    lines.push('- 命令面板：`CIM: Bind Doc to Current File` 为当前源文件创建绑定');
    lines.push('- 命令面板：`CIM: Delete Bound Doc` 删除绑定文档');
    lines.push('- 侧栏 **CIM → Bindings** 可跳转源码 / 文档 / 删除');
    lines.push('');

    const uri = this.docUri(indexPath);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(lines.join('\n'), 'utf8'));
    return uri;
  }

  async updateTargetPath(oldPath: string, newPath: string): Promise<boolean> {
    const index = await this.read();
    const oldNorm = normalizeRelPath(oldPath);
    const newNorm = normalizeRelPath(newPath);
    let changed = false;
    for (const binding of index.bindings) {
      if (normalizeRelPath(binding.target.path) === oldNorm) {
        binding.target.path = newNorm;
        await this.writeBinding(binding);
        changed = true;
      }
    }
    return changed;
  }

  toWorkspaceRelative(uri: vscode.Uri): string | undefined {
    const rel = vscode.workspace.asRelativePath(uri, false);
    if (!rel || rel === uri.fsPath) {
      return undefined;
    }
    return normalizeRelPath(rel);
  }

  findByTargetPath(index: CimIndex, targetPath: string): Binding | undefined {
    const all = this.findBindingsForTarget(index, targetPath);
    return all.find((b) => b.target.kind === 'file') ?? all[0];
  }

  findBindingsForTarget(index: CimIndex, targetPath: string): Binding[] {
    const norm = normalizeRelPath(targetPath);
    return index.bindings.filter((b) => normalizeRelPath(b.target.path) === norm);
  }

  /**
   * Prefer the tightest range covering `line1Based`, else file-level binding.
   */
  resolveBindingForLine(
    index: CimIndex,
    targetPath: string,
    line1Based: number
  ): Binding | undefined {
    const forFile = this.findBindingsForTarget(index, targetPath);
    if (!forFile.length) {
      return undefined;
    }

    const covering = forFile
      .filter(
        (b) =>
          b.target.kind === 'range' &&
          typeof b.target.startLine === 'number' &&
          typeof b.target.endLine === 'number' &&
          line1Based >= b.target.startLine &&
          line1Based <= b.target.endLine
      )
      .sort(
        (a, b) =>
          a.target.endLine! -
          a.target.startLine! -
          (b.target.endLine! - b.target.startLine!)
      );

    if (covering.length) {
      return covering[0];
    }

    return forFile.find((b) => b.target.kind === 'file');
  }

  findByDocPath(index: CimIndex, docPath: string): Binding | undefined {
    const norm = normalizeRelPath(docPath);
    return index.bindings.find((b) => normalizeRelPath(b.doc) === norm);
  }

  async hashFileContent(uri: vscode.Uri): Promise<string> {
    const raw = await vscode.workspace.fs.readFile(uri);
    return crypto.createHash('sha1').update(raw).digest('hex').slice(0, 12);
  }

  /** Suggest a workspace-relative doc path under docsPath. */
  suggestDocPath(targetRel: string): string {
    const base = targetRel
      .replace(/^src\//, '')
      .replace(/\.[^.]+$/, '')
      .replace(/\//g, '-');
    return `${this.docsPath}/${base || 'untitled'}.md`;
  }

  async createDocIfMissing(
    docRel: string,
    title: string,
    targetRel: string,
    extra?: { symbol?: string; contentHash?: string }
  ): Promise<vscode.Uri> {
    const uri = this.docUri(docRel);
    const binding: Binding = {
      id: normalizeRelPath(docRel),
      doc: normalizeRelPath(docRel),
      target: { path: normalizeRelPath(targetRel), kind: 'file' },
      anchors:
        extra?.contentHash || extra?.symbol
          ? [{ symbol: extra.symbol, contentHash: extra.contentHash }]
          : [],
    };

    try {
      const raw = await vscode.workspace.fs.readFile(uri);
      const { meta, body } = parseCimFrontmatter(Buffer.from(raw).toString('utf8'));
      if (!meta) {
        const content = serializeCimFrontmatter(
          bindingToFrontmatter(binding),
          body || defaultDocBody(title)
        );
        await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
        this.invalidateCache();
      }
    } catch {
      const parent = vscode.Uri.joinPath(uri, '..');
      await vscode.workspace.fs.createDirectory(parent);
      const content = serializeCimFrontmatter(
        bindingToFrontmatter(binding),
        defaultDocBody(title)
      );
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
      this.invalidateCache();
    }
    return uri;
  }
}

function defaultDocBody(title: string): string {
  return `# ${title}\n\n## 概述\n\n在此描述设计意图、约束与不变量。\n\n## 备注\n\n-\n`;
}

/** Relative link from one workspace file to another (POSIX). */
export function relativeMarkdownLink(fromFile: string, toFile: string): string {
  const from = normalizeRelPath(fromFile);
  const to = normalizeRelPath(toFile);
  const fromDir = from.includes('/') ? from.slice(0, from.lastIndexOf('/')) : '';
  const fromParts = fromDir ? fromDir.split('/') : [];
  const toParts = to.split('/');
  let i = 0;
  while (i < fromParts.length && i < toParts.length - 1 && fromParts[i] === toParts[i]) {
    i++;
  }
  const ups = fromParts.length - i;
  const down = toParts.slice(i).join('/');
  if (ups === 0) {
    return './' + down;
  }
  return '../'.repeat(ups) + down;
}

export function getWorkspaceStore(): IndexStore | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    return undefined;
  }
  return new IndexStore(folder);
}
