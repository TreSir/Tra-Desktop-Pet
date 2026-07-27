const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const LanManager = require('./lan.js');

// ── 食物放置模式 ──
let foodModeEnabled = false;       // 默认关闭
const foods = [];                  // [{id, screenX, screenY, placeTime, type}]
let foodIdCounter = 0;
const FOOD_TYPES = ['🍎', '🍖', '🍰', '🍬', '🍪', '🥕', '🐟', '🧀'];
let foodWindow = null;             // 全屏透明食物显示窗口
let mouseHookProc = null;          // PowerShell 全局鼠标监听子进程

function placeFoodAt(screenX, screenY) {
  if (!foodModeEnabled) return;
  foods.push({
    id: ++foodIdCounter,
    screenX,
    screenY,
    placeTime: Date.now(),
    type: FOOD_TYPES[Math.floor(Math.random() * FOOD_TYPES.length)],
  });
  sendFoodsToRenderer();
  console.log(`[FOOD] Placed at (${screenX}, ${screenY}), total=${foods.length}`);
}

function sendFoodsToRenderer() {
  const payload = foods;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('foods-update', payload);
  }
  if (foodWindow && !foodWindow.isDestroyed()) {
    foodWindow.webContents.send('foods-update', payload);
  }
}

// PowerShell 脚本：用 GetAsyncKeyState 监听全局 Ctrl+左键
// 边沿触发：仅在左键从未按→按下瞬间输出坐标，避免重复触发
const MOUSE_HOOK_SCRIPT = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class U {
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int v);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
}
"@
$last = $false
while ($true) {
  $ctrl = ([U]::GetAsyncKeyState(0x11) -band 0x8000) -ne 0
  $left = ([U]::GetAsyncKeyState(0x01) -band 0x8000) -ne 0
  if ($ctrl -and $left -and -not $last) {
    $pt = New-Object U+POINT
    [U]::GetCursorPos([ref]$pt) | Out-Null
    Write-Output "$($pt.X),$($pt.Y)"
    [Console]::Out.Flush()
  }
  $last = $left
  Start-Sleep -Milliseconds 20
}
`;

function startMouseHook() {
  if (mouseHookProc) return;
  // 用 Base64 编码避免 shell 双引号转义问题（PowerShell -EncodedCommand 需要 UTF-16LE）
  const encoded = Buffer.from(MOUSE_HOOK_SCRIPT, 'utf16le').toString('base64');
  mouseHookProc = spawn('powershell.exe', ['-NoProfile', '-EncodedCommand', encoded], {
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  let buf = '';
  mouseHookProc.stdout.on('data', (chunk) => {
    buf += chunk.toString();
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const parts = line.split(',');
      const sx = parseInt(parts[0], 10);
      const sy = parseInt(parts[1], 10);
      if (!isNaN(sx) && !isNaN(sy)) {
        placeFoodAt(sx, sy);
      }
    }
  });
  mouseHookProc.on('error', (e) => console.error('[FOOD] PowerShell hook error:', e.message));
  console.log('[FOOD] Mouse hook started (Ctrl+LeftClick)');
}

function stopMouseHook() {
  if (mouseHookProc) {
    try { mouseHookProc.kill(); } catch (e) {}
    mouseHookProc = null;
    console.log('[FOOD] Mouse hook stopped');
  }
}

function createFoodWindow() {
  if (foodWindow) return;
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  foodWindow = new BrowserWindow({
    x: 0, y: 0, width, height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    skipTaskbar: true,
    resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'food_preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // 'screen-saver' 是最高 z-order 级别，确保覆盖在桌宠窗口之上
  foodWindow.setAlwaysOnTop(true, 'screen-saver');
  foodWindow.setIgnoreMouseEvents(true); // 全程 click-through，不影响任何桌面操作
  foodWindow.loadFile('renderer/food_window.html');
  foodWindow.once('ready-to-show', () => {
    if (foodModeEnabled) {
      foodWindow.show();
      foodWindow.moveTop();
    }
    sendFoodsToRenderer();
    console.log('[FOOD] Food window ready and shown');
  });
  foodWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    console.log(`[FOOD-WIN] ${message}`);
  });
  foodWindow.on('closed', () => { foodWindow = null; });
  console.log(`[FOOD] Food window created (${width}x${height})`);
}

function toggleFoodMode(enable) {
  foodModeEnabled = enable;
  if (enable) {
    createFoodWindow();
    startMouseHook();
    console.log('[FOOD] Mode enabled, shortcut: Ctrl+LeftClick');
  } else {
    stopMouseHook();
    foods.length = 0;
    sendFoodsToRenderer();
    if (foodWindow && !foodWindow.isDestroyed()) {
      foodWindow.hide();
    }
    console.log('[FOOD] Mode disabled, all foods cleared');
  }
}

// ── 角色定义（主进程副本，用于托盘菜单）──
const CHARACTER_OPTIONS = [
  { key: 'slime',  name: '史莱姆', icon: '🟦' },
  { key: 'cat',    name: '小猫',   icon: '🐱' },
  { key: 'ghost',  name: '幽灵',   icon: '👻' },
  { key: 'flame',  name: '火焰',   icon: '🔥' },
  { key: 'robot',  name: '机器人', icon: '🤖' },
  { key: 'kunkun', name: '坤坤',   icon: '🐔' },
  { key: 'tree',  name: '小树',   icon: '🌳' },
];

// ── 角色持久化 ──
// 把 userData 重定向到项目目录下，避免沙盒限制访问 AppData
const USER_DATA_DIR = path.join(__dirname, '.userdata');
try {
  if (!fs.existsSync(USER_DATA_DIR)) fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  app.setPath('userData', USER_DATA_DIR);
} catch (e) {
  console.warn('[MAIN] Cannot redirect userData:', e.message);
}
let currentCharacter = 'slime';
const charConfigPath = path.join(app.getPath('userData'), 'character.json');

function loadCharacter() {
  try {
    if (fs.existsSync(charConfigPath)) {
      const data = JSON.parse(fs.readFileSync(charConfigPath, 'utf-8'));
      if (data.character && CHARACTER_OPTIONS.find(c => c.key === data.character)) {
        currentCharacter = data.character;
      }
    }
  } catch (e) { /* ignore */ }
}

function saveCharacter(charKey) {
  currentCharacter = charKey;
  try {
    fs.writeFileSync(charConfigPath, JSON.stringify({ character: charKey }), 'utf-8');
  } catch (e) { /* ignore */ }
}

process.on('uncaughtException', (err) => {
  console.error('[MAIN ERROR]', err && err.stack ? err.stack : err);
});

let mainWindow;
let tray;
let clickThrough = false;
let autoWalk = true;
let cursorTimer = null;
let physicsTimer = null;

// ── 局域网联机 ──
const lan = new LanManager();
let lanEnabled = false;  // 默认关闭，需手动开启

// ── 透明置顶无边框窗口 ──
function createWindow() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: 280,
    height: 340,
    x: Math.floor((sw - 280) / 2),
    y: sh - 400,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    paintWhenInitiallyHidden: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    }
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // 页面加载完成后发送已保存的角色
  mainWindow.webContents.once('did-finish-load', () => {
    if (currentCharacter !== 'slime') {
      mainWindow.webContents.send('character-change', currentCharacter);
    }
  });
  // 监听渲染进程 console 输出，转发到主进程终端
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    console.log(`[PET-WIN] ${message}`);
  });

  mainWindow.webContents.on('context-menu', () => {
    if (tray) tray.popUpContextMenu(getCachedMenu());
  });
}

// ── 托盘菜单缓存（仅在状态变化时重建）──
let cachedMenu = null;
let menuCacheKey = '';
function getCachedMenu() {
  // 计算缓存 key：包含 lanEnabled/autoWalk/clickThrough/currentCharacter/peer 数量/食物模式
  const peerCount = lan.getPeers().length;
  const key = `${lanEnabled}|${autoWalk}|${clickThrough}|${currentCharacter}|${peerCount}|${foodModeEnabled}`;
  if (menuCacheKey !== key || !cachedMenu) {
    menuCacheKey = key;
    cachedMenu = buildMenu();
  }
  return cachedMenu;
}

// ── 构建托盘菜单（含动态 peer 列表）──
function buildMenu() {
  const emotionLabels = {
    happy: '高兴', angry: '愤怒', sad: '悲伤',
    disdain: '鄙夷', badsmile: '坏笑', shocked: '震惊',
    scared: '害怕', relaxed: '放松', proud: '得意'
  };
  const statusLabels = {
    idle: '待机', working: '工作中', waiting: '等待确认',
    success: '任务成功', error: '任务失败', thinking: '思考中'
  };

  const emotionItems = Object.entries(emotionLabels).map(([key, label]) => ({
    label,
    click: () => mainWindow.webContents.send('emotion-change', key)
  }));

  const statusItems = Object.entries(statusLabels).map(([key, label]) => ({
    label,
    click: () => mainWindow.webContents.send('status-change', key)
  }));

  // ── 联机菜单项（仅在开启时显示 peer 列表）──
  let lanMenuItems;
  if (!lanEnabled) {
    lanMenuItems = [{ label: '未开启联机', enabled: false }];
  } else {
    const peers = lan.getPeers();
    if (peers.length === 0) {
      lanMenuItems = [{ label: '搜索中…', enabled: false }];
    } else {
      lanMenuItems = peers.map(p => ({
        label: `${p.name} (${p.ip})`,
        click: () => sendPetToPeer(p)
      }));
    }
  }

  const menuTemplate = [
    { label: '共生体桌宠', enabled: false },
    { type: 'separator' },
    { label: '切换表情', submenu: emotionItems },
    { label: '任务状态', submenu: statusItems },
    { type: 'separator' },
    { label: '喂食', click: () => mainWindow.webContents.send('pet-feed') },
    { label: '跳舞', click: () => mainWindow.webContents.send('pet-dance') },
    { label: '睡眠切换', click: () => mainWindow.webContents.send('pet-sleep-toggle') },
    { label: '重置缩放', click: () => mainWindow.webContents.send('pet-reset-zoom') },
    { type: 'separator' },
    // ── 角色切换 ──
    {
      label: '切换角色',
      submenu: CHARACTER_OPTIONS.map(c => ({
        label: `${c.icon} ${c.name}`,
        type: 'radio',
        checked: currentCharacter === c.key,
        click: () => {
          saveCharacter(c.key);
          mainWindow.webContents.send('character-change', c.key);
        }
      }))
    },
    {
      label: '点击穿透',
      type: 'checkbox',
      checked: clickThrough,
      click: (item) => {
        clickThrough = item.checked;
        mainWindow.setIgnoreMouseEvents(clickThrough, { forward: true });
      }
    },
    {
      label: '自动行走',
      type: 'checkbox',
      checked: autoWalk,
      click: (item) => {
        autoWalk = item.checked;
        mainWindow.webContents.send('auto-walk-toggle', autoWalk);
      }
    },
    {
      label: '放置食物模式 (Ctrl+左键)',
      type: 'checkbox',
      checked: foodModeEnabled,
      click: (item) => toggleFoodMode(item.checked)
    },
    { type: 'separator' },
    // ── 联机模式开关 ──
    {
      label: '联机模式',
      type: 'checkbox',
      checked: lanEnabled,
      click: (item) => toggleLan(item.checked)
    },
  ];

  // 仅在联机开启时显示扔给/召回
  if (lanEnabled) {
    menuTemplate.push(
      { label: '扔给…', submenu: lanMenuItems },
      {
        label: '召回桌宠',
        click: () => {
          const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
          mainWindow.setPosition(Math.floor((sw - 280) / 2), sh - 400);
          mainWindow.webContents.send('pet-recall');
        }
      }
    );
  }

  menuTemplate.push(
    { type: 'separator' },
    {
      label: '回到屏幕底部',
      click: () => {
        const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
        mainWindow.setPosition(Math.floor((sw - 280) / 2), sh - 400);
      }
    },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  );

  return Menu.buildFromTemplate(menuTemplate);
}

// ── 联机模式开关 ──
function toggleLan(enable) {
  lanEnabled = enable;
  if (enable) {
    lan.start();
    if (tray) tray.setToolTip('数字共生体桌宠（联机中…）');
  } else {
    lan.stop();
    if (tray) tray.setToolTip('数字共生体桌宠');
  }
  // 通知渲染进程
  mainWindow.webContents.send('lan-toggle', lanEnabled);
}

// ── 发送桌宠到 peer ──
async function sendPetToPeer(peer) {
  try {
    // 通知渲染进程：序列化状态 + 播放飞走动画
    mainWindow.webContents.send('pet-send-start', { peerName: peer.name });
    // 通过 executeJavaScript 调用渲染进程暴露的同步函数
    // （sandboxed preload 不支持 ipcRenderer.handle，故沿用此方式）
    const state = await mainWindow.webContents.executeJavaScript(
      `window.__getPetStateForTransfer ? window.__getPetStateForTransfer() : null`
    );

    if (!state) {
      console.error('[LAN] No pet state returned');
      mainWindow.webContents.send('pet-send-fail', { error: 'no state' });
      return;
    }

    await lan.sendPet(peer.ip, peer.port, state);
    // 发送成功：通知渲染进程隐藏桌宠
    mainWindow.webContents.send('pet-send-success', { peerName: peer.name });
  } catch (e) {
    console.error('[LAN] Send failed:', e.message);
    mainWindow.webContents.send('pet-send-fail', { error: e.message });
    // 窗口可能在屏幕外（边缘抛出场景），拉回屏幕中央底部
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
    mainWindow.setPosition(Math.floor((sw - 280) / 2), sh - 400);
  }
}

function createTray(iconDataUrl) {
  try {
    const icon = iconDataUrl
      ? nativeImage.createFromDataURL(iconDataUrl)
      : nativeImage.createEmpty();
    if (tray) {
      tray.setImage(icon);
      return;
    }
    tray = new Tray(icon);
    tray.setToolTip('数字共生体桌宠');
    tray.setContextMenu(getCachedMenu());
    tray.on('click', () => tray.popUpContextMenu(getCachedMenu()));
  } catch (e) {
    console.error('[TRAY ERROR]', e && e.stack ? e.stack : e);
  }
}

// ── IPC: 窗口移动 ──
ipcMain.on('move-window', (_e, dx, dy) => {
  if (!mainWindow) return;
  const [x, y] = mainWindow.getPosition();
  const [w, h] = mainWindow.getSize();
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const nx = Math.round(Math.max(-60, Math.min(sw - w + 60, x + dx)));
  const ny = Math.round(Math.max(-40, Math.min(sh - h + 40, y + dy)));
  mainWindow.setPosition(nx, ny);
});

// ── IPC: 光标位置轮询（眼球追踪用，80ms 平衡流畅度与 IPC 开销）──
ipcMain.on('start-cursor-poll', () => {
  if (cursorTimer) return;
  cursorTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const pos = screen.getCursorScreenPoint();
    const bounds = mainWindow.getBounds();
    mainWindow.webContents.send('cursor-pos', {
      x: pos.x - bounds.x - 140,
      y: pos.y - bounds.y - 205,
      winX: bounds.x,
      winY: bounds.y,
    });
  }, 80);
});

ipcMain.on('stop-cursor-poll', () => {
  if (cursorTimer) { clearInterval(cursorTimer); cursorTimer = null; }
});

// ── IPC: 抛掷物理引擎（含边缘飞出检测）──
ipcMain.on('physics-drop', (_e, vx, vy) => {
  if (!mainWindow) return;
  let velX = vx, velY = vy;
  const gravity = 0.9;
  const bounce = 0.45;
  const friction = 0.88;
  let edgeEscaped = false;

  if (physicsTimer) clearInterval(physicsTimer);

  physicsTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      clearInterval(physicsTimer); physicsTimer = null; return;
    }

    velY += gravity;

    const [x, y] = mainWindow.getPosition();
    const [w, h] = mainWindow.getSize();
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

    let nx = x + Math.round(velX);
    let ny = y + Math.round(velY);

    // 地面弹跳
    const floorY = sh - h + 40;

    // ── 联机模式：边缘飞出检测 ──
    if (lanEnabled) {
      // 飞出顶部：y < -200 且向上速度大
      if (ny < -200 && velY < -3) {
        edgeEscaped = true;
      }
      // 飞出左右：x 超出且速度大
      if ((nx < -200 && velX < -3) || (nx > sw + 200 && velX > 3)) {
        edgeEscaped = true;
      }

      if (edgeEscaped) {
        clearInterval(physicsTimer);
        physicsTimer = null;

        const peers = lan.getPeers();
        if (peers.length === 0) {
          // 联机开启但无在线 peer：弹回
          mainWindow.setPosition(Math.floor((sw - 280) / 2), sh - 400);
          mainWindow.webContents.send('pet-edge-bounce-back');
        } else {
          // 选择最活跃的 peer（lan.getPeers 内部已按发现时间排序，取最新一个）
          // 不固定取第一个，避免总是发给同一台
          const peer = peers[peers.length - 1];
          mainWindow.webContents.send('pet-edge-escape', {
            dir: ny < -200 ? 'top' : (nx < 0 ? 'left' : 'right'),
            vx: velX, vy: velY,
            peer,
          });
        }
        return;
      }
    }

    // 地面弹跳
    if (ny >= floorY) {
      ny = floorY;
      if (Math.abs(velY) > 1.5) {
        velY = -velY * bounce;
        velX *= friction;
        mainWindow.webContents.send('physics-bounce', Math.abs(velY));
      } else {
        velY = 0;
        velX *= 0.8;
      }
    }
    // 左右墙（正常弹跳，不飞出）
    if (nx < -60) { nx = -60; velX = -velX * bounce; }
    if (nx > sw - w + 60) { nx = sw - w + 60; velX = -velX * bounce; }

    mainWindow.setPosition(nx, ny);

    // 静止判定
    if (Math.abs(velY) < 0.8 && Math.abs(velX) < 0.3 && ny >= floorY - 1) {
      clearInterval(physicsTimer);
      physicsTimer = null;
      mainWindow.webContents.send('physics-landed');
    }
  }, 16);
});

ipcMain.on('physics-cancel', () => {
  if (physicsTimer) { clearInterval(physicsTimer); physicsTimer = null; }
});

ipcMain.on('set-tray-icon', (_e, dataUrl) => {
  createTray(dataUrl);
});

// ── IPC: 获取 peer 列表 ──
ipcMain.handle('get-peers', () => {
  return lan.getPeers();
});

// ── IPC: 手动发送桌宠到 peer ──
ipcMain.handle('send-pet-to', async (_e, peerId) => {
  if (!lanEnabled) return { ok: false, error: '联机未开启' };
  const peer = lan.getPeers().find(p => p.id === peerId);
  if (!peer) return { ok: false, error: 'Peer not found' };
  await sendPetToPeer(peer);
  return { ok: true };
});

// ── IPC: 渲染进程同步角色变更（如 LAN 接收后）──
ipcMain.on('character-sync', (_e, charKey) => {
  if (charKey && CHARACTER_OPTIONS.find(c => c.key === charKey)) {
    saveCharacter(charKey);
  }
});

// ── IPC: 调试保存抠图结果 ──
ipcMain.on('save-sprite-debug', (_e, name, dataUrl) => {
  try {
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    const outPath = path.join(__dirname, 'renderer', 'assets', name + '_keyed.png');
    fs.writeFileSync(outPath, Buffer.from(base64, 'base64'));
    console.log(`[DEBUG] Saved keyed sprite: ${outPath}`);
  } catch (e) {
    console.error('[DEBUG] Failed to save sprite:', e.message);
  }
});

// ── IPC: 渲染进程通知桌宠吃掉了某食物 ──
ipcMain.on('eat-food', (_e, foodId) => {
  const idx = foods.findIndex(f => f.id === foodId);
  if (idx >= 0) {
    const eaten = foods.splice(idx, 1)[0];
    sendFoodsToRenderer();
    console.log(`[FOOD] Eaten id=${foodId}, remaining=${foods.length}`);
  }
});

// ── App lifecycle ──
// 心跳日志（用于自动测试监控）
let heartbeatTimer = null;
const heartbeatPath = path.join(__dirname, '.userdata', 'heartbeat.json');
function writeHeartbeat() {
  try {
    const data = {
      ts: Date.now(),
      uptime: process.uptime(),
      memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
      character: currentCharacter,
      clickThrough, autoWalk, lanEnabled,
      peerCount: lan.getPeers().length,
      foodModeEnabled,
      foodCount: foods.length,
    };
    fs.writeFileSync(heartbeatPath, JSON.stringify(data, null, 2));
  } catch (e) { /* ignore */ }
}

app.whenReady().then(() => {
  loadCharacter();  // 加载已保存的角色
  createWindow();
  createTray();
  writeHeartbeat();
  heartbeatTimer = setInterval(writeHeartbeat, 5000);

  // 设置 LAN 回调（但不自动启动，需手动开启联机模式）
  lan.onPetReceived = (state) => {
    mainWindow.webContents.send('pet-received', state);
  };
  lan.onPeersChanged = (peers, event, info) => {
    if (tray) {
      const count = lan.getPeers().length;
      tray.setToolTip(`数字共生体桌宠${count > 0 ? `（${count} 个在线）` : '（联机中…）'}`);
    }
    // 通知渲染进程 peer 列表变化（用于 UI 提示）
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('peers-changed', { peers, event, info });
    }
  };
});

app.on('window-all-closed', () => {
  if (cursorTimer) clearInterval(cursorTimer);
  if (physicsTimer) clearInterval(physicsTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  stopMouseHook();
  lan.stop();
  if (tray) tray.destroy();
  app.quit();
});
