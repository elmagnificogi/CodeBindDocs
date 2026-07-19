---
cim:
  target: src/sync/splitSync.ts
  kind: file
  symbol: SplitSync
  contentHash: 920624d97461
---
# splitSync.ts

## 概述

活动源文件旁保持 CIM 文档面板；支持 file / range，光标行选最窄 range。

## 策略

1. `onDidChangeActiveTextEditor` + 选区防抖
2. **启动补同步**：窗口恢复的首个页签往往已是活动编辑器，不会再触发 change 事件；构造后与 bootstrap 后多次 `syncNow`
3. 忽略非 `file` 与文档目录内文件；是否提示「新建」由 `isBindableSourceRel` + `promptWhenUnbound` 决定
4. 有绑定则打开文档；无绑定则切换到「无关联文档」
5. **状态栏** `CIM 文档`：有绑定时显示，点击 `cim.revealBoundDoc`

## 设置

- `cim.splitSync.enabled` / `viewColumn` / `promptWhenUnbound`
- `cim.docsPath` / `cim.docPane.mode` / `cim.docPane.outline`

## 约束

- 自动同步不抢源码焦点
- 面板已打开时始终留在当前编辑器组；勿用 `Beside` 再次 reveal
