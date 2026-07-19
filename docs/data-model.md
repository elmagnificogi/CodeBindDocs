---
cim:
  target: src/store/indexStore.ts
  kind: file
  symbol: IndexStore
  contentHash: 2ee62344d549
---
# indexStore.ts / 数据模型

## 目录布局

```text
docs/                 # 默认文档目录（cim.docsPath）
  *.md                # 带 cim: 文件头的绑定文档
  cim-index.md        # 自动生成的汇总
  assets/             # 可选媒体（cim.assetsPath 可覆盖）
docs/REQUIREMENTS.md  # 普通文档（无 cim: 头，不算绑定）
```

## 配置

- `cim.docsPath`：文档根目录，默认 `docs`
- `cim.assetsPath`：资源目录，空则 `{docsPath}/assets`

## 绑定声明（文件头）

```yaml
---
cim:
  target: src/foo.ts
  kind: file
  startLine: 10
  endLine: 20
  symbol: activate
  contentHash: abc
---
```

## 识别流程

1. 扫描 `{docsPath}/**/*.md`
2. 解析开头 `---` … `---` 中的 `cim:` 块
3. 用 `cim.target`（相对工作区、正斜杠）匹配源文件
4. 文档路径为工作区相对路径（如 `docs/foo.md`）

## IndexStore 职责

- 确保目录结构
- 扫描并缓存绑定
- 写回/更新 Markdown 文件头
- 改名时更新 `cim.target`
- 生成 `cim-index.md`

## 约束

- CIM 绝不修改被绑定的源码文件。
- 无 `cim:` 文件头的 Markdown 不算绑定。
