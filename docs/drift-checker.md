---
cim:
  target: src/drift/driftChecker.ts
  kind: file
  symbol: DriftChecker
  contentHash: 2e2d3e689e29
---
# driftChecker.ts

## 概述

检测并尽量修复简单的绑定漂移：

- **改名**：更新文档头中的 `cim.target`
- **缺失**：源文件或文档路径不存在时警告
- **哈希**：`cim.contentHash` 不一致时信息提示
- **行范围**：`kind === range` 且行号越界时警告

## 交互

- 在绑定源文件上挂诊断（来源为 `CIM`）
- 状态栏显示漂移数量
- 文档目录下的 Markdown 保存后会刷新绑定并重写 `cim-index.md`

## 约束

- 哈希不一致仅为提示。
- 不要手改 `cim-index.md`。
