// 升级版本号（major/minor/patch），并同步更新所有出现版本号的文件：
//   package.json、src-tauri/tauri.conf.json、src-tauri/Cargo.toml、src-tauri/Cargo.lock
// 用法：node scripts/bump-version.js <major|minor|patch>
//   major：x.y.z -> (x+1).0.0   minor：x.y.z -> x.(y+1).0   patch：x.y.z -> x.y.(z+1)
const fs = require('node:fs');
const path = require('node:path');

const level = process.argv[2];
if (!['major', 'minor', 'patch'].includes(level)) {
  console.error('用法：node scripts/bump-version.js <major|minor|patch>');
  process.exit(1);
}

const root = path.join(__dirname, '..');
const files = {
  pkg: path.join(root, 'package.json'),
  tauriConf: path.join(root, 'src-tauri', 'tauri.conf.json'),
  cargoToml: path.join(root, 'src-tauri', 'Cargo.toml'),
  cargoLock: path.join(root, 'src-tauri', 'Cargo.lock'),
};

// 以 package.json 里的版本为当前版本
const pkg = JSON.parse(fs.readFileSync(files.pkg, 'utf8'));
const old = pkg.version;
const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(old);
if (!m) {
  console.error('无法解析当前版本号：' + old);
  process.exit(1);
}
let [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
if (level === 'major') { major += 1; minor = 0; patch = 0; }
else if (level === 'minor') { minor += 1; patch = 0; }
else { patch += 1; }
const next = `${major}.${minor}.${patch}`;

// 先在内存里完成全部替换，全部成功后一次性写盘，避免改到一半失败留下不一致的版本号
const updates = [];

// package.json / tauri.conf.json："version": "x.y.z"
for (const key of ['pkg', 'tauriConf']) {
  const text = fs.readFileSync(files[key], 'utf8');
  const from = `"version": "${old}"`;
  if (!text.includes(from)) {
    console.error(`未在 ${path.relative(root, files[key])} 中找到 ${from}，请检查版本号是否一致`);
    process.exit(1);
  }
  updates.push([files[key], text.replace(from, `"version": "${next}"`)]);
}

// Cargo.toml：[package] 下的 version = "x.y.z"（行首匹配，不会碰到依赖的版本号）
{
  const text = fs.readFileSync(files.cargoToml, 'utf8');
  const re = new RegExp(`^version = "${old.replace(/\./g, '\\.')}"$`, 'm');
  if (!re.test(text)) {
    console.error(`未在 src-tauri/Cargo.toml 中找到 version = "${old}"，请检查版本号是否一致`);
    process.exit(1);
  }
  updates.push([files.cargoToml, text.replace(re, `version = "${next}"`)]);
}

// Cargo.lock：invoice2excel 自己的 [[package]] 块（name 行的下一行就是 version 行）
{
  const text = fs.readFileSync(files.cargoLock, 'utf8');
  const re = new RegExp(`(name = "invoice2excel"\\r?\\nversion = ")${old.replace(/\./g, '\\.')}(")`);
  if (!re.test(text)) {
    console.error(`未在 src-tauri/Cargo.lock 中找到 invoice2excel 的版本 ${old}，请检查版本号是否一致`);
    process.exit(1);
  }
  updates.push([files.cargoLock, text.replace(re, `$1${next}$2`)]);
}

for (const [file, text] of updates) {
  fs.writeFileSync(file, text);
  console.log(`${path.relative(root, file)}: ${old} -> ${next}`);
}
console.log(`版本号已升级：${old} -> ${next}（${level}）`);
