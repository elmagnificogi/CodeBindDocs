---
cbd:
  target: src/drift/driftChecker.ts
  kind: file
  symbol: DriftChecker
  contentHash: e561ac1f2297
---
# driftChecker.ts

## 概述

检测绑定漂移并提示用户：

- **改名**：自动更新 `cbd.target`（含目录前缀批量）
- **缺失** / **重叠** / **行范围** / **符号**
- **内容哈希**：仅软提醒
- **按 symbol 重算**：符号位移或行范围失效时，保存弹窗**优先**「按 symbol 重算行号」

## 交互

- 保存已绑定源文件：优先通知 symbol/range（高于 hash）
- 状态栏：绑定异常为警告；仅核对提醒时为 `CodeBind Docs 核对 N`

## 约束

- 同一条漂移默认只弹一次，直到问题解决或提示文案变化
- 不要手改 `cbd-index.md`
