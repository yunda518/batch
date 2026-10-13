'use strict';
// IPC 路由：把渲染层发来的 task 分发到对应处理器，并统一错误/进度处理。
const pdf = require('./processors/pdf');
const word = require('./processors/word');
const excel = require('./processors/excel');
const image = require('./processors/image');
const file = require('./processors/file');
const text = require('./processors/text');

// task 名 -> 处理函数。处理函数签名 (payload, ctx) => Promise<result>
const registry = {
  // PDF
  'pdf.merge': pdf.merge,
  'pdf.split': pdf.split,
  'pdf.imagesToPdf': pdf.imagesToPdf,
  'pdf.ocr': pdf.ocr,
  'pdf.compress': pdf.compress,
  'pdf.rotateClean': pdf.rotateClean,
  'pdf.watermark': pdf.watermark,
  'pdf.toImages': pdf.toImages,
  // Word
  'word.replace': word.replace,
  'word.toPdf': word.toPdf,
  'word.headerFooter': word.headerFooter,
  'word.compressImages': word.compressImages,
  'word.toImages': word.toImages,
  // Excel
  'excel.mergeSheets': excel.mergeSheets,
  'excel.modifyCells': excel.modifyCells,
  'excel.splitSheets': excel.splitSheets,
  'excel.toPdf': excel.toPdf,
  'excel.clearFormat': excel.clearFormat,
  // 通用
  'file.rename': file.rename,
  'image.compress': image.compress,
  'image.convert': image.convert,
  'text.merge': text.merge,
  'text.replace': text.replace
};

function registerHandlers(ipcMain) {
  ipcMain.handle('task:run', async (event, { task, payload }) => {
    const fn = registry[task];
    if (!fn) return { ok: false, error: `未知任务: ${task}` };

    const ctx = {
      // 进度回报
      progress: (current, total, label) =>
        event.sender.send('task:progress', { current, total, label })
    };

    try {
      const data = await fn(payload || {}, ctx);
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });
}

module.exports = { registerHandlers, registry };
