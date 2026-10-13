'use strict';
// 渲染层主逻辑：由 window.FEATURES 配置驱动，统一文件选择/参数/进度/结果流程。
const state = { feature: null, files: [], outputDir: '' };

const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};

// ---------- 侧边导航 ----------
function buildNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = '';
  window.FEATURES.forEach((grp) => {
    const g = el('div', 'nav-group');
    g.appendChild(el('div', 'nav-group-title', grp.group));
    grp.items.forEach((item) => {
      const a = el('div', 'nav-item', item.title);
      a.dataset.id = item.id;
      a.onclick = () => selectFeature(item);
      g.appendChild(a);
    });
    nav.appendChild(g);
  });
}

function setActiveNav(id) {
  document.querySelectorAll('.nav-item').forEach((n) => {
    n.classList.toggle('active', n.dataset.id === id);
  });
}

// ---------- 选择功能 ----------
function selectFeature(feature) {
  state.feature = feature;
  state.files = [];
  setActiveNav(feature.id);
  document.getElementById('feature-title').textContent = feature.title;
  document.getElementById('feature-desc').textContent = feature.desc;
  renderBody();
}

// ---------- 渲染功能主体 ----------
function renderBody() {
  const body = document.getElementById('feature-body');
  body.innerHTML = '';
  const f = state.feature;

  // 1) 文件选择卡片
  const fileCard = el('div', 'card');
  fileCard.appendChild(el('h3', null, '① 选择文件'));
  const bar = el('div', 'filebar');
  const pick = el('button', 'btn primary', '选择文件…');
  pick.onclick = pickFiles;
  const clear = el('button', 'btn ghost', '清空');
  clear.onclick = () => { state.files = []; renderFileList(); };
  bar.append(pick, clear);
  fileCard.appendChild(bar);
  const list = el('div', 'filelist');
  list.id = 'filelist';
  fileCard.appendChild(list);
  body.appendChild(fileCard);

  // 2) 参数卡片
  if (f.fields && f.fields.length) {
    const pCard = el('div', 'card');
    pCard.appendChild(el('h3', null, '② 设置参数'));
    pCard.id = 'param-card';
    f.fields.forEach((fld) => pCard.appendChild(renderField(fld)));
    body.appendChild(pCard);
    applyShowWhen();
  }

  // 3) 输出与执行卡片
  const runCard = el('div', 'card');
  runCard.appendChild(el('h3', null, (f.fields && f.fields.length ? '③' : '②') + ' 输出并开始'));
  const outDir = el('div', 'out-dir');
  const chooseDir = el('button', 'btn', '选择输出文件夹…');
  chooseDir.onclick = pickDir;
  const dirPath = el('div', 'path', state.outputDir || '未选择（默认与来源同级 output 文件夹）');
  dirPath.id = 'out-dir-path';
  outDir.append(chooseDir, dirPath);
  runCard.appendChild(outDir);

  const actions = el('div', 'actions');
  const runBtn = el('button', 'btn primary', '开始处理');
  runBtn.id = 'run-btn';
  runBtn.onclick = run;
  actions.appendChild(runBtn);
  runCard.appendChild(actions);

  const prog = el('div', 'progress-wrap');
  prog.id = 'progress-wrap';
  prog.style.display = 'none';
  prog.innerHTML = '<div class="progress-bar"><div class="progress-fill" id="pfill"></div></div>'
    + '<div class="progress-label" id="plabel"></div>';
  runCard.appendChild(prog);
  runCard.appendChild(el('div', 'result', '')).id = 'result';
  body.appendChild(runCard);

  renderFileList();
}

// 渲染单个表单字段
function renderField(fld) {
  const wrap = el('div', fld.type === 'checkbox' ? 'field inline' : 'field');
  wrap.dataset.key = fld.key;
  if (fld.type === 'checkbox') {
    const input = el('input');
    input.type = 'checkbox';
    input.id = 'f_' + fld.key;
    input.checked = !!fld.default;
    wrap.append(input, el('label', null, fld.label));
    wrap.querySelector('label').htmlFor = input.id;
    return wrap;
  }
  wrap.appendChild(el('label', null, fld.label + (fld.required ? ' *' : '')));
  let input;
  if (fld.type === 'select') {
    input = el('select');
    fld.options.forEach((o) => {
      const opt = el('option', null, o.t);
      opt.value = o.v;
      if (o.v === fld.default) opt.selected = true;
      input.appendChild(opt);
    });
    input.onchange = applyShowWhen;
  } else {
    input = el('input');
    input.type = fld.type === 'number' ? 'number' : 'text';
    if (fld.default !== undefined) input.value = fld.default;
    if (fld.placeholder) input.placeholder = fld.placeholder;
  }
  input.id = 'f_' + fld.key;
  wrap.appendChild(input);
  if (fld.hint) wrap.appendChild(el('div', 'hint', fld.hint));
  return wrap;
}

