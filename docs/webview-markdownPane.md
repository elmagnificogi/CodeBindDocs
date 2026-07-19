---
cim:
  target: src/webview/markdownPane.ts
  kind: file
  symbol: MarkdownPane
  contentHash: 6935106eec5e
---
# markdownPane.ts

## 概述

CIM 右侧文档面板：Webview + Vditor IR / 纯文本源码切换，带主页、历史导航与绑定缺失提醒。

## 职责

- **即时渲染**：Vditor IR；**源码**：普通 textarea（不再用 Vditor SV）
- 隐藏 YAML 文件头；保存时用 `joinMarkdown` 写回
- 主页：已绑定文档列表 + **绑定缺失**（源文件/文档不存在）操作区
- 导航：主页 / 后退 / 前进
- 删除、重新绑定（经命令转发；改绑可选整文件或代码块选区）

## 关键消息

| Web → Host | 作用 |
| --- | --- |
| `createBind` | 为源文件新建绑定 |
| `rebindDoc` | 失效文档改绑到新源文件 |
| `deleteDoc` / `openDoc` / `openTarget` | 删除或打开 |
| `switchMode` | 切换 ir / source（本地即时，主机只记偏好） |

## 性能注意

- 复用单个 IR 实例；`setValue(md, true)` 清栈，避免残留代码块视图
- 正文勿写裸 `---` 示例（见 `mdProtect.ts`）；加载前会保护围栏内分隔线

## 约束

- 不修改被绑定的源码文件
- 不删除 `cim-index.md`
