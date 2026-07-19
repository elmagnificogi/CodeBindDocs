import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

async function main(): Promise<void> {
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 10000,
  });

  const root = path.resolve(__dirname);
  const files = await glob('unit/**/*.test.js', { cwd: root });
  if (!files.length) {
    throw new Error(`No unit tests found under ${root}/unit`);
  }
  for (const f of files.sort()) {
    mocha.addFile(path.join(root, f));
  }

  await new Promise<void>((resolve, reject) => {
    mocha.run((failures) => {
      if (failures) {
        reject(new Error(`${failures} unit test(s) failed`));
      } else {
        resolve();
      }
    });
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
