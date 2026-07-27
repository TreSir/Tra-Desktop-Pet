const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  // ── 基础交互 ──
  moveWindow: (dx, dy) => ipcRenderer.send('move-window', dx, dy),
  setTrayIcon: (dataUrl) => ipcRenderer.send('set-tray-icon', dataUrl),
  startCursorPoll: () => ipcRenderer.send('start-cursor-poll'),
  stopCursorPoll: () => ipcRenderer.send('stop-cursor-poll'),
  physicsDrop: (vx, vy) => ipcRenderer.send('physics-drop', vx, vy),
  physicsCancel: () => ipcRenderer.send('physics-cancel'),

  // ── 调试：保存抠图结果 ──
  saveSpriteDebug: (name, dataUrl) => ipcRenderer.send('save-sprite-debug', name, dataUrl),

  // ── 食物放置模式 ──
  // 接收主进程推送的食物列表 [{id, screenX, screenY, placeTime, type}]
  onFoodsUpdate: (cb) => ipcRenderer.on('foods-update', (_e, val) => cb(val)),
  // 通知主进程桌宠吃掉了某食物
  eatFood: (foodId) => ipcRenderer.send('eat-food', foodId),

  // ── 事件监听 ──
  onEmotionChange: (cb) => ipcRenderer.on('emotion-change', (_e, val) => cb(val)),
  onStatusChange: (cb) => ipcRenderer.on('status-change', (_e, val) => cb(val)),
  onAutoWalkToggle: (cb) => ipcRenderer.on('auto-walk-toggle', (_e, val) => cb(val)),
  onCursorPos: (cb) => ipcRenderer.on('cursor-pos', (_e, val) => cb(val)),
  onPhysicsBounce: (cb) => ipcRenderer.on('physics-bounce', (_e, val) => cb(val)),
  onPhysicsLanded: (cb) => ipcRenderer.on('physics-landed', () => cb()),

  // ── 新功能事件 ──
  onFeed: (cb) => ipcRenderer.on('pet-feed', () => cb()),
  onDance: (cb) => ipcRenderer.on('pet-dance', () => cb()),
  onSleepToggle: (cb) => ipcRenderer.on('pet-sleep-toggle', () => cb()),
  onResetZoom: (cb) => ipcRenderer.on('pet-reset-zoom', () => cb()),

  // ── 角色切换 ──
  onCharacterChange: (cb) => ipcRenderer.on('character-change', (_e, val) => cb(val)),
  characterSync: (charKey) => ipcRenderer.send('character-sync', charKey),

  // ── 局域网联机 ──
  // 联机模式开关变化
  onLanToggle: (cb) => ipcRenderer.on('lan-toggle', (_e, val) => cb(val)),
  // peer 列表变化（add/update/remove）
  onPeersChanged: (cb) => ipcRenderer.on('peers-changed', (_e, val) => cb(val)),
  // 获取在线 peer 列表
  getPeers: () => ipcRenderer.invoke('get-peers'),
  // 手动发送桌宠到指定 peer
  sendPetTo: (peerId) => ipcRenderer.invoke('send-pet-to', peerId),

  // 发送开始（渲染进程应准备状态 + 播放飞走动画）
  onPetSendStart: (cb) => ipcRenderer.on('pet-send-start', (_e, val) => cb(val)),
  // 发送成功（渲染进程应隐藏桌宠）
  onPetSendSuccess: (cb) => ipcRenderer.on('pet-send-success', (_e, val) => cb(val)),
  // 发送失败（渲染进程应恢复显示）
  onPetSendFail: (cb) => ipcRenderer.on('pet-send-fail', (_e, val) => cb(val)),
  // 收到飞来的桌宠（渲染进程应播放开场动画 + 应用状态）
  onPetReceived: (cb) => ipcRenderer.on('pet-received', (_e, val) => cb(val)),
  // 桌宠飞出屏幕边缘且有 peer（渲染进程播放飞走动画 + 发送）
  onEdgeEscape: (cb) => ipcRenderer.on('pet-edge-escape', (_e, val) => cb(val)),
  // 桌宠飞出边缘但无 peer（渲染进程播放弹回动画）
  onEdgeBounceBack: (cb) => ipcRenderer.on('pet-edge-bounce-back', () => cb()),
  // 召回桌宠（从隐藏状态恢复）
  onPetRecall: (cb) => ipcRenderer.on('pet-recall', () => cb()),
});
