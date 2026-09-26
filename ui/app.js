// ===== 预设选项（按需修改这里即可）=====
const DEPARTMENTS = ['综合办公室', '财务部', '人力资源部', '市场部', '技术部', '采购部']
const FEE_TYPES = ['市内交通费', '餐费', '软件费']

const AMOUNT_MAX = 9999999.99 // 金额上限（元）
const INITIAL_ROWS = 2 // 初始/重置后的明细行数

// ===== Tauri API =====
const tauri = window.__TAURI__ || {}
const invoke = (tauri.core && tauri.core.invoke) || tauri.invoke

// ===== 元素引用 =====
const els = {
  name: document.getElementById('name'),
  date: document.getElementById('date'),
  todayBtn: document.getElementById('todayBtn'),
  department: document.getElementById('department'),
  project: document.getElementById('project'),
  tbody: document.getElementById('tbody'),
  addRow: document.getElementById('addRow'),
  cn: document.getElementById('cnAmount'),
  num: document.getElementById('numAmount'),
  deleteEmpty: document.getElementById('deleteEmpty'),
  generate: document.getElementById('generate'),
  genLabel: document.getElementById('genLabel'),
  resetBtn: document.getElementById('resetBtn'),
  status: document.getElementById('status'),
  modalMask: document.getElementById('modalMask'),
  modalMsg: document.getElementById('modalMsg'),
  modalOk: document.getElementById('modalOk'),
}

// ===== 初始化下拉预设 =====
function fillDatalist(id, items) {
  document.getElementById(id).innerHTML = items
    .map((v) => `<option value="${v}"></option>`)
    .join('')
}
fillDatalist('deptList', DEPARTMENTS)
fillDatalist('feeList', FEE_TYPES)

function todayStr() {
  const now = new Date()
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
}

// ===== 明细表格 =====
function createRow() {
  const tr = document.createElement('tr')
  tr.innerHTML = `
    <td class="seq"></td>
    <td><input list="feeList" class="fee-summary" autocomplete="off" /></td>
    <td class="num"><input class="amount" inputmode="decimal" autocomplete="off" /></td>
    <td class="num"><input class="docs" inputmode="numeric" autocomplete="off" /></td>
    <td><button type="button" class="del" title="删除本行">✕</button></td>`

  const amount = tr.querySelector('.amount')
  const docs = tr.querySelector('.docs')

  tr.querySelector('.fee-summary').addEventListener('input', onRowInput)
  amount.addEventListener('input', () => {
    amount.value = sanitizeAmount(amount.value)
    onRowInput()
  })
  amount.addEventListener('blur', clampAmount)
  docs.addEventListener('input', () => {
    docs.value = docs.value.replace(/\D/g, '').slice(0, 4)
    onRowInput()
  })
  tr.querySelector('.del').addEventListener('click', () => deleteRow(tr))

  els.tbody.appendChild(tr)
  return tr
}

function rowOf(tr) {
  return [
    tr.querySelector('.fee-summary').value.trim(),
    tr.querySelector('.amount').value.trim(),
    tr.querySelector('.docs').value.trim(),
  ]
}

function renumber() {
  ;[...els.tbody.children].forEach((tr, i) => {
    tr.querySelector('.seq').textContent = String(i + 1)
  })
}

// 自增：最后一行有内容时自动补一个空行
function onRowInput() {
  const rows = [...els.tbody.children]
  const last = rows[rows.length - 1]
  if (last && rowOf(last).some((v) => v !== '')) createRow()
  renumber()
  updatePreview()
}

function deleteRow(tr) {
  if (els.tbody.children.length <= 1) {
    tr.querySelectorAll('input').forEach((i) => (i.value = ''))
  } else {
    tr.remove()
  }
  renumber()
  updatePreview()
}

els.addRow.addEventListener('click', () => {
  createRow()
  renumber()
})

// ===== 金额输入处理 =====
function sanitizeAmount(raw) {
  let v = raw.replace(/[^\d.]/g, '')
  const dot = v.indexOf('.')
  if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '')
  let [ip, fp] = v.split('.')
  ip = (ip || '').replace(/^0+(?=\d)/, '')
  if (ip.length > 7) ip = ip.slice(0, 7) // 整数部分最多 7 位
  return fp === undefined ? ip : `${ip}.${fp.slice(0, 2)}` // 最多两位小数
}

