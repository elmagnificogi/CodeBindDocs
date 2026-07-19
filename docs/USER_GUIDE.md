# CIM 使用说明

面向最终用户的安装与操作手册。上架市场后，简介见仓库根目录 [readme.md](../readme.md)；本文展开完整用法。

---

## 1. 安装

### 从市场（上架后）

1. 打开扩展视图（`Ctrl+Shift+X` / `Cmd+Shift+X`）  
2. 搜索 **CIM** 或 **Code Integrated Manual**  
3. 安装并重新加载窗口  

### 从 VSIX / 源码

```bash
npm install
npm run compile
npm run package    # 生成 .vsix（需 vsce）
```

命令面板：**Extensions: Install from VSIX…**，或 **Developer: Install Extension from Location…** 选本仓库根目录。

### 环境要求

- VS Code 或 Cursor，版本满足 `package.json` 中 `engines.vscode`  
- 必须打开**工作区文件夹**（非单文件）  

---

## 2. 五分钟上手

### 2.1 初始化仓库

命令面板 → **`CIM: Initialize`**

会创建（路径可由设置覆盖）：

- `docs/` — 文档根目录  
- `docs/assets/` — 图片等资源  
- `docs/_templates/` — 新建文档模板  
- `AGENTS.md` — Agent 入口说明  
- `.cursor/rules/cim.mdc` — Cursor 规则（若适用）  

可多次执行；已有文件会尽量保留。

### 2.2 绑定第一个文件

1. 在编辑器中打开某个源文件（如 `src/app.ts`）  
2. **`CIM: Bind Doc to Current File`**  
3. 选择粒度：  
   - **整文件** — 整个文件共用一篇文档  
   - **代码块** — 用状态栏确认选区，并**强烈建议填写 symbol**（函数/类名）  
4. 可选模板（设计 / API / 简洁等）  
5. 右侧打开新建的 Markdown，开始写文档  

之后只要再打开该源文件，右侧会自动同步对应文档。

### 2.3 打开主页与侧栏

- **`CIM: Open Docs Index`** — 文档主页（树、覆盖率、漂移提醒）  
- 左侧 Activity Bar **CIM** 图标 → **Bindings**  
  - **已绑定**：点源文件 / 文档  
  - **待绑定**：尚未有文档的源文件，点击即可新建绑定  

---

## 3. 日常工作流

### 3.1 分栏同步

- 默认开启：切换活动源文件时，右侧 CIM 面板跟随  
- 关闭：`CIM: Toggle Split Sync`，或设置 `cim.splitSync.enabled`  
- 无绑定时：右侧显示「无关联文档」，可一键新建（可用 `cim.splitSync.promptWhenUnbound` 关闭提示）  

分栏位置：`cim.splitSync.viewColumn` = `Beside`（默认）或 `Two`。

### 3.2 代码块（range）绑定

适合「这一段函数/类」单独一篇文档：

1. 绑定或改绑时选「代码块」  
2. 在编辑器中拖选范围，点状态栏 **确认代码块选区**（非模态，可正常选代码）  
3. 填写 symbol（可自动推断）；留空需二次确认  

同一文件可有多个 range，外加至多一个整文件绑定。光标落在某 range 内时优先显示**最窄** overlapping 文档。

源码上：

- 文件顶部 CodeLens：**CIM: 打开文档**  
- range 起始行 CodeLens：打开该块文档  
- 状态栏：**CIM 文档**  

### 3.3 从文档跳回源码

文档面板工具栏 **定位源码**：

- 整文件：打开目标文件  
- range：打开并选中 `startLine–endLine`  

命令：`CIM: Reveal Source Range`。

### 3.4 编辑文档

右侧面板：

| 模式 | 说明 |
|------|------|
| 即时渲染 | Vditor IR，类 Typora；可开大纲（`cim.docPane.outline`） |
| 源码 | 纯 Markdown 文本，适合精细改写 |

- YAML 文件头在面板中隐藏，保存时自动拼回  
- 粘贴/上传图片 → 写入 `docs/assets/`（或 `cim.assetsPath`），正文用相对路径  
- 导航：主页 / 后退 / 前进  
- 红色 **删除**：删绑定文档（需确认；不可删 `cim-index.md`）  

正文示例里尽量避免裸写一行 `---`（会干扰 IR）；需要展示时放在代码围栏内。

### 3.5 只读嵌入其它文档

在旁路文档中：

````markdown
```cim-include
doc: docs/foo.md
heading: 概述
```
````

可选字段：

| 字段 | 含义 |
|------|------|
| `doc` / `path` / `file` | 目标文档（相对当前文档，或 `docs/` 下文件名） |
| `heading` | 只嵌入该标题及其下属内容 |
| `lines` | 如 `10-40`，按正文行号切片 |

面板中展开为只读预览；保存仍写回紧凑 `cim-include`。

---

## 4. 漂移与维护

代码会变，绑定可能失效。CIM 的策略是**提醒 + 可操作修复**，不强制改你的文档内容。

| 类型 | 含义 | 常见处理 |
|------|------|----------|
| 源文件缺失 | 文档指向的路径不存在 | 重新绑定 / 删除失效文档 |
| 文档缺失 | 索引里有路径但文件没了 | 重新绑定（新建） |
| 行范围失效 | range 行号越界 | **按 symbol 重算行号** / 改绑 |
| 符号变动 | symbol 找不到或移出原范围 | 同上 |
| 范围重叠 | 同文件多个 range 相交 | 打开文档调整范围 |
| 源码已变（hash） | 仅提醒文档可能过时 | 打开核对，或「标记已核对」 |

