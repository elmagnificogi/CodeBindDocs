---
cim:
  target: src/drift/driftChecker.ts
  kind: file
  symbol: DriftChecker
  contentHash: 449f89f0af7c
---
# driftChecker.ts

## 概述

检测绑定漂移并提示用户：

- **改名**：自动更新文档头 `cim.target`，并提示打开主页 / 查看漂移
- **缺失**：源文件或文档不存在（`missing-target` / `missing-doc`）— 需处理
- **内容哈希**：`contentHash` 不一致 — **仅提醒**「源码可能改了、文档未必同步」，可忽略，不强制
- **行范围**：range 越界 — 建议处理
- **符号**：代码块绑定的 symbol 找不到或已移出原行范围 — 建议处理

## 交互

- 保存已绑定源文件且仅哈希变化：信息级提示（知道了 / 打开文档核对），不逼更新哈希或重绑定
- 可选「标记已核对」或命令 `CIM: Refresh All contentHashes` 清除提醒
- 状态栏：绑定异常为警告；仅核对提醒时为 `CIM 核对 N`（无警告底色）
- 诊断：哈希为 Information，缺失/范围等为 Warning
- 主页：「绑定提醒」与「文档核对提醒」分区展示

## 约束

- 同一条漂移默认只弹一次，直到问题解决或提示文案变化
- 不要手改 `cim-index.md`
