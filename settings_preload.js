// 设置窗口 preload：暴露设置读写 API
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsAPI', {
  // 获取当前设置
  getAll: () => ipcRenderer.invoke('settings-get-all'),
  // 保存单项设置 {key, value}
  set: (key, value) => ipcRenderer.invoke('settings-set', { key, value }),
  openShop: () => ipcRenderer.send('ui-open-shop'),
  onThemeChanged: (cb) => ipcRenderer.on('shop-theme-changed', (_e, val) => cb(val)),
  // 关闭设置窗口
  close: () => ipcRenderer.send('settings-close'),
});
