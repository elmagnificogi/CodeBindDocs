import * as vscode from 'vscode';
import { parseCbdFrontmatter } from './frontmatter';
import { INDEX_FILE_NAME, IndexStore } from './indexStore';
import { normalizeRelPath } from './types';

export interface MigrationResult {
  moved: number;
  conflicts: string[];
}

export interface MovePlan {
  moves: Array<{ from: string; to: string }>;
  conflicts: string[];
}

const RELOCATABLE_SETTINGS = ['docsPath', 'assetsPath', 'templatesPath'] as const;
export type RelocatableSetting = (typeof RELOCATABLE_SETTINGS)[number];

const SETTING_LABEL: Record<RelocatableSetting, string> = {
  docsPath: '文档目录 (cbd.docsPath)',
  assetsPath: '资源目录 (cbd.assetsPath)',
  templatesPath: '模板目录 (cbd.templatesPath)',
};

/**
 * Pure: given relPaths under `oldNorm`, compute which ones can move to the equivalent
 * path under `newNorm` (destination free) vs which conflict (destination already exists).
 * Paths not under `oldNorm` are ignored.
 */
export function planMoves(
  relPaths: string[],
  oldNorm: string,
  newNorm: string,
  destExists: (destRel: string) => boolean
): MovePlan {
  const moves: Array<{ from: string; to: string }> = [];
  const conflicts: string[] = [];
  for (const raw of relPaths) {
    const rel = normalizeRelPath(raw);
    if (rel !== oldNorm && !rel.startsWith(oldNorm + '/')) {
      continue;
    }
    const to = newNorm + rel.slice(oldNorm.length);
    if (destExists(to)) {
      conflicts.push(to);
      continue;
    }
    moves.push({ from: rel, to });
  }
  return { moves, conflicts };
}

function effectivePath(store: IndexStore, setting: RelocatableSetting): string {
  if (setting === 'docsPath') return store.docsPath;
  if (setting === 'assetsPath') return store.assetsPath;
  return store.templatesPath;
}

function stateKey(store: IndexStore, setting: RelocatableSetting): string {
  return `cbd.lastKnownPath.${setting}.${store.workspaceFolder.uri.toString()}`;
}

/**
 * Only `docsPath` may share a folder with content CBD doesn't own (a project's other
 * hand-written docs), so it needs to move selectively: bound `.md` docs (real `cbd:`
 * frontmatter), the generated index, and the conventional `assets/` / `_templates/`
 * subfolders — anything else in the old folder is left alone.
 */
async function collectDocsPathRelPaths(store: IndexStore, oldNorm: string): Promise<string[]> {
  const templatesRoot = `${oldNorm}/_templates`;
  const indexPath = `${oldNorm}/${INDEX_FILE_NAME}`;
  const out: string[] = [];

  const mdFiles = await vscode.workspace.findFiles(
    new vscode.RelativePattern(store.workspaceFolder, `${oldNorm}/**/*.md`)
  );
  for (const uri of mdFiles) {
    const rel = store.toWorkspaceRelative(uri);
    if (!rel) {
      continue;
    }
    const norm = normalizeRelPath(rel);
    if (norm === indexPath) {
      out.push(norm);
      continue;
    }
    if (norm === templatesRoot || norm.startsWith(templatesRoot + '/')) {
      continue; // handled below as a whole-folder move
    }
    try {
      const raw = await vscode.workspace.fs.readFile(uri);
      const { meta } = parseCbdFrontmatter(Buffer.from(raw).toString('utf8'));
      if (meta) {
        out.push(norm);
      }
    } catch {
      // unreadable — leave it where it is
    }
  }

  for (const sub of ['_templates', 'assets']) {
    const subRoot = `${oldNorm}/${sub}`;
    try {
      await vscode.workspace.fs.stat(store.workspaceUri(subRoot));
    } catch {
      continue;
    }
    const files = await vscode.workspace.findFiles(
      new vscode.RelativePattern(store.workspaceFolder, `${subRoot}/**/*`)
    );
    for (const uri of files) {
      const rel = store.toWorkspaceRelative(uri);
      if (rel) {
        out.push(normalizeRelPath(rel));
      }
    }
  }

  return out;
}

/** `assetsPath` / `templatesPath` folders are entirely CBD-owned — move everything. */
async function collectWholeFolderRelPaths(store: IndexStore, oldNorm: string): Promise<string[]> {
  const files = await vscode.workspace.findFiles(
    new vscode.RelativePattern(store.workspaceFolder, `${oldNorm}/**/*`)
  );
  const out: string[] = [];
  for (const uri of files) {
    const rel = store.toWorkspaceRelative(uri);
    if (rel) {
      out.push(normalizeRelPath(rel));
    }
  }
  return out;
}

