---
cbd:
  target: src/extension.ts
  kind: file
  symbol: activate
  contentHash: 2dabbe486fc7
---
# extension.ts

## 概述

扩展入口。`activate` 组装分栏同步、漂移、树、CodeLens 与命令。

## 绑定

- 代码块绑定：选区后 **强烈建议填 symbol**（`suggestSymbolInRange` 预填；留空需确认）
- 改绑同样走 `promptRangeSymbol`

## 命令

- **`CBD: Refresh Doc Tree`**：清绑定缓存、重写 `cbd-index.md`、刷新侧栏 / CodeLens / 漂移；若主页或覆盖率页正打开则就地重绘（不再只 `syncNow` 跟着当前源文件走）

## 约束

- 不在源码写入标记
- 仅工作区存在文档目录时启动扫描与同步
