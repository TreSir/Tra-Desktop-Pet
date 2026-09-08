const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const LanManager = require('./lan.js');

// ── userData 重定向（必须在所有 app.getPath('userData') 之前执行）──
// 把用户数据目录重定向到项目内 .userdata/，避免沙盒限制访问 AppData
const USER_DATA_DIR = path.join(__dirname, '.userdata');
try {
  if (!fs.existsSync(USER_DATA_DIR)) fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  app.setPath('userData', USER_DATA_DIR);
} catch (e) {
  console.warn('[MAIN] Cannot redirect userData:', e.message);
}

// ── 加载统一配置文件 ──
let GAME_CONFIG = { characters: {}, shop: { food: [], emotion: [], effect: [] } };
try {
  const configPath = path.join(__dirname, 'game_config.json');
  GAME_CONFIG = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  console.log('[CONFIG] Loaded game_config.json');
} catch (e) {
  console.warn('[CONFIG] Failed to load game_config.json:', e.message);
}

// ── 食物放置模式 ──
let foodModeEnabled = false;       // 默认关闭
const foods = [];                  // [{id, screenX, screenY, placeTime, type}]
let foodIdCounter = 0;
const FOOD_TYPES = ['🍎', '🍖', '🍰', '🍬', '🍪', '🥕', '🐟', '🧀'];
let foodWindow = null;             // 全屏透明食物显示窗口

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

