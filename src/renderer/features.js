'use strict';
// 功能注册表：UI 完全由此配置驱动，新增功能只需在此加一项。
const F = {
  PDF: [{ name: 'PDF', extensions: ['pdf'] }],
  IMG: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'] }],
  WORD: [{ name: 'Word', extensions: ['docx', 'doc'] }],
  EXCEL: [{ name: 'Excel/CSV', extensions: ['xlsx', 'csv'] }],
  TXT: [{ name: '文本', extensions: ['txt'] }],
  ALL: []
};

window.FEATURES = [
  {
    group: '📄 PDF 处理', items: [
      {
        id: 'pdf.merge', title: 'PDF 批量合并', desc: '多个 PDF 合并为一个文件',
        accept: F.PDF, fields: [
          { key: 'outputName', label: '输出文件名', type: 'text', placeholder: '合并结果' }
        ]
      },
      {
        id: 'pdf.split', title: 'PDF 批量拆分', desc: '按页数或页码范围拆分',
        accept: F.PDF, fields: [
          { key: 'mode', label: '拆分方式', type: 'select', default: 'perPages',
            options: [{ v: 'perPages', t: '按固定页数' }, { v: 'ranges', t: '按页码范围' }] },
          { key: 'pagesPer', label: '每份页数', type: 'number', default: 1, showWhen: { mode: 'perPages' } },
          { key: 'ranges', label: '页码范围', type: 'text', placeholder: '如 1-3,5,8-10',
            showWhen: { mode: 'ranges' } }
        ]
      },
      {
        id: 'pdf.imagesToPdf', title: '图片转 PDF', desc: '批量 JPG/PNG 转 PDF',
        accept: F.IMG, fields: [
          { key: 'mode', label: '输出方式', type: 'select', default: 'single',
            options: [{ v: 'single', t: '合并为一个 PDF' }, { v: 'perImage', t: '每张一个 PDF' }] },
          { key: 'outputName', label: '输出文件名(合并时)', type: 'text', placeholder: '图片合集',
            showWhen: { mode: 'single' } }
        ]
      },
      {
        id: 'pdf.ocr', title: 'PDF 批量提取文字(OCR)', desc: '本地识别，首次会缓存语言模型',
        accept: F.PDF, fields: [
          { key: 'lang', label: '识别语言', type: 'select', default: 'chi_sim+eng',
            options: [{ v: 'chi_sim+eng', t: '中文+英文' }, { v: 'eng', t: '仅英文' },
              { v: 'chi_sim', t: '仅中文' }] }
        ]
      },
      {
        id: 'pdf.compress', title: 'PDF 批量压缩', desc: '降低体积，便于邮件上传',
        accept: F.PDF, fields: [
          { key: 'imageQuality', label: '图片目标质量', type: 'number', default: 60,
            hint: '30-95，越低体积越小' }
        ]
      },
      {
        id: 'pdf.rotateClean', title: '页面旋转 / 删空白页', desc: '批量旋转页面并移除空白页',
        accept: F.PDF, fields: [
          { key: 'rotate', label: '旋转角度', type: 'select', default: '0',
            options: [{ v: '0', t: '不旋转' }, { v: '90', t: '顺时针 90°' },
              { v: '180', t: '180°' }, { v: '270', t: '逆时针 90°' }] },
          { key: 'removeBlank', label: '删除空白页', type: 'checkbox', default: false }
        ]
      },
      {
        id: 'pdf.watermark', title: 'PDF 批量加文字水印', desc: '支持中文，斜向平铺',
        accept: F.PDF, fields: [
          { key: 'text', label: '水印文字', type: 'text', placeholder: '内部文件' },
          { key: 'fontSize', label: '字号', type: 'number', default: 36 },
          { key: 'opacity', label: '不透明度', type: 'number', default: 0.2, hint: '0.05-1' },
          { key: 'color', label: '颜色', type: 'text', default: '#888888' }
        ]
      },
      {
        id: 'pdf.toImages', title: 'PDF 导出为图片', desc: 'PDF → JPG/PNG，每页一张',
        accept: F.PDF, fields: [
          { key: 'format', label: '图片格式', type: 'select', default: 'png',
            options: [{ v: 'png', t: 'PNG' }, { v: 'jpg', t: 'JPG' }] },
          { key: 'scale', label: '清晰度', type: 'number', default: 2, hint: '1-4，越大越清晰' }
        ]
      }
    ]
  },
  { group: '📘 Word 处理', items: WORD_ITEMS() },
  { group: '📊 Excel 处理', items: EXCEL_ITEMS() },
  { group: '🧰 通用小工具', items: TOOL_ITEMS() }
];
// __APPEND_MARKER__

