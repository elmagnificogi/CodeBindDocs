# CIM 产品需求

## 定位

CIM（Code-In-Markdown / Code Integrated Manual）是 VS Code / Cursor 扩展：用**旁路绑定**把设计文档与源码关联起来，在编辑器中**左右分栏**同步查看与编辑，且不修改原始源码。

## 目标

- 文档与代码同仓库、可版本控制、本地可用，无强制云端。
- 打开带绑定的源文件时，右侧自动打开对应 Markdown。
- Agent（Cursor / Copilot 等）可通过仓库内 Markdown + `AGENTS.md` / Cursor rules 读取设计上下文。
- 本仓库自身用 `docs/` 做 dogfood，展示「目标工程」形态。

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
| 绑定 | `CIM: Bind Doc to Current File` 为当前文件创建/关联文档 |
| 分栏同步 | 活动编辑器切换时，右侧打开绑定文档（避免重复 tab） |
| 文档树 | Activity Bar 列出绑定；点击跳转代码或文档 |
| 漂移检测 | 文件改名更新路径；内容 hash / 行范围不匹配时提示 |
| Agent | 生成 `AGENTS.md` 与 `.cursor/rules/cim.mdc` |

## 数据模型

文档目录由 **`cim.docsPath`** 配置，**默认 `docs/`**：

```text
docs/
  *.md              # 带 cim: 文件头的绑定文档
  cim-index.md      # 自动生成的汇总
  assets/           # 可选媒体（cim.assetsPath 可改）
```

绑定写在文档头（真相源）：

```yaml
---
cim:
  target: src/foo.ts
  kind: file
  symbol: activate
  contentHash: abc
---
```

- 扩展扫描 `{docsPath}/**/*.md`，解析 `cim.target` 匹配源文件
- `kind`：`file` 或 `range`（可带 `startLine` / `endLine`）
- **不修改**被绑定的源码文件
- 无 `cim:` 头的 Markdown（如产品需求）不算绑定

## UX

- 左：源码编辑器；右：Vditor 即时渲染文档面板
- 无绑定时显示「无关联文档」与新建按钮
- 命令面板提供 Initialize / Bind / Reveal Doc / Open Docs Index / Toggle Sync

## Agent 集成

- `AGENTS.md`：说明文档目录与 `cim-index.md`，要求改相关代码前先读绑定文档
- `.cursor/rules/cim.mdc`：Cursor 侧同等指引
- 文档本身为普通 Markdown，无需专用 Agent 格式

## 成功标准

1. `npm run debug` 启动后，打开已绑定源文件可见左右分栏文档。
2. 绑定声明与文档可提交 Git；源码文件无 CIM 标记污染。
3. 文件改名后文档头 `cim.target` 可更新或给出失效提示。
4. Agent 规则文件存在且指向 `docs/` 文件头绑定。

## 二期（规划）

- CodeLens 行内文档提示
- 富媒体（音视频）预览
- 真混排视图与「抽取为纯代码/纯文档」
- 更强的符号级绑定与 Git rename 自动修复
- 文档 block 合并与外部笔记嵌入
