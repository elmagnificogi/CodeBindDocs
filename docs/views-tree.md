---
cim:
  target: src/views/cimTreeProvider.ts
  kind: file
  symbol: CimTreeProvider
  contentHash: ac630df96ab7
---
# cimTreeProvider.ts

## 概述

活动栏 **CIM → Bindings** 树：汇总页入口 + 各绑定项。

## 行为

- 首项打开 `cim-index` / 主页
- 绑定项显示源路径；range 在 description 中带行号与 symbol
- 单击默认打开源文件；右键可打开文档、重新绑定、删除

## 约束

- 数据来自 `IndexStore.read()`，变更后需 `refresh()`
