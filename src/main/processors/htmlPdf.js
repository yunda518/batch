'use strict';
// 内置 Office→PDF 引擎（无需 LibreOffice）：HTML -> Electron printToPDF。
// 用隐藏 BrowserWindow 渲染 HTML 后导出 PDF，纯本地、零外部依赖。
const os = require('os');
const { fs, path } = require('./util');

// 把 HTML 字符串渲染为 PDF Buffer
async function htmlToPdf(html, options) {
  const { BrowserWindow } = require('electron'); // 仅主进程可用
  const tmp = path.join(os.tmpdir(), `batchdoc_${process.pid}_${Date.now()}.html`);
  fs.writeFileSync(tmp, html, 'utf8');
  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, sandbox: false, javascript: false }
  });
  try {
    await win.loadFile(tmp);
    const pdf = await win.webContents.printToPDF({
      pageSize: (options && options.pageSize) || 'A4',
      landscape: !!(options && options.landscape),
      printBackground: true,
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }
    });
    return pdf;
  } finally {
    win.destroy();
    try { fs.unlinkSync(tmp); } catch (_) { /* 忽略临时文件清理失败 */ }
  }
}

// 统一的 HTML 文档外壳（含基础排版样式，支持中文）
function wrapHtml(bodyHtml, title) {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">`
    + `<title>${title || ''}</title><style>`
    + `*{box-sizing:border-box}`
    + `body{font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;`
    + `font-size:12pt;line-height:1.6;color:#111;padding:0;margin:0}`
    + `h1,h2,h3,h4{margin:.6em 0 .3em}p{margin:.3em 0}`
    + `table{border-collapse:collapse;width:100%;margin:8px 0;font-size:10.5pt}`
    + `td,th{border:1px solid #999;padding:4px 8px;text-align:left;vertical-align:top}`
    + `img{max-width:100%}`
    + `.sheet{page-break-after:always}.sheet:last-child{page-break-after:auto}`
    + `.sheet h2{background:#f0f3fa;padding:6px 8px;border-left:4px solid #3b6ef5}`
    + `</style></head><body>${bodyHtml}</body></html>`;
}

module.exports = { htmlToPdf, wrapHtml, docxToPdf };

// ---------- 高保真 docx -> PDF ----------
// 用 docx-preview 在隐藏窗口里按 Word 版式渲染（保留表格/制表位/字体/下划线等），
// 再 printToPDF。纯本地、无需 LibreOffice。
function vendor(pkg, rel) {
  // 绕过部分包的 exports 限制：从主入口回溯到包根目录，再拼接 dist 文件
  let dir = path.dirname(require.resolve(pkg));
  for (let i = 0; i < 6; i++) {
    const pj = path.join(dir, 'package.json');
    if (fs.existsSync(pj)) {
      try { if (JSON.parse(fs.readFileSync(pj, 'utf8')).name === pkg) break; } catch (_) { /* ignore */ }
    }
    dir = path.dirname(dir);
  }
  return fs.readFileSync(path.join(dir, rel), 'utf8');
}

function buildDocxRenderHtml() {
  const jszip = vendor('jszip', 'dist/jszip.min.js');
  const docxp = vendor('docx-preview', 'dist/docx-preview.min.js');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:#fff}
    .docx-wrapper{background:#fff!important;padding:0!important}
    .docx-wrapper>section.docx{box-shadow:none!important;margin:0 auto!important}
  </style>
  <script>${jszip}</script>
  <script>${docxp}</script>
  </head><body><div id="container"></div>
  <script>
    window.__render = function(b64){
      var bin = atob(b64), bytes = new Uint8Array(bin.length);
      for (var i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
      return docx.renderAsync(bytes, document.getElementById('container'), null, {
        className:'docx', inWrapper:true, breakPages:true,
        ignoreLastRenderedPageBreak:false, experimental:true,
        useBase64URL:true, renderHeaders:true, renderFooters:true
      }).then(function(){ return true; });
    };
  </script></body></html>`;
}

async function docxToPdf(file) {
  const { BrowserWindow } = require('electron');
  const tmp = path.join(os.tmpdir(), `batchdoc_docx_${process.pid}_${Date.now()}.html`);
  fs.writeFileSync(tmp, buildDocxRenderHtml(), 'utf8');
  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, sandbox: false, contextIsolation: false }
  });
  try {
    await win.loadFile(tmp);
    const b64 = fs.readFileSync(file).toString('base64');
    await win.webContents.executeJavaScript(`window.__render(${JSON.stringify(b64)})`, true);
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      pageSize: 'A4',
      margins: { marginType: 'none' }
    });
    return pdf;
  } finally {
    win.destroy();
    try { fs.unlinkSync(tmp); } catch (_) { /* 忽略 */ }
  }
}
