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
| 文档树 | Activity Bar 列出绑定；可打开源码/文档 |
| CodeLens | 源码 range 绑定行上方可点击打开代码块文档 |
| 主页 | 已绑定列表 + **绑定缺失**分区（源文件缺失 / 文档缺失）及操作入口 |
| 漂移检测 | 改名更新 `cim.target`；缺失/hash/行范围诊断；状态栏提示 |
| 删除 | 删除绑定文档；**两次确认**；文件进回收站；面板删除按钮为红色 |
| 重新绑定 | 选源文件 → 选**整文件或代码块（选区）**；可改路径、行范围与 symbol |
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
  symbol: activate    # 可选
  contentHash: abc
```

- 扩展扫描 `{docsPath}/**/*.md`，用 `cim.target` 匹配源文件
- 同一源文件：多个 `range` + 至多一个 `file`；光标行优先**最窄** range，否则回退 file
- **不修改**被绑定的源码文件
- 无 `cim:` 头的 Markdown 不算绑定
- 加载/写回时剥离 BOM 与正文中误嵌套的重复文件头

## UX 细节

### 文档面板

- 左：源码；右：CIM 面板（主页 / 文档 / 无关联）
- 启动/窗口恢复后补做分栏同步（首个已聚焦页签不会触发 activeEditor 变更）
- **即时渲染**：Vditor IR（复用实例；`setValue` 清栈，避免切换残留）
- **源码**：普通 textarea，非 Vditor 分屏（避免切换卡顿）
- YAML 文件头不进入编辑区；保存时拼回
- 围栏内 `---` 加载前做保护，保存前还原（`mdProtect`）
- 导航：主页 / 后退 / 前进
- 可删文档时显示红色「删除」按钮

### 主页 · 绑定缺失

| 类型 | 含义 | 操作 |
|------|------|------|
| 文档缺失 | 源文件在、绑定文档不在 | 重新绑定（新建）、打开源文件 |
| 源文件缺失 | 文档在、目标源文件不在 | 重新绑定、打开此文档、删除失效文档 |

进入主页时刷新漂移扫描。

### 重新绑定流程

1. 选择工作区内源文件（不可选文档目录内文件）
2. 选择粒度：**整文件** 或 **代码块**
3. 若选代码块：打开源文件；用**状态栏**「确认代码块选区 / 取消」（**非模态**，可正常拖选代码）；可选填 symbol
4. 更新 `cim.target` / `kind` / 行号 / `contentHash`，并打开该文档

新建代码块绑定同样走状态栏确认选区，禁止用模态对话框挡住编辑器。

允许：代码块 ↔ 整文件 互相改绑。

### 删除

- 入口：面板「删除」、侧栏右键、命令面板 `CIM: Delete Bound Doc`
- **两次确认**（确定删除 → 确认删除）
- 不可删除自动生成的 `cim-index.md`
- 删除后刷新树、CodeLens、漂移；若正在看该文档或在主页则回到主页

### 命令一览

| 命令 | 作用 |
|------|------|
| `CIM: Initialize` | 文档目录与 Agent 脚手架 |
| `CIM: Bind Doc to Current File` | 新建整文件/代码块绑定 |
| `CIM: Rebind Doc to Source` | 失效或改绑（含代码块选区） |
| `CIM: Delete Bound Doc` | 删除绑定文档（两次确认） |
| `CIM: Reveal Bound Doc` | 打开当前文件绑定文档 |
| `CIM: Open Docs Index` | 打开主页 / 汇总 |
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
3. 改名可更新 `cim.target`，或主页提示缺失并可改绑/删除。
4. 重新绑定支持整文件与代码块选区。
5. 删除需两次确认；`cim-index` 不可删。
6. Agent 规则与对照表存在；`src/**` 均有绑定文档。
7. 即时渲染与源码切换流畅；新建文档顶部无多余「幽灵代码块」。

## 二期（规划）

- 富媒体（音视频）预览
- 真混排视图与「抽取为纯代码/纯文档」
- 更强的符号级绑定与 Git rename 自动修复
- 文档 block 合并与外部笔记嵌入
- 重叠 range 告警与冲突策略细化
