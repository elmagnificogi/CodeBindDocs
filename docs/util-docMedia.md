---
cbd:
  target: src/util/docMedia.ts
  kind: file
  symbol: rewriteImagesForWebview
  contentHash: a70a6919f51c
---
# docMedia.ts

## 概述

文档内图片路径工具：相对路径 ↔ webview URI，以及粘贴文件名清洗。

## 职责

- `resolveFromDoc` / `relativeToDoc`：相对文档目录解析
- `rewriteImagesForWebview`：加载时把 `![](...)` 改成可预览的 webview URI，并记录反向映射
- `rewriteImagesForDisk`：保存时还原为相对路径（落盘进 Git 友好）
- `safeAssetFileName`：粘贴资源安全文件名

## 约束

- 只处理相对/工作区路径；不改写 `http(s):` / `data:` 外链
