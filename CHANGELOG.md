# Changelog

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
