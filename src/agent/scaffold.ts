import * as vscode from 'vscode';

const AGENTS_CONTENT = `# AGENTS

本仓库使用 **CodeBind Docs** 旁路文档。

## 布局

- 文档目录由设置 \`cbd.docsPath\` 决定，**默认 \`docs/cbd/\`**
- \`docs/cbd/*.md\` — 设计文档；**绑定写在 Markdown YAML 文件头**
- \`docs/cbd/cbd-index.md\` — 全部绑定的汇总目录（自动生成）
- \`docs/cbd/assets/\` — 可选媒体（可用 \`cbd.assetsPath\` 覆盖）

## 绑定格式

文件头用三连短横线围栏包裹；正文示例勿写裸分隔线。

\`\`\`yaml
cbd:
  target: src/foo.ts
  kind: file
\`\`\`

## Agent 规则

1. 可先打开 \`docs/cbd/cbd-index.md\` 查看全部绑定。
2. 改源文件前，在文档目录中查找文件头 \`cbd.target\` 等于该路径的 Markdown，并先阅读。
3. 若行为/设计意图变更，同步更新对应文档。
4. 保持普通 Markdown；绑定只放在文件头 \`cbd:\` 下。
5. 不要在源码中插入 CodeBind Docs 标记。
6. 不要手改 \`cbd-index.md\`（会被覆盖）。

## 人类命令

- \`CBD: Initialize\` — 创建文档目录与脚手架
- \`CBD: Open Docs Index\` — 打开文档汇总页
- \`CBD: Bind Doc to Current File\` — 为当前文件写入带文件头的文档
- \`CBD: Rebind Doc to Source\` — 失效文档改绑源文件
- \`CBD: Delete Bound Doc\` — 删除绑定文档
- \`CBD: Reveal Bound Doc\` — 打开绑定文档
`;

const CURSOR_RULE_CONTENT = `---
description: 编辑绑定源文件前先读 CodeBind Docs 旁路文档
globs:
  - "**/*"
alwaysApply: false
---

# CodeBind Docs 文档

本项目用 CodeBind Docs 把设计文档放在源码旁：

- 文档目录：\`cbd.docsPath\`（默认 \`docs/cbd/\`）
- 汇总：\`docs/cbd/cbd-index.md\`（自动生成）
- 绑定：每个 Markdown 文件头的 YAML \`cbd.target\`
- 模块对照见根目录 \`AGENTS.md\`

编辑某文件前，可先看 \`cbd-index.md\`；若存在 \`cbd.target\` 指向该文件的文档：

1. 先阅读该 Markdown
2. 遵守其中的约束，除非用户要求修改
3. 设计变更时同步更新文档
4. 不要在源码里写 CodeBind Docs 标记——绑定只在文档头
5. 不要手改 \`cbd-index.md\`
`;

export async function scaffoldAgentFiles(workspaceRoot: vscode.Uri): Promise<void> {
  const agentsUri = vscode.Uri.joinPath(workspaceRoot, 'AGENTS.md');
  await writeIfMissing(agentsUri, AGENTS_CONTENT);

  const rulesDir = vscode.Uri.joinPath(workspaceRoot, '.cursor', 'rules');
  await vscode.workspace.fs.createDirectory(rulesDir);
  const ruleUri = vscode.Uri.joinPath(rulesDir, 'cbd.mdc');
  await writeIfMissing(ruleUri, CURSOR_RULE_CONTENT);
}

async function writeIfMissing(uri: vscode.Uri, content: string): Promise<void> {
  try {
    await vscode.workspace.fs.stat(uri);
  } catch {
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
  }
}

export { AGENTS_CONTENT, CURSOR_RULE_CONTENT };
