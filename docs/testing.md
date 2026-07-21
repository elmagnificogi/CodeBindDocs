# 测试

## 命令

| 命令 | 说明 |
| --- | --- |
| `npm run test:unit` | Node + Mocha，纯逻辑单测（`test/stubs` 拦截 `vscode`） |
| `npm run test:integration` | `@vscode/test-electron` 冒烟（临时工作区） |
| `npm test` | unit + integration |

## 布局

```text
test/
  stubs/           vscode 模块桩（仅 unit）
  unit/            *.test.ts 纯逻辑
  suite/           Extension Host 集成用例
  runUnit.ts
  runIntegration.ts
```

编译输出在 `out-test/`（已 gitignore）。

## 覆盖范围

- **单测**：types、frontmatter、mdProtect、rangeOverlap、symbolRange、docMedia、docEmbed、docTemplates、bindableSources、relativeMarkdownLink
- **集成**：`cbd.initialize`、IndexStore 扫描 binding、`updateTargetPath` 目录前缀、contentHash 刷新
- **不测**：Vditor DOM、剪贴板粘贴、QuickPick/状态栏选区交互

## CI

`.github/workflows/ci.yml` 分别跑 unit 与 integration。

- **unit**：纯 Node，无 GUI，直接跑即可  
- **integration**：会下载并启动真实 VS Code（Electron）。GitHub `ubuntu-latest` 无显示器，必须用 `xvfb-run -a`，否则会出现 `Missing X server or $DISPLAY` 然后进程退出——这是环境问题，不是用例写错  

本地有桌面时 `npm run test:integration` 一般可直接跑；无头 Linux 本地同样需要 xvfb。
