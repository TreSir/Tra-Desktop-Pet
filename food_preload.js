// 食物窗口 preload：用 contextBridge 暴露 API（contextIsolation: true 必须用 contextBridge）
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('foodAPI', {
  onFoodsUpdate: (cb) => ipcRenderer.on('foods-update', (_e, val) => cb(val)),
});
