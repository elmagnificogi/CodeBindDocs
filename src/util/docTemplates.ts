import * as vscode from 'vscode';
import { IndexStore } from '../store/indexStore';

export type DocTemplateChoice = {
  id: string;
  label: string;
  description: string;
  /** Absolute body with optional {{title}} placeholders. */
  body: string;
  /** Workspace-relative path when loaded from disk. */
  sourceRel?: string;
};

const BUILTIN: DocTemplateChoice[] = [
  {
    id: 'design',
    label: '设计文档',
    description: '概述 · 约束与不变量 · 备注',
    body: [
      '# {{title}}',
      '',
      '## 概述',
      '',
      '在此描述设计意图、职责边界与关键协作。',
      '',
      '## 约束与不变量',
      '',
      '-',
      '',
      '## 备注',
      '',
      '-',
      '',
    ].join('\n'),
  },
  {
    id: 'api',
    label: 'API / 接口',
    description: '概述 · API · 使用注意 · 相关',
    body: [
      '# {{title}}',
      '',
      '## 概述',
      '',
      '简述职责与调用方。',
      '',
      '## API / 接口',
      '',
      '### ',
      '',
      '| 参数 | 类型 | 说明 |',
      '| --- | --- | --- |',
      '|  |  |  |',
      '',
      '## 使用注意',
      '',
      '-',
      '',
      '## 相关',
      '',
      '-',
      '',
    ].join('\n'),
  },
  {
    id: 'minimal',
    label: '简洁',
    description: '仅标题，自行填写',
    body: '# {{title}}\n\n',
  },
];

/** @deprecated use listDocTemplates — kept for type aliases. */
export type DocTemplateId = string;

/** Apply `{{title}}` (and legacy bare title patterns) into template body. */
export function applyDocTemplate(body: string, title: string): string {
  return body.replace(/\{\{\s*title\s*\}\}/gi, title);
}

/** Built-in fallback when the templates folder is empty. */
export function builtinDocTemplates(): DocTemplateChoice[] {
  return BUILTIN.map((t) => ({ ...t }));
}

/**
 * Load templates from `cbd.templatesPath` (default `{docsPath}/_templates`).
 * If the folder has no `.md` files, returns built-ins.
 */
export async function listDocTemplates(store: IndexStore): Promise<DocTemplateChoice[]> {
  const dirRel = store.templatesPath;
  const dirUri = store.workspaceUri(dirRel);
  try {
    await vscode.workspace.fs.stat(dirUri);
  } catch {
    return builtinDocTemplates();
  }

  const files = await vscode.workspace.findFiles(
    new vscode.RelativePattern(store.workspaceFolder, `${dirRel}/**/*.md`)
  );
  if (!files.length) {
    return builtinDocTemplates();
  }

  const loaded: DocTemplateChoice[] = [];
  for (const uri of files.sort((a, b) => a.fsPath.localeCompare(b.fsPath))) {
    const rel = store.toWorkspaceRelative(uri);
    if (!rel) {
      continue;
    }
    try {
      const raw = await vscode.workspace.fs.readFile(uri);
      const text = Buffer.from(raw).toString('utf8');
      const parsed = parseTemplateFile(text, rel);
      if (parsed) {
        loaded.push(parsed);
      }
    } catch {
      // skip
    }
  }
  return loaded.length ? loaded : builtinDocTemplates();
}

/**
 * Write built-in templates into the templates folder when it is empty
 * (so users can edit them). Returns how many files were written.
 */
export async function ensureDefaultTemplates(store: IndexStore): Promise<number> {
  const dirRel = store.templatesPath;
  const dirUri = store.workspaceUri(dirRel);
  await vscode.workspace.fs.createDirectory(dirUri);

  const existing = await vscode.workspace.findFiles(
    new vscode.RelativePattern(store.workspaceFolder, `${dirRel}/**/*.md`)
  );
  if (existing.length) {
    return 0;
  }

  let n = 0;
  for (const t of BUILTIN) {
    const content = serializeTemplateFile(t);
    const uri = store.workspaceUri(`${dirRel}/${t.id}.md`);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
    n++;
  }
  return n;
}

function parseTemplateFile(text: string, sourceRel: string): DocTemplateChoice | undefined {
  const base = sourceRel.split('/').pop()?.replace(/\.md$/i, '') || 'template';
  const { meta, body } = splitTemplateFrontmatter(text);
  const bodyTrim = body.replace(/^\uFEFF/, '').replace(/^\r?\n/, '');
  if (!bodyTrim.trim()) {
    return undefined;
  }
  return {
    id: base,
    label: meta.label?.trim() || base,
    description: meta.description?.trim() || sourceRel,
    body: bodyTrim.endsWith('\n') ? bodyTrim : bodyTrim + '\n',
    sourceRel,
  };
}

function serializeTemplateFile(t: DocTemplateChoice): string {
  const lines = [
    '---',
    `label: ${t.label}`,
    `description: ${t.description}`,
    '---',
    '',
    t.body.endsWith('\n') ? t.body : t.body + '\n',
  ];
  return lines.join('\n');
}

function splitTemplateFrontmatter(text: string): {
  meta: { label?: string; description?: string };
  body: string;
} {
  const normalized = text.replace(/^\uFEFF/, '');
  const m = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) {
    return { meta: {}, body: normalized };
  }
  // Do not treat as CodeBind Docs binding frontmatter — only label/description.
  if (/^\s*cbd\s*:/m.test(m[1])) {
    return { meta: {}, body: normalized };
  }
  const meta: { label?: string; description?: string } = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+)\s*:\s*(.*)$/);
    if (!kv) {
      continue;
    }
    const key = kv[1];
    let val = kv[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key === 'label') {
      meta.label = val;
    } else if (key === 'description') {
      meta.description = val;
    }
  }
  return { meta, body: m[2] };
}

/** Legacy helper used by older call sites. */
export function docBodyFromTemplate(id: string, title: string): string {
  const t = BUILTIN.find((b) => b.id === id) ?? BUILTIN[0];
  return applyDocTemplate(t.body, title);
}
