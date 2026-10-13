'use strict';
const ExcelJS = require('exceljs');
const { path, ensureDir, baseName, uniquePath, forEachFile } = require('./util');
const office = require('./office');
const { readWorkbook } = require('./csvio');

// 读取工作簿：支持 .xlsx 与 .csv（.csv 自动识别编码，见 csvio）

// 保证工作表名唯一（Excel 名长度/字符限制 31）
function safeSheetName(name, used) {
  let n = String(name).replace(/[\\/*?:\[\]]/g, '_').slice(0, 28) || 'Sheet';
  let base = n, i = 1;
  while (used.has(n)) { n = `${base}_${i++}`.slice(0, 31); }
  used.add(n);
  return n;
}

// 规整单元格取值（公式取结果、富文本取文本）
function cellVal(v) {
  if (v == null) return null;
  if (typeof v === 'object') {
    if (v.result !== undefined) return v.result;
    if (v.text !== undefined) return v.text;
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if (v.hyperlink !== undefined) return v.text || v.hyperlink;
  }
  return v;
}

// 1. 批量合并工作表：支持"合并为一张表"或"每文件各一张工作表"
async function mergeSheets(payload, ctx) {
  const { files, outputDir } = payload;
  ensureDir(outputDir);
  if (!files || files.length < 1) throw new Error('请选择 Excel/CSV 文件');
  const result = payload.mode === 'perSheet'
    ? await mergePerSheet(payload, ctx)
    : await mergeStack(payload, ctx);
  ctx.progress(files.length, files.length, '完成');
  return result;
}

// 模式一：每个文件作为独立工作表汇入一个工作簿
async function mergePerSheet({ files, outputDir, outputName }, ctx) {
  const out = new ExcelJS.Workbook();
  const used = new Set();
  for (let i = 0; i < files.length; i++) {
    ctx.progress(i, files.length, `合并: ${path.basename(files[i])}`);
    const wb = await readWorkbook(files[i]);
    wb.eachSheet((ws) => {
      const target = out.addWorksheet(safeSheetName(`${baseName(files[i])}_${ws.name}`, used));
      ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
        row.eachCell({ includeEmpty: false }, (cell, colNum) => {
          target.getRow(rowNum).getCell(colNum).value = cellVal(cell.value);
        });
      });
    });
  }
  const name = outputName && outputName.trim() ? outputName.trim() : '合并工作表';
  const target = uniquePath(outputDir, name, '.xlsx');
  await out.xlsx.writeFile(target);
  return { output: target, sheets: used.size };
}
// __MERGE_STACK__

// 读取一个文件所有工作表的行（每个工作表一组 1-based 值数组）
async function readSheets(file) {
  const wb = await readWorkbook(file);
  const sheets = [];
  wb.eachSheet((ws) => {
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row) => rows.push(row.values.map(cellVal)));
    if (rows.length) sheets.push(rows);
  });
  return sheets;
}

// 模式二：把多个文件（的所有工作表）内容按行堆叠合并到一张工作表
async function mergeStack({ files, outputDir, outputName, byHeader, addSource }, ctx) {
  const out = new ExcelJS.Workbook();
  const sheet = out.addWorksheet('合并');
  const headerAlign = byHeader !== false; // 默认按表头对齐
  const master = []; const seen = new Set(); const records = [];

  for (let i = 0; i < files.length; i++) {
    ctx.progress(i, files.length, `合并: ${path.basename(files[i])}`);
    const src = baseName(files[i]);
    const sheets = await readSheets(files[i]);
    for (const rows of sheets) {
      const header = rows[0];
      if (headerAlign) {
        const names = header.map((h) => (h == null ? '' : String(h)));
        names.forEach((h) => { if (h && !seen.has(h)) { seen.add(h); master.push(h); } });
        for (let r = 1; r < rows.length; r++) {
          const obj = {};
          names.forEach((h, c) => { if (h) obj[h] = rows[r][c]; });
          records.push({ src, obj });
        }
      } else {
        const start = records.length === 0 ? 0 : 1; // 仅保留第一张表的表头
        for (let r = start; r < rows.length; r++) records.push({ src, raw: rows[r] });
      }
    }
  }

  writeStack(sheet, headerAlign, !!addSource, master, records);
  const name = outputName && outputName.trim() ? outputName.trim() : '合并结果';
  const target = uniquePath(outputDir, name, '.xlsx');
  await out.xlsx.writeFile(target);
  return { output: target, rows: records.length, columns: headerAlign ? master.length : undefined };
}

// 把收集到的记录写入目标工作表
function writeStack(sheet, headerAlign, addSource, master, records) {
  if (headerAlign) {
    sheet.addRow((addSource ? ['来源文件'] : []).concat(master));
    records.forEach(({ src, obj }) => {
      const vals = master.map((h) => (obj[h] === undefined ? null : obj[h]));
      sheet.addRow((addSource ? [src] : []).concat(vals));
    });
  } else {
    records.forEach(({ src, raw }) => {
      const vals = raw.slice(1); // 去掉 1-based 的空首位
      sheet.addRow(addSource ? [src].concat(vals) : vals);
    });
  }
}

// 2. 批量修改单元格内容（查找替换文本型单元格）
async function modifyCells({ files, outputDir, findText, replaceText }, ctx) {
  ensureDir(outputDir);
  if (findText === undefined || findText === '') throw new Error('请输入要查找的内容');
  return forEachFile(files, ctx, '修改', async (f) => {
    const wb = await readWorkbook(f);
    let count = 0;
    wb.eachSheet((ws) => {
      ws.eachRow((row) => {
        row.eachCell((cell) => {
          if (typeof cell.value === 'string' && cell.value.includes(findText)) {
            cell.value = cell.value.split(findText).join(replaceText || '');
            count++;
          }
        });
      });
    });
    const target = uniquePath(outputDir, `${baseName(f)}_modified`, '.xlsx');
    await wb.xlsx.writeFile(target);
    return { output: target, changed: count };
  });
}

// 3. 批量拆分工作表：每个 sheet 导出为独立文件
async function splitSheets({ files, outputDir }, ctx) {
  ensureDir(outputDir);
  return forEachFile(files, ctx, '拆分', async (f) => {
    const wb = await readWorkbook(f);
    const sub = ensureDir(path.join(outputDir, baseName(f)));
    const outputs = [];
    for (const ws of wb.worksheets) {
      const single = new ExcelJS.Workbook();
      const ns = single.addWorksheet(ws.name.replace(/[\\/*?:\[\]]/g, '_').slice(0, 31));
      ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
        row.eachCell({ includeEmpty: false }, (cell, colNum) => {
          ns.getRow(rowNum).getCell(colNum).value = cell.value;
        });
      });
      const target = uniquePath(sub, `${baseName(f)}_${ws.name}`, '.xlsx');
      await single.xlsx.writeFile(target);
      outputs.push(target);
    }
    return { output: sub, files: outputs.length };
  });
}

// 4. 批量导出为 PDF（优先 LibreOffice，缺失时内置引擎回退）
async function toPdf({ files, outputDir }, ctx) {
  ensureDir(outputDir);
  return office.toPdfBatch(files, outputDir, 'excel', ctx, '导出PDF');
}

// 5. 批量清除单元格格式（保留值，去样式）
async function clearFormat({ files, outputDir }, ctx) {
  ensureDir(outputDir);
  return forEachFile(files, ctx, '清格式', async (f) => {
    const wb = await readWorkbook(f);
    wb.eachSheet((ws) => {
      ws.eachRow((row) => {
        row.eachCell((cell) => {
          const v = cell.value;
          cell.style = {};
          cell.value = v;
        });
      });
    });
    const target = uniquePath(outputDir, `${baseName(f)}_plain`, '.xlsx');
    await wb.xlsx.writeFile(target);
    return target;
  });
}

module.exports = { mergeSheets, modifyCells, splitSheets, toPdf, clearFormat };
