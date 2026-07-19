---
cim:
  target: src/webview/markdownPane.ts
  kind: file
  symbol: MarkdownPane
  contentHash: 4419cc8a78b7
---
# markdownPane.ts

## 概述

CIM 右侧文档面板：Webview + Vditor IR / 纯文本源码切换，带主页、历史导航、绑定问题与文档核对提醒。

## 职责

- **即时渲染**：Vditor IR；**源码**：普通 textarea（不再用 Vditor SV）
- 隐藏 YAML 文件头；保存时用 `joinMarkdown` 写回
- 主页：已绑定文档按源路径**目录树**展示（可折叠；点源文件名打开源码） + **绑定提醒**（含范围重叠）+ **文档核对提醒**
- 导航：主页 / 后退 / 前进
- **定位源码**：打开绑定源文件；range 时选中 `startLine–endLine`
- 删除、重新绑定（经命令转发；改绑可选整文件或代码块选区）

## 主机消息

| Web → Host | 作用 |
| --- | --- |
| `createBind` | 为源文件新建绑定 |
| `rebindDoc` | 失效文档改绑到新源文件 |
| `deleteDoc` / `openDoc` / `openTarget` | 删除或打开（`openTarget` 可带行号选区） |
| `switchMode` | 切换 ir / source（本地即时，主机只记偏好） |

## 性能注意

- 新建绑定：对话框期间离屏预热 Vditor；打开后源码盖住直至 IR 就绪再切换
- 关闭 hljs，降低首次 `setValue` 卡顿
- 面板在主页/无关联时用 off-screen `warming` 布局保活实例（避免 `display:none`）
- 新建绑定：先写文档并打开面板，索引/漂移扫描后台进行
- 复用单个 IR 实例；`setValue(md, true)` 清栈，避免残留代码块视图
- 正文勿写裸 `---` 示例（见 `mdProtect.ts`）；加载前会保护围栏内分隔线
- 面板已打开时勿用 `Beside` 再次 reveal（会改分栏尺寸）

## 约束

- 不修改被绑定的源码文件
- 不删除 `cim-index.md`
