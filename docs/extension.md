---
cim:
  target: src/extension.ts
  kind: file
  symbol: activate
  contentHash: dbe30f42a162
---
# extension.ts

## 概述

扩展入口。`activate` 负责组装：

- `SplitSync`：打开源码时在旁侧打开绑定的 Markdown
- `DriftChecker`：改名更新路径 + 内容/行范围诊断
- `CimTreeProvider`：活动栏绑定列表
- 命令：初始化、绑定、打开文档、开关同步、树节点打开

## 识别方式

绑定写在本文档 YAML 头的 `cim.target` 中。扩展扫描 `{cim.docsPath}/**/*.md`（默认 `docs/`），用 `target` 匹配当前源文件路径。

## 命令

| 命令 | 作用 |
|------|------|
| `cim.initialize` | 创建文档目录、示例、`AGENTS.md`、Cursor 规则 |
| `cim.bindCurrentFile` | 为当前源文件创建/关联 Markdown（写入文件头） |
| `cim.revealBoundDoc` | 强制打开当前文件的绑定文档 |
| `cim.openDocsIndex` | 打开 `cim-index.md` 汇总页 |
| `cim.toggleSplitSync` | 开关自动分栏同步 |
| `cim.refreshTree` | 刷新树并重新扫描漂移 |

## 约束

- 绝不在源码文件中写入标记。
- 文档目录由 `cim.docsPath` 配置（默认 `docs/`）。
- 禁止绑定文档目录内的文件。
