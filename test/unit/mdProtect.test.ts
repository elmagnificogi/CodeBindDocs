import * as assert from 'assert';
import { protectHrInFences, unprotectHrInFences } from '../../src/webview/mdProtect';

suite('mdProtect', () => {
  test('protects bare --- inside fences and restores', () => {
    const md = ['# T', '', '```yaml', '---', 'cbd:', '  target: x', '---', '```', '', 'done'].join(
      '\n'
    );
    const protectedMd = protectHrInFences(md);
    assert.ok(protectedMd.includes('\u200B---'));
    assert.ok(!/^---$/m.test(protectedMd.split('```')[1] || ''));
    const restored = unprotectHrInFences(protectedMd);
    assert.strictEqual(restored, md);
  });

  test('does not protect --- outside fences', () => {
    const md = 'before\n---\nafter\n';
    const protectedMd = protectHrInFences(md);
    assert.strictEqual(protectedMd, md);
  });
});
