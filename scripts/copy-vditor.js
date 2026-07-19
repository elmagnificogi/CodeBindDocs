const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

const root = path.join(__dirname, '..');
const src = path.join(root, 'node_modules', 'vditor', 'dist');
const dest = path.join(root, 'media', 'vditor', 'dist');

if (!fs.existsSync(src)) {
  console.error('vditor dist not found. Run npm install first.');
  process.exit(1);
}

fs.rmSync(path.join(root, 'media', 'vditor'), { recursive: true, force: true });
copyDir(src, dest);
console.log('Copied vditor assets → media/vditor/dist');
