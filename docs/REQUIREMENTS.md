# CIM 产品需求

## 定位

CIM（Code-In-Markdown / Code Integrated Manual）是 VS Code / Cursor 扩展：用**旁路绑定**把设计文档与源码关联起来，在编辑器中**左右分栏**同步查看与编辑，且不修改原始源码。

## 目标

- 文档与代码同仓库、可版本控制、本地可用，无强制云端。
- 打开带绑定的源文件时，右侧自动打开对应 Markdown。
- 支持**整文件**与**代码块（行范围）**两级绑定；光标进入代码块时切换到对应文档。
- Agent（Cursor / Copilot 等）可通过仓库内 Markdown + `AGENTS.md` / Cursor rules 读取设计上下文。
- 本仓库自身用 `docs/` 做 dogfood：`src/**` 均有旁路文档。

## 非目标（MVP 不做）

- 真混排 Webview（文档块与代码块交错同一视图）
- 音视频嵌入与在线编辑
- Block 合并、跨笔记/第三方链接嵌入
- 非 VS Code 系 IDE 插件
- 基于 Git 历史自动重写全部绑定
- 云端同步与团队协作后端

## MVP 范围

| 能力 | 说明 |
|------|------|
| 初始化 | `CIM: Initialize` 创建文档目录、Agent 脚手架 |
| 绑定 | 整文件或代码块（`kind: file \| range`）；新建时可选选区；光标进入块时切换文档 |
| 分栏同步 | 活动编辑器切换时右侧打开绑定文档；**启动时对已恢复页签补同步**；无绑定提示新建 |
| 文档面板 | Vditor **即时渲染** + **纯文本源码**切换；YAML 头隐藏；标题旁不显示 H1/H2/H3 标签 |
| 文档树 | Activity Bar：**已绑定** + **待绑定**；可打开源码/文档/新建绑定 |
| CodeLens | 源码顶部「打开 CIM 文档」+ range 行上打开代码块文档；状态栏 `CIM 文档` |
| 主页 | 已绑定目录树 + **绑定覆盖率** + **绑定缺失**分区 |
| 漂移检测 | 目录级改名更新路径；哈希软提醒；符号/行范围位移时**优先「按 symbol 重算行号」**；重叠提示 |
| 删除 | 删除绑定文档；确认一次后删除；文件进回收站；面板删除按钮为红色 |
| 重新绑定 | 选源文件 → 选**整文件或代码块（选区）**；可改路径、行范围与 symbol |
| 定位源码 | 文档面板「定位源码」跳转到绑定文件；range 时选中整段行范围 |
| 文档模板 | 新建绑定时可选模板；目录由 **`cim.templatesPath`**（默认 `{docsPath}/_templates`）配置，支持 `{{title}}` |
| 文档资源 | 粘贴/上传图片自动写入 **`cim.assetsPath`**（默认 `{docsPath}/assets`），Markdown 用相对路径引用 |
| 文档大纲 | IR 模式可选右侧 TOC（`cim.docPane.outline`，默认开） |
| 文档嵌入 | `cim-include` 围栏只读嵌入本仓库其它 Markdown |
| Agent | `AGENTS.md` + `.cursor/rules/cim.mdc`；模块→文档对照表 |

## 数据模型

文档目录由 **`cim.docsPath`** 配置，**默认 `docs/`**：

```text
docs/
  *.md              # 带 cim: 文件头的绑定文档
  cim-index.md      # 自动生成的汇总（勿手改）
  assets/           # 可选媒体（cim.assetsPath 可改）
docs/REQUIREMENTS.md  # 产品需求（无 cim 头，不算绑定）
```

绑定写在文档头（真相源）。文件头用三连短横线围栏；**正文示例勿再写裸 `---` 行**（Vditor IR 会卡顿或误显示为代码块）：

```yaml
cim:
  target: src/foo.ts
  kind: file          # 或 range
  startLine: 15       # range 时
  endLine: 44
  symbol: activate    # 强烈建议：range 位移时可一键重算行号
  contentHash: abc
```

- 扩展扫描 `{docsPath}/**/*.md`，用 `cim.target` 匹配源文件
- 同一源文件：多个 `range` + 至多一个 `file`；光标行优先**最窄** range，否则回退 file
- **不修改**被绑定的源码文件
- 无 `cim:` 头的 Markdown 不算绑定
- 加载/写回时剥离 BOM 与正文中误嵌套的重复文件头
- 新建/改绑代码块时**强烈建议填 symbol**（可自动从选区推断）；留空需二次确认

### 文档嵌入（只读）

在旁路文档正文中写：

````markdown
```cim-include
doc: docs/foo.md
heading: 概述
```
````

可选 `lines: 10-40`。面板加载时展开为只读预览；保存时写回紧凑 `cim-include`（展开内容不持久化进宿主文档）。

## UX 细节

### 文档面板

- 左：源码；右：CIM 面板（主页 / 文档 / 无关联）
- 启动/窗口恢复后补做分栏同步（首个已聚焦页签不会触发 activeEditor 变更）
- **即时渲染**：Vditor IR（复用实例；`setValue` 清栈，避免切换残留）；可选右侧大纲（TOC）
- **源码**：普通 textarea，非 Vditor 分屏（避免切换卡顿）
- YAML 文件头不进入编辑区；保存时拼回
- 围栏内 `---` 加载前做保护，保存前还原（`mdProtect`）
- 粘贴/上传图片：写入 `assets/`，正文写入相对路径；面板内用 webview URI 预览
- 导航：主页 / 后退 / 前进
- 可删文档时显示红色「删除」按钮
- 绑定文档显示「定位源码」/「打开源码」（range 时选中整段）

