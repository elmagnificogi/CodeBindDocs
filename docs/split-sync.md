---
cim:
  target: src/sync/splitSync.ts
  kind: file
  symbol: SplitSync
  contentHash: ade0f7a8ac8a
---
# splitSync.ts

## 概述

当存在 CIM 绑定时，在活动源文件**旁边**保持打开对应的 Markdown 编辑器（Vditor IR）。

## 策略

1. 监听 `onDidChangeActiveTextEditor`。
2. 忽略非 `file` 协议，以及文档目录（`cim.docsPath`）下的文件。
3. 扫描文档目录中带 `cim.target` 的 Markdown，匹配当前源文件。
4. 有绑定时打开 Vditor 即时渲染面板；无绑定时显示「无关联文档」与新建按钮。
5. YAML 文件头在编辑区隐藏，写回磁盘时原样保留。

## 设置项

- `cim.splitSync.enabled`
- `cim.splitSync.viewColumn`
- `cim.splitSync.promptWhenUnbound`
- `cim.docsPath` / `cim.docPane.mode`

## 约束

- 自动同步不得抢走源码编辑器的焦点。
- 文档缺失时只警告，不崩溃。
