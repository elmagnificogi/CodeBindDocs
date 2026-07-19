---
cbd:
  target: src/store/types.ts
  kind: file
  contentHash: 6b645e7c2ed6
---
# types.ts

## 概述

CodeBind Docs 核心类型：`Binding`、`BindingTarget`、`BindingAnchor`、`CbdIndex`。

## 要点

- `kind: file | range`；range 用 1-based 闭区间 `startLine`/`endLine`
- `doc` / `target.path` 均为工作区相对路径（正斜杠）
- `normalizeRelPath` 统一路径格式
- `emptyIndex()` 得到 `version: 1` 空索引

## 约束

- 类型变更需同步 `frontmatter.ts` 与扫描/写回逻辑
