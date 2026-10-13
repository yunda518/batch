'use strict';
// 从 assets/icon.svg 生成 build/icon.png、build/icon.ico、build/icon.icns。
// 用法：node scripts/gen-icons.js  （.icns 依赖 mac 的 iconutil）
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');
const pngToIco = require('png-to-ico');

const ROOT = path.join(__dirname, '..');
const SVG = path.join(ROOT, 'assets', 'icon.svg');
const BUILD = path.join(ROOT, 'build');

async function png(size) {
  return sharp(SVG, { density: 384 }).resize(size, size).png().toBuffer();
}

async function main() {
  fs.mkdirSync(BUILD, { recursive: true });
  // 主 PNG（electron-builder 兜底用）
  fs.writeFileSync(path.join(BUILD, 'icon.png'), await png(1024));

  // ICO（Windows）：多尺寸合一
  const sizes = [256, 128, 64, 48, 32, 16];
  const bufs = await Promise.all(sizes.map(png));
  fs.writeFileSync(path.join(BUILD, 'icon.ico'), await pngToIco(bufs));

  // ICNS（Mac）：生成 iconset 后用 iconutil 转换
  const iconset = path.join(BUILD, 'icon.iconset');
  fs.rmSync(iconset, { recursive: true, force: true });
  fs.mkdirSync(iconset);
  const specs = [
    [16, 'icon_16x16.png'], [32, 'icon_16x16@2x.png'],
    [32, 'icon_32x32.png'], [64, 'icon_32x32@2x.png'],
    [128, 'icon_128x128.png'], [256, 'icon_128x128@2x.png'],
    [256, 'icon_256x256.png'], [512, 'icon_256x256@2x.png'],
    [512, 'icon_512x512.png'], [1024, 'icon_512x512@2x.png']
  ];
  for (const [sz, name] of specs) fs.writeFileSync(path.join(iconset, name), await png(sz));
  try {
    execFileSync('iconutil', ['-c', 'icns', '-o', path.join(BUILD, 'icon.icns'), iconset]);
    fs.rmSync(iconset, { recursive: true, force: true });
    console.log('已生成 icon.png / icon.ico / icon.icns');
  } catch (e) {
    console.log('已生成 icon.png / icon.ico；icon.icns 需在 mac 上用 iconutil 生成:', e.message);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
