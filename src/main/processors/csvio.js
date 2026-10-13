'use strict';
// CSV 读取：自动识别编码（UTF-8 / UTF-16 / GBK/GB2312 等中文编码）后再解析，
// 避免 Excel 导出的中文 CSV 出现乱码。xlsx 直接走 exceljs。
const ExcelJS = require('exceljs');
const iconv = require('iconv-lite');
const jschardet = require('jschardet');
const { Readable } = require('stream');
const { fs } = require('./util');

// 把文件 buffer 解码为 UTF-8 字符串
function decodeBuffer(buf) {
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    return buf.slice(3).toString('utf8'); // 去掉 UTF-8 BOM
  }
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) return iconv.decode(buf, 'utf16le');
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) return iconv.decode(buf, 'utf16be');

  const det = jschardet.detect(buf);
  let enc = det && det.encoding ? det.encoding.toLowerCase() : '';
  // 中文常见编码统一用 gb18030（GBK/GB2312 的超集）解码
  if (/gb2312|gbk|gb18030|big5|windows-1252|iso-8859/.test(enc)) enc = 'gb18030';
  if (!enc || /ascii|utf-?8/.test(enc)) {
    const utf8 = buf.toString('utf8');
    // UTF-8 解码若出现替换字符，说明不是 UTF-8，回退 GBK
    if (!utf8.includes('\uFFFD')) return utf8;
    enc = 'gb18030';
  }
  try { return iconv.decode(buf, enc); } catch (_) { return iconv.decode(buf, 'gb18030'); }
}

// 读取工作簿：.csv 自动识别编码，其余按 xlsx
async function readWorkbook(file) {
  const wb = new ExcelJS.Workbook();
  if (/\.csv$/i.test(file)) {
    const text = decodeBuffer(fs.readFileSync(file));
    // exceljs 的 csv.read 会自动创建名为 "sheet1" 的工作表，无需再改名
    // （改成同名/仅大小写不同的名字会触发工作表重名错误）。
    await wb.csv.read(Readable.from([text]));
  } else {
    await wb.xlsx.readFile(file);
  }
  return wb;
}

module.exports = { readWorkbook, decodeBuffer };