保存源文件时，若检测到符号/行号问题，弹窗会**优先**提供「按 symbol 重算行号」。

相关命令：

- `CIM: Show Binding Drift`  
- `CIM: Retighten Range by Symbol`  
- `CIM: Refresh Doc contentHash` / `Refresh All …`（标记已核对）  
- `CIM: Rebind Doc to Source`  

**改名**：在资源管理器中重命名文件或文件夹时，会尽量自动更新 `cim.target`（含目录前缀批量更新）。

---

## 5. 重新绑定与删除

### 重新绑定

`CIM: Rebind Doc to Source`：选新源文件 → 整文件或代码块 → 更新头信息。允许 range ↔ file 互改。

### 删除

- 面板删除按钮、侧栏右键、或 `CIM: Delete Bound Doc`  
- **一次确认**后删除（进回收站）  
- 不可删除自动生成的 `cim-index.md`  
- 删后侧栏/漂移刷新；若正在看该文档，会切到该源的「无关联」或剩余绑定  

---

## 6. 设置项

在设置中搜索 `cim`：

| 设置 | 默认 | 说明 |
|------|------|------|
| `cim.docsPath` | `docs` | 文档根目录（工作区相对路径） |
| `cim.assetsPath` | 空 → `{docsPath}/assets` | 图片等资源目录 |
| `cim.templatesPath` | 空 → `{docsPath}/_templates` | 新建模板；有 `.md` 则用磁盘模板 |
| `cim.splitSync.enabled` | `true` | 自动分栏同步 |
| `cim.splitSync.promptWhenUnbound` | `true` | 无绑定时显示新建入口 |
| `cim.splitSync.viewColumn` | `Beside` | `Beside` 或 `Two` |
| `cim.docPane.mode` | `ir` | `ir` 即时渲染 / `source` 纯文本 |
| `cim.docPane.outline` | `true` | IR 右侧大纲 |

模板正文可用占位符 `{{title}}`。

---

## 7. 命令一览

| 命令 | 作用 |
|------|------|
| `CIM: Initialize` | 初始化文档目录与 Agent 脚手架 |
| `CIM: Bind Doc to Current File` | 为当前/指定源文件新建绑定 |
| `CIM: Rebind Doc to Source` | 改绑到新源文件或新粒度 |
| `CIM: Delete Bound Doc` | 删除绑定文档 |
| `CIM: Reveal Bound Doc` | 打开当前文件的旁路文档 |
| `CIM: Reveal Source Range` | 从文档跳到源码选区 |
| `CIM: Retighten Range by Symbol` | 按 symbol 重算行号 |
| `CIM: Open Docs Index` | 打开文档主页 |
| `CIM: Show Binding Drift` | 查看并处理漂移 |
| `CIM: Refresh Doc contentHash` | 单篇标记已核对 |
| `CIM: Refresh All contentHashes` | 全部标记已核对 |
| `CIM: Toggle Split Sync` | 开关分栏同步 |
| `CIM: Refresh Doc Tree` | 刷新侧栏与漂移 |

---

## 8. 与 AI Agent 协作

Initialize 会生成：

- **`AGENTS.md`**：布局说明 + 模块→文档对照表  
- **`.cursor/rules/cim.mdc`**：提示改绑定源文件前先读文档  

约定：

1. 改行为前先读对应旁路文档  
2. 行为变更时**同一提交**更新文档  
3. 不要在源码里塞 CIM 标记；绑定只在文档头  

文档本身是普通 Markdown，任何能读仓库的 Agent 都能直接打开。

---

## 9. 数据与 Git

建议提交：

- `docs/**/*.md`（含绑定头）  
- `docs/assets/**`（需要的图片）  
- `AGENTS.md`、`.cursor/rules/cim.mdc`  

不必提交（开发扩展时）：

- `out/`、`out-test/`、`node_modules/`、`media/vditor/`、`.vscode-test/`  

`docs/cim-index.md` 为自动汇总，**勿手改**；扩展会重写。

---

## 10. 常见问题

**Q: 装了扩展但没有反应？**  
确认打开的是文件夹工作区；命令面板能搜到 `CIM: Initialize`。标题栏若在开发宿主中应含 Extension Development Host。

**Q: 右侧不出现文档？**  
检查 `cim.splitSync.enabled`；该文件是否已绑定；是否在 `cim.docsPath` 外误放了文档。用 `CIM: Reveal Bound Doc` 或主页排查。

**Q: 即时渲染卡住或顶部出现奇怪代码块？**  
正文里裸 `---` 易触发；示例 YAML 请放进 ` ``` ` 围栏。可切到「源码」模式编辑后再回 IR。

**Q: 改了代码行号全乱了？**  
绑定 range 时填好 symbol，用 **按 symbol 重算行号**，或重新选区改绑。

**Q: 和 Swimm / 笔记本有何不同？**  
CIM 强调**本地、源码零侵入、旁路 Markdown + 分栏**；不做强制云端，也不做真混排笔记本。

**Q: 能否绑定文档目录里的文件？**  
不能；文档目录内文件是「文档侧」，不能作为 `cim.target`。

---

## 11. 更多文档

| 文档 | 用途 |
|------|------|
| [readme.md](../readme.md) | 市场简介 / 快速开始 |
| [REQUIREMENTS.md](REQUIREMENTS.md) | 产品范围与数据模型 |
| [DEVELOPMENT.md](DEVELOPMENT.md) | 扩展开发与调试 |
| [testing.md](testing.md) | 自动化测试 |

问题与建议欢迎在仓库提 Issue。
