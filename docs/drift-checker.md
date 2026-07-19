---
cim:
  target: src/drift/driftChecker.ts
  kind: file
  symbol: DriftChecker
  contentHash: 07b1a4779b7e
---
# driftChecker.ts

## 概述

检测并尽量修复绑定漂移：

- **改名**：更新文档头 `cim.target`
- **缺失**：源文件或文档不存在（`missing-target` / `missing-doc`）
- **哈希**：`contentHash` 不一致（info）
- **行范围**：range 越界（warning）

## 交互

- 诊断挂在源文件上（来源 `CIM`）
- 状态栏显示警告/信息数量
- 主页「绑定缺失」读取 `getIssues()` 中的缺失类问题
- 文档目录 Markdown 保存后刷新绑定并重写 `cim-index.md`

## 约束

- 哈希不一致仅为提示
- 不要手改 `cim-index.md`
