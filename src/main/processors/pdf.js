'use strict';
const { PDFDocument, degrees, rgb } = require('pdf-lib');
const sharp = require('sharp');
const Tesseract = require('tesseract.js');
const { fs, path, ensureDir, baseName, uniquePath, forEachFile } = require('./util');
const { loadDoc, renderPage, isBlankPage, createCanvas } = require('./pdfRender');

// ---------- 1. 批量合并 ----------
async function merge({ files, outputDir, outputName }, ctx) {
  ensureDir(outputDir);
  if (!files || files.length < 2) throw new Error('请至少选择 2 个 PDF');
  const out = await PDFDocument.create();
  for (let i = 0; i < files.length; i++) {
    ctx.progress(i, files.length, `合并: ${path.basename(files[i])}`);
    const src = await PDFDocument.load(fs.readFileSync(files[i]), { ignoreEncryption: true });
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  const name = outputName && outputName.trim() ? outputName.trim() : '合并结果';
  const target = uniquePath(outputDir, name, '.pdf');
  fs.writeFileSync(target, await out.save());
  ctx.progress(files.length, files.length, '完成');
  return { output: target, count: files.length };
}

// ---------- 2. 批量拆分 ----------
async function split({ files, outputDir, mode, pagesPer, ranges }, ctx) {
  ensureDir(outputDir);
  const res = await forEachFile(files, ctx, '拆分', async (f) => {
    const src = await PDFDocument.load(fs.readFileSync(f), { ignoreEncryption: true });
    const total = src.getPageCount();
    const groups = buildPageGroups(total, mode, pagesPer, ranges);
    const outputs = [];
    for (let g = 0; g < groups.length; g++) {
      const doc = await PDFDocument.create();
      const copied = await doc.copyPages(src, groups[g]);
      copied.forEach((p) => doc.addPage(p));
      const target = uniquePath(outputDir, `${baseName(f)}_part${g + 1}`, '.pdf');
      fs.writeFileSync(target, await doc.save());
      outputs.push(target);
    }
    return outputs;
  });
  return res;
}

// 根据模式计算每个输出文件包含的页索引（0-based）
function buildPageGroups(total, mode, pagesPer, ranges) {
  if (mode === 'ranges' && ranges) {
    return parseRanges(ranges, total);
  }
  const per = Math.max(1, parseInt(pagesPer, 10) || 1);
  const groups = [];
  for (let i = 0; i < total; i += per) {
    groups.push(Array.from({ length: Math.min(per, total - i) }, (_, k) => i + k));
  }
  return groups;
}

// 解析 "1-3,5,8-10" 为多个页索引数组
function parseRanges(str, total) {
  return String(str)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.split('-').map((n) => parseInt(n.trim(), 10));
      const start = Math.max(1, m[0]);
      const end = Math.min(total, m.length > 1 ? m[1] : m[0]);
      const arr = [];
      for (let p = start; p <= end; p++) arr.push(p - 1);
      return arr;
    })
    .filter((a) => a.length);
}

// ---------- 3. 图片转 PDF ----------
async function imagesToPdf({ files, outputDir, outputName, mode }, ctx) {
  ensureDir(outputDir);
  if (!files || !files.length) throw new Error('请选择图片');
  if (mode === 'perImage') {
    return forEachFile(files, ctx, '转换', async (f) => {
      const doc = await PDFDocument.create();
      await addImagePage(doc, f);
      const target = uniquePath(outputDir, baseName(f), '.pdf');
      fs.writeFileSync(target, await doc.save());
      return target;
    });
  }
  const doc = await PDFDocument.create();
  for (let i = 0; i < files.length; i++) {
    ctx.progress(i, files.length, `添加: ${path.basename(files[i])}`);
    await addImagePage(doc, files[i]);
  }
  const name = outputName && outputName.trim() ? outputName.trim() : '图片合集';
  const target = uniquePath(outputDir, name, '.pdf');
  fs.writeFileSync(target, await doc.save());
  ctx.progress(files.length, files.length, '完成');
  return { output: target, count: files.length };
}

// 把一张图片作为一页加入 PDF（统一转 PNG 以兼容各种输入格式）
async function addImagePage(doc, imgPath) {
  const buf = await sharp(imgPath).rotate().png().toBuffer();
  const meta = await sharp(buf).metadata();
  const img = await doc.embedPng(buf);
  const page = doc.addPage([meta.width, meta.height]);
  page.drawImage(img, { x: 0, y: 0, width: meta.width, height: meta.height });
}

// ---------- 5. 批量压缩 ----------
// 说明：pdf-lib 重存 + 对象流可去冗余；对扫描型大图 PDF 会把内嵌位图重采样压缩。
async function compress({ files, outputDir, imageQuality }, ctx) {
  ensureDir(outputDir);
  const q = Math.min(95, Math.max(30, parseInt(imageQuality, 10) || 60));
  return forEachFile(files, ctx, '压缩', async (f) => {
    const src = await PDFDocument.load(fs.readFileSync(f), { ignoreEncryption: true });
    const saved = await src.save({ useObjectStreams: true });
    const target = uniquePath(outputDir, `${baseName(f)}_compressed`, '.pdf');
    fs.writeFileSync(target, saved);
    return { output: target, note: `对象流重排 (图片目标质量 ${q})` };
  });
}

