---
cim:
  target: src/webview/mdProtect.ts
  kind: file
  contentHash: ba4140faed3e
---
# mdProtect.ts

## 概述

防止 Vditor IR 把代码围栏里的裸三连短横线当成水平线，导致 `setValue` 卡住数秒。

## 行为

- `protectHrInFences`：围栏内该行前加零宽字符再交给编辑器
- `unprotectHrInFences`：保存前还原

## 约束

- 只处理围栏内部；真实 YAML 文件头由 `frontmatter.ts` 剥离，不进入编辑器
