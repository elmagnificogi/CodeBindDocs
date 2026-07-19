# AGENTS

本仓库使用 **CIM** 旁路文档。

## 布局

- 文档目录由设置 `cim.docsPath` 决定，**默认 `docs/`**
- `docs/*.md` — 设计文档；**绑定写在 Markdown YAML 文件头**
- `docs/cim-index.md` — 全部绑定的汇总目录（自动生成）
- `docs/assets/` — 可选媒体（可用 `cim.assetsPath` 覆盖）
- `docs/REQUIREMENTS.md` — 产品需求（无绑定头）

## 模块文档（源码 → 文档）

改代码前请先读对应文档（详见 `docs/cim-index.md`）：

| 源码 | 文档 |
| --- | --- |
| `src/extension.ts` | `docs/extension.md`（整文件）、`docs/extension-activate.md`（activate 代码块） |
| `src/store/indexStore.ts` | `docs/data-model.md` |
| `src/store/frontmatter.ts` | `docs/store-frontmatter.md` |
| `src/store/types.ts` | `docs/store-types.md` |
| `src/sync/splitSync.ts` | `docs/split-sync.md` |
| `src/drift/driftChecker.ts` | `docs/drift-checker.md` |
| `src/webview/markdownPane.ts` | `docs/webview-markdownPane.md` |
| `src/webview/mdProtect.ts` | `docs/webview-mdProtect.md` |
| `src/views/cimTreeProvider.ts` | `docs/views-tree.md` |
| `src/views/cimCodeLens.ts` | `docs/views-codelens.md` |
| `src/agent/scaffold.ts` | `docs/agent-scaffold.md` |
| `src/util/rangePicker.ts` | `docs/util-rangePicker.md` |

## 绑定格式

```yaml
cim:
  target: src/foo.ts
  kind: file   # 或 range（配合 startLine / endLine / symbol）
```

（实际文件头需用三连短横线围栏包裹。）同一文件可有多篇 `range`；光标行优先最窄代码块。

## Agent 规则

1. 可先打开 `docs/cim-index.md` 查看全部绑定。
2. 改源文件前，阅读 `cim.target` 等于该路径的 Markdown。
3. 行为/设计意图变更时同步更新对应文档。
4. 保持普通 Markdown；绑定只放在文件头 `cim:` 下。
5. 不要在源码中插入 CIM 标记。
6. 不要手改 `cim-index.md`（会被覆盖）。
7. 正文示例避免裸三连短横线行（Vditor IR 性能问题）。

## 人类命令

- `CIM: Initialize` — 创建文档目录与脚手架
- `CIM: Open Docs Index` — 打开文档主页 / 汇总
- `CIM: Bind Doc to Current File` — 新建绑定
- `CIM: Rebind Doc to Source` — 失效文档改绑源文件
- `CIM: Delete Bound Doc` — 删除绑定文档（需确认）
- `CIM: Reveal Bound Doc` — 打开当前文件的绑定文档
