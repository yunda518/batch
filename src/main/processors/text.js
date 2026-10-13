'use strict';
const { fs, path, ensureDir, uniquePath, forEachFile } = require('./util');

// TXT 批量合并：按选择顺序拼接为单个文件，可加文件名分隔标题
async function merge({ files, outputDir, outputName, addSeparator }, ctx) {
  ensureDir(outputDir);
  if (!files || !files.length) throw new Error('请选择 TXT 文件');
  let combined = '';
  for (let i = 0; i < files.length; i++) {
    ctx.progress(i, files.length, `合并: ${path.basename(files[i])}`);
    const content = fs.readFileSync(files[i], 'utf8');
    if (addSeparator) combined += `\n===== ${path.basename(files[i])} =====\n`;
    combined += content + '\n';
  }
  const name = outputName && outputName.trim() ? outputName.trim() : '合并文本';
  const target = uniquePath(outputDir, name, '.txt');
  fs.writeFileSync(target, combined, 'utf8');
  ctx.progress(files.length, files.length, '完成');
  return { output: target, count: files.length };
}

// TXT 批量查找替换：逐文件替换后输出
async function replace({ files, outputDir, findText, replaceText, useRegex }, ctx) {
  ensureDir(outputDir);
  if (!findText) throw new Error('请输入要查找的文字');
  return forEachFile(files, ctx, '替换', async (f) => {
    let content = fs.readFileSync(f, 'utf8');
    let count = 0;
    if (useRegex) {
      const re = new RegExp(findText, 'g');
      content = content.replace(re, (m) => { count++; return replaceText || ''; });
    } else {
      const parts = content.split(findText);
      count = parts.length - 1;
      content = parts.join(replaceText || '');
    }
    const target = uniquePath(outputDir, path.basename(f, '.txt'), '.txt');
    fs.writeFileSync(target, content, 'utf8');
    return { output: target, replaced: count };
  });
}

module.exports = { merge, replace };
