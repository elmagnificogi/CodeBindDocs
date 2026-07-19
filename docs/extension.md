---
cim:
  target: src/extension.ts
  kind: file
  symbol: activate
  contentHash: a21da3c2434c
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
| `cim.bindCurrentFile` | 整文件或代码块绑定（可选文档模板；range 重叠二次确认） |
| `cim.revealBoundDoc` | 打开当前文件绑定文档 |
| `cim.revealSourceRange` | 跳到源码并选中绑定行范围 |
| `cim.openDocsIndex` | 主页 / 汇总 |
| `cim.deleteDoc` | 删除绑定文档（需确认） |
| `cim.rebindDoc` | 将文档改绑：选源文件 → 整文件或代码块（状态栏确认选区） |
| `cim.retightenRange` | 按 symbol 重算 range 行号 |
| `cim.toggleSplitSync` | 开关分栏同步 |
| `cim.refreshTree` | 刷新树与漂移扫描 |
| `cim.showDriftIssues` | 查看并处理绑定漂移 |
| `cim.refreshDocHash` | 刷新文档 contentHash |
| `cim.refreshAllDocHashes` | 全部标记已核对（清除哈希提醒，可选） |

## 约束

- 绝不在源码中写入 CIM 标记
- 文档目录由 `cim.docsPath` 配置（默认 `docs/`）
- 禁止绑定文档目录内的文件
