---
cbd:
  target: src/views/cbdTreeProvider.ts
  kind: file
  symbol: CbdTreeProvider
  contentHash: b59a9b3aaeb8
---
# cbdTreeProvider.ts

## 概述

活动栏 **CodeBind Docs → Bindings** 树：汇总页 + **已绑定** + **待绑定**。

## 行为

- 首项打开 `cbd-index` / 主页
- **已绑定**：源路径；range 带行号与 symbol；单击打开源文件
- **待绑定**：`scanBindingCoverage` 未覆盖源文件（默认折叠）；单击启动新建绑定；过多时提示回主页
- 右键：绑定项可打开文档/改绑/删除；待绑定项可新建绑定
- **`CBD: Refresh Doc Tree`**：`refresh()` 会作废缓存；`getChildren` 对根节点和已展开分组都会重新 `read()`（避免 VS Code 先问旧 SectionItem 时仍返回上一轮列表）

## 约束

- 数据来自 `IndexStore.read()` + 覆盖率扫描，变更后需 `refresh()`
