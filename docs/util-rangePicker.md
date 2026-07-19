---
cbd:
  target: src/util/rangePicker.ts
  kind: file
  contentHash: ff2a7a93169b
---
# rangePicker.ts

## 概述

代码块绑定/改绑时的**选区采集**工具：打开源文件后，用状态栏确认，避免模态框挡住编辑器。

## 行为

- `pickLineRangeInEditor`：打开文件、可选预选旧 range、显示状态栏「确认 / 取消」
- 用户可自由拖选；点确认后读取当前选区的 1-based 行范围
- `registerRangePickerCommands`：注册 `cbd.acceptRangeSelection` / `cbd.cancelRangeSelection`

## 约束

- 禁止用 `modal: true` 对话框要求用户边选区边点按钮
- 同时只允许一个 pending 选区流程
