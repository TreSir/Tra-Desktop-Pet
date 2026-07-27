// 商店窗口 preload：暴露商店读写 API
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('shopAPI', {
  // 获取商品目录 + 余额 + 解锁状态 + 特效启用状态
  getState: () => ipcRenderer.invoke('shop-get-state'),
  // 购买商品（返回 {ok, coins, placed?, reason?}）
  buy: (itemId) => ipcRenderer.invoke('shop-buy', itemId),
  // 切换特效启用状态（返回 {ok, effectsOn, reason?}）
  toggleEffect: (itemId) => ipcRenderer.invoke('shop-toggle-effect', itemId),
  // 关闭商店窗口
  close: () => ipcRenderer.send('shop-close'),
  // 监听余额变化（购买后实时更新）
  onCoinsUpdate: (cb) => ipcRenderer.on('coins-update', (_e, val) => cb(val)),
});
