/**
 * Rename product CIM → CodeBind Docs (CBD).
 * Usage: node scripts/rename-to-cbd.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', 'out', 'out-test', '.vscode-test', '.git']);

const TEXT_EXT = new Set([
  '.ts', '.js', '.json', '.md', '.mdc', '.ps1', '.cmd', '.yml', '.yaml', '.svg', '.txt',
]);

const FILE_MOVES = [
  ['src/views/cimCodeLens.ts', 'src/views/cbdCodeLens.ts'],
  ['src/views/cimTreeProvider.ts', 'src/views/cbdTreeProvider.ts'],
  ['.cursor/rules/cim.mdc', '.cursor/rules/cbd.mdc'],
  ['media/cim.svg', 'media/cbd.svg'],
  ['docs/cim-index.md', 'docs/cbd-index.md'],
];

const PAIRS = [
  ['src/views/cimTreeProvider', 'src/views/cbdTreeProvider'],
  ['src/views/cimCodeLens', 'src/views/cbdCodeLens'],
  ['./views/cimTreeProvider', './views/cbdTreeProvider'],
  ['./views/cimCodeLens', './views/cbdCodeLens'],
  ['../views/cimTreeProvider', '../views/cbdTreeProvider'],
  ['../views/cimCodeLens', '../views/cbdCodeLens'],
  ['media/cim.svg', 'media/cbd.svg'],
  ['cimTreeProvider.ts', 'cbdTreeProvider.ts'],
  ['cimCodeLens.ts', 'cbdCodeLens.ts'],
  ['rules/cim.mdc', 'rules/cbd.mdc'],
  ['cim-index.md', 'cbd-index.md'],
  ['(cim-index)', '(cbd-index)'],
  ['`cim-index`', '`cbd-index`'],
  ['cim-include-view', 'cbd-include-view'],
  ['cim-include', 'cbd-include'],
  ['parseCimFrontmatter', 'parseCbdFrontmatter'],
  ['serializeCimFrontmatter', 'serializeCbdFrontmatter'],
  ['CimFrontmatter', 'CbdFrontmatter'],
  ['parseCimYaml', 'parseCbdYaml'],
  ['CimIndex', 'CbdIndex'],
  ['CimTreeProvider', 'CbdTreeProvider'],
  ['CimCodeLensProvider', 'CbdCodeLensProvider'],
  ['CimTreeItem', 'CbdTreeItem'],
  ['docRelFromCim', 'docRelFromCbd'],
  ['inCim', 'inCbd'],
  ["getConfiguration('cim')", "getConfiguration('cbd')"],
  ['getConfiguration("cim")', 'getConfiguration("cbd")'],
  ["createDiagnosticCollection('cim')", "createDiagnosticCollection('cbd')"],
  ["'cim.markdownPane'", "'cbd.markdownPane'"],
  ['"cim.markdownPane"', '"cbd.markdownPane"'],
  ['view == cim.bindings', 'view == cbd.bindings'],
  ['"cim.bindings"', '"cbd.bindings"'],
  ["'cim.bindings'", "'cbd.bindings'"],
  ['"id": "cim"', '"id": "cbd"'],
  ['"cim": [', '"cbd": ['],
  ["/\\^\\s*cim\\s*:/m", "/^\\s*cbd\\s*:/m"],
  ['/^\\s*cim\\s*:/m', '/^\\s*cbd\\s*:/m'],
  ['cim.initialize', 'cbd.initialize'],
  ['cim.bindCurrentFile', 'cbd.bindCurrentFile'],
  ['cim.revealBoundDoc', 'cbd.revealBoundDoc'],
  ['cim.toggleSplitSync', 'cbd.toggleSplitSync'],
  ['cim.refreshTree', 'cbd.refreshTree'],
  ['cim.openTarget', 'cbd.openTarget'],
  ['cim.revealSourceRange', 'cbd.revealSourceRange'],
  ['cim.openDoc', 'cbd.openDoc'],
  ['cim.openDocsIndex', 'cbd.openDocsIndex'],
  ['cim.deleteDoc', 'cbd.deleteDoc'],
  ['cim.rebindDoc', 'cbd.rebindDoc'],
  ['cim.retightenRange', 'cbd.retightenRange'],
  ['cim.showDriftIssues', 'cbd.showDriftIssues'],
  ['cim.refreshDocHash', 'cbd.refreshDocHash'],
  ['cim.refreshAllDocHashes', 'cbd.refreshAllDocHashes'],
  ['cim.docsPath', 'cbd.docsPath'],
  ['cim.assetsPath', 'cbd.assetsPath'],
  ['cim.templatesPath', 'cbd.templatesPath'],
  ['cim.splitSync', 'cbd.splitSync'],
  ['cim.docPane', 'cbd.docPane'],
  ['INDEX_FILE_NAME = \'cim-index.md\'', "INDEX_FILE_NAME = 'cbd-index.md'"],
  ["'cim-index.md'", "'cbd-index.md'"],
  ['"cim-index.md"', '"cbd-index.md"'],
  ['configurable via `cim.', 'configurable via `cbd.'],
  ['设置 `cim.', '设置 `cbd.'],
  ['搜索 `cim`', '搜索 `cbd`'],
  ['带 cim: 文件头', '带 cbd: 文件头'],
  ['无 cim 头', '无 cbd 头'],
  ['无 cim: 头', '无 cbd: 头'],
  ['left the cim:', 'left the cbd:'],
  ['文件头 `cim:`', '文件头 `cbd:`'],
  ['\\`cim:\\`', '\\`cbd:\\`'],
  ['cim-vscode-dev', 'cbd-vscode-dev'],
  ['cim-integ-', 'cbd-integ-'],
];

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'vditor') continue;
      walk(p, out);
    } else if (TEXT_EXT.has(path.extname(ent.name)) || ent.name === 'AGENTS.md') {
      out.push(p);
    }
  }
  return out;
}

function transform(content, filePath) {
  let s = content;
  const base = path.basename(filePath);

  // Frontmatter key at line start (docs + tests with embedded FM)
  s = s.replace(/^cim:\s*$/gm, 'cbd:');
  s = s.replace(/^cim:\s+/gm, 'cbd: ');
  // Embedded in test string literals with \n
  s = s.replace(/\\ncim:\\n/g, '\\ncbd:\\n');
  s = s.replace(/---\\ncim:\\n/g, '---\\ncbd:\\n');
  s = s.replace(/'---\ncim:\n/g, "'---\ncbd:\n");
  s = s.replace(/`cim:`/g, '`cbd:`');
  s = s.replace(/'cim:'/g, "'cbd:'");
  s = s.replace(/"cim:"/g, '"cbd:"');
  s = s.replace(/\^cim:\\s\*/g, '^cbd:\\s*');

  for (const [from, to] of PAIRS) {
    if (s.includes(from)) s = s.split(from).join(to);
  }

  s = s.replace(/\bcim\.([a-zA-Z])/g, 'cbd.$1');

  s = s.replace(/\bCIM:\s/g, 'CBD: ');
  s = s.replace(/\$\(book\) CIM/g, '$(book) CBD');
  s = s.replace(/CIM ·/g, 'CBD ·');
  s = s.replace(/CIM Doc\b/g, 'CBD');
  s = s.replace(/「CIM」/g, '「CodeBind Docs」');
  s = s.replace(/\bCIM\b/g, 'CodeBind Docs');

  s = s.replace(/Code-In-Markdown\s*\/\s*Code Integrated Manual/g, 'CodeBind Docs');
  s = s.replace(/Code Integrated Manual/g, 'CodeBind Docs');
  s = s.replace(/Code-In-Markdown/g, 'CodeBind Docs');
  s = s.replace(/CodeBind Docs — CodeBind Docs/g, 'CodeBind Docs');
  s = s.replace(/CodeBind Docs（CodeBind Docs）/g, 'CodeBind Docs');

  if (base === 'package.json' || base === 'package-lock.json') {
    s = s.replace(/"name": "cim"/g, '"name": "codebind-docs"');
    s = s.replace(/"displayName": "[^"]*"/, '"displayName": "CodeBind Docs"');
    s = s.replace(/"publisher": "cim"/g, '"publisher": "codebind"');
    s = s.replace(/"id": "cim"/g, '"id": "cbd"');
    s = s.replace(/"CIM"/g, '"CBD"');
    // keywords last item may have become CodeBind Docs already
  }

  s = s.replace(/relative to `\.cim\/`/g, 'relative to docs/');
  s = s.replace(/under `\.cim\/`/g, 'under docs/');
  s = s.replace(/\.cim\/docs/g, 'docs');
  s = s.replace(/`\.cim`/g, '`docs`');
  s = s.replace(/not under `\.cim\/`/gi, 'not under a hidden folder');
  s = s.replace(/\(not under `\.cim\/`\)/g, '(workspace docs folder)');
  s = s.replace(/Default docs path: `docs\/` \(not under `\.cim\/`\)\./g, 'Default docs path: `docs/`.');

  // template detector
  s = s.replace(/\/\^\\s\*cim\\s\*:\/m/, '/^\\s*cbd\\s*:/m');
  s = s.replace(/if \(\/\^\\s\*cim/, 'if (/^\\s*cbd');

  return s;
}

// 1) Move files
for (const [from, to] of FILE_MOVES) {
  const src = path.join(ROOT, from);
  const dest = path.join(ROOT, to);
  if (!fs.existsSync(src)) {
    console.warn('missing', from);
    continue;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest) && path.resolve(src) !== path.resolve(dest)) {
    fs.unlinkSync(dest);
  }
  fs.renameSync(src, dest);
  console.log('moved', from, '→', to);
}

// 2) Transform contents
const files = walk(ROOT);
let changed = 0;
for (const file of files) {
  if (file.endsWith('rename-to-cbd.js')) continue;
  const before = fs.readFileSync(file, 'utf8');
  const after = transform(before, file);
  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    changed++;
    console.log('updated', path.relative(ROOT, file));
  }
}
console.log(`Done. ${changed} files updated.`);
