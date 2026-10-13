'use strict';
// 无需 Electron 的处理器自测：生成样例 -> 跑纯本地处理 -> 断言产物存在。
// Office(LibreOffice)/OCR(模型) 相关功能需外部依赖，自动跳过并提示。
const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');
const sharp = require('sharp');
const ExcelJS = require('exceljs');

const ROOT = __dirname;
const SAMP = path.join(ROOT, 'samples');
const OUT = path.join(ROOT, 'out');
const ctx = { progress: () => {} };
let pass = 0, fail = 0;

function ok(cond, name) {
  if (cond) { pass++; console.log('  ✔', name); }
  else { fail++; console.log('  ✖', name); }
}
function exists(p) { try { return fs.statSync(p).size >= 0; } catch { return false; } }

async function makeSamples() {
  fs.rmSync(SAMP, { recursive: true, force: true });
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(SAMP, { recursive: true });
  // 两个多页 PDF
  for (const nm of ['a', 'b']) {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 3; i++) {
      const pg = doc.addPage([400, 500]);
      pg.drawText(`${nm} page ${i + 1}`, { x: 50, y: 440, size: 24, color: rgb(0, 0, 0) });
    }
    fs.writeFileSync(path.join(SAMP, `${nm}.pdf`), await doc.save());
  }
  // 图片
  await sharp({ create: { width: 200, height: 150, channels: 3, background: '#4477cc' } })
    .jpeg().toFile(path.join(SAMP, 'img1.jpg'));
  await sharp({ create: { width: 180, height: 120, channels: 4, background: '#cc5577' } })
    .png().toFile(path.join(SAMP, 'img2.png'));
  // Excel
  const wb = new ExcelJS.Workbook();
  const ws1 = wb.addWorksheet('Sheet1'); ws1.addRow(['姓名', '张三']); ws1.addRow(['城市', '北京']);
  const ws2 = wb.addWorksheet('Sheet2'); ws2.addRow(['item', 'value']);
  await wb.xlsx.writeFile(path.join(SAMP, 'book.xlsx'));
  // TXT
  fs.writeFileSync(path.join(SAMP, 't1.txt'), 'hello 北京\nfoo bar', 'utf8');
  fs.writeFileSync(path.join(SAMP, 't2.txt'), 'world 北京\nbaz', 'utf8');
}

module.exports = { ROOT, SAMP, OUT, ctx, ok, exists, makeSamples, run: main };
// __TEST_MAIN__

const pdf = require('../src/main/processors/pdf');
const image = require('../src/main/processors/image');
const excel = require('../src/main/processors/excel');
const text = require('../src/main/processors/text');
const file = require('../src/main/processors/file');

const P = (...a) => path.join(SAMP, ...a);

async function main() {
  await makeSamples();
  const pdfs = [P('a.pdf'), P('b.pdf')];
  const imgs = [P('img1.jpg'), P('img2.png')];

  console.log('\n[PDF]');
  let r = await pdf.merge({ files: pdfs, outputDir: path.join(OUT, 'merge'), outputName: 'm' }, ctx);
  ok(exists(r.output), 'merge 输出');
  r = await pdf.split({ files: [P('a.pdf')], outputDir: path.join(OUT, 'split'), mode: 'perPages', pagesPer: 1 }, ctx);
  ok(r.success[0].output.length === 3, 'split 按页数 => 3 份');
  r = await pdf.imagesToPdf({ files: imgs, outputDir: path.join(OUT, 'img2pdf'), mode: 'single', outputName: 'imgs' }, ctx);
  ok(exists(r.output), 'imagesToPdf 单文件');
  r = await pdf.compress({ files: pdfs, outputDir: path.join(OUT, 'compress') }, ctx);
  ok(r.success.length === 2, 'compress 2 文件');
  r = await pdf.rotateClean({ files: [P('a.pdf')], outputDir: path.join(OUT, 'rot'), rotate: '90', removeBlank: true }, ctx);
  ok(exists(r.success[0].output.output), 'rotateClean 输出');
  r = await pdf.watermark({ files: [P('a.pdf')], outputDir: path.join(OUT, 'wm'), text: '内部文件', opacity: 0.2, fontSize: 36 }, ctx);
  ok(exists(r.success[0].output.output), 'watermark(中文) 输出');
  r = await pdf.toImages({ files: [P('a.pdf')], outputDir: path.join(OUT, 'pdf2img'), format: 'png', scale: 2 }, ctx);
  ok(r.success[0].output.pages === 3, 'toImages => 3 页');

  console.log('\n[图片]');
  r = await image.convert({ files: imgs, outputDir: path.join(OUT, 'conv'), target: 'webp' }, ctx);
  ok(r.success.length === 2 && /\.webp$/.test(r.success[0].output), 'convert => webp');
  r = await image.compress({ files: [P('img1.jpg')], outputDir: path.join(OUT, 'imgmin'), quality: 50 }, ctx);
  ok(exists(r.success[0].output), 'image.compress 输出');

  console.log('\n[Excel]');
  r = await excel.mergeSheets({ files: [P('book.xlsx')], outputDir: path.join(OUT, 'xmerge'), outputName: 'xm', mode: 'perSheet' }, ctx);
  ok(exists(r.output) && r.sheets === 2, 'excel.mergeSheets 每文件各表 => 2 sheet');
  r = await excel.mergeSheets({ files: [P('book.xlsx'), P('book.xlsx')], outputDir: path.join(OUT, 'xstack'), outputName: 'xs', mode: 'stack', byHeader: false }, ctx);
  ok(exists(r.output) && r.rows > 0, 'excel.mergeSheets 堆叠为一张表');
  r = await excel.modifyCells({ files: [P('book.xlsx')], outputDir: path.join(OUT, 'xmod'), findText: '北京', replaceText: '上海' }, ctx);
  ok(r.success[0].output.changed === 1, 'excel.modifyCells 改 1 处');
  r = await excel.splitSheets({ files: [P('book.xlsx')], outputDir: path.join(OUT, 'xsplit') }, ctx);
  ok(r.success[0].output.files === 2, 'excel.splitSheets => 2 文件');
  r = await excel.clearFormat({ files: [P('book.xlsx')], outputDir: path.join(OUT, 'xclear') }, ctx);
  ok(exists(r.success[0].output), 'excel.clearFormat 输出');

  console.log('\n[通用]');
  r = await text.merge({ files: [P('t1.txt'), P('t2.txt')], outputDir: path.join(OUT, 'tmerge'), outputName: 'all', addSeparator: true }, ctx);
  ok(exists(r.output), 'text.merge 输出');
  r = await text.replace({ files: [P('t1.txt')], outputDir: path.join(OUT, 'trep'), findText: '北京', replaceText: 'BJ' }, ctx);
  ok(r.success[0].output.replaced === 1, 'text.replace 替换 1 处');
  r = await file.rename({ files: imgs, outputDir: path.join(OUT, 'ren'), prefix: 'IMG_', startNumber: 1, numberDigits: 3 }, ctx);
  ok(r.success.length === 2 && /IMG_001/.test(r.success[0].output), 'file.rename 前缀+序号');

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('测试异常:', e); process.exit(1); });
