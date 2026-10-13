'use strict';
const fs = require('fs');
const path = require('path');

// 处理器通用工具：输出目录、文件名、唯一命名、批处理循环。
function ensureDir(dir) {
  if (!dir) throw new Error('未指定输出目录');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function baseName(filePath) {
  return path.basename(filePath, path.extname(filePath));
}

// 若目标文件已存在，自动追加 (1)/(2)… 避免覆盖
function uniquePath(dir, name, ext) {
  let candidate = path.join(dir, `${name}${ext}`);
  let i = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${name}(${i})${ext}`);
    i++;
  }
  return candidate;
}

// 对文件列表逐个处理并回报进度，收集成功/失败明细
async function forEachFile(files, ctx, label, handler) {
  const results = { success: [], failed: [] };
  const total = files.length;
  for (let i = 0; i < total; i++) {
    const f = files[i];
    if (ctx && ctx.progress) ctx.progress(i, total, `${label}: ${path.basename(f)}`);
    try {
      const out = await handler(f, i);
      results.success.push({ input: f, output: out });
    } catch (err) {
      results.failed.push({ input: f, error: err.message || String(err) });
    }
  }
  if (ctx && ctx.progress) ctx.progress(total, total, '完成');
  return results;
}

module.exports = { fs, path, ensureDir, baseName, uniquePath, forEachFile };