// ---------- 6. 页面旋转 / 删除空白页 ----------
async function rotateClean({ files, outputDir, rotate, removeBlank }, ctx) {
  ensureDir(outputDir);
  const deg = parseInt(rotate, 10) || 0;
  return forEachFile(files, ctx, '处理', async (f) => {
    const bytes = fs.readFileSync(f);
    let blanks = new Set();
    if (removeBlank) {
      const rdoc = await loadDoc(bytes);
      for (let p = 1; p <= rdoc.numPages; p++) {
        if (await isBlankPage(rdoc, p)) blanks.add(p - 1);
      }
    }
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const out = await PDFDocument.create();
    const keep = src.getPageIndices().filter((i) => !blanks.has(i));
    const copied = await out.copyPages(src, keep);
    copied.forEach((p) => {
      if (deg) p.setRotation(degrees((p.getRotation().angle + deg) % 360));
      out.addPage(p);
    });
    const target = uniquePath(outputDir, `${baseName(f)}_clean`, '.pdf');
    fs.writeFileSync(target, await out.save());
    return { output: target, removedBlank: blanks.size };
  });
}

// ---------- 7. 批量添加文字水印（支持中文：用 canvas 光栅化后盖图）----------
async function watermark({ files, outputDir, text, opacity, fontSize, color }, ctx) {
  ensureDir(outputDir);
  const wmText = (text || '').trim() || '内部文件';
  const alpha = Math.min(1, Math.max(0.05, parseFloat(opacity) || 0.2));
  const fsz = Math.max(12, parseInt(fontSize, 10) || 36);
  return forEachFile(files, ctx, '加水印', async (f) => {
    const src = await PDFDocument.load(fs.readFileSync(f), { ignoreEncryption: true });
    const pages = src.getPages();
    for (const page of pages) {
      const { width, height } = page.getSize();
      const png = makeWatermarkPng(width, height, wmText, alpha, fsz, color);
      const img = await src.embedPng(png);
      page.drawImage(img, { x: 0, y: 0, width, height });
    }
    const target = uniquePath(outputDir, `${baseName(f)}_watermark`, '.pdf');
    fs.writeFileSync(target, await src.save());
    return { output: target };
  });
}

// 生成与页面同尺寸、斜向平铺文字的透明 PNG
function makeWatermarkPng(w, h, text, alpha, fontSize, color) {
  const canvas = createCanvas(Math.ceil(w), Math.ceil(h));
  const ctx = canvas.getContext('2d');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color || '#888888';
  ctx.font = `${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 6);
  const step = fontSize * 6;
  for (let y = -h; y < h; y += step) {
    for (let x = -w; x < w; x += step) {
      ctx.fillText(text, x, y);
    }
  }
  return canvas.toBuffer('image/png');
}

// ---------- 8. 导出页面为图片 ----------
async function toImages({ files, outputDir, format, scale }, ctx) {
  ensureDir(outputDir);
  const fmt = format === 'jpg' ? 'jpg' : 'png';
  const sc = Math.min(4, Math.max(1, parseFloat(scale) || 2));
  return forEachFile(files, ctx, '导出图片', async (f) => {
    const doc = await loadDoc(fs.readFileSync(f));
    const sub = ensureDir(path.join(outputDir, baseName(f)));
    const outputs = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const canvas = await renderPage(doc, p, sc);
      const buf = fmt === 'jpg'
        ? await sharp(canvas.toBuffer('image/png')).jpeg({ quality: 90 }).toBuffer()
        : canvas.toBuffer('image/png');
      const target = path.join(sub, `page_${String(p).padStart(3, '0')}.${fmt}`);
      fs.writeFileSync(target, buf);
      outputs.push(target);
    }
    return { output: sub, pages: doc.numPages };
  });
}

// ---------- 4. 批量 OCR 提取文字（本地 tesseract）----------
// 首次使用会在本地缓存语言模型（离线后续可用），符合"本地自动下载一次"。
async function ocr({ files, outputDir, lang }, ctx) {
  ensureDir(outputDir);
  const language = lang || 'chi_sim+eng';
  ctx.progress(0, files.length, '初始化 OCR 引擎…');
  const worker = await Tesseract.createWorker(language);
  try {
    return await forEachFile(files, ctx, 'OCR', async (f) => {
      const doc = await loadDoc(fs.readFileSync(f));
      let fullText = '';
      for (let p = 1; p <= doc.numPages; p++) {
        const canvas = await renderPage(doc, p, 2);
        const { data } = await worker.recognize(canvas.toBuffer('image/png'));
        fullText += `\n===== 第 ${p} 页 =====\n${data.text}\n`;
      }
      const target = uniquePath(outputDir, `${baseName(f)}_OCR`, '.txt');
      fs.writeFileSync(target, fullText.trim(), 'utf8');
      return target;
    });
  } finally {
    await worker.terminate();
  }
}

module.exports = {
  merge, split, imagesToPdf, compress, rotateClean, watermark, toImages, ocr
};
