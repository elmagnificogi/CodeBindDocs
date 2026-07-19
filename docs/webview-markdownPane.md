---
cim:
  target: src/webview/markdownPane.ts
  kind: file
  symbol: MarkdownPane
  contentHash: d3b48d70abd8
---
# markdownPane.ts

## 概述

CIM 右侧文档面板：Vditor IR / 源码、主页、覆盖率、图片 assets、**文档嵌入**。

## 职责

- IR / 源码切换；YAML 头隐藏
- 主页：目录树 + 覆盖率 + 绑定提醒 + 核对提醒
- 图片：`saveAsset` → assets；相对路径落盘，webview URI 预览
- **嵌入**：加载时 `expandDocIncludes`，保存时 `collapseDocIncludes`
- 大纲：`cim.docPane.outline`

## 性能

- 预拉 Vditor 静态资源；离屏预热；关 hljs

## 约束

- 不修改被绑定源码；不删 `cim-index.md`
