---
cim:
  target: src/views/cimCodeLens.ts
  kind: file
  symbol: CimCodeLensProvider
  contentHash: 1f0f253cecea
---
# cimCodeLens.ts

## 概述

在源码中为 `kind: range` 绑定提供 CodeLens，点击打开对应代码块文档。

## 行为

- 仅文件协议；忽略文档目录内文件
- Lens 挂在 `startLine`；文案含 symbol 或行范围
- 绑定变更后调用 `refresh()`

## 约束

- 不修改源码；只读扫描绑定
