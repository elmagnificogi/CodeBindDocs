import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export async function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 60000,
  });

  const testsRoot = path.resolve(__dirname);
  const files = await glob('**/*.test.js', { cwd: testsRoot });
  for (const f of files.sort()) {
    mocha.addFile(path.join(testsRoot, f));
  }

  await new Promise<void>((resolve, reject) => {
    mocha.run((failures) => {
      if (failures) {
        reject(new Error(`${failures} integration test(s) failed`));
      } else {
        resolve();
      }
    });
  });
}
