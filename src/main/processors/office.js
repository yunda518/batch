'use strict';
// Office -> PDF 转换：优先本地 LibreOffice（高保真），未安装时自动回退到
// 内置引擎（docx 用 docx-preview 按 Word 版式渲染、xlsx 用 exceljs 转表格，
// 再经 Electron printToPDF 导出），纯本地零外部依赖。
const util = require('util');
const { fs, path, baseName, uniquePath, forEachFile } = require('./util');
const { htmlToPdf, wrapHtml, docxToPdf } = require('./htmlPdf');

let libre = null;
function getLibre() {
  if (!libre) libre = require('libreoffice-convert');
  return libre;
}

const NO_SOFFICE_MSG =
  '未检测到本地 LibreOffice，无法进行 Office 文档转换。请安装 LibreOffice 后重试' +
  '（Mac: 下载 LibreOffice.app；Windows: 安装 LibreOffice）。';

function isNoSoffice(err) {
  const msg = String(err && err.message ? err.message : err);
  return /soffice|ENOENT|not found|command|LibreOffice/i.test(msg);
}

// 调用 LibreOffice 转换 buffer（无 soffice 时抛出可识别错误）
function convertBuffer(buf, ext) {
  const convert = util.promisify(getLibre().convert);
  return convert(buf, `.${ext}`, undefined).catch((err) => {
    if (isNoSoffice(err)) throw new Error(NO_SOFFICE_MSG);
    throw err;
  });
}

// 内置引擎：docx -> PDF（docx-preview 按 Word 版式高保真渲染后打印）
async function wordToPdfBuiltin(file) {
  return docxToPdf(file);
}

// 内置引擎：xlsx -> PDF（exceljs 转 HTML 表格再打印，横向更适合宽表）
async function excelToPdfBuiltin(file) {
  const wb = await require('./csvio').readWorkbook(file);
  const esc = (v) => String(v == null ? '' : v)
    .replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  let body = '';
  wb.worksheets.forEach((ws) => {
    body += `<div class="sheet"><h2>${esc(ws.name)}</h2><table>`;
    ws.eachRow({ includeEmpty: false }, (row) => {
      body += '<tr>';
      row.eachCell({ includeEmpty: true }, (cell) => {
        const v = cell.value && cell.value.result !== undefined ? cell.value.result : cell.value;
        body += `<td>${esc(v)}</td>`;
      });
      body += '</tr>';
    });
    body += '</table></div>';
  });
  return htmlToPdf(wrapHtml(body, baseName(file)), { landscape: true });
}

// 对外：返回 { buf, engine }，engine 为 'libreoffice' 或 'builtin'
async function toPdfBuffer(file, kind) {
  try {
    const buf = await convertBuffer(fs.readFileSync(file), 'pdf');
    return { buf, engine: 'libreoffice' };
  } catch (err) {
    if (!isNoSoffice(err)) throw err;
    const buf = kind === 'excel' ? await excelToPdfBuiltin(file) : await wordToPdfBuiltin(file);
    return { buf, engine: 'builtin' };
  }
}

// 批量 Office -> PDF，带引擎回退
async function toPdfBatch(files, outputDir, kind, ctx, label) {
  return forEachFile(files, ctx, label || '转PDF', async (f) => {
    const { buf, engine } = await toPdfBuffer(f, kind);
    const target = uniquePath(outputDir, baseName(f), '.pdf');
    fs.writeFileSync(target, buf);
    return { output: target, engine };
  });
}

module.exports = {
  convertBuffer, toPdfBuffer, toPdfBatch, NO_SOFFICE_MSG, isNoSoffice
};