// 根据 showWhen 条件显示/隐藏字段
function applyShowWhen() {
  const f = state.feature;
  if (!f.fields) return;
  f.fields.forEach((fld) => {
    if (!fld.showWhen) return;
    const row = document.querySelector(`.field[data-key="${fld.key}"]`);
    if (!row) return;
    const match = Object.entries(fld.showWhen).every(([k, v]) => getFieldValue(k) === v);
    row.style.display = match ? '' : 'none';
  });
}

function getFieldValue(key) {
  const node = document.getElementById('f_' + key);
  if (!node) return undefined;
  if (node.type === 'checkbox') return node.checked;
  return node.value;
}

// ---------- 文件列表 ----------
function renderFileList() {
  const list = document.getElementById('filelist');
  if (!list) return;
  list.innerHTML = '';
  state.files.forEach((f, i) => {
    const row = el('div', 'file-row');
    row.appendChild(el('span', null, f.split(/[\\/]/).pop()));
    const rm = el('span', 'rm', '✕');
    rm.onclick = () => { state.files.splice(i, 1); renderFileList(); };
    row.appendChild(rm);
    list.appendChild(row);
  });
}

async function pickFiles() {
  const picked = await window.api.pickFiles(state.feature.accept);
  picked.forEach((p) => { if (!state.files.includes(p)) state.files.push(p); });
  renderFileList();
}

async function pickDir() {
  const dir = await window.api.pickDir();
  if (dir) {
    state.outputDir = dir;
    document.getElementById('out-dir-path').textContent = dir;
  }
}

// 收集参数 payload
function collectPayload() {
  const payload = { files: state.files.slice(), outputDir: state.outputDir };
  (state.feature.fields || []).forEach((fld) => {
    payload[fld.key] = getFieldValue(fld.key);
  });
  return payload;
}

// 默认输出目录：来源文件所在目录下的 output 子目录
function defaultOutputDir() {
  const first = state.files[0] || '';
  const sep = first.includes('\\') ? '\\' : '/';
  const dir = first.slice(0, first.lastIndexOf(sep));
  return dir ? dir + sep + 'output' : '';
}

// ---------- 执行 ----------
async function run() {
  const f = state.feature;
  if (!state.files.length) return toast('请先选择文件', 'err');

  for (const fld of f.fields || []) {
    if (fld.required && !getFieldValue(fld.key)) {
      return toast(`请填写：${fld.label}`, 'err');
    }
  }

  const payload = collectPayload();
  if (!payload.outputDir) payload.outputDir = defaultOutputDir();
  if (!payload.outputDir) return toast('无法确定输出目录，请手动选择', 'err');

  const runBtn = document.getElementById('run-btn');
  const prog = document.getElementById('progress-wrap');
  const fill = document.getElementById('pfill');
  const plabel = document.getElementById('plabel');
  const result = document.getElementById('result');
  runBtn.disabled = true;
  runBtn.textContent = '处理中…';
  prog.style.display = 'block';
  result.innerHTML = '';
  fill.style.width = '0%';

  const off = window.api.onProgress(({ current, total, label }) => {
    const pct = total ? Math.round((current / total) * 100) : 0;
    fill.style.width = pct + '%';
    plabel.textContent = `${label || ''} (${current}/${total})`;
  });

  const res = await window.api.run(f.id, payload);
  off();
  runBtn.disabled = false;
  runBtn.textContent = '开始处理';

  if (!res.ok) {
    plabel.textContent = '处理失败';
    result.innerHTML = `<span class="fail">✖ ${escapeHtml(res.error)}</span>`;
    toast(res.error, 'err');
    return;
  }
  showResult(res.data, payload.outputDir);
}

function showResult(data, outputDir) {
  const result = document.getElementById('result');
  let okCount = 0, failList = [];
  if (data && Array.isArray(data.success)) {
    okCount = data.success.length;
    failList = data.failed || [];
  } else {
    okCount = 1;
  }
  let html = `<span class="ok">✔ 成功 ${okCount} 项</span>`;
  if (failList.length) {
    html += ` <span class="fail">失败 ${failList.length} 项</span><ul>`;
    failList.forEach((x) => {
      html += `<li>${escapeHtml(x.input.split(/[\\/]/).pop())}：${escapeHtml(x.error)}</li>`;
    });
    html += '</ul>';
  }
  html += `<div class="actions"><button class="btn" id="open-out">打开输出目录</button></div>`;
  result.innerHTML = html;
  document.getElementById('open-out').onclick = () => window.api.openPath(outputDir);
  toast('处理完成', 'ok');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ---------- 轻提示 ----------
function toast(msg, type) {
  const box = document.getElementById('toast');
  const item = el('div', 'toast-item ' + (type || ''), escapeHtml(msg));
  box.appendChild(item);
  setTimeout(() => item.remove(), 3200);
}

// ---------- 初始化 ----------
function showWelcome() {
  document.getElementById('feature-body').innerHTML =
    '<div class="card welcome">👈 从左侧选择功能开始。<br><br>'
    + '<b>隐私承诺：</b>所有文件均在本机 CPU 处理，<b>不会上传互联网</b>。<br>'
    + '<b>使用流程：</b>选择文件 → 设置参数 → 选择输出目录 → 开始处理 → 打开结果。</div>';
}

buildNav();
showWelcome();