async function migrateRelPaths(
  store: IndexStore,
  relPaths: string[],
  oldNorm: string,
  newNorm: string
): Promise<MigrationResult> {
  const candidates = relPaths
    .map(normalizeRelPath)
    .filter((rel) => rel === oldNorm || rel.startsWith(oldNorm + '/'));

  const destChecks = await Promise.all(
    candidates.map(async (rel) => {
      const to = newNorm + rel.slice(oldNorm.length);
      try {
        await vscode.workspace.fs.stat(store.workspaceUri(to));
        return to;
      } catch {
        return undefined;
      }
    })
  );
  const existingDest = new Set(destChecks.filter((x): x is string => Boolean(x)));

  const plan = planMoves(candidates, oldNorm, newNorm, (rel) => existingDest.has(rel));

  let moved = 0;
  for (const { from, to } of plan.moves) {
    const srcUri = store.workspaceUri(from);
    const destUri = store.workspaceUri(to);
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(destUri, '..'));
    await vscode.workspace.fs.rename(srcUri, destUri, { overwrite: false });
    moved++;
  }
  return { moved, conflicts: plan.conflicts };
}

/**
 * Compare a relocatable path setting's current effective value against what we last saw
 * (persisted in workspaceState), and — if it changed and the old folder still has content —
 * offer to move that content to the new location. Covers both live edits (via the
 * onDidChangeConfiguration watcher below) and edits made while the extension wasn't running
 * (checked once at activation).
 */
export async function checkAndOfferPathMigration(
  store: IndexStore,
  context: vscode.ExtensionContext,
  setting: RelocatableSetting
): Promise<void> {
  const key = stateKey(store, setting);
  const last = context.workspaceState.get<string>(key);
  const current = effectivePath(store, setting);

  if (last === undefined) {
    // First time we've ever recorded this workspace's value — nothing to compare against.
    await context.workspaceState.update(key, current);
    return;
  }
  if (normalizeRelPath(last) === normalizeRelPath(current)) {
    return;
  }

  const oldNorm = normalizeRelPath(last).replace(/\/+$/, '');
  try {
    await vscode.workspace.fs.stat(store.workspaceUri(oldNorm));
  } catch {
    // Old folder is gone (already moved by hand, or never existed) — nothing to migrate.
    await context.workspaceState.update(key, current);
    return;
  }

  const choice = await vscode.window.showInformationMessage(
    `CBD: 检测到${SETTING_LABEL[setting]}由「${last}」改为「${current}」。是否将旧目录下的内容自动迁移过去？`,
    { modal: true },
    '迁移',
    '暂不迁移'
  );
  // Record the new value regardless of the choice — otherwise we'd re-prompt for the
  // same transition on every subsequent activation/config change.
  await context.workspaceState.update(key, current);
  if (choice !== '迁移') {
    return;
  }

  const newNorm = normalizeRelPath(current).replace(/\/+$/, '');
  const relPaths =
    setting === 'docsPath'
      ? await collectDocsPathRelPaths(store, oldNorm)
      : await collectWholeFolderRelPaths(store, oldNorm);
  const result = await migrateRelPaths(store, relPaths, oldNorm, newNorm);

  store.invalidateCache();
  await store.writeDocsIndex();

  const extra = result.conflicts.length
    ? `；${result.conflicts.length} 个因目标已存在被跳过（需手动处理）`
    : '';
  void vscode.window.showInformationMessage(
    `CBD: 已迁移 ${result.moved} 个文件到 ${current}/${extra}`
  );
}

/** Live-edit path: react to the user changing a relocatable setting while the window is open. */
export function registerPathMigrationWatcher(
  getStore: () => IndexStore | undefined,
  context: vscode.ExtensionContext
): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    const affected = RELOCATABLE_SETTINGS.filter((s) => e.affectsConfiguration(`cbd.${s}`));
    if (!affected.length) {
      return;
    }
    const store = getStore();
    if (!store) {
      return;
    }
    void (async () => {
      // docsPath first: assetsPath/templatesPath usually derive from it, so by the time
      // those run the folder may already be gone (already moved) — avoids a duplicate prompt.
      for (const setting of affected.slice().sort((a, b) => (a === 'docsPath' ? -1 : b === 'docsPath' ? 1 : 0))) {
        await checkAndOfferPathMigration(store, context, setting);
      }
    })();
  });
}
