---
cbd:
  target: src/webview/markdownPane.ts
  kind: file
  symbol: MarkdownPane
  contentHash: d68dbb78d719
---
# markdownPane.ts

## 概述

CodeBind Docs 右侧文档面板：Vditor IR / 源码、主页、覆盖率、图片 assets、**文档嵌入**。

## 职责

- IR / 源码切换；YAML 头隐藏
- 主页：目录树 + 覆盖率摘要 + 绑定提醒 + 核对提醒；未绑定列表为独立导航页
- 图片：`saveAsset` → assets；相对路径落盘，webview URI 预览
- **嵌入**：加载时 `expandDocIncludes`，保存时 `collapseDocIncludes`
- 大纲：`cbd.docPane.outline`

## 性能

- 预拉 Vditor 静态资源；离屏预热；关 hljs
- `localResourceRoots` 仅含扩展 `media/` + `docsPath` + `assetsPath`，**不挂整个工作区根**（Unity 等大仓挂根会导致面板创建极慢或看似无响应）

## 约束

- 不修改被绑定源码；不删 `cbd-index.md`
