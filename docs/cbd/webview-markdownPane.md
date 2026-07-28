---
cbd:
  target: src/webview/markdownPane.ts
  kind: file
  symbol: MarkdownPane
  contentHash: 74ef4034e8cc
---
# markdownPane.ts

## 概述

CodeBind Docs 右侧文档面板：Vditor IR / 源码、主页、覆盖率、图片 assets、**文档嵌入**。

## 职责

- IR / 源码切换；YAML 头隐藏
- 主页：目录树 + 覆盖率摘要 + 绑定提醒 + 核对提醒；未绑定列表为独立导航页
- 图片：`saveAsset` → assets；相对路径落盘，webview URI 预览
- **嵌入**：加载时 `expandDocIncludes`，保存时 `collapseDocIncludes`
- 大纲：`cbd.docPane.outline`（默认开启）；设置变化通过消息即时切换右侧 TOC，并同步显示或隐藏工具栏大纲入口，不重建 webview；Webview ready、复用 reveal、重复打开同一文档时都会重发当前值，避免保留面板漏掉配置事件
- 关联代码的任一祖先目录存在 `directory` 绑定时，顶部操作栏显示「目录文档」，并打开最接近当前代码路径的目录绑定；目录文档自身不显示该按钮

## 性能

- 预拉 Vditor 静态资源；离屏预热；关 hljs
- `localResourceRoots` 仅含扩展 `media/` + `docsPath` + `assetsPath`，**不挂整个工作区根**（Unity 等大仓挂根会导致面板创建极慢或看似无响应）

## 约束

- 不修改被绑定源码；不删 `cbd-index.md`
