'use strict';
// 使用 pdfjs-dist(legacy ESM) + @napi-rs/canvas 在主进程把 PDF 页面光栅化。
// pdfjs v4 为 ESM，CJS 中通过 dynamic import 加载。
const { createCanvas } = require('@napi-rs/canvas');

let _pdfjs = null;
async function getPdfjs() {
  if (_pdfjs) return _pdfjs;
  _pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return _pdfjs;
}

// 打开一个 PDF，返回 pdfjs document
async function loadDoc(data) {
  const pdfjs = await getPdfjs();
  const task = pdfjs.getDocument({
    data: new Uint8Array(data),
    useSystemFonts: true,
    disableFontFace: true
  });
  return task.promise;
}

// 渲染指定页为 canvas（scale 控制清晰度 / DPI）
async function renderPage(doc, pageNum, scale) {
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale: scale || 2 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');
  // 白底，避免透明背景导出成黑色
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}

// 判断某页是否近似空白：低分辨率渲染后统计非白像素比例
async function isBlankPage(doc, pageNum) {
  const canvas = await renderPage(doc, pageNum, 0.5);
  const ctx = canvas.getContext('2d');
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let nonWhite = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) nonWhite++;
  }
  const ratio = nonWhite / (data.length / 4);
  return ratio < 0.002; // 非白像素低于 0.2% 视为空白
}

module.exports = { getPdfjs, loadDoc, renderPage, isBlankPage, createCanvas };