function clampAmount(e) {
  const v = parseFloat(e.target.value)
  if (!Number.isNaN(v) && v > AMOUNT_MAX) e.target.value = String(AMOUNT_MAX)
  updatePreview()
}

// ===== 金额计算与格式化 =====
function toCents(v) {
  if (!v) return 0
  const [ip, fp = ''] = v.split('.')
  const i = parseInt(ip || '0', 10) || 0
  const f = parseInt((fp + '00').slice(0, 2), 10) || 0
  return i * 100 + f
}

function fmtCents(cents) {
  const yuan = Math.floor(cents / 100)
  const s = String(yuan).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${s}.${String(cents % 100).padStart(2, '0')}`
}

// ===== 人民币大写（与后端 rmb.rs 同一套规则）=====
const CNUM = '零壹贰叁肆伍陆柒捌玖'
const CUNIT = ['', '拾', '佰', '仟']
const CBIG = ['', '万', '亿']

function secToCn(s) {
  let out = ''
  let pendingZero = false
  for (let idx = 3; idx >= 0; idx--) {
    const d = Math.floor(s / 10 ** idx) % 10
    if (d > 0) {
      if (pendingZero) {
        out += '零'
        pendingZero = false
      }
      out += CNUM[d] + CUNIT[idx]
    } else if (out !== '') {
      pendingZero = true
    }
  }
  return out
}

function yuanToCn(n) {
  if (n === 0) return '零'
  const secs = []
  while (n > 0) {
    secs.push(n % 10000)
    n = Math.floor(n / 10000)
  }
  let out = ''
  for (let i = secs.length - 1; i >= 0; i--) {
    if (secs[i] === 0) continue
    if (out !== '' && secs[i] < 1000) out += '零'
    out += secToCn(secs[i]) + (CBIG[i] || '')
  }
  return out
}

function centsToUpper(cents) {
  if (cents <= 0) return '零元整'
  const yuan = Math.floor(cents / 100)
  const jiao = Math.floor(cents / 10) % 10
  const fen = cents % 10
  if (yuan === 0) {
    if (jiao === 0) return CNUM[fen] + '分'
    if (fen === 0) return CNUM[jiao] + '角整'
    return CNUM[jiao] + '角' + CNUM[fen] + '分'
  }
  let out = yuanToCn(yuan) + '元'
  if (jiao === 0 && fen === 0) out += '整'
  else if (jiao === 0) out += '零' + CNUM[fen] + '分'
  else if (fen === 0) out += CNUM[jiao] + '角整'
  else out += CNUM[jiao] + '角' + CNUM[fen] + '分'
  return out
}

// ===== 实时预览 =====
function updatePreview() {
  let total = 0
  for (const tr of els.tbody.children) total += toCents(rowOf(tr)[1])
  els.num.textContent = '¥' + fmtCents(total)
  els.cn.textContent = centsToUpper(total)
}

// ===== 成功提示（含“打开文件夹”）=====
const CHECK_SVG =
  '<svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true">' +
  '<path fill-rule="evenodd" clip-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z' +
  'm3.7-9.3a1 1 0 0 0-1.4-1.4L9 10.6 7.7 9.3a1 1 0 1 0-1.4 1.4l2 2a1 1 0 0 0 1.4 0l4-4Z"/></svg>'
const FOLDER_SVG =
  '<svg viewBox="0 0 20 20" width="13" height="13" fill="currentColor" aria-hidden="true">' +
  '<path d="M2 5.5A1.5 1.5 0 0 1 3.5 4h3.586c.398 0 .78.158 1.06.44l.86.86c.095.094.223.147.357.147h7.137A1.5 1.5 0 0 1 18 7.347v7.153a1.5 1.5 0 0 1-1.5 1.5h-13a1.5 1.5 0 0 1-1.5-1.5V5.5Z"/></svg>'

let lastGeneratedPath = ''

function escapeHtml(s) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
}

function showSuccess(path) {
  lastGeneratedPath = path
  els.status.className = 'status ok'
  els.status.innerHTML =
    CHECK_SVG +
    `<span class="path">已生成：${escapeHtml(path)}</span>` +
    `<button type="button" class="open-btn" id="openFolder">${FOLDER_SVG}打开文件夹</button>`
  document.getElementById('openFolder').addEventListener('click', openFolder)
}

async function openFolder() {
  if (!lastGeneratedPath) return
  try {
    await invoke('reveal_in_explorer', { path: lastGeneratedPath })
  } catch (e) {
    showError('无法打开文件夹：' + e)
  }
}

function clearStatus() {
  lastGeneratedPath = ''
  els.status.innerHTML = ''
  els.status.className = 'status'
}

// ===== 校验错误弹窗（强制点“确定”才能关闭）=====
function showError(msg) {
  els.modalMsg.textContent = msg
  els.modalMask.hidden = false
  els.modalOk.focus()
}

els.modalOk.addEventListener('click', () => {
  els.modalMask.hidden = true
  els.modalMsg.textContent = ''
})

function clearInvalid() {
  els.tbody.querySelectorAll('tr.invalid-row').forEach((tr) => tr.classList.remove('invalid-row'))
}

// ===== 校验：返回 null 表示通过，否则返回错误消息 =====
function validate() {
  if (!els.name.value.trim()) return '请填写姓名。'
  if (!els.date.value) return '请选择日期。'
  if (!els.department.value.trim()) return '请填写部门。'

  clearInvalid()
  const rows = [...els.tbody.children].map((tr) => rowOf(tr))
  let firstBad = 0
  rows.forEach((r, i) => {
    const filled = r.filter((v) => v !== '').length
    if (filled > 0 && filled < 3) {
      if (!firstBad) firstBad = i + 1
      els.tbody.children[i].classList.add('invalid-row')
    }
  })
  if (firstBad)
    return `第 ${firstBad} 行明细不完整：摘要、金额、附单据数需填写完整（允许整行留空）。`
  return null
}

// ===== 生成 Excel =====
function dirOf(p) {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
  return i > 0 ? p.slice(0, i) : ''
}

els.generate.addEventListener('click', async () => {
  clearStatus()
  const err = validate()
  if (err) return showError(err)
  if (!invoke) {
    showError('未检测到 Tauri 环境：请通过应用本体运行。')
    return
  }

  const rows = [...els.tbody.children].map((tr) => {
    const [summary, amount, docs] = rowOf(tr)
    return { summary, amount, docs: parseInt(docs, 10) || 0 }
  })
  if (els.deleteEmpty.checked && rows.every((r) => !r.summary && !r.amount && !r.docs)) {
    return showError('报销明细为空，请先填写报销信息。')
  }

  els.generate.disabled = true
  els.genLabel.textContent = '生成中…'
  try {
    const path = await invoke('generate_excel', {
      form: {
        name: els.name.value.trim(),
        date: els.date.value,
        department: els.department.value.trim(),
        project: els.project.value.trim(),
        rows,
        deleteEmpty: els.deleteEmpty.checked,
        lastDir: localStorage.getItem('lastSaveDir') || '',
      },
    })
    if (path) {
      const dir = dirOf(path)
      if (dir) localStorage.setItem('lastSaveDir', dir)
      showSuccess(path)
    }
  } catch (e) {
    showError('生成失败：' + e)
  } finally {
    els.generate.disabled = false
    els.genLabel.textContent = '生成 Excel 文件'
  }
})

// ===== 今天 / 重置 =====
els.todayBtn.addEventListener('click', () => {
  els.date.value = todayStr()
})

els.resetBtn.addEventListener('click', () => {
  els.name.value = ''
  els.date.value = todayStr()
  els.department.value = ''
  els.project.value = ''
  els.tbody.innerHTML = ''
  for (let i = 0; i < INITIAL_ROWS; i++) createRow()
  renumber()
  els.deleteEmpty.checked = true
  clearInvalid()
  clearStatus()
  updatePreview()
})

// 初始状态
els.date.value = todayStr()
for (let i = 0; i < INITIAL_ROWS; i++) createRow()
renumber()
updatePreview()
