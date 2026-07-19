---
cim:
  target: src/drift/driftChecker.ts
  kind: file
  symbol: DriftChecker
  contentHash: 9de60ee6ac7a
---
# driftChecker.ts

## 概述

检测绑定漂移并提示用户：

- **改名**：自动更新文档头 `cim.target`，并提示打开主页 / 查看漂移
- **缺失**：源文件或文档不存在（`missing-target` / `missing-doc`）— 需处理
- **内容哈希**：`contentHash` 不一致 — **仅提醒**「源码可能改了、文档未必同步」，可忽略，不强制
- **行范围**：range 越界 — 建议处理
- **符号**：代码块绑定的 symbol 找不到或已移出原行范围 — 建议处理
- **重叠**：同文件多个 range 行范围相交 — 建议处理
- **按 symbol 重算**：符号位移或行范围失效时，可一键更新 `startLine`/`endLine`（DocumentSymbol / 启发式）

## 交互

- 保存已绑定源文件且仅哈希变化：信息级提示（知道了 / 打开文档核对），不逼更新哈希或重绑定
- 符号变动 / 行范围失效：可「按 symbol 重算行号」或重新绑定
- 可选「标记已核对」或命令 `CIM: Refresh All contentHashes` 清除提醒
- 状态栏：绑定异常为警告；仅核对提醒时为 `CIM 核对 N`（无警告底色）
- 诊断：哈希为 Information，缺失/范围/重叠等为 Warning
- 主页：「绑定提醒」与「文档核对提醒」分区展示

## 约束

- 同一条漂移默认只弹一次，直到问题解决或提示文案变化
- 不要手改 `cim-index.md`
