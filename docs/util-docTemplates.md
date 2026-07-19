---
cim:
  target: src/util/docTemplates.ts
  kind: file
  contentHash: 63dd953b2221
---
# docTemplates.ts

## 概述

新建绑定文档时的正文模板（设计 / API / 简洁）。

## 约束

- 只生成 Markdown 正文，不含 YAML 文件头
- 模板选择在写文件前完成；已存在文档不会被模板覆盖