function WORD_ITEMS() {
  return [
    {
      id: 'word.replace', title: 'Word 批量查找替换', desc: '替换正文及页眉页脚文字',
      accept: F.WORD, fields: [
        { key: 'findText', label: '查找内容', type: 'text', required: true },
        { key: 'replaceText', label: '替换为', type: 'text' }
      ]
    },
    {
      id: 'word.toPdf', title: 'Word 批量转 PDF', desc: '内置引擎，无需安装 LibreOffice',
      accept: F.WORD, fields: []
    },
    {
      id: 'word.headerFooter', title: 'Word 批量改页眉页脚', desc: '替换现有页眉/页脚文字',
      accept: F.WORD, fields: [
        { key: 'findText', label: '查找内容', type: 'text', required: true },
        { key: 'replaceText', label: '替换为', type: 'text' }
      ]
    },
    {
      id: 'word.compressImages', title: 'Word 批量压缩内图', desc: '重新编码文档内位图',
      accept: F.WORD, fields: [
        { key: 'quality', label: '图片质量', type: 'number', default: 60, hint: '30-95' }
      ]
    },
    {
      id: 'word.toImages', title: 'Word 导出为图片', desc: '先转 PDF 再逐页出图',
      accept: F.WORD, fields: [
        { key: 'format', label: '图片格式', type: 'select', default: 'png',
          options: [{ v: 'png', t: 'PNG' }, { v: 'jpg', t: 'JPG' }] },
        { key: 'scale', label: '清晰度', type: 'number', default: 2 }
      ]
    }
  ];
}

function EXCEL_ITEMS() {
  return [
    { id: 'excel.mergeSheets', title: 'Excel 批量合并工作表', desc: '多文件合并为一张表或各自成表',
      accept: F.EXCEL, fields: [
        { key: 'mode', label: '合并方式', type: 'select', default: 'stack',
          options: [{ v: 'stack', t: '合并为一张表（按行堆叠）' },
            { v: 'perSheet', t: '每个文件各一张工作表' }] },
        { key: 'byHeader', label: '按表头对齐合并（首行为表头）', type: 'checkbox', default: true,
          showWhen: { mode: 'stack' } },
        { key: 'addSource', label: '增加"来源文件"列', type: 'checkbox', default: false,
          showWhen: { mode: 'stack' } },
        { key: 'outputName', label: '输出文件名', type: 'text', placeholder: '合并结果' }] },
    { id: 'excel.modifyCells', title: 'Excel 批量改单元格', desc: '按文字查找替换',
      accept: F.EXCEL, fields: [
        { key: 'findText', label: '查找内容', type: 'text', required: true },
        { key: 'replaceText', label: '替换为', type: 'text' }] },
    { id: 'excel.splitSheets', title: 'Excel 批量拆分工作表', desc: '每个工作表独立文件',
      accept: F.EXCEL, fields: [] },
    { id: 'excel.toPdf', title: 'Excel 批量导出 PDF', desc: '内置引擎，无需安装 LibreOffice',
      accept: F.EXCEL, fields: [] },
    { id: 'excel.clearFormat', title: '批量清除单元格格式', desc: '保留内容去除样式',
      accept: F.EXCEL, fields: [] }
  ];
}
// __TOOLS_MARKER__

function TOOL_ITEMS() {
  return [
    {
      id: 'file.rename', title: '文件批量重命名', desc: '前缀 / 序号 / 替换文件名',
      accept: F.ALL, fields: [
        { key: 'prefix', label: '前缀', type: 'text', placeholder: '如 2026_' },
        { key: 'startNumber', label: '起始序号(留空不编号)', type: 'number', placeholder: '1' },
        { key: 'numberDigits', label: '序号位数', type: 'number', default: 3, hint: '如 3 => 001' },
        { key: 'findText', label: '原文件名查找', type: 'text' },
        { key: 'replaceText', label: '替换为', type: 'text' }
      ]
    },
    {
      id: 'image.compress', title: '图片批量压缩', desc: '按质量/最大宽度重新编码',
      accept: F.IMG, fields: [
        { key: 'quality', label: '质量', type: 'number', default: 70, hint: '10-100' },
        { key: 'maxWidth', label: '最大宽度(px，0不限)', type: 'number', default: 0 }
      ]
    },
    {
      id: 'image.convert', title: '图片格式互转', desc: 'JPG ↔ PNG ↔ WebP',
      accept: F.IMG, fields: [
        { key: 'target', label: '目标格式', type: 'select', default: 'png',
          options: [{ v: 'jpg', t: 'JPG' }, { v: 'png', t: 'PNG' }, { v: 'webp', t: 'WebP' }] }
      ]
    },
    {
      id: 'text.merge', title: 'TXT 批量合并', desc: '按选择顺序拼接',
      accept: F.TXT, fields: [
        { key: 'outputName', label: '输出文件名', type: 'text', placeholder: '合并文本' },
        { key: 'addSeparator', label: '插入文件名分隔标题', type: 'checkbox', default: true }
      ]
    },
    {
      id: 'text.replace', title: 'TXT 批量查找替换', desc: '支持普通文本或正则',
      accept: F.TXT, fields: [
        { key: 'findText', label: '查找内容', type: 'text', required: true },
        { key: 'replaceText', label: '替换为', type: 'text' },
        { key: 'useRegex', label: '使用正则表达式', type: 'checkbox', default: false }
      ]
    }
  ];
}
