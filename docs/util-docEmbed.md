---
cim:
  target: src/util/docEmbed.ts
  kind: file
  symbol: expandDocIncludes
  contentHash: f010716db402
---
# docEmbed.ts

## 概述

本仓库 Markdown **只读嵌入**：`cim-include` ↔ `cim-include-view`。

## 语法

````markdown
```cim-include
doc: docs/foo.md
heading: 概述
lines: 10-40
```
````

## 行为

- 加载：展开为目标文档正文（可按标题/行号切片），包在 `cim-include-view` 中预览
- 保存：折叠回紧凑 `cim-include`（嵌入内容不写进宿主文档的持久副本）
- 路径相对当前文档，或 `docs/` 下文件名
- **导出** `parseIncludeMeta` / `serializeIncludeMeta` 供单测与工具复用

## 约束

- 非第三方笔记；仅工作区文档
- 超长内容截断，避免拖垮面板
