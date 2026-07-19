import * as assert from 'assert';
import {
  applyDocTemplate,
  builtinDocTemplates,
  docBodyFromTemplate,
} from '../../src/util/docTemplates';

suite('docTemplates', () => {
  test('applyDocTemplate replaces {{title}}', () => {
    assert.strictEqual(applyDocTemplate('# {{title}}\n', 'Foo'), '# Foo\n');
    assert.strictEqual(applyDocTemplate('# {{ title }}\n', 'Bar'), '# Bar\n');
  });

  test('builtinDocTemplates include design/api/minimal', () => {
    const ids = builtinDocTemplates().map((t) => t.id);
    assert.ok(ids.includes('design'));
    assert.ok(ids.includes('api'));
    assert.ok(ids.includes('minimal'));
  });

  test('docBodyFromTemplate applies title', () => {
    const body = docBodyFromTemplate('minimal', 'Hello');
    assert.ok(body.includes('# Hello'));
    assert.ok(!body.includes('{{title}}'));
  });
});
