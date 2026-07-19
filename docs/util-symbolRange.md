---
cim:
  target: src/util/symbolRange.ts
  kind: file
  contentHash: bc8d8af888b8
---
# symbolRange.ts

## 概述

按符号名解析源码中的行范围（1-based inclusive），供「按 symbol 重算行号」使用。

## 策略

1. 优先 `vscode.executeDocumentSymbolProvider`
2. 否则用声明行正则 + `{`/`}` 块匹配
3. 再否则沿用旧 span 长度平移

## 约束

- 不修改源码
- 符号名需与绑定 `cim.symbol` 一致
