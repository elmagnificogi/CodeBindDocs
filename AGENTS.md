# AGENTS

本仓库使用 **CIM** 旁路文档。

## 布局

- 文档目录由设置 `cim.docsPath` 决定，**默认 `docs/`**
- `docs/*.md` — 设计文档；**绑定写在 Markdown YAML 文件头**
- `docs/cim-index.md` — 全部绑定的汇总目录（自动生成）
- `docs/assets/` — 可选媒体（可用 `cim.assetsPath` 覆盖）

## 绑定格式

```yaml
---
cim:
  target: src/foo.ts
  kind: file
---
```

## Agent 规则

1. 可先打开 `docs/cim-index.md` 查看全部绑定。
2. 改源文件前，在文档目录中查找文件头 `cim.target` 等于该路径的 Markdown，并先阅读。
3. 若行为/设计意图变更，同步更新对应文档。
4. 保持普通 Markdown；绑定只放在文件头 `cim:` 下。
5. 不要在源码中插入 CIM 标记。
6. 不要手改 `cim-index.md`（会被覆盖）。

## 人类命令

- `CIM: Initialize` — 创建文档目录与脚手架
- `CIM: Open Docs Index` — 打开文档汇总页
- `CIM: Bind Doc to Current File` — 为当前文件写入带文件头的文档
- `CIM: Reveal Bound Doc` — 打开绑定文档
