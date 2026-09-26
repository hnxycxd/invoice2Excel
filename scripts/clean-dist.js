// 打包前清空根目录 dist/（保留文件夹本身；目录不存在则先创建）
const fs = require('node:fs');
const path = require('node:path');

const dist = path.join(__dirname, '..', 'dist');
fs.mkdirSync(dist, { recursive: true });
for (const name of fs.readdirSync(dist)) {
  fs.rmSync(path.join(dist, name), { recursive: true, force: true });
  console.log('removed dist/' + name);
}
console.log('dist/ 已清空');
