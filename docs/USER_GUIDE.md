# CodeBind Docs 使用说明

面向最终用户的安装与操作手册。产品全称 **CodeBind Docs**，简称 **CBD**（命令/设置为 `cbd.*`）。上架市场后，简介见仓库根目录 [readme.md](../readme.md)；本文展开完整用法。

---

## 1. 安装

### 从市场（上架后）

1. 打开扩展视图（`Ctrl+Shift+X` / `Cmd+Shift+X`）  
2. 搜索 **CodeBind Docs** 或 **CodeBind Docs**  
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

命令面板 → **`CBD: Initialize`**

会创建（路径可由设置覆盖）：

- `docs/` — 文档根目录  
- `docs/assets/` — 图片等资源  
- `docs/_templates/` — 新建文档模板  
- `AGENTS.md` — Agent 入口说明  
- `.cursor/rules/cbd.mdc` — Cursor 规则（若适用）  

可多次执行；已有文件会尽量保留。完成后会立刻对当前源文件做一次分栏同步（有绑定打开文档，无绑定则出现「无关联文档」提示）。若面板仍未出现，可切换一下编辑器页签，或运行 **`CBD: Open Docs Index`**。

### 2.2 绑定第一个文件

1. 在编辑器中打开某个源文件（如 `src/app.ts`）  
2. **`CBD: Bind Doc to Current File`**  
3. 选择粒度：  
   - **整文件** — 整个文件共用一篇文档  
   - **代码块** — 用状态栏确认选区，并**强烈建议填写 symbol**（函数/类名）  
4. 可选模板（设计 / API / 简洁等）  
5. 右侧打开新建的 Markdown，开始写文档  

之后只要再打开该源文件，右侧会自动同步对应文档。

### 2.3 打开主页与侧栏

- **`CBD: Open Docs Index`** — 文档主页（树、覆盖率摘要、漂移提醒）；未绑定列表从主页进入独立页  
- 左侧 Activity Bar **CodeBind Docs** 图标 → **Bindings**  
  - **已绑定**：点源文件 / 文档  
  - **待绑定**：尚未有文档的源文件，点击即可新建绑定  

---

## 3. 日常工作流

### 3.1 分栏同步

- **自动分栏**（默认开）：切换活动源文件时，右侧 CodeBind Docs 面板跟随  
  - 设置：`cbd.splitSync.enabled`  
  - 或命令 / 快捷键：`CBD: Toggle Split Sync`（`Ctrl+Alt+Shift+D` / Mac `Cmd+Alt+Shift+D`）  
- **关闭自动分栏**后：打开代码时不再强制弹文档窗；状态栏在有绑定时仍显示，可点；也可用一键打开  
- **一键打开当前代码的绑定文档**：`CBD: Reveal Bound Doc`  
  - 快捷键：`Ctrl+Alt+D`（Mac `Cmd+Alt+D`）  
  - 无绑定时会提示并可新建  
- 无绑定时（仅自动分栏开启）：右侧显示「无关联文档」，可一键新建（`cbd.splitSync.promptWhenUnbound`）  

分栏位置：`cbd.splitSync.viewColumn` = `Beside`（默认）或 `Two`。

### 3.2 代码块（range）绑定

适合「这一段函数/类」单独一篇文档：

1. 绑定或改绑时选「代码块」  
2. 在编辑器中拖选范围，点状态栏 **确认代码块选区**（非模态，可正常选代码）  
3. 填写 symbol（可自动推断）；留空需二次确认  

同一文件可有多个 range，外加至多一个整文件绑定。光标落在某 range 内时优先显示**最窄** overlapping 文档。

源码上：

- 文件顶部 CodeLens：**CBD: 打开文档**  
- range 起始行 CodeLens：打开该块文档  
- 状态栏：**CodeBind Docs 文档**  

### 3.3 从文档跳回代码

文档面板工具栏 **Code**：

- 整文件：打开目标文件  
- range：打开并选中 `startLine–endLine`  

命令：`CBD: Reveal Source Range`。

### 3.4 编辑文档

右侧面板：

| 模式 | 说明 |
|------|------|
| 即时渲染 | Vditor IR，类 Typora；可开大纲（`cbd.docPane.outline`） |
| 文档源码 | 纯 Markdown 文本，适合精细改写 |

工具栏 **Code** 用于跳转到绑定的源文件（range 时选中行范围）。

- YAML 文件头在面板中隐藏，保存时自动拼回  
- 粘贴/上传图片 → 写入 `docs/assets/`（或 `cbd.assetsPath`），正文用相对路径  
- 导航：主页 / 后退 / 前进  
- 红色 **删除**：删绑定文档（需确认；不可删 `cbd-index.md`）  

正文示例里尽量避免裸写一行 `---`（会干扰 IR）；需要展示时放在代码围栏内。

### 3.5 只读嵌入其它文档

在旁路文档中：

