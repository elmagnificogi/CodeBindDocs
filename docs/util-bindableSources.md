---
cbd:
  target: src/util/bindableSources.ts
  kind: file
  symbol: scanBindingCoverage
  contentHash: 1732aa5d4f9d
---
# bindableSources.ts

## 概述

判定「哪些源文件适合绑定」，并扫描**绑定覆盖率**（已绑定 / 未绑定列表），供主页摘要与未绑定独立页展示。

## 规则

- 常见源码后缀（ts/js/py/go/…）
- 跳过 `node_modules`、`out`、`dist`、文档目录、二进制与锁文件等
- `scanBindingCoverage`：与索引中的 `target.path` 集合求差

## 约束

- 未绑定列表在独立页截断展示（主机侧限制条数），避免超大仓库卡死 UI