// PowerShell 脚本：用 GetAsyncKeyState 统一监听全局快捷键
// 边沿触发：仅在某键从未按→按下瞬间输出，避免重复
// 输出格式：M,x,y = Ctrl+左键；H = H 键
const GLOBAL_HOOK_SCRIPT = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class U {
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int v);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
}
"@
$lastLeft = $false
$lastH = $false
while ($true) {
  $ctrl = ([U]::GetAsyncKeyState(0x11) -band 0x8000) -ne 0
  $left = ([U]::GetAsyncKeyState(0x01) -band 0x8000) -ne 0
  $h = ([U]::GetAsyncKeyState(0x48) -band 0x8000) -ne 0
  if ($ctrl -and $left -and -not $lastLeft) {
    $pt = New-Object U+POINT
    [U]::GetCursorPos([ref]$pt) | Out-Null
    Write-Output "M,$($pt.X),$($pt.Y)"
    [Console]::Out.Flush()
  }
  if ($h -and -not $lastH) {
    Write-Output "H"
    [Console]::Out.Flush()
  }
  $lastLeft = $left
  $lastH = $h
  Start-Sleep -Milliseconds 20
}
`;

let globalHookProc = null;   // 统一的快捷键监听进程（合并鼠标+键盘）
let petHidden = false;       // 桌宠是否处于隐藏状态
let hookStopping = false;    // 主动停止标志（避免主动停止后自动重启）
let hookRestartTimer = null; // 钩子异常退出后的自动重启定时器

function startGlobalHook() {
  if (globalHookProc) return;
  hookStopping = false;  // 重置标志，让 exit 处理器能自动重启
  const encoded = Buffer.from(GLOBAL_HOOK_SCRIPT, 'utf16le').toString('base64');
  const psExe = path.join(
    process.env.windir || process.env.SystemRoot || 'C:\\Windows',
    'System32\\WindowsPowerShell\\v1.0\\powershell.exe'
  );
  try {
    globalHookProc = spawn(psExe, ['-NoProfile', '-EncodedCommand', encoded], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (e) {
    console.error('[HOOK] PowerShell spawn failed:', e.message);
    globalHookProc = null;
    return;
  }
  globalHookProc.on('error', (e) => {
    console.error('[HOOK] PowerShell error:', e.message);
    globalHookProc = null;
  });
  // 钩子进程异常退出时自动重启，保证 H 键/Ctrl+左键始终可用
  globalHookProc.on('exit', (code) => {
    globalHookProc = null;
    if (hookStopping) {
      console.log('[HOOK] Global hook stopped');
      return;
    }
    console.warn(`[HOOK] Global hook exited unexpectedly (code=${code}), restarting in 2s...`);
    if (hookRestartTimer) clearTimeout(hookRestartTimer);
    hookRestartTimer = setTimeout(() => {
      hookRestartTimer = null;
      if (!app.isQuitting) startGlobalHook();
    }, 2000);
  });
  let buf = '';
  globalHookProc.stdout.on('data', (chunk) => {
    buf += chunk.toString();
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      if (line === 'H') {
        togglePetVisibility();
      } else if (line.startsWith('M,')) {
        // Ctrl+左键放置食物（仅食物模式开启时处理）
        if (foodModeEnabled) {
          const parts = line.slice(2).split(',');
          const sx = parseInt(parts[0], 10);
          const sy = parseInt(parts[1], 10);
          if (!isNaN(sx) && !isNaN(sy)) placeFoodAt(sx, sy);
        }
      }
    }
  });
  console.log('[HOOK] Global hook started (H + Ctrl+LeftClick)');
}

function stopGlobalHook() {
  hookStopping = true;
  if (hookRestartTimer) { clearTimeout(hookRestartTimer); hookRestartTimer = null; }
  if (globalHookProc) {
    try { globalHookProc.kill(); } catch (e) {}
    globalHookProc = null;
  }
  console.log('[HOOK] Global hook stop requested');
}

// 切换桌宠可见性：触发动画（隐藏/显示都由渲染进程动画驱动）
function togglePetVisibility() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isVisible() && !petHidden) {
    // 当前可见 → 触发隐藏动画（渲染进程播放完才 hide）
    mainWindow.webContents.send('hide-toggle', 'hide');
    console.log('[HKEY] Hide animation triggered');
  } else {
    // 当前隐藏 → 在鼠标位置弹出，并触发显示动画
    const { x, y } = screen.getCursorScreenPoint();
    const CANVAS_CX = 210, CANVAS_CY = 230;
    const nx = Math.round(x - CANVAS_CX);
    const ny = Math.round(y - CANVAS_CY);
    mainWindow.setPosition(nx, ny);
    mainWindow.show();
    mainWindow.focus();
    petHidden = false;
    mainWindow.webContents.send('hide-toggle', 'show');
    console.log(`[HKEY] Show animation at mouse (${x}, ${y})`);
  }
}

// 渲染进程动画完成后真正隐藏窗口
ipcMain.on('pet-hidden-anim-done', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
    petHidden = true;
    console.log('[HKEY] Pet hidden (anim done)');
  }
});

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
    console.log('[FOOD] Mode enabled, shortcut: Ctrl+LeftClick');
  } else {
    foods.length = 0;
    eatenFoodIds.clear();  // 清空已消费记录（id 单调递增，不会误伤新食物）
    sendFoodsToRenderer();
    if (foodWindow && !foodWindow.isDestroyed()) {
      foodWindow.hide();
    }
    console.log('[FOOD] Mode disabled, all foods cleared');
  }
}

// ── 设置系统 ──
let settingsWindow = null;
const settingsPath = path.join(app.getPath('userData'), 'settings.json');
// 默认设置
const DEFAULT_SETTINGS = {
  walkSpeed: 28,
  foodSeekSpeed: 320,
  foodEatDist: 45,
  energyDecay: 0.3,
  energyRecover: 2.0,
  eyeTrack: true,
  blink: true,
  particles: true,
  shopTheme: 'aurora', // 商店主题：aurora=极光玻璃 / sweet=甜暖风 / pixel=像素风
};
let settings = { ...DEFAULT_SETTINGS };

// ── 羁绊币系统（接触宠物获得，可兑换交互）──
const coinsPath = path.join(app.getPath('userData'), 'coins.json');
let coins = 0;
function loadCoins() {
  try {
    if (fs.existsSync(coinsPath)) {
      const data = JSON.parse(fs.readFileSync(coinsPath, 'utf-8'));
      coins = Math.max(0, data.coins | 0);
    }
  } catch (e) {
    console.warn('[COINS] Load failed:', e.message);
  }
  console.log(`[COINS] Loaded: ${coins}`);
}
function saveCoins() {
  try {
    fs.writeFileSync(coinsPath, JSON.stringify({ coins }, null, 2));
  } catch (e) {
    console.warn('[COINS] Save failed:', e.message);
  }
}

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      settings = { ...DEFAULT_SETTINGS, ...data };
    }
  } catch (e) {
    console.warn('[SETTINGS] Load failed:', e.message);
  }
  console.log('[SETTINGS] Loaded:', settings);
}

function saveSettings() {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    return true;
  } catch (e) {
    console.warn('[SETTINGS] Save failed:', e.message);
    return false;
  }
}

// 把子窗口摆到主窗口旁边（右侧优先，超出屏幕则左侧，再不行则屏幕居中）
function positionNearMain(win) {
  const [w, h] = win.getSize();
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  let x, y;
  if (mainWindow && !mainWindow.isDestroyed()) {
    const [mx, my] = mainWindow.getPosition();
    const [mw] = mainWindow.getSize();
    if (mx + mw + 12 + w <= sw) {
      x = mx + mw + 12;            // 主窗口右侧
    } else if (mx - 12 - w >= 0) {
      x = mx - 12 - w;             // 主窗口左侧
    } else {
      x = Math.floor((sw - w) / 2); // 屏幕水平居中
    }
    y = Math.max(0, Math.min(my, sh - h)); // 跟随主窗口高度并夹紧
  } else {
    x = Math.floor((sw - w) / 2);
    y = Math.floor((sh - h) / 2);
  }
  win.setPosition(x, y);
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: Math.min(600, screen.getPrimaryDisplay().workAreaSize.width),
    height: Math.min(780, screen.getPrimaryDisplay().workAreaSize.height),
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    hasShadow: false,
    roundedCorners: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'settings_preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  positionNearMain(settingsWindow);
  settingsWindow.loadFile('renderer/settings.html');
  settingsWindow.on('closed', () => { settingsWindow = null; });
  settingsWindow.webContents.on('console-message', (_e, level, message) => {
    console.log(`[SETTINGS-WIN] ${message}`);
  });
}

// ── 设置 IPC ──
ipcMain.handle('settings-get-all', () => settings);

ipcMain.handle('settings-set', (_e, payload = {}) => {
  const { key, value } = payload;
  if (key === 'shopTheme') return { ok: setShopTheme(value) };
  const limits = { walkSpeed:[10,80], foodSeekSpeed:[80,800], foodEatDist:[20,100], energyDecay:[0.1,2], energyRecover:[0.5,10] };
  const valid = Object.hasOwn(limits,key)
    ? Number.isFinite(value) && value >= limits[key][0] && value <= limits[key][1]
    : ['eyeTrack','blink','particles'].includes(key) && typeof value === 'boolean';
  if (valid) {
    const oldVal = settings[key];
    settings[key] = value;
    if (!saveSettings()) { settings[key] = oldVal; return { ok:false }; }
    // 推送给桌宠渲染进程实时应用
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('settings-changed', { key, value });
    }
    console.log(`[SETTINGS] ${key}: ${oldVal} -> ${value}`);
    return { ok:true };
  }
  return { ok:false };
});

ipcMain.on('ui-open-settings', () => createSettingsWindow());
ipcMain.on('ui-open-shop', () => createShopWindow());
ipcMain.handle('shop-use-emotion', (_e, id) => {
  if (!SHOP_CATALOG.emotion.some(item => item.id === id)) return { ok:false };
  return { ok: tryEmotion(id) };
});

ipcMain.on('settings-close', () => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.close();
  }
});

// ── 羁绊币 IPC ──
function broadcastCoins() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('coins-update', coins);
  }
  if (shopWindow && !shopWindow.isDestroyed()) {
    shopWindow.webContents.send('coins-update', coins);
  }
  cachedMenu = null;
  menuCacheKey = '';
}

// 渲染进程上报获得金币
ipcMain.on('coins-add', (_e, amount) => {
  const n = Math.max(0, amount | 0);
  if (n <= 0) return;
  coins += n;
  saveCoins();
  broadcastCoins();
  console.log(`[COINS] +${n} → ${coins}`);
});

// 渲染进程查询余额
ipcMain.handle('coins-get', () => coins);

// 渲染进程消费金币（返回 {ok, coins}）
ipcMain.handle('coins-spend', (_e, amount) => {
  const n = Math.max(0, amount | 0);
  if (n <= 0) return { ok: false, coins, reason: 'invalid' };
  if (coins < n) return { ok: false, coins, reason: 'insufficient' };
  coins -= n;
  saveCoins();
  broadcastCoins();
  console.log(`[COINS] -${n} → ${coins}`);
  return { ok: true, coins };
});

// ═══════════════════════════════════════════════
// 商店系统
// ═══════════════════════════════════════════════
// 商品目录从 game_config.json 加载（food=消耗品 / emotion=永久解锁表情 / effect=永久解锁特效）
const SHOP_CATALOG = GAME_CONFIG.shop || { food: [], emotion: [], effect: [] };

// 已解锁商品（emotion/effect 永久；food 不存于此）
const shopUnlockPath = path.join(app.getPath('userData'), 'shop_unlocks.json');
let unlockedItems = new Set();   // ['love','rainbow',...]
let enabledEffects = new Set();  // ['hearts','stardust',...]

function loadShopUnlocks() {
  try {
    if (fs.existsSync(shopUnlockPath)) {
      const data = JSON.parse(fs.readFileSync(shopUnlockPath, 'utf-8'));
      if (Array.isArray(data.items)) unlockedItems = new Set(data.items);
      if (Array.isArray(data.effectsOn)) enabledEffects = new Set(data.effectsOn);
    }
  } catch (e) { console.warn('[SHOP] Load failed:', e.message); }
  console.log(`[SHOP] Unlocked: ${[...unlockedItems].join(',') || '(none)'}`);
  console.log(`[SHOP] Effects on: ${[...enabledEffects].join(',') || '(none)'}`);
}

function saveShopUnlocks() {
  try {
    fs.writeFileSync(shopUnlockPath, JSON.stringify({
      items: [...unlockedItems],
      effectsOn: [...enabledEffects],
    }, null, 2));
  } catch (e) { console.warn('[SHOP] Save failed:', e.message); }
}

// 判断是否已解锁
function isUnlocked(itemId) { return unlockedItems.has(itemId); }
// 判断特效是否启用
function isEffectOn(itemId) { return enabledEffects.has(itemId); }

// 商店窗口
let shopWindow = null;
function createShopWindow() {
  if (shopWindow && !shopWindow.isDestroyed()) {
    shopWindow.show();
    shopWindow.focus();
    return;
  }
  shopWindow = new BrowserWindow({
    width: Math.min(740, screen.getPrimaryDisplay().workAreaSize.width),
    height: Math.min(790, screen.getPrimaryDisplay().workAreaSize.height),
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    hasShadow: false,
    roundedCorners: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'shop_preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  positionNearMain(shopWindow);
  shopWindow.loadFile('renderer/shop.html');
  shopWindow.on('closed', () => { shopWindow = null; });
  shopWindow.webContents.on('console-message', (_e, level, message) => {
    console.log(`[SHOP-WIN] ${message}`);
  });
}

// ── 商店 IPC ──
// 获取商品目录 + 当前余额 + 解锁状态 + 特效启用状态
ipcMain.handle('shop-get-state', () => {
  return {
    catalog: SHOP_CATALOG,
    coins,
    unlocked: [...unlockedItems],
    effectsOn: [...enabledEffects],
  };
});

// 购买商品
// 食物：扣币后立即在桌宠附近放一份食物（采用宠物当前位置）
// 表情/特效：扣币后加入解锁列表（特效默认启用）
ipcMain.handle('shop-buy', (_e, itemId) => {
  // 查找商品及其类别
  let found = null;
  let category = null;
  for (const [cat, list] of Object.entries(SHOP_CATALOG)) {
    found = list.find(it => it.id === itemId);
    if (found) { category = cat; break; }
  }
  if (!found) return { ok: false, reason: 'not_found' };

  // 食物：消耗品，每次购买都放一份
  if (category === 'food') {
    if (coins < found.price) return { ok: false, coins, reason: 'insufficient' };
    coins -= found.price;
    saveCoins();
    broadcastCoins();

    const emojiMap = { apple:'🍎', candy:'🍬', meat:'🍖', fish:'🐟', cake:'🍰' };
    const emoji = emojiMap[found.id] || '🍎';
    let placed = false;
    if (mainWindow && !mainWindow.isDestroyed()) {
      const [wx, wy] = mainWindow.getPosition();
      // 按已有食物数量错位放置，避免连买多个堆在同一点
      const foodIdx = foods.length;
      const sx = wx + 210 + 80 + (foodIdx % 4) * 48;
      const sy = wy + 100 - Math.floor(foodIdx / 4) * 42;
      foods.push({
        id: ++foodIdCounter,
        screenX: sx, screenY: sy,
        placeTime: Date.now(),
        type: emoji,
        effect: found.effect || null,
      });
      // 若食物窗口未创建则创建一次
      createFoodWindow();
      if (foodWindow && !foodWindow.isDestroyed()) {
        foodWindow.show();
        foodWindow.moveTop();
      }
      sendFoodsToRenderer();
      placed = true;
    }
    console.log(`[SHOP] Bought food ${itemId} for ${found.price}, coins=${coins}, placed=${placed}`);
    return { ok: true, coins, placed };
  }

  // 表情/特效：永久解锁，购买一次后不能再买
  if (unlockedItems.has(itemId)) return { ok: false, reason: 'already_owned' };
  if (coins < found.price) return { ok: false, coins, reason: 'insufficient' };

  coins -= found.price;
  saveCoins();
  broadcastCoins();

  unlockedItems.add(itemId);
  if (category === 'effect') enabledEffects.add(itemId);
  saveShopUnlocks();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('shop-unlocks-changed', {
      unlocked: [...unlockedItems],
      effectsOn: [...enabledEffects],
    });
  }

  console.log(`[SHOP] Bought ${category} ${itemId} for ${found.price}, coins=${coins}`);
  return { ok: true, coins, placed: false };
});

// 切换特效启用状态（仅对已解锁的特效有效）
ipcMain.handle('shop-toggle-effect', (_e, itemId) => {
  if (!unlockedItems.has(itemId)) return { ok: false, reason: 'not_unlocked' };
  if (enabledEffects.has(itemId)) enabledEffects.delete(itemId);
  else enabledEffects.add(itemId);
  saveShopUnlocks();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('shop-unlocks-changed', {
      unlocked: [...unlockedItems],
      effectsOn: [...enabledEffects],
    });
  }
  console.log(`[SHOP] Effect ${itemId} ${enabledEffects.has(itemId) ? 'ON' : 'OFF'}`);
  return { ok: true, effectsOn: [...enabledEffects] };
});

// 触发表情切换（已解锁表情才能用，由托盘菜单调用）
function tryEmotion(emoKey) {
  if (!unlockedItems.has(emoKey) && !['happy','angry','sad','disdain','shocked','scared','relaxed'].includes(emoKey)) {
    // 未解锁且非默认表情
    return false;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('emotion-change', emoKey);
  }
  return true;
}

ipcMain.on('shop-close', () => {
  if (shopWindow && !shopWindow.isDestroyed()) {
    shopWindow.close();
  }
});

// ── 商店主题（极光玻璃 / 甜暖风 / 像素风）──
function setShopTheme(theme) {
  if (theme === 'aurora' || theme === 'sweet' || theme === 'pixel') {
    const previous = settings.shopTheme;
    settings.shopTheme = theme;
    if (!saveSettings()) { settings.shopTheme = previous; return false; }
    cachedMenu = null;  // 触发托盘菜单重建，刷新单选选中态
    // 推送给桌宠渲染进程实时更新主题视觉（托盘图标等）
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('settings-changed', { key: 'shopTheme', value: theme });
    }
    // 推送给打开中的商店窗口，主题实时切换（无需重开）
    if (shopWindow && !shopWindow.isDestroyed()) {
      shopWindow.webContents.send('shop-theme-changed', theme);
    }
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('shop-theme-changed', theme);
    }
    if (foodWindow && !foodWindow.isDestroyed()) {
      foodWindow.webContents.send('shop-theme-changed', theme);
    }
    return true;
  }
  return false;
}
ipcMain.handle('shop-get-theme', () => settings.shopTheme || 'aurora');
ipcMain.on('shop-set-theme', (_e, theme) => setShopTheme(theme));

// ── 角色定义（从 game_config.json 加载，用于托盘菜单）──
const CHARACTER_OPTIONS = Object.entries(GAME_CONFIG.characters || {}).map(([key, c]) => ({
  key,
  name: c.name,
  icon: c.icon,
}));

function getSkinOptions(charKey) {
  const character = GAME_CONFIG.characters && GAME_CONFIG.characters[charKey];
  if (!character) return [{ id: 'default', name: '默认', icon: '🎨' }];
  return [
    { id: 'default', name: '默认', icon: character.icon },
    ...(character.skins || []).map(skin => ({
      id: skin.id,
      name: skin.name || skin.id,
      icon: skin.icon || character.icon,
    })),
  ];
}

function normalizeSkin(charKey, skinKey) {
  return getSkinOptions(charKey).some(skin => skin.id === skinKey) ? skinKey : 'default';
}

// ── 角色持久化 ──
let currentCharacter = 'slime';
let currentSkin = 'default';
const charConfigPath = path.join(app.getPath('userData'), 'character.json');

function loadCharacter() {
  try {
    if (fs.existsSync(charConfigPath)) {
      const data = JSON.parse(fs.readFileSync(charConfigPath, 'utf-8'));
      if (data.character && CHARACTER_OPTIONS.find(c => c.key === data.character)) {
        currentCharacter = data.character;
        currentSkin = normalizeSkin(currentCharacter, data.skin || 'default');
      }
    }
  } catch (e) { /* ignore */ }
}

function saveCharacter(charKey, skinKey = 'default') {
  currentCharacter = charKey;
  currentSkin = normalizeSkin(charKey, skinKey);
  try {
    fs.writeFileSync(charConfigPath, JSON.stringify({ character: charKey, skin: currentSkin }), 'utf-8');
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
    width: 420,
    height: 460,
    x: Math.floor((sw - 420) / 2),
    y: sh - 500,
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

  // 页面加载完成后发送已保存的角色与主题
  mainWindow.webContents.once('did-finish-load', () => {
    if (currentCharacter !== 'slime' || currentSkin !== 'default') {
      mainWindow.webContents.send('character-change', { character: currentCharacter, skin: currentSkin });
    }
    mainWindow.webContents.send('settings-changed', { key: 'shopTheme', value: settings.shopTheme || 'aurora' });
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
  // 计算缓存 key：包含 lanEnabled/autoWalk/clickThrough/currentCharacter/peer 数量/食物模式/商店主题
  const peerCount = lan.getPeers().length;
  const key = `${lanEnabled}|${autoWalk}|${clickThrough}|${currentCharacter}|${currentSkin}|${peerCount}|${foodModeEnabled}|${settings.shopTheme}`;
  if (menuCacheKey !== key || !cachedMenu) {
    menuCacheKey = key;
    cachedMenu = buildMenu();
  }
  return cachedMenu;
}

// ── 构建托盘菜单（含动态 peer 列表）──
function buildMenu() {
  // 默认免费表情；商店解锁表情单独追加
  const freeEmotions = {
    happy: '高兴', angry: '愤怒', sad: '悲伤',
    disdain: '鄙夷', shocked: '震惊',
    scared: '害怕', relaxed: '放松',
  };
  const shopEmotions = {
    proud: '得意', dizzy: '晕眩', badsmile: '坏笑', love: '心动',
  };
  const statusLabels = {
    idle: '待机', working: '工作中', waiting: '等待确认',
    success: '任务成功', error: '任务失败', thinking: '思考中'
  };

  const emotionItems = [
    ...Object.entries(freeEmotions).map(([key, label]) => ({
      label,
      click: () => tryEmotion(key),
    })),
    ...Object.entries(shopEmotions)
      .filter(([key]) => unlockedItems.has(key))
      .map(([key, label]) => ({
        label: `${label} ★`,
        click: () => tryEmotion(key),
      })),
  ];

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

  // 居中回到屏幕底部的通用动作
  const recallToBottom = () => {
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
    mainWindow.setPosition(Math.floor((sw - 420) / 2), sh - 500);
  };

  const menuTemplate = [
    { label: '🐾 数字共生体桌宠', enabled: false },
    { label: `🪙 羁绊币  ${coins}`, enabled: false },
    { type: 'separator' },
    // ── 互动（收成一个子菜单）──
    {
      label: '🎮 互动',
      submenu: [
        { label: '🎭 切换表情', submenu: emotionItems },
        { label: '📋 任务状态', submenu: statusItems },
        { label: '🍖 喂食', click: () => mainWindow.webContents.send('pet-feed') },
        { label: '💃 跳舞', click: () => mainWindow.webContents.send('pet-dance') },
        { label: '😴 睡眠切换', click: () => mainWindow.webContents.send('pet-sleep-toggle') },
        { label: '🔍 重置缩放', click: () => mainWindow.webContents.send('pet-reset-zoom') },
      ],
    },
    {
      label: '🧬 切换角色',
      submenu: CHARACTER_OPTIONS.map(c => ({
        label: `${c.icon} ${c.name}`,
        type: 'radio',
        checked: currentCharacter === c.key,
        click: () => {
          saveCharacter(c.key, 'default');
          mainWindow.webContents.send('character-change', { character: c.key, skin: 'default' });
        }
      }))
    },
    {
      label: '🎨 切换皮肤',
      submenu: getSkinOptions(currentCharacter).map(skin => ({
        label: `${skin.icon} ${skin.name}`,
        type: 'radio',
        checked: currentSkin === skin.id,
        click: () => {
          saveCharacter(currentCharacter, skin.id);
          mainWindow.webContents.send('character-change', { character: currentCharacter, skin: currentSkin });
        },
      })),
    },
    { type: 'separator' },
    // ── 设置 ──
    {
      label: '🖱 点击穿透 (智能)',
      type: 'checkbox',
      checked: clickThrough,
      click: (item) => {
        // 智能穿透：勾选时由渲染进程根据宠物范围动态切换；取消时全程可点击
        clickThrough = item.checked;
        if (clickThrough) {
          mainWindow.setIgnoreMouseEvents(true, { forward: true });
        } else {
          mainWindow.setIgnoreMouseEvents(false);
        }
      }
    },
    {
      label: '🚶 自动行走',
      type: 'checkbox',
      checked: autoWalk,
      click: (item) => {
        autoWalk = item.checked;
        mainWindow.webContents.send('auto-walk-toggle', autoWalk);
      }
    },
    {
      label: '🥕 放置食物模式',
      type: 'checkbox',
      checked: foodModeEnabled,
      click: (item) => toggleFoodMode(item.checked)
    },
    {
      label: '🎨 主题',
      submenu: [
        {
          label: '🌌 极光玻璃',
          type: 'radio',
          checked: settings.shopTheme === 'aurora',
          click: () => setShopTheme('aurora'),
        },
        {
          label: '🍬 甜暖风',
          type: 'radio',
          checked: settings.shopTheme === 'sweet',
          click: () => setShopTheme('sweet'),
        },
        {
          label: '🕹 像素风',
          type: 'radio',
          checked: settings.shopTheme === 'pixel',
          click: () => setShopTheme('pixel'),
        },
      ],
    },
    { label: '🛒 羁绊商店…', click: () => createShopWindow() },
    { label: '⚙️ 设置…', click: () => createSettingsWindow() },
    { type: 'separator' },
    // ── 联机 ──
    {
      label: '📡 联机模式',
      type: 'checkbox',
      checked: lanEnabled,
      click: (item) => toggleLan(item.checked)
    },
  ];

  // 仅在联机开启时显示扔给/召回
  if (lanEnabled) {
    menuTemplate.push(
      { label: '📤 扔给…', submenu: lanMenuItems },
      {
        label: '📥 召回桌宠',
        click: () => { recallToBottom(); mainWindow.webContents.send('pet-recall'); }
      }
    );
  }

  menuTemplate.push(
    { type: 'separator' },
    { label: '⬇️ 回到屏幕底部', click: recallToBottom },
    { type: 'separator' },
    { label: '🚪 退出', click: () => app.quit() }
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
    mainWindow.setPosition(Math.floor((sw - 420) / 2), sh - 500);
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
// 当前 zoom（由渲染进程同步，用于计算光圈可贴边的范围）
let petZoom = 1.0;
const CANVAS_CX = 210;  // canvas 中心 x（与 CFG.cx 一致）
const CANVAS_CY = 230;  // canvas 中心 y（与 CFG.cy 一致）
const AURA_FACTOR = 1.5; // 光圈半径 = r * 1.5

ipcMain.on('sync-zoom', (_e, zoom) => {
  petZoom = Math.max(0.5, Math.min(2.0, zoom));
});

ipcMain.on('move-window', (_e, dx, dy) => {
  if (!mainWindow) return;
  const [x, y] = mainWindow.getPosition();
  const [w, h] = mainWindow.getSize();
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  // 光圈半径（屏幕坐标）：r * zoom * 1.5
  const auraR = 60 * petZoom * AURA_FACTOR;
  // 让光圈能贴到屏幕边缘：窗口可移出屏幕，移出量 = canvas 中心到边的距离 - 光圈半径
  const marginX = CANVAS_CX - auraR;  // 左右各可移出这么多
  const marginYTop = CANVAS_CY - auraR; // 上
  const marginYBottom = h - CANVAS_CY - auraR; // 下
  const nx = Math.round(Math.max(-marginX, Math.min(sw - w + marginX, x + dx)));
  const ny = Math.round(Math.max(-marginYTop, Math.min(sh - h + marginYBottom, y + dy)));
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
  let lastPx = null, lastPy = null;

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

    // 地面弹跳（按光圈半径计算，让光圈贴地）
    const auraR = 60 * petZoom * AURA_FACTOR;
    const floorY = sh - h + (h - CANVAS_CY) - auraR;

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
          mainWindow.setPosition(Math.floor((sw - 420) / 2), sh - 500);
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
    // 左右墙（按光圈半径计算，让光圈贴边弹跳）
    const marginX = CANVAS_CX - auraR;
    if (nx < -marginX) { nx = -marginX; velX = -velX * bounce; }
    if (nx > sw - w + marginX) { nx = sw - w + marginX; velX = -velX * bounce; }

    // 坐标合法性校验：多显示器切换/DPI 变化可能导致 NaN，避免 setPosition 抛错+定时器泄漏
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) {
      console.warn('[PHYSICS] Invalid position, aborting:', nx, ny);
      clearInterval(physicsTimer);
      physicsTimer = null;
      return;
    }
    const rx = Math.round(nx);
    const ry = Math.round(ny);
    // 位置未变则跳过 setPosition，减少主进程开销
    if (rx !== lastPx || ry !== lastPy) {
      try {
        mainWindow.setPosition(rx, ry);
        lastPx = rx;
        lastPy = ry;
      } catch (e) {
        console.warn('[PHYSICS] setPosition failed, aborting:', e.message);
        clearInterval(physicsTimer);
        physicsTimer = null;
        return;
      }
    }

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

// 点击穿透切换：true=窗口穿透到桌面，false=窗口可点击
// forward:true 让穿透状态下 mousemove 仍转发给渲染进程
ipcMain.on('set-click-through', (_e, through) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setIgnoreMouseEvents(!!through, { forward: !!through });
  }
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
ipcMain.on('character-sync', (_e, selection) => {
  const next = typeof selection === 'string'
    ? { character: selection, skin: 'default' }
    : selection;
  if (next && next.character && CHARACTER_OPTIONS.find(c => c.key === next.character)) {
    saveCharacter(next.character, next.skin || 'default');
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
// 已消费集合：防止渲染进程动画延迟导致同一食物被重复消费
const eatenFoodIds = new Set();
ipcMain.on('eat-food', (_e, foodId) => {
  if (eatenFoodIds.has(foodId)) return;   // 已被消费过，忽略
  const idx = foods.findIndex(f => f.id === foodId);
  if (idx >= 0) {
    foods.splice(idx, 1);
    eatenFoodIds.add(foodId);
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
      skin: currentSkin,
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
  loadSettings();  // 加载设置
  loadCoins();     // 加载羁绊币
  loadShopUnlocks();  // 加载商店解锁状态
  createWindow();
  createTray();
  startGlobalHook();  // 启动统一快捷键监听（H + Ctrl+LeftClick）
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
  stopGlobalHook();
  lan.stop();
  if (tray) tray.destroy();
  app.quit();
});
