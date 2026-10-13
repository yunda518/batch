'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// 向渲染进程暴露受限、安全的 API（contextIsolation 下的唯一桥）
contextBridge.exposeInMainWorld('api', {
  pickFiles: (filters) => ipcRenderer.invoke('dialog:pickFiles', filters),
  pickDir: () => ipcRenderer.invoke('dialog:pickDir'),
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),

  // 统一的任务执行入口：task = 功能标识，payload = 参数
  run: (task, payload) => ipcRenderer.invoke('task:run', { task, payload }),

  // 进度订阅：主进程通过 'task:progress' 推送 { current, total, label }
  onProgress: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on('task:progress', listener);
    return () => ipcRenderer.removeListener('task:progress', listener);
  }
});
