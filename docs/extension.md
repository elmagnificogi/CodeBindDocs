---
cim:
  target: src/extension.ts
  kind: file
  symbol: activate
  contentHash: fe412d9ccbfe
---
# extension.ts

## 概述

扩展入口。`activate` 组装并注册全部 CIM 能力。

## 组装

- `SplitSync` + `MarkdownPane`：分栏文档面板
- `DriftChecker`：改名、缺失、哈希、行范围
- `CimTreeProvider` / `CimCodeLensProvider`：侧栏与 CodeLens

## 命令

| 命令 | 作用 |
|------|------|
| `cim.initialize` | 文档目录、脚手架 |
| `cim.bindCurrentFile` | 整文件或代码块绑定 |
| `cim.revealBoundDoc` | 打开当前文件绑定文档 |
| `cim.openDocsIndex` | 主页 / 汇总 |
| `cim.deleteDoc` | 删除绑定文档（两次确认） |
| `cim.rebindDoc` | 将文档改绑：选源文件 → 整文件或代码块（状态栏确认选区） |
| `cim.toggleSplitSync` | 开关分栏同步 |
| `cim.refreshTree` | 刷新树与漂移扫描 |

## 约束

- 绝不在源码中写入 CIM 标记
- 文档目录由 `cim.docsPath` 配置（默认 `docs/`）
- 禁止绑定文档目录内的文件