### 主页 · 已绑定文档

按绑定的源文件路径展开为目录树（文件夹 → 源文件 → 旁路文档）；同一源上的多个绑定（整文件 / 代码块）挂在同一文件节点下。汇总索引单独置顶。文件夹折叠状态在会话内记忆；点击源文件名打开源码，点击文档打开旁路文档。

### 主页 · 绑定覆盖率

扫描可绑定源文件（常见语言后缀，排除 `node_modules` / `out` / 文档目录等），显示已绑定比例与未绑定列表；可从列表「新建绑定」或打开源文件。

### 主页 · 绑定提醒

| 类型 | 含义 | 操作 |
|------|------|------|
| 文档缺失 | 源文件在、绑定文档不在 | 重新绑定（新建）、打开源文件 |
| 源文件缺失 | 文档在、目标源文件不在 | 重新绑定、打开此文档、删除失效文档 |
| 行范围失效 | range 行号越界 | **按 symbol 重算行号**（有 symbol 时）、重新绑定、打开文档 |
| 符号变动 | symbol 找不到或已移出绑定行范围 | **按 symbol 重算行号**、重新绑定、打开文档 |
| 范围重叠 | 同文件多个 range 行范围相交 | 打开文档、定位源码、重新绑定 |

### 主页 · 文档核对提醒（可忽略）

源码 `contentHash` 变化时，**仅提醒**「代码可能改了、文档未必同步」——不强制更新哈希或重绑定。可打开文档核对，核对后可选「标记已核对」清除提示。

进入主页时刷新漂移扫描。保存已绑定源文件后，哈希变化只弹一次可忽略的信息提示。

状态栏：绑定异常显示警告；仅核对提醒时显示 `CIM 核对 N`（无警告底色）。

### 重新绑定流程

1. 选择工作区内源文件（不可选文档目录内文件）
2. 选择粒度：**整文件** 或 **代码块**
3. 若选代码块：打开源文件；用**状态栏**「确认代码块选区 / 取消」（**非模态**，可正常拖选代码）；**强烈建议填 symbol**（可自动推断，留空需确认）
4. 更新 `cim.target` / `kind` / 行号 / `contentHash`，并打开该文档

新建代码块绑定同样走状态栏确认选区，禁止用模态对话框挡住编辑器。新建时可选择文档模板（目录 `cim.templatesPath`，默认 `docs/_templates/`，正文可用 `{{title}}`）。若新 range 与已有绑定重叠，会二次确认。

保存已绑定源文件且检测到符号位移/行范围失效时，弹窗**优先**提供「按 symbol 重算行号」。
允许：代码块 ↔ 整文件 互相改绑。

### 删除

- 入口：面板「删除」、侧栏右键、命令面板 `CIM: Delete Bound Doc`
- **一次确认**后删除
- 不可删除自动生成的 `cim-index.md`
- 删除后刷新树、CodeLens、漂移；若正在看该文档或在主页则显示该源的「无关联」（或剩余绑定），不回主页

### 命令一览

| 命令 | 作用 |
|------|------|
| `CIM: Initialize` | 文档目录与 Agent 脚手架 |
| `CIM: Bind Doc to Current File` | 新建整文件/代码块绑定 |
| `CIM: Rebind Doc to Source` | 失效或改绑（含代码块选区） |
| `CIM: Delete Bound Doc` | 删除绑定文档（需确认） |
| `CIM: Reveal Bound Doc` | 打开当前文件绑定文档 |
| `CIM: Reveal Source Range` | 从当前/指定文档跳到源码并选中绑定范围 |
| `CIM: Retighten Range by Symbol` | 按 symbol 重算代码块 startLine/endLine |
| `CIM: Open Docs Index` | 打开主页 / 汇总 |
| `CIM: Show Binding Drift` | 查看并处理绑定漂移 |
| `CIM: Refresh Doc contentHash` | 标记单篇文档已核对（更新哈希） |
| `CIM: Refresh All contentHashes` | 全部标记已核对（可选，非强制） |
| `CIM: Toggle Split Sync` | 开关分栏同步 |
| `CIM: Refresh Doc Tree` | 刷新树与漂移 |

## Agent 集成

- `AGENTS.md`：布局、**模块→文档对照表**、规则与命令
- `.cursor/rules/cim.mdc`：编辑绑定源文件前先读文档
- 文档为普通 Markdown；改行为须同步更新对应旁路文档
- 本仓库 dogfood：见 `docs/cim-index.md`

## 成功标准

1. `npm run debug` 后，打开已绑定源文件可见左右分栏文档；range 随光标切换。
2. 绑定与文档可提交 Git；源码无 CIM 标记污染。
3. 改名可更新 `cim.target`，或主页/弹窗提示缺失并可改绑/删除。
4. 重新绑定支持整文件与代码块选区。
5. 删除需确认；`cim-index` 不可删。
6. 源文件保存后，内容/行范围/符号变动有可操作提示。
7. Agent 规则与对照表存在；`src/**` 均有绑定文档。
8. 即时渲染与源码切换流畅；新建文档顶部无多余「幽灵代码块」。
9. `npm test`（或至少 `npm run test:unit`）通过。

## 二期（规划）

- 富媒体（音视频）预览
- 真混排视图与「抽取为纯代码/纯文档」
- 更强的符号级绑定与 Git rename 自动修复
- 文档 block 合并与外部笔记嵌入
- 重叠冲突时的自动拆分/合并策略
