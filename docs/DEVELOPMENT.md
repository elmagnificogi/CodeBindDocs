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
npm run package          # 生成 .vsix（需已 npm install，含 @vscode/vsce）
# npm run publish:vsce   # 登录 Publisher + PAT 后发布到 Marketplace
# npm run publish:ovsx   # Open VSX（Cursor 等）
```

上架前请确认：

- [README.md](../readme.md) / [CHANGELOG.md](../CHANGELOG.md) / [LICENSE](../LICENSE) 齐全  
- `package.json` 的 `publisher`（当前 `codebinddocs`）、`version`、`icon`、`repository`  
- `npm test` 通过  
- 扩展 ID：`codebinddocs.codebinddocs`（VS Marketplace 与 Open VSX 一致）

### CI 自动双发

仓库 workflow：[`.github/workflows/publish.yml`](../.github/workflows/publish.yml)。

1. 在 GitHub → Settings → Secrets and variables → Actions 配置：
   - **`VSCE_PAT`**：Azure DevOps PAT（Organizations = All accessible organizations，Scope = Marketplace Manage）
   - **`OVSX_PAT`**：[Open VSX](https://open-vsx.org/) Access Token
2. 把 `package.json` 的 `version` 升到目标版（如 `0.1.6`），提交后打同名 tag：

```bash
git tag v0.1.6
git push origin v0.1.6
```

3. tag 必须与 `package.json` 的 `version` 一致（`v` 前缀），否则 workflow 失败。  
4. 也可在 Actions 里手动 **Run workflow**（`workflow_dispatch`）；手动跑时不做 tag/版本校验。

本地仍可网页上传 `.vsix`：https://marketplace.visualstudio.com/manage 、https://open-vsx.org/

## 相关需求

产品范围与非目标：[REQUIREMENTS.md](REQUIREMENTS.md)。
