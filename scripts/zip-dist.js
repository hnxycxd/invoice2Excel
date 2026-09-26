// 把发布文件打成 dist/报销单生成.zip：
//   dist/invoice2excel.exe + dist/使用说明.txt + README.md
// 纯 Node 实现（zlib deflate），无第三方依赖，避免 PowerShell 中文编码问题。
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const root = path.join(__dirname, '..')
const dist = path.join(root, 'dist')
const outZip = path.join(dist, '报销单生成.zip')
const entries = [
  { file: path.join(dist, 'invoice2excel.exe'), name: 'invoice2excel.exe' },
  { file: path.join(dist, '使用说明.txt'), name: '使用说明.txt' },
  { file: path.join(root, 'README.md'), name: 'README.md' },
]

// ---- CRC32（ZIP 规范）----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
const crc32 = (buf) => {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// ZIP 要求的 DOS 本地时间（2 秒精度）
function dosDateTime(mtime) {
  const d = new Date(mtime)
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time, date }
}

for (const e of entries) {
  if (!fs.existsSync(e.file)) {
    console.error('缺少文件：' + e.file)
    console.error('请先执行 npm run build 再打包 zip')
    process.exit(1)
  }
}

const localChunks = []
const centralChunks = []
let offset = 0
for (const { file, name } of entries) {
  const data = fs.readFileSync(file)
  const comp = zlib.deflateRawSync(data, { level: 9 })
  const crc = crc32(data)
  const { time, date } = dosDateTime(fs.statSync(file).mtimeMs)
  const nameBuf = Buffer.from(name, 'utf8')

  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0) // local file header signature
  local.writeUInt16LE(20, 4) // version needed
  local.writeUInt16LE(0x0800, 6) // flags: UTF-8 文件名
  local.writeUInt16LE(8, 8) // method: deflate
  local.writeUInt16LE(time, 10)
  local.writeUInt16LE(date, 12)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(comp.length, 18)
  local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(nameBuf.length, 26)
  local.writeUInt16LE(0, 28) // extra len
  localChunks.push(local, nameBuf, comp)

  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0) // central directory signature
  central.writeUInt16LE(20, 4) // version made by
  central.writeUInt16LE(20, 6) // version needed
  central.writeUInt16LE(0x0800, 8) // flags
  central.writeUInt16LE(8, 10) // method
  central.writeUInt16LE(time, 12)
  central.writeUInt16LE(date, 14)
  central.writeUInt32LE(crc, 16)
  central.writeUInt32LE(comp.length, 20)
  central.writeUInt32LE(data.length, 24)
  central.writeUInt16LE(nameBuf.length, 28)
  central.writeUInt16LE(0, 30) // extra len
  central.writeUInt16LE(0, 32) // comment len
  central.writeUInt16LE(0, 34) // disk number
  central.writeUInt16LE(0, 36) // internal attrs
  central.writeUInt32LE(0, 38) // external attrs
  central.writeUInt32LE(offset, 42) // local header offset
  centralChunks.push(central, nameBuf)

  offset += local.length + nameBuf.length + comp.length
}

const centralBuf = Buffer.concat(centralChunks)
const eocd = Buffer.alloc(22)
eocd.writeUInt32LE(0x06054b50, 0) // end of central directory
eocd.writeUInt16LE(0, 4)
eocd.writeUInt16LE(0, 6)
eocd.writeUInt16LE(entries.length, 8)
eocd.writeUInt16LE(entries.length, 10)
eocd.writeUInt32LE(centralBuf.length, 12)
eocd.writeUInt32LE(offset, 16)
eocd.writeUInt16LE(0, 20)

fs.writeFileSync(outZip, Buffer.concat([...localChunks, centralBuf, eocd]))
console.log('created dist/报销单生成.zip (' + fs.statSync(outZip).size + ' bytes)')
