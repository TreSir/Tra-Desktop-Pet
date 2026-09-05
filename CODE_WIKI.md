# Tra-Desktop-Pet · 数字共生体桌宠 — Code Wiki

> 一只住在你桌面上的暗色粘液生物桌宠，基于 Electron + Canvas 构建，零运行时依赖。
> 本文档对项目架构、模块职责、关键类与函数、依赖关系及运行方式做完整说明。

---

## 目录

1. [项目概览](#1-项目概览)
2. [整体架构](#2-整体架构)
3. [目录结构](#3-目录结构)
4. [主进程模块（main.js）](#4-主进程模块mainjs)
5. [渲染进程模块（renderer/）](#5-渲染进程模块renderer)
6. [预加载脚本（Preload）](#6-预加载脚本preload)
7. [局域网联机模块（lan.js）](#7-局域网联机模块lanjs)
8. [配置系统（game_config.json）](#8-配置系统game_configjson)
9. [关键数据结构](#9-关键数据结构)
10. [IPC 通信总览](#10-ipc-通信总览)
11. [依赖关系](#11-依赖关系)
12. [项目运行方式](#12-项目运行方式)
13. [核心机制详解](#13-核心机制详解)
14. [开发调试工具](#14-开发调试工具)
15. [已知限制](#15-已知限制)

---

## 1. 项目概览

| 属性 | 内容 |
| --- | --- |
| 项目名 | `symbiote-pet` (Tra-Desktop-Pet) |
| 版本 | 1.0.0 |
| 技术栈 | Electron 33 + 原生 Canvas 2D |
| 运行时依赖 | **零依赖**（仅 devDependencies: electron） |
| 平台 | Windows（macOS/Linux 部分功能受限） |
| 入口 | [main.js](file:///c:/Users/32935/Desktop/desktop-pet/main.js) |
| 许可证 | MIT |

**核心特性**：
- 7 个 AI 生成精灵图角色 + 实时绿幕抠图
- 12 种情绪 + 6 种任务状态的表情系统
- 抛掷物理引擎、眼球追踪、滚轮缩放、长按挣扎
- 食物放置系统（Ctrl+左键全局放置）
- 局域网联机（UDP 发现 + HTTP 传输，零依赖）
- 羁绊币 + 商店系统（食物/表情/特效）
- 系统托盘菜单、点击穿透、睡眠模式、进化系统

---

## 2. 整体架构

项目采用标准 Electron 双进程架构，加上多个独立子窗口与一个原生 PowerShell 钩子进程：

```
┌─────────────────────────────────────────────────────────────┐
│                     主进程 main.js                          │
│  ┌─────────────┐ ┌─────────────┐ ┌──────────────────────┐   │
│  │ 窗口管理     │ │ 托盘菜单     │ │ 物理引擎(16ms tick)   │   │
│  │ (主/食物/    │ │ (缓存构建)   │ │ 重力/弹跳/边缘飞出    │   │
│  │  设置/商店)  │ ├─────────────┤ ├──────────────────────┤   │
│  │             │ │ 设置/羁绊币/ │ │ 光标轮询(80ms)        │   │
│  │             │ │ 商店持久化   │ │ (眼球追踪用)          │   │
│  ├─────────────┴─────────────┴─┴──────────────────────┤   │
│  │ IPC 通道（ipcMain.on / ipcMain.handle）             │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │ PowerShell 全局钩子（spawn 子进程）                  │   │
│  │  - H 键 → 切换桌宠显隐                                │   │
│  │  - Ctrl+左键 → 放置食物                              │   │
│  └──────────────────────────────────────────────────────┘   │
│                              ▲                              │
└──────────────────────────────│──────────────────────────────┘
                               │ contextBridge (preload.js)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              渲染进程 renderer/index.html                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  characters.js  ─→  角色定义/精灵图加载/绿幕抠图/绘制 │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │  app.js  ─→  状态机/物理/表情/动画/粒子/交互/IPC监听  │   │
│  │   ├─ pet 全局状态对象（情绪/能量/连击/进化/金币...）  │   │
│  │   ├─ 主渲染循环 loop() (requestAnimationFrame)        │   │
│  │   ├─ 各类粒子系统（心形/汗滴/Zzz/星尘/音符/脚印...）  │   │
│  │   └─ 鼠标/键盘事件处理                                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘

┌──────────────────────┐  ┌──────────────────────┐
│ 食物窗口              │  │ 设置窗口              │
│ food_window.html      │  │ settings.html         │
│ (全屏透明 click-through│  │ (圆角玻璃风 iOS 风格) │
│  food_preload.js)     │  │ settings_preload.js)  │
└──────────────────────┘  └──────────────────────┘

┌──────────────────────┐  ┌──────────────────────────────────┐
│ 商店窗口              │  │  局域网联机 lan.js (LanManager)   │
│ shop.html             │  │  ├─ UDP 广播发现 (port 19827)     │
│ (商品网格/Toast       │  │  ├─ HTTP 接收桌宠 (port 19826)    │
│  shop_preload.js)     │  │  └─ 自动重试 + 端口探测           │
└──────────────────────┘  └──────────────────────────────────┘
```

---

## 3. 目录结构

```
Tra-Desktop-Pet/
├── main.js                  # Electron 主进程入口
├── preload.js               # 主窗口预加载（contextBridge 暴露 petAPI）
├── food_preload.js          # 食物窗口预加载（暴露 foodAPI）
├── settings_preload.js      # 设置窗口预加载（暴露 settingsAPI）
├── shop_preload.js          # 商店窗口预加载（暴露 shopAPI）
├── lan.js                   # 局域网联机模块（UDP+HTTP，零依赖）
├── game_config.json         # 统一数值配置（角色/商店/金币）
├── package.json
│
├── renderer/                # 渲染进程
│   ├── index.html           # 桌宠主窗口（同步加载 game_config.json）
│   ├── food_window.html     # 食物显示窗口（全屏透明）
│   ├── settings.html        # 设置面板（macOS 风格）
│   ├── shop.html            # 羁绊商店
│   ├── app.js               # 主逻辑（~3250 行，状态机+物理+动画）
│   ├── characters.js        # 角色系统（精灵图+绿幕抠图+形变动画）
│   ├── style.css            # 主窗口样式
│   └── assets/              # AI 生成的角色精灵图源图（jpg）
│       ├── slime.jpg / cat.jpg / ghost.jpg / flame.jpg
│       ├── robot.jpg / kunkun.jpg / tree.jpg
│       └── v2_mryook77_*.jpg
│
├── analyze_*.js             # 开发调试：分析精灵图边缘/颜色分布
│   ├── analyze_shape.js
│   ├── analyze_sides.js
│   ├── analyze_tree.js
│   └── analyze_tree_electron.js
├── dl_tree.js               # 开发调试：下载树角色素材
├── verify_tree_keyed.js     # 开发调试：验证抠图结果
│
├── .userdata/               # 运行时用户数据（gitignored）
│   ├── settings.json        # 用户设置
│   ├── character.json       # 当前角色
│   ├── coins.json           # 羁绊币余额
│   ├── shop_unlocks.json    # 商店解锁状态
│   └── heartbeat.json       # 心跳日志（自动测试用）
└── LICENSE / README.md / .gitignore
```

---

## 4. 主进程模块（main.js）

[main.js](file:///c:/Users/32935/Desktop/desktop-pet/main.js) 是 Electron 主进程入口，承担窗口管理、托盘、物理引擎、IPC、全局钩子、持久化等职责。约 1160 行。

### 4.1 启动流程

```
app.whenReady()
  ├─ loadCharacter()         # 加载上次角色
  ├─ loadSettings()          # 加载设置
  ├─ loadCoins()             # 加载羁绊币
  ├─ loadShopUnlocks()       # 加载商店解锁
  ├─ createWindow()          # 创建主窗口（透明置顶无边框）
  ├─ createTray()            # 创建系统托盘
  ├─ startGlobalHook()       # 启动 PowerShell 全局钩子
  ├─ writeHeartbeat()        # 写心跳
  ├─ setInterval(writeHeartbeat, 5000)
  └─ lan.onPetReceived/onPeersChanged 回调注册
```

**关键设计**：在 `app.getPath('userData')` 之前把 userData 重定向到项目内 `.userdata/`，避免沙盒限制访问 AppData。

### 4.2 关键函数

#### 窗口创建

| 函数 | 职责 |
| --- | --- |
| `createWindow()` | 创建主桌宠窗口：420×460，透明、置顶（`screen-saver` 级别）、无任务栏、`paintWhenInitiallyHidden:true` |
| `createFoodWindow()` | 全屏透明食物窗口，`setIgnoreMouseEvents(true)` 全程 click-through，`screen-saver` z-order |
| `createSettingsWindow()` | 380×560 圆角玻璃风设置窗口 |
| `createShopWindow()` | 460×620 商店窗口 |
| `createTray(iconDataUrl)` | 创建/更新托盘图标（由渲染进程 canvas 生成 dataURL） |

#### 物理引擎

| 函数 | 职责 |
| --- | --- |
| `ipcMain.on('physics-drop', (vx,vy))` | 抛掷物理：16ms tick，重力 0.9、弹跳 0.45、摩擦 0.88，含边缘飞出检测 |
| `ipcMain.on('physics-cancel')` | 取消物理（被接住时） |

物理引擎关键参数：
- `gravity = 0.9`，`bounce = 0.45`，`friction = 0.88`
- 光圈半径 `auraR = 60 * petZoom * 1.5`，用于贴边/贴地计算
- 联机模式边缘飞出阈值：`ny < -200 && velY < -3` 或左右超出 200px
- 静止判定：`|velY| < 0.8 && |velX| < 0.3 && ny >= floorY - 1` → 发送 `physics-landed`
- NaN 校验 + `setPosition` 失败保护，避免定时器泄漏

#### 全局钩子（PowerShell）

| 函数 | 职责 |
| --- | --- |
| `startGlobalHook()` | spawn PowerShell 子进程，用 `GetAsyncKeyState` 监听全局快捷键 |
| `stopGlobalHook()` | 终止钩子进程 |
| `togglePetVisibility()` | H 键触发：可见→播放隐藏动画；隐藏→在鼠标位置弹出 |
| `placeFoodAt(x,y)` | Ctrl+左键放置食物（随机类型） |

**钩子脚本**（`GLOBAL_HOOK_SCRIPT`）通过 `-EncodedCommand` base64 启动，边沿触发避免重复，输出格式：`M,x,y` = Ctrl+左键；`H` = H 键。

#### 持久化系统

| 函数 | 文件 | 职责 |
| --- | --- | --- |
| `loadSettings/saveSettings` | `.userdata/settings.json` | 8 项设置（速度/能量/开关） |
| `loadCoins/saveCoins` | `.userdata/coins.json` | 羁绊币余额 |
| `loadShopUnlocks/saveShopUnlocks` | `.userdata/shop_unlocks.json` | `{items:[], effectsOn:[]}` |
| `loadCharacter/saveCharacter` | `.userdata/character.json` | 当前角色 key |
| `writeHeartbeat` | `.userdata/heartbeat.json` | 5s 写一次，自动测试监控用 |

#### 托盘菜单

| 函数 | 职责 |
| --- | --- |
| `getCachedMenu()` | 菜单缓存：key 含 `lanEnabled|autoWalk|clickThrough|currentCharacter|peerCount|foodModeEnabled`，状态变化才重建 |
| `buildMenu()` | 构建菜单模板：表情/状态/喂食/跳舞/睡眠/角色切换/穿透/自动行走/食物模式/金币/商店/设置/联机 |
| `tryEmotion(emoKey)` | 触发表情（默认表情免费，商店表情需解锁） |
| `toggleLan(enable)` | 联机开关 |
| `sendPetToPeer(peer)` | 发送桌宠到 peer：序列化状态 → HTTP POST → 通知渲染进程 |

#### IPC 处理器（ipcMain）

| 通道 | 类型 | 职责 |
| --- | --- | --- |
| `move-window` | on | 移动主窗口（带光圈边界裁剪） |
| `sync-zoom` | on | 同步当前 zoom（0.5~2.0） |
| `start-cursor-poll` / `stop-cursor-poll` | on | 启停光标轮询（80ms，眼球追踪） |
| `physics-drop` / `physics-cancel` | on | 抛掷物理 |
| `set-click-through` | on | 切换窗口穿透（forward:true 转发 mousemove） |
| `set-tray-icon` | on | 设置托盘图标 |
| `pet-hidden-anim-done` | on | 隐藏动画完成 → 真正 hide 窗口 |
| `eat-food` | on | 桌宠吃掉食物 |
| `save-sprite-debug` | on | 调试：保存抠图 PNG |
| `character-sync` | on | 渲染进程同步角色变更 |
| `settings-get-all` | handle | 获取全部设置 |
| `settings-set` | on | 设置单项并广播给桌宠 |
| `coins-get` / `coins-add` / `coins-spend` | handle/on | 羁绊币增删查 |
| `shop-get-state` / `shop-buy` / `shop-toggle-effect` | handle | 商店状态/购买/切换特效 |
| `get-peers` | handle | 获取在线 peer |
| `send-pet-to` | handle | 手动发送桌宠到 peer |

---

## 5. 渲染进程模块（renderer/）

### 5.1 [app.js](file:///c:/Users/32935/Desktop/desktop-pet/renderer/app.js) — 主逻辑（~3250 行）

这是整个项目最核心、最庞大的文件，包含状态机、物理、表情、动画、粒子、交互、IPC 监听等所有桌宠逻辑。

#### 5.1.1 全局配置 `CFG`

```js
const CFG = {
  W: 420, H: 460,        // canvas 尺寸
  cx: 210, cy: 230, r: 60, // 宠物中心与半径
  walkSpeed: 28,
  eyeTrackK: 0.38,       // 眼球追踪系数
  dragThrowMin: 2,       // 拖拽抛出最小速度
};
```

#### 5.1.2 表情系统 `EMOTIONS`

12 种情绪，每种定义眼睛/嘴巴/色调/张力/辉光/眨眼速率：

| 情绪 | eye | mouth | 用途 |
| --- | --- | --- | --- |
| happy | crescent | smile_teeth | 高兴（默认免费） |
| angry | angry | frown_teeth | 愤怒 |
| sad | droop | frown | 悲伤 |
| disdain | half_lid | smirk | 鄙夷 |
| badsmile | gleam | grin_teeth | 坏笑（商店解锁） |
| shocked | circle | o_open | 震惊 |
| scared | dot | wavy | 害怕 |
| relaxed | curve_down | soft_smile | 放松 |
| proud | confident | smirk_teeth | 得意（商店解锁） |
| sleepy | curve_down | soft_smile | 困倦 |
| dizzy | circle | wavy | 晕眩（商店解锁） |
| love | heart | smile_teeth | 心动（商店解锁） |

**心情→表情映射** `MOOD_EMOTIONS`：90→love, 75→happy, 60→proud, 45→relaxed, 30→disdain, 15→sad, 0→angry。

**任务状态映射** `STATUS_MAP`：idle→relaxed, working→proud, waiting→disdain, success→happy, error→shocked, thinking→relaxed。

#### 5.1.3 核心状态对象 `pet`

`pet` 对象是整个桌宠的中枢状态，包含 30+ 子系统字段：

| 分类 | 字段 | 说明 |
| --- | --- | --- |
| 情绪 | `emotion`, `targetEmotion`, `params` | 当前/目标情绪与插值参数 |
| 角色 | `character` | slime/cat/ghost/flame/robot/kunkun/tree |
| 物理 | `bobY`, `walkOffset`, `squashX/Y`, `squashVX/VY`, `tilt`, `tiltV` | 弹簧物理 |
| 眨眼 | `blinkT`, `blinkPhase`, `blinkTimer` | 三阶段眨眼状态机 |
| 行走 | `walking`, `walkDir`, `walkTimer`, `walkAccum` | 自动漫步 |
| 拖拽 | `dragging`, `dragVelX/Y`, `dragHist`, `falling` | 拖拽+抛掷 |
| 鼠标 | `hovering`, `mouseRX/Y`, `_rawMouseX/Y` | 眼球追踪 |
| 情绪系统 | `mood`(0-100), `energy`(0-100), `sleeping`, `sleepTimer` | 心情/能量/睡眠 |
| 连击 | `combo`, `comboTimer`, `comboShake` | 点击连击 |
| 屏震 | `shakeIntensity`, `shakeX/Y` | 屏幕震动 |
| 残影 | `trail`, `trailTimer` | 拖拽/坠落残影 |
| 旋转 | `spin` | 三连击旋转 |
| 缩放 | `zoom`, `zoomTarget` | 滚轮缩放（0.5~2.0） |
| 进化 | `totalPets`, `totalDrags`, `evolutionLevel`(0-3), `evoGlow` | 阈值 20/60/150 |
| 金币 | `coins`, `coinPopups`, `coinDisplayAlpha` | 羁绊币 |
| 商店 | `shopUnlocked`, `shopEffectsOn`, `_shopTick` | 解锁与特效 |
| 联机 | `hidden`, `flyAway`, `dropIn`, `teleportGlow` | 飞走/降临/传送光效 |
| 隐藏动画 | `hideAnim`, `hideAnimT` | H 键显隐（>0 隐藏中, <0 显示中） |
| 舞蹈 | `dancing`, `danceTimer`, `dancePhase` | 舞蹈模式 |
| 进食 | `eating`, `eatTimer` | 进食动画 |
| 日夜 | `hour`, `isNight`, `dayNightCheck` | 夜晚加速入睡 |

#### 5.1.4 关键函数分类

**A. 渲染相关**
- `loop(ts)` — 主渲染循环（requestAnimationFrame），含睡眠/隐藏时的帧率优化（睡眠约 20Hz，隐藏约 10Hz）
- `drawBody(ctx, t, params)` — 程序化身体绘制（46 点有机变形 + 触手 + 辉光 + 次表面散射）
- `drawEyes/drawOneEye(ctx, ...)` — 10 种眼睛样式
- `drawMouth(ctx, t, params)` — 9 种嘴巴样式
- `drawAura(ctx, t, rx, ry)` — 心情驱动光环（含彩虹特效）
- `drawTentacles(ctx, t, pts, params)` — 6 条有机触手
- `drawBubble/drawCombo/drawThoughts` — 气泡/连击数字/思考气泡
- `drawSpriteBody(ctx, t, params, sprite, charDef)` — 精灵图绘制（呼吸/眨眼/眼球追踪/色调叠加）

**B. 状态更新（每帧调用）**
- `lerpParams(dt)` — 表情参数插值
- `updateBlink(dt)` — 眨眼三阶段状态机
- `updateCursorTracking(dt)` — 鼠标位置插值
- `updateSpringPhysics(dt, t)` — 弹簧物理 + 行走 + 缩放同步 + 商店特效生成
- `updateMood(dt)` — 心情/能量衰减 + 自动入睡
- `updateSleep(dt)` — 睡眠/唤醒
- `updateCombo(dt)` — 连击衰减
- `updateShake(dt)` — 屏震衰减
- `updateTrail(dt)` — 残影
- `updateRandomEvents(dt)` — 随机事件（喷嚏/打嗝/环顾）
- `updateEvolution(dt)` — 进化等级判定
- `updateDance(dt, t)` / `updateEating(dt)` — 舞蹈/进食
- `updateFoodSeeking(dt)` — 食物寻路（非线性缓动 + 起步加速）
- `updateDayNight(dt)` — 日夜检查（5 分钟一次）
- `updateLanSearch(dt)` — 联机搜索提示
- `updateCoins(dt)` — 金币飘字

**C. 粒子系统（对象池 + spawn/update/draw 三件套）**

| 粒子 | 函数 | 触发场景 |
| --- | --- | --- |
| 通用粒子 | `spawnParticle/updateParticles/drawParticles` | 池大小 150，freeIndex 栈优化 |
| 心形 | `spawnHeart/updateHearts/drawHearts` | love 表情/连击/进食 |
| 汗滴 | `spawnSweat/updateSweat/drawSweat` | 工作出汗 |
| Zzz | `spawnZzz/updateZzz/drawZzz` | 睡眠 |
| 冲击裂缝 | `spawnCracks/updateCracks/drawCracks` | 着陆/喷嚏/闪电拖尾 |
| 星尘 | `spawnSparkle/updateSparkles/drawSparkles` | 开心/进化/切换角色 |
| 音符 | `spawnNote/updateNotes/drawNotes` | 开心/舞蹈 |
| 脚印 | `spawnFootprint/updateFootprints/drawFootprints` | 行走 |
| 冲击波 | `spawnShockwave/updateShockwaves/drawShockwaves` | 着陆/隐藏动画 |
| 思考气泡 | `spawnThought/updateThoughts/drawThoughts` | 待机/睡眠梦境 |

**D. 交互处理**
- `isPetHit(x, y)` — 命中检测（半径 = `r * zoom * 1.55`，自由落体时全 canvas 可接）
- `onCaughtMidAir(x, y)` — 自由落体被接住的庆祝反应（心情+18，金币奖励，心形+星尘）
- `mousedown/mousemove/mouseup` — 拖拽+抛掷+连击+抚摸
- `wheel` — 滚轮缩放 / Ctrl+滚轮切换角色
- `contextmenu` — 右键喂食
- `keydown` — 空格(拍拍)/S(睡眠)/D(舞蹈)/F(喂食)/R(重置缩放)

**E. 羁绊币系统**
- `gainCoins(amount, reason, x, y)` — 获得金币（带 80ms 冷却防刷）
- `spawnCoinPopup(x, y, amount)` — 飘字动画
- 奖励配置来自 `game_config.json.coins.rewards`：pet=1, combo3=3, combo5=8, catch=20, drag=2

**F. 联机事件处理**
- `window.__getPetStateForTransfer()` — 序列化桌宠状态（挂在 window 上，主进程通过 `executeJavaScript` 调用）
- `onPetReceived(state)` — 接收飞来的桌宠，应用状态 + 播放降临动画
- `onEdgeEscape(info)` — 边缘飞出 → 飞走动画 + 发送
- `onPetSendStart/Success/Fail` — 发送流程回调
- `drawLanSearch(ctx)` — 搜索同伴雷达气泡

#### 5.1.5 帧率优化策略

`loop()` 中根据状态切换更新频率，节省 CPU：
- **隐藏状态**：6 帧抽 1（约 10Hz），仅维持传送光效衰减
- **睡眠状态**：3 帧抽 1（约 20Hz），用累计 dt 保持动画速度正常
- **清醒活跃**：全速 60FPS

光标轮询 `syncCursorPoll()` 也会在睡眠/隐藏时暂停，降低主进程 IPC 开销。

### 5.2 [characters.js](file:///c:/Users/32935/Desktop/desktop-pet/renderer/characters.js) — 角色系统（~380 行）

#### 5.2.1 角色定义 `CHARACTERS`

从 `window.GAME_CONFIG.characters` 加载，失败回退内置默认。每个角色定义：
```js
{
  name: '史莱姆',
  icon: '🟦',
  glowColor: [0, 200, 255],   // 辉光颜色
  particleHue: 178,            // 粒子色相
  spriteSrc: 'assets/slime.jpg',
  isHumanoid: false,           // 坤坤为 true（人形比例）
  chromaKey: { hardCutoff, hardKeep, rTol, bTol }  // 可选：自定义抠图阈值（tree 用）
}
```

#### 5.2.2 绿幕抠图 `chromaKey(sourceImg, cropRatio, charDef)`

这是项目的技术亮点之一，流程：

1. **裁边**：去除 `cropRatio`（默认 0.08）比例的边缘（去多余绿幕）
2. **缩放**：最大 500px，节省内存
3. **去水印**：右下角 15%×8% 区域 alpha 清零
4. **采样背景色**：取四角各 5×5 像素的中值 G 通道作为背景色
5. **纯绿幕检测**：`bgG>180 && bgR<80 && bgB<80 && (bgG-bgR)>100 && (bgG-bgB)>100`
6. **抠图**：
   - 计算每个像素到背景色的欧氏距离
   - 窄过渡抗锯齿：`dist < hardCutoff` 全透明，`> hardKeep` 全保留，中间线性过渡
   - **严格绿幕模式**：额外要求 `R/B 都接近背景` 且 `G>150`，防止树叶绿被误扣
   - **溢色修正**：边缘绿色通道拉向 `max(R,B)`
7. **孤立像素清理**：半透明像素若周围实心邻居 <2 则清零，防止 `shadowBlur` 放大成方框

#### 5.2.3 精灵图加载与绘制

- `loadSprites()` — 启动时加载所有角色精灵图，抠图后缓存到 `spriteCache`
- `getSprite(charKey)` — 取缓存的 canvas
- `drawSpriteBody(ctx, t, params, sprite, charDef)` — 绘制：呼吸缩放 + 眼球追踪微移 + 眨眼垂直压缩 + 辉光 + 色调叠加 + 脸红

#### 5.2.4 角色切换形变动画 `charMorph`

两阶段动画（约 0.8 秒）：
- **phase 0（缩小消失）**：`getMorphScale()` 用 `easeInExpo` 从 1→0，`getMorphAlpha()` 从 1→0.3
- **切换瞬间**：爆星尘 + 传送光效 + 屏震
- **phase 1（放大出现）**：`getMorphScale()` 用 `easeOutCubic` 从 0→1

### 5.3 HTML 页面

| 文件 | 职责 |
| --- | --- |
| [index.html](file:///c:/Users/32935/Desktop/desktop-pet/renderer/index.html) | 主窗口，同步 XHR 加载 game_config.json，引入 characters.js + app.js |
| [food_window.html](file:///c:/Users/32935/Desktop/desktop-pet/renderer/food_window.html) | 全屏透明食物窗口，无食物时停帧省 CPU，目标食物有旋转虚线指示环 |
| [settings.html](file:///c:/Users/32935/Desktop/desktop-pet/renderer/settings.html) | macOS 风格设置面板（滑块+iOS toggle），8 项设置 |
| [shop.html](file:///c:/Users/32935/Desktop/desktop-pet/renderer/shop.html) | 商店网格（食物/表情/特效），Toast 反馈，余额实时更新 |

---

## 6. 预加载脚本（Preload）

所有 preload 都用 `contextBridge.exposeInMainWorld` 暴露安全 API（`contextIsolation: true`）。

| 文件 | 暴露对象 | 主要 API |
| --- | --- | --- |
| [preload.js](file:///c:/Users/32935/Desktop/desktop-pet/preload.js) | `window.petAPI` | moveWindow, physicsDrop, setClickThrough, syncZoom, eatFood, addCoins, getCoins, spendCoins, getShopState, onEmotionChange, onFoodsUpdate, onPetReceived, sendPetTo 等（~40 个） |
| [food_preload.js](file:///c:/Users/32935/Desktop/desktop-pet/food_preload.js) | `window.foodAPI` | onFoodsUpdate |
| [settings_preload.js](file:///c:/Users/32935/Desktop/desktop-pet/settings_preload.js) | `window.settingsAPI` | getAll, set, close |
| [shop_preload.js](file:///c:/Users/32935/Desktop/desktop-pet/shop_preload.js) | `window.shopAPI` | getState, buy, toggleEffect, close, onCoinsUpdate |

---

## 7. 局域网联机模块（lan.js）

[lan.js](file:///c:/Users/32935/Desktop/desktop-pet/lan.js) 导出 `LanManager` 类，**零依赖**（仅用 Node 内置 `dgram`+`http`+`os`+`crypto`）。

### 7.1 常量

| 常量 | 值 | 说明 |
| --- | --- | --- |
| `PET_PORT` | 19826 | HTTP 服务端口（接收桌宠） |
| `DISCOVER_PORT` | 19827 | UDP 广播端口（发现 peer） |
| `BROADCAST_INTERVAL` | 3000ms | 广播间隔 |
| `PEER_TIMEOUT` | 10000ms | peer 超时清理 |

### 7.2 关键方法

| 方法 | 职责 |
| --- | --- |
| `start()` | 启动 HTTP + UDP |
| `getLocalIPs()` | 获取本机非内网 IPv4 |
| `getBroadcastAddresses()` | 计算子网定向广播地址（`x.x.x.255`，比 `255.255.255.255` 可靠） |
| `_startHttpServer()` | HTTP 服务：`GET /ping` 心跳，`POST /receive-pet` 接收桌宠 |
| `_startUdpDiscovery()` | UDP 监听 + 定时广播 + peer 清理 |
| `_broadcast()` | 同时广播到 `255.255.255.255` 和所有子网定向广播地址，带 `actualPort` |
| `_cleanupPeers()` | 清理超时 peer（10s 未刷新心跳） |
| `getPeers()` | 返回 peer 数组 `[{id, name, ip, port}]` |
| `sendPet(peerIp, peerPort, petState)` | 发送桌宠：POST `/receive-pet`，失败自动重试 + 端口探测 |
| `_probeRealPort(peerIp, peerPort)` | 探测 peer 真实端口（ping 失败则尝试 +1/+2/+3） |
| `stop()` | 关闭所有服务 |

### 7.3 回调

| 回调 | 触发时机 |
| --- | --- |
| `onPetReceived(state)` | 收到飞来的桌宠 |
| `onPeersChanged(peers, event, info)` | peer 增删改（event: add/update/remove） |

### 7.4 端口冲突处理

HTTP 端口冲突时自动尝试 `PET_PORT+1`、`+2`、`+3`，并通过广播的 `actualPort` 字段告知 peer 真实端口。发送失败时通过 `_probeRealPort` 重新探测。

---

## 8. 配置系统（game_config.json）

[game_config.json](file:///c:/Users/32935/Desktop/desktop-pet/game_config.json) 是统一数值配置文件，**修改后需重启应用生效**。主进程通过 `fs.readFileSync` 加载，渲染进程通过同步 XHR 加载到 `window.GAME_CONFIG`。

### 8.1 结构

```json
{
  "coins": {
    "enabled": true,
    "cooldownMs": 80,
    "rewards": { "pet": 1, "combo3": 3, "combo5": 8, "catch": 20, "drag": 2 }
  },
  "characters": {
    "slime": { "name", "icon", "glowColor", "particleHue", "spriteSrc" },
    "tree": { ..., "chromaKey": { "hardCutoff", "hardKeep", "rTol", "bTol" } },
    "kunkun": { ..., "isHumanoid": true }
  },
  "shop": {
    "food":     [{ "id", "name", "icon", "price", "desc", "effect" }],
    "emotion":  [{ "id", "name", "icon", "price", "desc" }],
    "effect":   [{ "id", "name", "icon", "price", "desc" }]
  }
}
```

### 8.2 商品类别

| 类别 | 说明 | 示例 |
| --- | --- | --- |
| `food` | 消耗品，购买后立即放到桌面 | 苹果(5)/糖果(10)/肉块(15)/鱼肉(20)/蛋糕(25) |
| `emotion` | 永久解锁表情 | 得意(50)/晕眩(60)/邪笑(70)/爱心眼(80) |
| `effect` | 永久解锁特效，可开关 | 心形粒子(120)/星尘(150)/闪电拖尾(180)/彩虹光环(200) |

---

## 9. 关键数据结构

### 9.1 食物对象

```js
{
  id: number,           // 自增 ID
  screenX: number,      // 屏幕坐标 X
  screenY: number,      // 屏幕坐标 Y
  placeTime: number,    // 放置时间戳
  type: string,         // emoji（🍎🍖🍰🍬🍪🥕🐟🧀）
  effect: { mood, energy } | null  // 商店食物带独立效果
}
```

### 9.2 桌宠传输状态（`__getPetStateForTransfer`）

```js
{
  emotion, mood, energy,
  params: { eye, mouth, curve, teeth, tint[], tension, glow, rate, eyeS },
  squashX, squashY, totalPets, totalDrags, evolutionLevel, zoom, character
}
```

### 9.3 Peer 对象

```js
{ id: string, name: string, ip: string, port: number }
```

### 9.4 默认设置 `DEFAULT_SETTINGS`

```js
{
  walkSpeed: 28,
  foodSeekSpeed: 320,
  foodEatDist: 45,
  energyDecay: 0.3,
  energyRecover: 2.0,
  eyeTrack: true,
  blink: true,
  particles: true
}
```

---

## 10. IPC 通信总览

### 主进程 → 渲染进程（`webContents.send`）

| 通道 | 触发场景 |
| --- | --- |
| `foods-update` | 食物列表变化（放置/吃掉） |
| `cursor-pos` | 光标轮询（80ms，含窗口坐标） |
| `physics-bounce` | 物理弹跳（带力度） |
| `physics-landed` | 物理着陆 |
| `character-change` | 切换角色 |
| `emotion-change` | 切换表情 |
| `status-change` | 切换任务状态 |
| `hide-toggle` | H 键显隐触发 |
| `settings-changed` | 设置变化 |
| `coins-update` | 金币余额变化 |
| `shop-unlocks-changed` | 商店解锁/启用变化 |
| `lan-toggle` | 联机开关 |
| `peers-changed` | peer 列表变化 |
| `pet-send-start/success/fail` | 发送桌宠流程 |
| `pet-received` | 收到桌宠 |
| `pet-edge-escape` | 边缘飞出 |
| `pet-edge-bounce-back` | 边缘弹回（无 peer） |
| `pet-recall` | 召回桌宠 |
| `auto-walk-toggle` | 自动行走开关 |

### 渲染进程 → 主进程（详见第 4.2 节 IPC 处理器表）

---

## 11. 依赖关系

### 11.1 运行时依赖

**零依赖**。`package.json` 仅声明：

```json
{
  "devDependencies": { "electron": "^33.4.11" }
}
```

### 11.2 模块依赖图

```
main.js
  ├─ require('electron')        # app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen
  ├─ require('path'), 'fs', 'child_process'
  └─ require('./lan.js')        # LanManager

lan.js
  └─ require('dgram'), 'http', 'os', 'crypto'   # 全部 Node 内置

renderer/app.js
  ├─ 依赖 characters.js 提供的 CHARACTERS, getSprite, drawSpriteBody, startCharMorph...
  ├─ 依赖 window.GAME_CONFIG（index.html 注入）
  └─ 依赖 window.petAPI（preload.js 注入）

renderer/characters.js
  └─ 依赖 window.GAME_CONFIG.characters

各 preload.js
  └─ require('electron').contextBridge, ipcRenderer
```

### 11.3 进程间依赖

- 主窗口渲染进程 ↔ 主进程：通过 `petAPI`（40+ API）
- 食物窗口 ↔ 主进程：通过 `foodAPI`
- 设置窗口 ↔ 主进程：通过 `settingsAPI`
- 商店窗口 ↔ 主进程：通过 `shopAPI`
- 主进程 ↔ PowerShell：spawn 子进程，stdout 行解析
- 主进程 ↔ LAN peer：UDP 广播 + HTTP POST

---

## 12. 项目运行方式

### 12.1 环境要求

- **Node.js** ≥ 16
- **Windows**（食物模式与全局鼠标钩子依赖 PowerShell，macOS/Linux 可运行但功能受限）
- **局域网**（联机模式需要同网段，不支持跨网段）

### 12.2 安装与启动

```bash
git clone <repo-url>
cd Tra-Desktop-Pet
npm install      # 仅安装 electron
npm start        # 即 electron .
```

启动后桌宠出现在屏幕底部中央，右下角托盘图标可呼出全部菜单。

### 12.3 操作快捷键

| 操作 | 效果 |
| --- | --- |
| 鼠标拖动 | 抓起桌宠 |
| 拖动后松手 | 抛掷（带物理弹跳） |
| 滚轮 | 缩放桌宠（0.5~2.0） |
| Ctrl + 滚轮 | 循环切换角色 |
| 长按 | 挣扎动画 |
| 右键 | 喂食 |
| 双击 | 惊吓反应 |
| 空格 | 拍拍 |
| S | 睡眠切换 |
| D | 舞蹈 |
| F | 喂食 |
| R | 重置缩放 |
| **H**（全局） | 切换桌宠显隐（隐藏后在鼠标位置弹出） |
| **Ctrl + 左键**（食物模式） | 在桌面任意位置放置食物 |
| 托盘点击 / 右键窗口 | 打开菜单 |

### 12.4 userData 目录

应用把 userData 重定向到项目内 `.userdata/`，包含：
- `settings.json` — 用户设置
- `character.json` — 当前角色
- `coins.json` — 羁绊币余额
- `shop_unlocks.json` — 商店解锁状态
- `heartbeat.json` — 心跳日志（5s 写一次，自动测试监控用）

---

## 13. 核心机制详解

### 13.1 抛掷物理引擎

主进程 `ipcMain.on('physics-drop')` 实现，16ms tick（约 60FPS）：

1. 每帧 `velY += gravity(0.9)`
2. 计算新位置，按光圈半径 `auraR = 60 * zoom * 1.5` 裁剪边界
3. **联机模式边缘飞出检测**：顶部 `ny < -200 && velY < -3`，左右超出 200px
4. 地面弹跳：`velY = -velY * 0.45`，`velX *= 0.88`，力度 >1.5 才弹
5. 左右墙弹跳：按光圈半径贴边
6. **静止判定**：`|velY|<0.8 && |velX|<0.3 && ny>=floorY-1` → 停定时器 + 发 `physics-landed`
7. NaN 校验 + `setPosition` 失败保护，避免定时器泄漏

### 13.2 智能点击穿透

桌宠窗口默认 `setIgnoreMouseEvents(true, {forward:true})`（穿透到桌面但转发 mousemove）：
- 鼠标移入宠物命中范围（`isPetHit`，半径 `r * zoom * 1.55`）→ `setClickThrough(false)` 可点击
- 鼠标离开 → `setClickThrough(true)` 穿透
- **拖拽/自由落体期间锁定不切换**，避免中断
- 自由落体时整个 canvas 可接（方便接住）

### 13.3 食物寻路系统

`updateFoodSeeking(dt)` 实现先放先吃（`foods[0]` 为目标）：

1. 拖拽/坠落/睡眠/进食时跳过
2. 计算桌宠中心（`windowX + CFG.cx`）到食物的距离
3. 距离 < `foodEatDist`(45) → 吃掉（调 `eatFood` + `feedPet`）
4. 否则非线性缓动移动：
   - **距离→速度系数**：远处全速，近处 `easeInExpo` 急减速（笨拙感）
   - **起步 easeIn 加速**：约 0.5 秒完成起步
   - **lerp 逼近目标速度**：`1 - Math.pow(0.25, dt)`
5. 累积移动量到 1 像素才发 IPC，减少调用频率

### 13.4 进化系统

`updateEvolution(dt)` 基于 `totalPets + totalDrags` 累计值：

| 等级 | 阈值 | 名称 | 效果 |
| --- | --- | --- | --- |
| 0 | 0 | 普通 | 无 |
| 1 | 20 | 闪耀形态 | 进化光环 + 彩色旋转弧 |
| 2 | 60 | 彩虹形态 | 持续生成星尘粒子 |
| 3 | 150 | 传说形态 | 最强光环 |

升级时触发：屏震 + 传送光效 + 15 星尘 + love 表情 + 心情满。

### 13.5 羁绊币与商店

- **获得**：接触宠物（点击/拖拽/接住）获得，带 80ms 冷却防刷
- **消耗**：商店购买食物（消耗品，立即放桌面）/表情（永久解锁）/特效（永久解锁+可开关）
- **持久化**：`coins.json` 存余额，`shop_unlocks.json` 存 `{items:[], effectsOn:[]}`
- **同步**：主进程 `broadcastCoins()` 推送给桌宠+商店窗口；解锁变化推送给桌宠

### 13.6 联机桌宠转移

**手动发送**（托盘「扔给…」）：
1. 主进程 `sendPetToPeer(peer)` → 发 `pet-send-start`
2. 渲染进程播放飞走动画 + `window.__getPetStateForTransfer()` 序列化状态
3. 主进程 `lan.sendPet(ip, port, state)` HTTP POST，失败自动重试 + 端口探测
4. 成功 → `pet-send-success`（渲染进程隐藏桌宠）

**边缘飞出**（抛向屏幕边缘）：
1. 物理引擎检测边缘飞出 → 发 `pet-edge-escape`（带方向+速度+peer）
2. 渲染进程播放飞走动画 + 调 `sendPetTo(peer.id)`
3. 无 peer 时发 `pet-edge-bounce-back`（弹回中央）

**接收**：
1. `lan.onPetReceived(state)` → 发 `pet-received`
2. 渲染进程应用状态 + 播放 `dropIn` 从天而降动画 + 传送光效

---

## 14. 开发调试工具

项目根目录的 `analyze_*.js`、`dl_tree.js`、`verify_tree_keyed.js` 是开发调试脚本，**不属于运行时代码**：

| 文件 | 用途 |
| --- | --- |
| `analyze_shape.js` | 分析精灵图形状边缘 |
| `analyze_sides.js` | 分析精灵图四边颜色 |
| `analyze_tree.js` | 分析 tree.jpg 各点颜色（依赖 `canvas` 模块） |
| `analyze_tree_electron.js` | Electron 版本的颜色分析 |
| `dl_tree.js` | 下载树角色素材 |
| `verify_tree_keyed.js` | 验证抠图结果 |

**抠图调试**：在渲染进程控制台执行 `localStorage.setItem('debugSprites', '1')` 后重启，抠图结果会通过 `saveSpriteDebug` 保存到 `renderer/assets/*_keyed.png`（已 gitignore）。

---

## 15. 已知限制

- **食物模式依赖 Windows PowerShell**：macOS/Linux 暂不支持（全局鼠标钩子）
- **角色素材为 AI 生成**：可能存在抠图瑕疵
- **联机模式不支持跨网段**：依赖 UDP 子网广播
- **单显示器假设**：物理引擎使用 `screen.getPrimaryDisplay()`，多显示器切换可能异常（代码已做 NaN 保护）

---

## 附录：技术亮点小结

1. **零运行时依赖**：整个项目仅 devDependencies 一个 electron，LAN 模块纯 Node 内置模块
2. **绿幕抠图自适应**：四角中值采样 + 纯绿幕检测 + 严格 R/B 容差，tree 角色单独配置 chromaKey
3. **粒子对象池**：150 槽位 + freeIndex 栈，避免 GC 压力
4. **帧率自适应**：睡眠/隐藏时自动降帧，节省 CPU
5. **托盘菜单缓存**：状态变化才重建，避免每次右键重建开销
6. **物理引擎健壮性**：NaN 校验 + setPosition 失败保护 + 静止自动停定时器
7. **IPC 频率优化**：光标轮询 80ms、食物移动累积到 1px 才发、行走累积到 1px 才发
8. **端口冲突容错**：HTTP 端口冲突自动 +1/+2/+3，广播带 actualPort，发送失败自动探测真实端口
