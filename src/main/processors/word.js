'use strict';
const JSZip = require('jszip');
const sharp = require('sharp');
const { fs, path, baseName, uniquePath, forEachFile, ensureDir } = require('./util');
const office = require('./office');
const { loadDoc, renderPage } = require('./pdfRender');

async function loadDocx(file) {
  return JSZip.loadAsync(fs.readFileSync(file));
}

// 在单个 XML 的每个 <w:t> 文本节点内做查找替换（避免破坏标签结构）。
// 局限：若同一词被拆分到多个 run，可能漏替换（V1 说明）。
function replaceInXml(xml, find, repl) {
  let count = 0;
  const out = xml.replace(/(<w:t[^>]*>)([\s\S]*?)(<\/w:t>)/g, (m, open, body, close) => {
    if (body.includes(find)) {
      count += body.split(find).length - 1;
      body = body.split(find).join(repl);
    }
    return open + body + close;
  });
  return { xml: out, count };
}

// 1. 批量查找替换文字
async function replace({ files, outputDir, findText, replaceText }, ctx) {
  ensureDir(outputDir);
  if (!findText) throw new Error('请输入要查找的文字');
  return forEachFile(files, ctx, '替换', async (f) => {
    const zip = await loadDocx(f);
    let total = 0;
    const targets = Object.keys(zip.files).filter((n) =>
      /^word\/(document|header\d*|footer\d*)\.xml$/.test(n));
    for (const name of targets) {
      const xml = await zip.file(name).async('string');
      const r = replaceInXml(xml, findText, replaceText || '');
      total += r.count;
      zip.file(name, r.xml);
    }
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const target = uniquePath(outputDir, `${baseName(f)}_replaced`, '.docx');
    fs.writeFileSync(target, buf);
    return { output: target, replaced: total };
  });
}

// 2. 批量转 PDF（优先 LibreOffice，缺失时内置引擎回退）
async function toPdf({ files, outputDir }, ctx) {
  ensureDir(outputDir);
  return office.toPdfBatch(files, outputDir, 'word', ctx, '转PDF');
}

// 3. 批量修改页眉页脚（对现有页眉/页脚做查找替换）
// V1 局限：仅修改文档中已存在的页眉/页脚，不新建。
async function headerFooter({ files, outputDir, findText, replaceText }, ctx) {
  ensureDir(outputDir);
  if (!findText) throw new Error('请输入页眉/页脚中要替换的文字');
  return forEachFile(files, ctx, '页眉页脚', async (f) => {
    const zip = await loadDocx(f);
    const parts = Object.keys(zip.files).filter((n) =>
      /^word\/(header\d*|footer\d*)\.xml$/.test(n));
    if (!parts.length) throw new Error('该文档没有页眉/页脚，V1 暂不支持新建');
    let total = 0;
    for (const name of parts) {
      const xml = await zip.file(name).async('string');
      const r = replaceInXml(xml, findText, replaceText || '');
      total += r.count;
      zip.file(name, r.xml);
    }
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const target = uniquePath(outputDir, `${baseName(f)}_hf`, '.docx');
    fs.writeFileSync(target, buf);
    return { output: target, replaced: total };
  });
}

// 4. 批量压缩文档内图片（重新编码 word/media 下的位图）
async function compressImages({ files, outputDir, quality }, ctx) {
  ensureDir(outputDir);
  const q = Math.min(95, Math.max(30, parseInt(quality, 10) || 60));
  return forEachFile(files, ctx, '压缩图片', async (f) => {
    const zip = await loadDocx(f);
    const media = Object.keys(zip.files).filter((n) =>
      /^word\/media\/.*\.(jpe?g|png)$/i.test(n));
    let done = 0;
    for (const name of media) {
      const buf = await zip.file(name).async('nodebuffer');
      try {
        const out = /\.png$/i.test(name)
          ? await sharp(buf).png({ quality: q, compressionLevel: 9 }).toBuffer()
          : await sharp(buf).jpeg({ quality: q, mozjpeg: true }).toBuffer();
        if (out.length < buf.length) { zip.file(name, out); done++; }
      } catch (_) { /* 跳过无法解析的图片 */ }
    }
    const result = await zip.generateAsync({ type: 'nodebuffer' });
    const target = uniquePath(outputDir, `${baseName(f)}_imgmin`, '.docx');
    fs.writeFileSync(target, result);
    return { output: target, compressed: done };
  });
}

// 5. 批量导出页面为图片（先转 PDF，再光栅化）
async function toImages({ files, outputDir, format, scale }, ctx) {
  ensureDir(outputDir);
  const fmt = format === 'jpg' ? 'jpg' : 'png';
  const sc = Math.min(4, Math.max(1, parseFloat(scale) || 2));
  return forEachFile(files, ctx, '导出图片', async (f) => {
    const { buf: pdfBuf } = await office.toPdfBuffer(f, 'word');
    const doc = await loadDoc(pdfBuf);
    const sub = ensureDir(path.join(outputDir, baseName(f)));
    for (let p = 1; p <= doc.numPages; p++) {
      const canvas = await renderPage(doc, p, sc);
      const buf = fmt === 'jpg'
        ? await sharp(canvas.toBuffer('image/png')).jpeg({ quality: 90 }).toBuffer()
        : canvas.toBuffer('image/png');
      fs.writeFileSync(path.join(sub, `page_${String(p).padStart(3, '0')}.${fmt}`), buf);
    }
    return { output: sub, pages: doc.numPages };
  });
}

module.exports = { replace, toPdf, headerFooter, compressImages, toImages };
