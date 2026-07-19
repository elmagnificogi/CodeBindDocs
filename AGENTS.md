# AGENTS

本仓库使用 **CodeBind Docs（CBD）** 旁路文档。

## 布局

- 文档目录由设置 `cbd.docsPath` 决定，**默认 `docs/`**
- `docs/*.md` — 设计文档；**绑定写在 Markdown YAML 文件头**
- `docs/cbd-index.md` — 全部绑定的汇总目录（自动生成）
- `docs/assets/` — 可选媒体（可用 `cbd.assetsPath` 覆盖）
- `docs/_templates/` — 新建文档模板（可用 `cbd.templatesPath` 覆盖；支持 `{{title}}`）
- `docs/REQUIREMENTS.md` — 产品需求（无绑定头）
- `docs/USER_GUIDE.md` — **最终用户使用说明**（安装、绑定、漂移、设置）
- `docs/DEVELOPMENT.md` — 扩展开发与调试
- `docs/testing.md` — 单元 / 集成测试说明
- `test/` — Mocha 单测 + Extension Host 冒烟（`npm test`）

## 模块文档（源码 → 文档）

改代码前请先读对应文档（详见 `docs/cbd-index.md`）：

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
| `src/views/cbdTreeProvider.ts` | `docs/views-tree.md` |
| `src/views/cbdCodeLens.ts` | `docs/views-codelens.md` |
| `src/agent/scaffold.ts` | `docs/agent-scaffold.md` |
| `src/util/rangePicker.ts` | `docs/util-rangePicker.md` |
| `src/util/docTemplates.ts` | `docs/util-docTemplates.md` |
| `src/util/rangeOverlap.ts` | `docs/util-rangeOverlap.md` |
| `src/util/symbolRange.ts` | `docs/util-symbolRange.md` |

## 绑定格式

```yaml
cbd:
  target: src/foo.ts
  kind: file   # 或 range（配合 startLine / endLine / symbol）
```

（实际文件头需用三连短横线围栏包裹。）同一文件可有多篇 `range`；光标行优先最窄代码块。

## Agent 规则

1. 可先打开 `docs/cbd-index.md` 查看全部绑定。
2. 改源文件前，阅读 `cbd.target` 等于该路径的 Markdown。
3. 行为/设计意图变更时同步更新对应文档。
4. 保持普通 Markdown；绑定只放在文件头 `cbd:` 下。
5. 不要在源码中插入 CodeBind Docs 标记。
6. 不要手改 `cbd-index.md`（会被覆盖）。
7. 正文示例避免裸三连短横线行（Vditor IR 性能问题）。

## 人类命令

- `CBD: Initialize` — 创建文档目录与脚手架
- `CBD: Open Docs Index` — 打开文档主页 / 汇总
- `CBD: Bind Doc to Current File` — 新建绑定
- `CBD: Rebind Doc to Source` — 失效文档改绑源文件
- `CBD: Delete Bound Doc` — 删除绑定文档（需确认）
- `CBD: Show Binding Drift` — 查看绑定漂移并处理
- `CBD: Refresh Doc contentHash` — 刷新文档内容哈希
- `CBD: Reveal Bound Doc` — 打开当前文件的绑定文档
- `CBD: Reveal Source Range` — 从文档跳到源码并选中绑定范围
