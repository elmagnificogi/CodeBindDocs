---
cim:
  target: src/views/cimTreeProvider.ts
  kind: file
  symbol: CimTreeProvider
  contentHash: f0975c68155d
---
# cimTreeProvider.ts

## 概述

活动栏 **CIM → Bindings** 树：汇总页 + **已绑定** + **待绑定**。

## 行为

- 首项打开 `cim-index` / 主页
- **已绑定**：源路径；range 带行号与 symbol；单击打开源文件
- **待绑定**：`scanBindingCoverage` 未覆盖源文件（默认折叠）；单击启动新建绑定；过多时提示回主页
- 右键：绑定项可打开文档/改绑/删除；待绑定项可新建绑定

## 约束

- 数据来自 `IndexStore.read()` + 覆盖率扫描，变更后需 `refresh()`
