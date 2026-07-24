---
cbd:
  target: src/views/cbdCodeLens.ts
  kind: file
  symbol: CbdCodeLensProvider
  contentHash: 0a72661ce87f
---
# cbdCodeLens.ts

## 概述

源码 CodeLens：文件顶部「打开 CodeBind Docs 文档」+ range 行上的代码块文档入口。

## 行为

- 仅文件协议；忽略文档目录内文件
- 有任意绑定时，第 0 行显示 `CBD: 打开文档`（多篇时带数量）→ `cbd.revealBoundDoc`
- range 挂在 `startLine`；文案含 symbol 或行范围 → `cbd.openDoc`
- 另：状态栏 `CodeBind Docs 文档`（见 SplitSync）
- 绑定变更后调用 `refresh()`

## 约束

- 不修改源码；只读扫描绑定
