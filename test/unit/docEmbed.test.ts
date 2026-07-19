import * as assert from 'assert';
import {
  collapseDocIncludes,
  parseIncludeMeta,
  serializeIncludeMeta,
} from '../../src/util/docEmbed';

suite('docEmbed', () => {
  test('parseIncludeMeta reads doc / heading / lines', () => {
    const spec = parseIncludeMeta('doc: docs/foo.md\nheading: 概述\nlines: 10-20\n');
    assert.ok(spec);
    assert.strictEqual(spec!.doc, 'docs/foo.md');
    assert.strictEqual(spec!.heading, '概述');
    assert.strictEqual(spec!.startLine, 10);
    assert.strictEqual(spec!.endLine, 20);
  });

  test('serializeIncludeMeta round-trips', () => {
    const raw = serializeIncludeMeta({
      doc: 'docs/a.md',
      heading: 'API',
      startLine: 1,
      endLine: 3,
    });
    const again = parseIncludeMeta(raw);
    assert.deepStrictEqual(again, {
      doc: 'docs/a.md',
      heading: 'API',
      startLine: 1,
      endLine: 3,
    });
  });

  test('collapseDocIncludes restores compact fence', () => {
    const view = [
      '```cbd-include-view',
      'doc: docs/foo.md',
      'heading: 概述',
      '',
      '> **嵌入（只读）** `docs/foo.md`',
      '>',
      '> # 概述',
      '> body',
      '```',
    ].join('\n');
    const collapsed = collapseDocIncludes(view);
    assert.ok(collapsed.includes('```cbd-include'));
    assert.ok(!collapsed.includes('cbd-include-view'));
    assert.ok(collapsed.includes('doc: docs/foo.md'));
    assert.ok(collapsed.includes('heading: 概述'));
    assert.ok(!collapsed.includes('> body'));
  });
});
