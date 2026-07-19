---
cim:
  target: src/store/types.ts
  kind: file
  contentHash: e4eedb039b1c
---
# types.ts

## 概述

CIM 核心类型：`Binding`、`BindingTarget`、`BindingAnchor`、`CimIndex`。

## 要点

- `kind: file | range`；range 用 1-based 闭区间 `startLine`/`endLine`
- `doc` / `target.path` 均为工作区相对路径（正斜杠）
- `normalizeRelPath` 统一路径格式
- `emptyIndex()` 得到 `version: 1` 空索引

## 约束

- 类型变更需同步 `frontmatter.ts` 与扫描/写回逻辑
