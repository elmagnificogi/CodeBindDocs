---
cbd:
  target: src/util/bindableSources.ts
  kind: file
  symbol: scanBindingCoverage
  contentHash: 77510831be02
---
# bindableSources.ts

## 概述

判定「哪些源文件适合绑定」，并扫描**绑定覆盖率**（已绑定 / 未绑定列表），供主页摘要与未绑定独立页展示。

## 规则

- 常见源码后缀（ts/js/py/go/cs/…）
- 覆盖率扫描：`findFiles(glob, null)`，**不传自定义 exclude**，沿用工作区 `files.exclude` / `search.exclude`
- 工程特有的大目录（如 Unity `Library/`、各项目的 build 输出）应由仓库自己的 exclude 配置，CBD **不硬编码**项目目录名
- 结果再经 `isBindableSourceRel` 过滤：跳过文档目录、少数通用前缀（`node_modules` / `out` / `dist` / `.git` 等）、二进制与锁文件

## 约束

- 未绑定列表在独立页截断展示（主机侧限制条数），避免超大仓库卡死 UI
- 路径跳过规则大小写不敏感
- 勿再给 `findFiles` 传自定义 exclude 字符串——那会**覆盖**默认 exclude，反而把工程已排除的大目录扫回来
