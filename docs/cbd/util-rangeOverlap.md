---
cbd:
  target: src/util/rangeOverlap.ts
  kind: file
  contentHash: ec109071ebb6
---
# rangeOverlap.ts

## 概述

检测同文件多个 `kind: range` 绑定的行范围是否相交，供漂移扫描与新建绑定时二次确认。

## 约束

- 行号为 1-based inclusive
- 每对重叠只报告一次
