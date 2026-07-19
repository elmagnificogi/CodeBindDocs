---
cim:
  target: src/store/frontmatter.ts
  kind: file
  contentHash: 6533b51a8909
---
# frontmatter.ts

## 概述

解析/序列化 Markdown 文件头中的 `cim:` YAML，以及正文与文件头的拆分合并。

## API

- `parseCimFrontmatter` / `serializeCimFrontmatter`：读写绑定元数据
- `splitMarkdown` / `joinMarkdown`：面板编辑时隐藏文件头、保存时拼回
- `frontmatterToBinding` / `bindingToFrontmatter`：与 `Binding` 互转

## 细节

- 去 BOM；剥离正文里误嵌套的重复文件头（否则 IR 会显示成顶部「代码块」）
- 序列化时若 body 仍以文件头开头会再剥一层，避免双重包裹

## 约束

- 绑定真相源在文档文件头，不在源码里
- 正文示例尽量不要写裸的三连短横线围栏（易触发 Vditor 卡顿）
