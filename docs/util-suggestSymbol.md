---
cbd:
  target: src/util/suggestSymbol.ts
  kind: file
  symbol: suggestSymbolInRange
  contentHash: 4b9469a1e84a
---
# suggestSymbol.ts

## 概述

从代码块选区推断建议的 `symbol`（DocumentSymbol 优先，否则声明行启发式）。

## 用途

新建/改绑 range 时预填 InputBox，降低漏填 symbol 的概率。
