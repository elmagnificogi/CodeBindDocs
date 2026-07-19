---
cim:
  target: src/extension.ts
  kind: range
  startLine: 15
  endLine: 58
  symbol: activate
  contentHash: a21da3c2434c
---
# activate（代码块）

绑定：`src/extension.ts` 的 `activate`（L15–L58）。

## 作用

扩展激活入口：创建 SplitSync / DriftChecker / 树 / CodeLens，注册命令，并 `bootstrap` 已有文档工作区。

## 说明

光标落在此行范围内时，右侧优先显示**本代码块文档**；移出则回退到整文件文档（若有）。
