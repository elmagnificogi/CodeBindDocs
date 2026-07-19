---
cim:
  target: src/views/cimCodeLens.ts
  kind: file
  symbol: CimCodeLensProvider
  contentHash: df33b85964c6
---
# cimCodeLens.ts

## 概述

源码 CodeLens：文件顶部「打开 CIM 文档」+ range 行上的代码块文档入口。

## 行为

- 仅文件协议；忽略文档目录内文件
- 有任意绑定时，第 0 行显示 `CIM: 打开文档`（多篇时带数量）→ `cim.revealBoundDoc`
- range 挂在 `startLine`；文案含 symbol 或行范围 → `cim.openDoc`
- 另：状态栏 `CIM 文档`（见 SplitSync）
- 绑定变更后调用 `refresh()`

## 约束

- 不修改源码；只读扫描绑定
