export type DocTemplateId = 'minimal' | 'design' | 'api';

export type DocTemplateChoice = {
  id: DocTemplateId;
  label: string;
  description: string;
};

export const DOC_TEMPLATES: DocTemplateChoice[] = [
  {
    id: 'design',
    label: '设计文档',
    description: '概述 · 约束与不变量 · 备注',
  },
  {
    id: 'api',
    label: 'API / 接口',
    description: '概述 · API · 使用注意 · 相关',
  },
  {
    id: 'minimal',
    label: '简洁',
    description: '仅标题，自行填写',
  },
];

/** Body markdown for a new binding doc (no YAML frontmatter). */
export function docBodyFromTemplate(id: DocTemplateId, title: string): string {
  switch (id) {
    case 'minimal':
      return `# ${title}\n\n`;
    case 'api':
      return [
        `# ${title}`,
        '',
        '## 概述',
        '',
        '简述职责与调用方。',
        '',
        '## API / 接口',
        '',
        '### ',
        '',
        '| 参数 | 类型 | 说明 |',
        '| --- | --- | --- |',
        '|  |  |  |',
        '',
        '## 使用注意',
        '',
        '-',
        '',
        '## 相关',
        '',
        '-',
        '',
      ].join('\n');
    case 'design':
    default:
      return [
        `# ${title}`,
        '',
        '## 概述',
        '',
        '在此描述设计意图、职责边界与关键协作。',
        '',
        '## 约束与不变量',
        '',
        '-',
        '',
        '## 备注',
        '',
        '-',
        '',
      ].join('\n');
  }
}
