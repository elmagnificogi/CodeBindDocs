---
cim:
  target: src/extension.ts
  kind: file
  symbol: activate
  contentHash: cd8e3f2975ca
---
# extension.ts

## 概述

扩展入口。`activate` 组装分栏同步、漂移、树、CodeLens 与命令。

## 绑定

- 代码块绑定：选区后 **强烈建议填 symbol**（`suggestSymbolInRange` 预填；留空需确认）
- 改绑同样走 `promptRangeSymbol`

## 约束

- 不在源码写入标记
- 仅工作区存在文档目录时启动扫描与同步
