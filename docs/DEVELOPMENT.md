# CodeBind Docs 开发与调试

面向扩展贡献者。最终用户请看 [USER_GUIDE.md](USER_GUIDE.md)。

## 仓库结构

```text
src/                 扩展源码
test/                单元测试 + Extension Host 集成冒烟
docs/                默认文档目录（dogfood）+ 产品/使用说明
media/               扩展图标等（Vditor 资源由 compile 复制）
AGENTS.md            Agent 入口
```

本仓库用自身 `docs/` 做 dogfood，绑定见 `docs/cbd-index.md`（自动生成，勿手改）。

## 安装依赖与编译

```bash
npm install
npm run compile        # tsc → out/ + 复制 Vditor 到 media/vditor
npm run watch          # 仅 tsc watch（不含 copy-vditor）
```

## 测试

```bash
npm run test:unit          # 纯逻辑（快）
npm run test:integration   # Extension Host 冒烟（首次下载 VS Code）
npm test
```

说明见 [testing.md](testing.md)。CI：`.github/workflows/ci.yml`。

## 调试加载扩展

### 推荐：独立 VS Code 开发宿主

```bash
npm run debug
# 或
npm run debug:watch
```

会编译并用 `--extensionDevelopmentPath` 启动 VS Code。窗口标题一般含 **`[Extension Development Host]`**。

也可运行任务 **CBD: Debug (compile + VS Code)**。

从 Cursor 按 F5 时，调试器仍挂在 Cursor 上，点工作区文件夹常会抢回 Cursor；请优先用 `npm run debug`。

改代码后若未开 watch：再 `npm run compile`，在开发宿主里 **Developer: Reload Window**。

### 备选：当前窗口从位置安装

1. `npm run compile`  
2. **Developer: Install Extension from Location…**  
3. 选本仓库根目录 → Reload Window  

## 打包上架

```bash
npm run compile
npm run package          # vsce package（需安装 @vscode/vsce）
```

上架前请确认：

- [readme.md](../readme.md) 简介与截图（可选）齐全  
- [USER_GUIDE.md](USER_GUIDE.md) 与当前功能一致  
- `package.json` 的 `publisher`、`version`、`engines`、`keywords`  
- `npm test` 通过  

## 相关需求

产品范围与非目标：[REQUIREMENTS.md](REQUIREMENTS.md)。
