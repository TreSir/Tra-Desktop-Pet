// 设置窗口 preload：暴露设置读写 API
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsAPI', {
  // 获取当前设置
  getAll: () => ipcRenderer.invoke('settings-get-all'),
  // 保存单项设置 {key, value}
  set: (key, value) => ipcRenderer.send('settings-set', { key, value }),
  // 关闭设置窗口
  close: () => ipcRenderer.send('settings-close'),
});
