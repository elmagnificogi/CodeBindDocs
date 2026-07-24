# Changelog

## [0.1.10] - 2026-07-24

### Added

- 目录绑定（`cbd.kind: directory`）：可将文档绑定到整个目录，统一说明其下代码；支持 `CBD: Bind Doc to Folder`（资源管理器右键文件夹 / 命令面板文件夹选择器），侧栏树用文件夹图标展示，`cbd-index.md` 显示 `directory` 类型；未单独绑定文件所在目录若有说明文档，分屏「无关联文档」页会带快捷入口
- 漂移检测对目录绑定仅检查目录是否存在（不做内容哈希）

### Changed

- **`cbd.docsPath` 默认值由 `docs` 改为 `docs/cbd`**（新工作区默认把 CBD 管理的文档放进独立子目录，避免和其它项目文档混在一起）；已有工作区如需保留旧路径，可在设置里把 `cbd.docsPath` 改回 `docs`
- 扩展改用 esbuild 打包为单文件 `out/extension.js`（原为 tsc 逐文件输出），加快扩展宿主启动
- `vditor` 从 `dependencies` 移到 `devDependencies`（仅构建期用于拷贝 webview 静态资源，运行时从未被引入）

## [0.1.9] - 2026-07-22

### Changed

- README 快速开始补充 VS Marketplace / Open VSX 安装链接

## [0.1.8] - 2026-07-22

### Added

- 快捷键：`Ctrl+Alt+D` 一键打开当前代码绑定文档；`Ctrl+Alt+Shift+D` 开关自动分栏

### Changed

- 关闭 `cbd.splitSync.enabled` 后不再强制弹窗；有绑定时仍显示状态栏，面板已打开时继续跟随切换

## [0.1.7] - 2026-07-21

### Fixed

- CI 集成测试在无头 Ubuntu 上使用 `xvfb-run`（修复 Missing X server / DISPLAY）

## [0.1.6] - 2026-07-21

### Fixed

- Initialize 后立即分栏同步，避免未绑定/绑定面板不出现
- 文档面板 `localResourceRoots` 不再挂整个工作区根（大仓如 Unity 下创建面板过慢）
- 覆盖率扫描改用工作区 `files.exclude` / `search.exclude`，不再用自定义 exclude 覆盖

### Added

- GitHub Actions：打 `v*` tag 自动发布到 VS Marketplace 与 Open VSX

## [0.1.5] - 2026-07-21

### Changed

- 扩展 `name` / publisher 对齐为 `codebinddocs`（Marketplace 重发）

## [0.1.4] - 2026-07-21

### Changed

- Open VSX publisher 改为 `codebinddocs`（避免与现有命名空间冲突）

## [0.1.3] - 2026-07-21

### Changed

- 精简 Marketplace README 产品简介文案

## [0.1.2] - 2026-07-19

### Changed

- 更新 Marketplace README 截图（第二张改为仓库内图）

## [0.1.1] - 2026-07-19

### Changed

- Marketplace README 增加产品截图
- 修正 Marketplace 分类（移除无效的 `Documentation`）
- 完善上架配置：LICENSE、图标、`repository`、打包忽略规则

## [0.1.0] - 2026-07-19

### Added

- 旁路 Markdown 文档绑定（整文件 / 代码块 range）
- 左右分栏同步、文档主页、侧栏已绑定 / 待绑定
- Vditor 即时渲染与文档源码切换；粘贴图片进 assets
- 绑定覆盖率（未绑定独立页）、漂移提醒与按 symbol 重算行号
- `cbd-include` 只读嵌入；Initialize 生成 `AGENTS.md` / Cursor rules
