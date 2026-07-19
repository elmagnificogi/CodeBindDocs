---
cim:
  target: src/sync/splitSync.ts
  kind: file
  symbol: SplitSync
  contentHash: 15b97781b56f
---
# splitSync.ts

## 概述

活动源文件旁保持 CIM 文档面板；支持 file / range，光标行选最窄 range。

## 策略

1. `onDidChangeActiveTextEditor` + 选区防抖
2. **启动补同步**：窗口恢复的首个页签往往已是活动编辑器，不会再触发 change 事件；构造后与 bootstrap 后多次 `syncNow`（含 visible editors 回退）
3. 忽略非 `file` 与文档目录内文件
4. 有绑定则打开文档；无绑定则切换到「无关联文档」（即使是 `package-lock.json` 等默认不提示新建的文件，也要换掉上一份文档，避免串页）
5. 注入漂移回调，供主页展示缺失项

## 设置

- `cim.splitSync.enabled` / `viewColumn` / `promptWhenUnbound`
- `cim.docsPath` / `cim.docPane.mode`

## 约束

- 自动同步不抢源码焦点
- 删除文档前 `releaseDoc` 取消待保存，避免写回已删文件
