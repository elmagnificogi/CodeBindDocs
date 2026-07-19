import * as assert from 'assert';
import {
  bindingToFrontmatter,
  frontmatterToBinding,
  joinMarkdown,
  parseCbdFrontmatter,
  serializeCbdFrontmatter,
  splitMarkdown,
} from '../../src/store/frontmatter';
import { Binding } from '../../src/store/types';

suite('frontmatter', () => {
  test('splitMarkdown extracts header and body', () => {
    const md = `---
cbd:
  target: src/a.ts
  kind: file
---
# Hello

body
`;
    const { header, body } = splitMarkdown(md);
    assert.ok(header?.startsWith('---'));
    assert.ok(body.startsWith('# Hello'));
  });

  test('splitMarkdown strips BOM and nested duplicate frontmatter in body', () => {
    const md =
      '\uFEFF---\ncbd:\n  target: src/a.ts\n  kind: file\n---\n---\ncbd:\n  target: src/a.ts\n  kind: file\n---\n# X\n';
    const { body } = splitMarkdown(md);
    assert.ok(!body.startsWith('---'));
    assert.ok(body.includes('# X'));
  });

  test('joinMarkdown concatenates header and body', () => {
    const joined = joinMarkdown('---\ncbd:\n  target: x\n---\n', '# T\n');
    assert.ok(joined.startsWith('---'));
    assert.ok(joined.includes('# T'));
  });

  test('parseCbdFrontmatter reads range fields', () => {
    const md = `---
cbd:
  target: src/foo.ts
  kind: range
  startLine: 10
  endLine: 20
  symbol: bar
  contentHash: abc123
---
# Doc
`;
    const { meta, body } = parseCbdFrontmatter(md);
    assert.ok(meta);
    assert.strictEqual(meta!.target, 'src/foo.ts');
    assert.strictEqual(meta!.kind, 'range');
    assert.strictEqual(meta!.startLine, 10);
    assert.strictEqual(meta!.endLine, 20);
    assert.strictEqual(meta!.symbol, 'bar');
    assert.strictEqual(meta!.contentHash, 'abc123');
    assert.ok(body.startsWith('# Doc'));
  });

  test('serialize and parse round-trip', () => {
    const body = '# Title\n\ntext\n';
    const md = serializeCbdFrontmatter(
      {
        target: 'src/x.ts',
        kind: 'file',
        symbol: 'activate',
        contentHash: 'deadbeef',
      },
      body
    );
    const { meta } = parseCbdFrontmatter(md);
    assert.strictEqual(meta?.target, 'src/x.ts');
    assert.strictEqual(meta?.symbol, 'activate');
    assert.strictEqual(meta?.contentHash, 'deadbeef');
  });

  test('bindingToFrontmatter / frontmatterToBinding round-trip', () => {
    const binding: Binding = {
      id: 'docs/x.md',
      doc: 'docs/x.md',
      target: { path: 'src/x.ts', kind: 'range', startLine: 1, endLine: 5 },
      anchors: [{ symbol: 'foo', contentHash: 'h1' }],
    };
    const meta = bindingToFrontmatter(binding);
    const again = frontmatterToBinding('docs/x.md', meta);
    assert.strictEqual(again.target.path, 'src/x.ts');
    assert.strictEqual(again.target.kind, 'range');
    assert.strictEqual(again.target.startLine, 1);
    assert.strictEqual(again.anchors?.[0]?.symbol, 'foo');
  });
});
