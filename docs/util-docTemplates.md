---
cim:
  target: src/util/docTemplates.ts
  kind: file
  contentHash: 5ec4040b23e8
---
# docTemplates.ts

## 概述

新建绑定文档的模板：优先读取工作区模板目录，否则用内置三种。

## 配置

- 设置项 **`cim.templatesPath`**：工作区相对路径；留空 = `{docsPath}/_templates`（默认 `docs/_templates`）
- `CIM: Initialize` 或首次绑定时，若目录为空会写入默认 `design.md` / `api.md` / `minimal.md`

## 模板文件格式

```markdown
---
label: 设计文档
description: 概述 · 约束 …
---
# {{title}}

## 概述
…
```

- 可选头字段：`label`、`description`（**不要**写 `cim:`，否则可能被当成绑定）
- 正文用 `{{title}}` 占位；目录下有任意 `.md` 时只用磁盘模板

## 约束

- 模板目录在绑定扫描中被跳过
- 只生成 Markdown 正文，不含绑定 YAML 头
