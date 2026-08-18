---
cbd:
  target: src/store/indexStore.ts
  kind: file
  symbol: IndexStore
  contentHash: b19bd0557f5b
---
# indexStore.ts / 数据模型

## 目录布局

```text
docs/cbd/             # 默认文档目录（cbd.docsPath）
  *.md                # 带 cbd: 文件头的绑定文档
  cbd-index.md        # 自动生成的汇总
  assets/             # 可选媒体（cbd.assetsPath 可覆盖；粘贴图片自动落入）
  _templates/         # 新建文档模板（cbd.templatesPath 可覆盖）
docs/REQUIREMENTS.md  # 普通文档（无 cbd: 头，不算绑定）
```

## 配置

- `cbd.docsPath`：文档根目录，默认 `docs/cbd`
- `cbd.assetsPath`：资源目录，空则 `{docsPath}/assets`
- `cbd.templatesPath`：新建文档模板目录，空则 `{docsPath}/_templates`

## 改名

`updateTargetPath` 支持精确匹配与**目录前缀**替换（文件夹 rename 时批量更新子路径绑定）。

`read()` 通过 `workspace.fs` **递归遍历** `{docsPath}` 下的 `*.md`（不用 `findFiles`），避免刚写入的绑定在 Extension Host / CI 里被搜索索引漏掉。目录/文件类型用 `FileType` 位掩码判断，避免符号链接等组合类型被跳过。

## 绑定声明（文件头）

文档**文件最开头**用三连短横线包裹 YAML。正文示例勿再写裸分隔线（Vditor IR 会卡顿）。

### 整文件

```yaml
cbd:
  target: src/foo.ts
  kind: file
  contentHash: abc
```

### 代码块（行范围）

```yaml
cbd:
  target: src/foo.ts
  kind: range
  startLine: 15
  endLine: 44
  symbol: activate
  contentHash: abc
```

同一源文件可有多篇：多个 `range` + 至多一个 `file`。光标行优先最窄 range，否则回退 file。

## IndexStore 职责

- 扫描/缓存绑定；`writeBinding` / `deleteDoc` / `createDocIfMissing`
- 改名更新 `cbd.target`；生成 `cbd-index.md`
- `resolveBindingForLine` 供分栏与 CodeLens

## 约束

- 绝不修改被绑定的源码文件
- 无 `cbd:` 文件头的 Markdown 不算绑定
- 不能删除自动生成的 `cbd-index.md`
