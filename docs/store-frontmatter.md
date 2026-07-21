---
cbd:
  target: src/store/frontmatter.ts
  kind: file
  contentHash: b2b7af5229c5
---
* [ ]  ****

# scaffold.ts

## 概述

`CBD: Initialize` 时写入 Agent 脚手架（若不存在则创建）：

- 根目录 `AGENTS.md`
- `.cursor/rules/cbd.mdc`

## 行为

- `writeIfMissing`：已有文件不覆盖，避免冲掉人工修改
- 内容说明文档目录、`cbd-index.md`、文件头绑定与 Agent 阅读规则

## 约束

- 脚手架只引导读 docs；不要求专用 Agent 格式
- 更新模板后，已存在的 `AGENTS.md` / 规则文件需人工同步（本函数不会覆盖）
