import * as assert from 'assert';
import * as vscode from 'vscode';
import { findBraceBlockEnd, findSymbolLine } from '../../src/util/symbolRange';

suite('symbolRange', () => {
  test('findSymbolLine finds function / class / const', () => {
    const text = [
      'export function activate() {}',
      'export class Foo {}',
      'export const bar = 1;',
      'type Baz = string;',
    ].join('\n');
    assert.strictEqual(findSymbolLine(text, 'activate'), 1);
    assert.strictEqual(findSymbolLine(text, 'Foo'), 2);
    assert.strictEqual(findSymbolLine(text, 'bar'), 3);
    assert.strictEqual(findSymbolLine(text, 'Baz'), 4);
    assert.strictEqual(findSymbolLine(text, 'missing'), undefined);
  });

  test('findBraceBlockEnd matches closing brace', () => {
    const lines = [
      'function foo() {',
      '  if (true) {',
      '    return 1;',
      '  }',
      '}',
      'const x = 1;',
    ];
    const doc = {
      lineCount: lines.length,
      lineAt(i: number) {
        return { text: lines[i] };
      },
    } as unknown as vscode.TextDocument;
    assert.strictEqual(findBraceBlockEnd(doc, 1), 5);
  });
});
