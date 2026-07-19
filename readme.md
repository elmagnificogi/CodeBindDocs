# CIM

旁路绑定的代码文档扩展（VS Code / Cursor）：源码零侵入，文档默认在 **`docs/`**（可用 `cim.docsPath` 配置），**绑定写在 Markdown YAML 文件头**；打开代码时左右分栏同步显示，便于人与 Agent 共用设计上下文。

详细需求见 [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)。

## 仓库结构

```text
src/                 扩展源码
docs/                CIM 绑定文档 + 产品需求（默认 docsPath）
AGENTS.md            Agent 入口说明
```

## 开发调试

```bash
npm install
```

### 推荐：调试启动脚本（自动编译 + 打开 VS Code）

```bash
npm run debug
```

等价于：自动 `npm install`（如缺依赖）→ `npm run compile` → 用独立用户目录启动 **VS Code Extension Development Host** 并加载本扩展。

持续编译（改代码后自动 tsc，VS Code 里 Reload Window 即可）：

```bash
npm run debug:watch
```

也可双击 [`scripts/debug.cmd`](scripts/debug.cmd)，或在命令面板跑任务 **`CIM: Debug (compile + VS Code)`**。

从 Cursor 按 F5 时，调试器仍挂在 Cursor 上，点工作区文件夹常会抢回 Cursor；请优先用上面的 `npm run debug`。

改代码后若未开 watch：再执行一次 `npm run compile`，在 VS Code 里 **Developer: Reload Window**。

### 备选：当前 Cursor 窗口直接装扩展

1. `npm run compile`
2. 命令面板 **`Developer: Install Extension from Location...`**
3. 选本仓库根目录，然后 **Reload Window**

常用命令：`CIM: Open Docs Index` / `CIM: Initialize` / `CIM: Bind Doc to Current File` / `CIM: Reveal Bound Doc` / `CIM: Toggle Split Sync`。

## 背景与竞品

- [Swimm](https://swimm.io/) — 代码绑定文档 + AI，偏云端
- Jupyter / Colab — 笔记本式混排，偏数据科学
- Cursor `AGENTS.md` / Rules — Agent 上下文，无位置绑定 UX

CIM 聚焦：**本地旁路绑定 + 分栏同步 + Vditor 即时渲染（类 Typora）**。

## 许可

MIT
