# CIM 文档汇总

共 **13** 个绑定。由 CIM 自动生成，请勿手改（绑定变更后会覆盖）。

文档目录：`docs/`（设置项 `cim.docsPath`）。

绑定声明在各文档 YAML 头的 `cim.target`；本页仅作目录。

| 源文件 | 文档 | 类型 |
| --- | --- | --- |
| [`src/agent/scaffold.ts`](../src/agent/scaffold.ts) | [`docs/agent-scaffold.md`](./agent-scaffold.md) | file |
| [`src/drift/driftChecker.ts`](../src/drift/driftChecker.ts) | [`docs/drift-checker.md`](./drift-checker.md) | file |
| [`src/extension.ts`](../src/extension.ts) | [`docs/extension-activate.md`](./extension-activate.md) | range L15-58 (activate) |
| [`src/extension.ts`](../src/extension.ts) | [`docs/extension.md`](./extension.md) | file |
| [`src/store/frontmatter.ts`](../src/store/frontmatter.ts) | [`docs/store-frontmatter.md`](./store-frontmatter.md) | file |
| [`src/store/indexStore.ts`](../src/store/indexStore.ts) | [`docs/data-model.md`](./data-model.md) | file |
| [`src/store/types.ts`](../src/store/types.ts) | [`docs/store-types.md`](./store-types.md) | file |
| [`src/sync/splitSync.ts`](../src/sync/splitSync.ts) | [`docs/split-sync.md`](./split-sync.md) | file |
| [`src/util/rangePicker.ts`](../src/util/rangePicker.ts) | [`docs/util-rangePicker.md`](./util-rangePicker.md) | file |
| [`src/views/cimCodeLens.ts`](../src/views/cimCodeLens.ts) | [`docs/views-codelens.md`](./views-codelens.md) | file |
| [`src/views/cimTreeProvider.ts`](../src/views/cimTreeProvider.ts) | [`docs/views-tree.md`](./views-tree.md) | file |
| [`src/webview/markdownPane.ts`](../src/webview/markdownPane.ts) | [`docs/webview-markdownPane.md`](./webview-markdownPane.md) | file |
| [`src/webview/mdProtect.ts`](../src/webview/mdProtect.ts) | [`docs/webview-mdProtect.md`](./webview-mdProtect.md) | file |

## 快捷操作

- 命令面板：`CIM: Open Docs Index` 打开本页
- 命令面板：`CIM: Bind Doc to Current File` 为当前源文件创建绑定
- 命令面板：`CIM: Delete Bound Doc` 删除绑定文档
- 侧栏 **CIM → Bindings** 可跳转源码 / 文档 / 删除
