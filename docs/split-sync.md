---
cbd:
  target: src/sync/splitSync.ts
  kind: file
  symbol: SplitSync
  contentHash: 66dca202ff37
---
# splitSync.ts

## 概述

活动源文件旁保持 CodeBind Docs 文档面板；支持 file / range，光标行选最窄 range。

## 策略

1. `onDidChangeActiveTextEditor` + 选区防抖
2. **启动补同步**：窗口恢复的首个页签往往已是活动编辑器，不会再触发 change 事件；构造后与 bootstrap 后多次 `syncNow`
3. **`CBD: Initialize` 后也会 `syncNow`**：初始化不切换活动编辑器，否则未绑定/绑定面板都不会出现
4. **`cbd.splitSync.enabled`**：为 true 时自动打开/切换文档面板；为 false 时不强制弹窗，但仍更新状态栏；若面板已打开则继续跟随当前文件
5. 忽略非 `file` 与文档目录内文件；是否提示「新建」由 `isBindableSourceRel` + `promptWhenUnbound` 决定（仅自动分栏开启时）
6. 有绑定则打开文档；无绑定则切换到「无关联文档」（仅自动分栏开启时）
7. **状态栏** / 快捷键 **`Ctrl+Alt+D`**（Mac `Cmd+Alt+D`）：`cbd.revealBoundDoc` 一键打开当前源文件绑定文档
8. **`Ctrl+Alt+Shift+D`**：`cbd.toggleSplitSync` 开关自动分栏

## 设置

- `cbd.splitSync.enabled` / `viewColumn` / `promptWhenUnbound`
- `cbd.docsPath` / `cbd.docPane.mode` / `cbd.docPane.outline`

## 约束

- 自动同步不抢源码焦点
- 面板已打开时始终留在当前编辑器组；勿用 `Beside` 再次 reveal
- 关闭自动分栏后，手动 reveal / CodeLens / 状态栏仍可打开文档
