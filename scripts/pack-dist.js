// 打包后把产物复制到根目录 dist/：
//   src-tauri/target/release/invoice2excel.exe -> dist/invoice2excel.exe
//   assets/使用说明.txt                        -> dist/使用说明.txt
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
// 与 cargo 一致：允许用 CARGO_TARGET_DIR 指定构建目录（默认 src-tauri/target）
const targetDir = process.env.CARGO_TARGET_DIR || path.join(root, 'src-tauri', 'target');
const exe = path.join(targetDir, 'release', 'invoice2excel.exe');

fs.mkdirSync(dist, { recursive: true });
if (!fs.existsSync(exe)) {
  console.error('未找到构建产物：' + exe);
  console.error('请先执行 npm run build');
  process.exit(1);
}
fs.copyFileSync(exe, path.join(dist, 'invoice2excel.exe'));
console.log('copied dist/invoice2excel.exe');

const note = path.join(root, 'assets', '使用说明.txt');
if (fs.existsSync(note)) {
  fs.copyFileSync(note, path.join(dist, '使用说明.txt'));
  console.log('copied dist/使用说明.txt');
}
console.log('打包完成，输出目录：' + dist);
