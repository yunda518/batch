'use strict';
const sharp = require('sharp');
const { path, ensureDir, baseName, uniquePath, forEachFile } = require('./util');

// 图片批量压缩：按质量/最大宽度重新编码
async function compress({ files, outputDir, quality, maxWidth }, ctx) {
  ensureDir(outputDir);
  const q = Math.min(100, Math.max(10, parseInt(quality, 10) || 70));
  const mw = parseInt(maxWidth, 10) || 0;
  return forEachFile(files, ctx, '压缩', async (f) => {
    let img = sharp(f).rotate();
    if (mw > 0) img = img.resize({ width: mw, withoutEnlargement: true });
    const ext = path.extname(f).toLowerCase();
    if (ext === '.png') img = img.png({ quality: q, compressionLevel: 9 });
    else if (ext === '.webp') img = img.webp({ quality: q });
    else img = img.jpeg({ quality: q, mozjpeg: true });
    const target = uniquePath(outputDir, `${baseName(f)}_min`, ext || '.jpg');
    await img.toFile(target);
    return target;
  });
}

// 图片格式互转：JPG <-> PNG <-> WebP
async function convert({ files, outputDir, target }, ctx) {
  ensureDir(outputDir);
  const fmt = ['jpg', 'png', 'webp'].includes(target) ? target : 'png';
  return forEachFile(files, ctx, `转 ${fmt}`, async (f) => {
    let img = sharp(f).rotate();
    if (fmt === 'png') img = img.png();
    else if (fmt === 'webp') img = img.webp({ quality: 90 });
    else img = img.jpeg({ quality: 92 });
    const out = uniquePath(outputDir, baseName(f), `.${fmt === 'jpg' ? 'jpg' : fmt}`);
    await img.toFile(out);
    return out;
  });
}

module.exports = { compress, convert };
