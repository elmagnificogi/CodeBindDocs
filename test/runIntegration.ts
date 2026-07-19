import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '../..');
  const extensionTestsPath = path.resolve(__dirname, './suite/index');

  const tmpWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cim-integ-'));
  fs.mkdirSync(path.join(tmpWorkspace, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(tmpWorkspace, 'src', 'sample.ts'),
    'export function hello() {\n  return 1;\n}\n',
    'utf8'
  );

  try {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [tmpWorkspace, '--disable-extensions'],
    });
  } finally {
    try {
      fs.rmSync(tmpWorkspace, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors on Windows file locks
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
