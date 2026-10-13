# 本地批量文档工具箱

Windows (.exe) / Mac (.dmg) 双端桌面工具。所有文件在本机 CPU 运算，**不上传任何文档到网络**，专注 PDF / Word / Excel 批量处理。

- 无需登录、无需云端账号、无需 API 密钥
- 基于 Electron，纯本地运行

## 技术栈

- 外壳：Electron（主进程 Node，渲染层原生 JS，无需打包构建）
- PDF：`pdf-lib`（合并/拆分/旋转/水印/图片转 PDF）、`pdfjs-dist` + `@napi-rs/canvas`（渲染为图片 / OCR 光栅化）
- OCR：`tesseract.js`（本地识别，首次缓存语言模型后离线可用）
- 图片：`sharp`
- Excel：`exceljs`
- Word：`docx-preview` 按 Word 版式高保真渲染（转 PDF / 导出图片，保留表格/制表位/字体/下划线）、`jszip` 处理查找替换与内图压缩
- Office → PDF：**内置引擎**（HTML → Electron `printToPDF`，零外部依赖）；若本机装有 LibreOffice（`libreoffice-convert`）则自动优先使用以获得更高保真度

## 开发运行

```bash
npm install
npm start        # 启动应用
npm test         # 运行处理器自测（无需 Electron）
```

## 打包交付

产物位于 `release/`，配置见 `electron-builder.yml`。**原生依赖（sharp、@napi-rs/canvas）与平台相关，必须在目标系统上重新安装，不能跨平台拷贝 `node_modules`。**

### Mac（在 Mac 上）

```bash
npm ci
npm run dist:mac        # universal（Intel + Apple Silicon）
# 或仅当前架构（更快、更稳）：
npx electron-builder --mac dmg --arm64
```

### Windows（在 Windows 机器上，推荐 Win10/11 x64）

前提：安装 Node.js（建议与开发端一致，当前 Node 24）、Git。然后：

```powershell
# 1. 获取源码（git clone 或拷贝项目，勿拷贝 mac 的 node_modules / release）
# 2. 全新、可复现地安装依赖（按 package-lock.json 精确安装）
npm ci
# 3. 打包，产出 NSIS 安装包 release\本地批量文档工具箱-1.0.0-win-x64.exe
npm run dist:win
```

说明：
- `npm ci` 会按 `package-lock.json` 精确安装并在 Windows 上重新编译/下载原生依赖，保证可复现。
- 首次会下载 Electron Windows 二进制（约 90MB）。
- 未配置签名时产出**未签名** exe，用户运行会触发 SmartScreen“Windows 已保护你的电脑”。

### Windows 代码签名（正式发布）

用 Authenticode 证书签名以消除 SmartScreen 警告。electron-builder 自动读取环境变量：

```powershell
$env:CSC_LINK="C:\path\to\cert.pfx"      # OV 证书(.pfx)
$env:CSC_KEY_PASSWORD="你的证书密码"
npm run dist:win
```

- **OV 证书**：可签名，但 SmartScreen 需累积信誉后才完全免警告。
- **EV 证书**：即时获得 SmartScreen 信任，但私钥在硬件 U-key 上，需在签名机插入 token 后签（不能用 CSC_LINK，用 `signtool` 或 `win.signingHashAlgorithms` + 证书主题名配置）。

### 图标

应用图标由 `assets/icon.svg` 生成，已产出到 `build/`：`icon.icns`（Mac）、`icon.ico`（Windows）、`icon.png`。
electron-builder 会自动识别 `build/` 下的图标。修改 `assets/icon.svg` 后重新生成：

```bash
npm run icons   # 需在 mac 上才能生成 .icns（依赖 iconutil）
```

## 功能清单（V1.0）

- PDF：合并、拆分、图片转 PDF、OCR 提取文字、压缩、旋转/删空白页、文字水印、导出为图片
- Word：查找替换、转 PDF、改页眉页脚、压缩内图、导出为图片
- Excel：合并工作表、改单元格、拆分工作表、导出 PDF、清除格式
- 通用：文件批量重命名、图片压缩、图片格式互转、TXT 合并 / 查找替换

## 风险与注意事项

1. **Mac 签名与公证**：`.dmg` 上架前需配置 Apple 开发者签名与 notarize，否则用户打开会提示"无法验证开发者"。在 `electron-builder.yml` 的 `mac` 段补充签名证书与 `afterSign` 公证脚本。
2. **Office → PDF 转换**：默认使用**内置引擎**（docx/xlsx → HTML → Electron 打印为 PDF），纯本地、无需安装任何 Office 或 LibreOffice，开箱即用。内置引擎为**内容级**转换（保留文字、标题、列表、表格、图片），不保证与 Word/Excel 像素级一致的版式（页码、精确字体、复杂页眉页脚等）。如需高保真版式，安装 LibreOffice 后程序会自动优先调用它。
3. **本地 OCR 模型**：`tesseract.js` 首次识别会下载并缓存语言模型（之后离线可用）。完全离线分发需将 `*.traineddata` 与核心 wasm 预置到安装包并配置 `langPath` / `corePath`。

## 已知 V1 局限

- PDF 压缩为对象流重排，对已高度压缩的文件体积下降有限。
- Word 查找替换按单个文本节点处理，若同一词被拆分到多个 run 可能漏替换。
- Word 页眉页脚仅支持修改已存在的内容，不新建。
- 内置引擎 Office→PDF：Word 侧用 docx-preview 按 Word 版式渲染，表格/制表位对齐/字体/下划线等基本还原；仍可能与 Word 存在细微差异（分页位置、极少数特殊字体）。Excel 侧为表格级渲染。对版式零容忍场景请安装 LibreOffice。

## V2.0 规划

文件哈希校验、PPT 批量处理、图片水印、PDF 批量加解密。
