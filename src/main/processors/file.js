'use strict';
const { fs, path, ensureDir, uniquePath } = require('./util');

// 文件批量自定义重命名：前缀 + 序号 + 文件名文字替换。
// 复制到输出目录重命名（非破坏性，不动原文件）。
async function rename({ files, outputDir, prefix, startNumber, numberDigits, findText, replaceText }, ctx) {
  ensureDir(outputDir);
  const pre = prefix || '';
  const useNumber = startNumber !== undefined && startNumber !== null && startNumber !== '';
  let num = parseInt(startNumber, 10) || 1;
  const digits = parseInt(numberDigits, 10) || 0;
  const results = { success: [], failed: [] };

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    ctx.progress(i, files.length, `重命名: ${path.basename(f)}`);
    try {
      const ext = path.extname(f);
      let stem = path.basename(f, ext);
      if (findText) stem = stem.split(findText).join(replaceText || '');
      let name = pre + stem;
      if (useNumber) {
        const seq = digits > 0 ? String(num).padStart(digits, '0') : String(num);
        name = `${pre}${seq}${stem ? '_' + stem : ''}`;
        num++;
      }
      const target = uniquePath(outputDir, name, ext);
      fs.copyFileSync(f, target);
      results.success.push({ input: f, output: target });
    } catch (err) {
      results.failed.push({ input: f, error: err.message });
    }
  }
  ctx.progress(files.length, files.length, '完成');
  return results;
}

module.exports = { rename };