````markdown
```cbd-include
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

面板中展开为只读预览；保存仍写回紧凑 `cbd-include`。

---

## 4. 漂移与维护

代码会变，绑定可能失效。CodeBind Docs 的策略是**提醒 + 可操作修复**，不强制改你的文档内容。

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

- `CBD: Show Binding Drift`  
- `CBD: Retighten Range by Symbol`  
- `CBD: Refresh Doc contentHash` / `Refresh All …`（标记已核对）  
- `CBD: Rebind Doc to Source`  

**改名**：在资源管理器中重命名文件或文件夹时，会尽量自动更新 `cbd.target`（含目录前缀批量更新）。

---

## 5. 重新绑定与删除

### 重新绑定

`CBD: Rebind Doc to Source`：选新源文件 → 整文件或代码块 → 更新头信息。允许 range ↔ file 互改。

### 删除

- 面板删除按钮、侧栏右键、或 `CBD: Delete Bound Doc`  
- **一次确认**后删除（进回收站）  
- 不可删除自动生成的 `cbd-index.md`  
- 删后侧栏/漂移刷新；若正在看该文档，会切到该源的「无关联」或剩余绑定  

---

## 6. 设置项

在设置中搜索 `cbd`：

| 设置 | 默认 | 说明 |
|------|------|------|
| `cbd.docsPath` | `docs` | 文档根目录（工作区相对路径） |
| `cbd.assetsPath` | 空 → `{docsPath}/assets` | 图片等资源目录 |
| `cbd.templatesPath` | 空 → `{docsPath}/_templates` | 新建模板；有 `.md` 则用磁盘模板 |
| `cbd.splitSync.enabled` | `true` | 打开源文件时是否**自动**弹出绑定文档；关后用快捷键手动打开 |
| `cbd.splitSync.promptWhenUnbound` | `true` | 自动分栏开启时，无绑定是否显示新建入口 |
| `cbd.splitSync.viewColumn` | `Beside` | `Beside` 或 `Two` |
| `cbd.docPane.mode` | `ir` | `ir` 即时渲染 / `source` 纯文本 |
| `cbd.docPane.outline` | `true` | IR 右侧大纲 |

模板正文可用占位符 `{{title}}`。

快捷键（可在「键盘快捷方式」里改）：

| 快捷键 | 命令 |
|--------|------|
| `Ctrl+Alt+D`（Mac `Cmd+Alt+D`） | 打开当前代码的绑定文档 |
| `Ctrl+Alt+Shift+D`（Mac `Cmd+Alt+Shift+D`） | 开关自动分栏 |

覆盖率 /「待绑定」扫描会走 VS Code 的 `findFiles`，并尊重工作区 **`files.exclude` / `search.exclude`**（不另写死项目目录）。Unity 等大仓请把 `Library/`、`Temp/` 等放进这些设置里（多数模板已有），否则扫全仓会很慢。

---

## 7. 命令一览

| 命令 | 作用 |
|------|------|
| `CBD: Initialize` | 初始化文档目录与 Agent 脚手架 |
| `CBD: Bind Doc to Current File` | 为当前/指定源文件新建绑定 |
| `CBD: Rebind Doc to Source` | 改绑到新源文件或新粒度 |
| `CBD: Delete Bound Doc` | 删除绑定文档 |
| `CBD: Reveal Bound Doc` | 打开当前文件的旁路文档（`Ctrl+Alt+D`） |
| `CBD: Reveal Source Range` | 从文档跳到源码选区 |
| `CBD: Retighten Range by Symbol` | 按 symbol 重算行号 |
| `CBD: Open Docs Index` | 打开文档主页 |
| `CBD: Show Binding Drift` | 查看并处理漂移 |
| `CBD: Refresh Doc contentHash` | 单篇标记已核对 |
| `CBD: Refresh All contentHashes` | 全部标记已核对 |
| `CBD: Toggle Split Sync` | 开关自动分栏（`Ctrl+Alt+Shift+D`） |
| `CBD: Refresh Doc Tree` | 刷新侧栏与漂移 |

---

## 8. 与 AI Agent 协作

Initialize 会生成：

- **`AGENTS.md`**：布局说明 + 模块→文档对照表  
- **`.cursor/rules/cbd.mdc`**：提示改绑定源文件前先读文档  

约定：

1. 改行为前先读对应旁路文档  
2. 行为变更时**同一提交**更新文档  
3. 不要在源码里塞 CodeBind Docs 标记；绑定只在文档头  

文档本身是普通 Markdown，任何能读仓库的 Agent 都能直接打开。

---

## 9. 数据与 Git

建议提交：

- `docs/**/*.md`（含绑定头）  
- `docs/assets/**`（需要的图片）  
- `AGENTS.md`、`.cursor/rules/cbd.mdc`  

不必提交（开发扩展时）：

- `out/`、`out-test/`、`node_modules/`、`media/vditor/`、`.vscode-test/`  

`docs/cbd-index.md` 为自动汇总，**勿手改**；扩展会重写。

---

## 10. 常见问题

**Q: 装了扩展但没有反应？**  
确认打开的是文件夹工作区；命令面板能搜到 `CBD: Initialize`。标题栏若在开发宿主中应含 Extension Development Host。

**Q: 右侧不出现文档？**  
检查 `cbd.splitSync.enabled`；该文件是否已绑定；是否在 `cbd.docsPath` 外误放了文档。用 `CBD: Reveal Bound Doc` 或主页排查。

**Q: 即时渲染卡住或顶部出现奇怪代码块？**  
正文里裸 `---` 易触发；示例 YAML 请放进 ` ``` ` 围栏。可切到「文档源码」模式编辑后再回 IR。

**Q: 改了代码行号全乱了？**  
绑定 range 时填好 symbol，用 **按 symbol 重算行号**，或重新选区改绑。

**Q: 和 Swimm / 笔记本有何不同？**  
CodeBind Docs 强调**本地、源码零侵入、旁路 Markdown + 分栏**；不做强制云端，也不做真混排笔记本。

**Q: 能否绑定文档目录里的文件？**  
不能；文档目录内文件是「文档侧」，不能作为 `cbd.target`。

---

## 11. 更多文档

| 文档 | 用途 |
|------|------|
| [readme.md](../readme.md) | 市场简介 / 快速开始 |
| [REQUIREMENTS.md](REQUIREMENTS.md) | 产品范围与数据模型 |
| [DEVELOPMENT.md](DEVELOPMENT.md) | 扩展开发与调试 |
| [testing.md](testing.md) | 自动化测试 |

问题与建议欢迎在仓库提 Issue。
