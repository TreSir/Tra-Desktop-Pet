'use strict';

// ═══════════════════════════════════════════════
// 数字共生体桌宠 v5 — 终极进化版
// 有机触手 | 次表面散射 | 分层辉光 | 粒子对象池
// 弹簧物理 | 眼球追踪 | 抛掷物理 | 待机环顾
// 情绪系统 | 能量系统 | 睡眠模式 | 连击系统
// 心形粒子 | 汗滴 | 星尘 | 残影 | 屏震 | 随机事件
// 滚轮缩放 | 长按挣扎 | 边缘窥探 | 光环系统
// ═══════════════════════════════════════════════

// ─── 可调参数 ───
const CFG = {
  W: 420, H: 460,
  cx: 210, cy: 230, r: 60,
  walkSpeed: 28,
  eyeTrackK: 0.38,
  dragThrowMin: 2,
};

// ─── Canvas 初始化 ───
const canvas = document.getElementById('pet');
const ctx = canvas.getContext('2d', { alpha: true });
const DPR = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = CFG.W * DPR;
canvas.height = CFG.H * DPR;
canvas.style.width = CFG.W + 'px';
canvas.style.height = CFG.H + 'px';
ctx.scale(DPR, DPR);

// ─── 数学工具 ───
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const TAU = Math.PI * 2;
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
const easeInExpo = (t) => t === 0 ? 0 : Math.pow(2, 10 * t - 10);

function pnoise(x) {
  return Math.sin(x * 1.0) * 0.5 + Math.sin(x * 2.3 + 1.3) * 0.3 + Math.sin(x * 4.7 + 2.1) * 0.2;
}

// ═══════════════════════════════════════════════
// 表情参数
// ═══════════════════════════════════════════════
const EMOTIONS = {
  happy:    { eye:'crescent',  mouth:'smile_teeth',  curve:0.9,  teeth:1, tint:[0,0,0],      tension:0.55, glow:1.3, rate:2.2, eyeS:1.0 },
  angry:    { eye:'angry',     mouth:'frown_teeth',  curve:-0.8, teeth:1, tint:[45,-18,-22], tension:1.0,  glow:1.6, rate:2.8, eyeS:0.95 },
  sad:      { eye:'droop',     mouth:'frown',        curve:-0.6, teeth:0, tint:[-12,-6,25],  tension:0.1,  glow:0.7, rate:0.6, eyeS:0.9 },
  disdain:  { eye:'half_lid',  mouth:'smirk',        curve:0.15, teeth:0, tint:[0,0,0],      tension:0.4,  glow:1.0, rate:0.8, eyeS:0.9 },
  badsmile: { eye:'gleam',     mouth:'grin_teeth',   curve:0.85, teeth:1, tint:[12,6,-12],   tension:0.7,  glow:1.5, rate:2.0, eyeS:0.85 },
  shocked:  { eye:'circle',    mouth:'o_open',       curve:0,    teeth:0, tint:[22,12,12],   tension:0.95, glow:1.6, rate:3.5, eyeS:1.35 },
  scared:   { eye:'dot',       mouth:'wavy',         curve:0,    teeth:0, tint:[-6,-6,18],   tension:0.25, glow:1.2, rate:2.2, eyeS:0.6 },
  relaxed:  { eye:'curve_down',mouth:'soft_smile',   curve:0.3,  teeth:0, tint:[-6,0,6],     tension:0.3,  glow:0.85,rate:0.9, eyeS:1.0 },
  proud:    { eye:'confident', mouth:'smirk_teeth',  curve:0.4,  teeth:1, tint:[6,0,-6],     tension:0.65, glow:1.2, rate:1.6, eyeS:0.95 },
  sleepy:   { eye:'curve_down',mouth:'soft_smile',   curve:0.15, teeth:0, tint:[-8,-4,10],   tension:0.15, glow:0.5, rate:0.3, eyeS:0.7 },
  dizzy:    { eye:'circle',    mouth:'wavy',         curve:0,    teeth:0, tint:[20,10,-10],  tension:0.3,  glow:1.1, rate:1.5, eyeS:0.8 },
  love:     { eye:'heart',     mouth:'smile_teeth',  curve:0.95, teeth:1, tint:[30,-5,-15],  tension:0.5,  glow:1.8, rate:3.0, eyeS:1.1 },
};

const STATUS_MAP = { idle:'relaxed', working:'proud', waiting:'disdain', success:'happy', error:'shocked', thinking:'relaxed' };
const STATUS_TEXT = { idle:'待机中…', working:'工作中…', waiting:'等你确认', success:'完成啦！', error:'出错了…', thinking:'思考中…' };
const EMOTION_TEXT = { happy:'高兴~', angry:'哼！', sad:'呜呜…', disdain:'切', badsmile:'嘿嘿', shocked:'？！', scared:'啊！', relaxed:'~', proud:'哼哼', sleepy:'Zzz…', dizzy:'晕…', love:'♥' };

// 心情→表情映射
const MOOD_EMOTIONS = {
  90: 'love', 75: 'happy', 60: 'proud', 45: 'relaxed',
  30: 'disdain', 15: 'sad', 0: 'angry',
};

// ═══════════════════════════════════════════════
// 宠物状态
// ═══════════════════════════════════════════════
const pet = {
  emotion: 'relaxed',
  targetEmotion: 'relaxed',
  params: { ...EMOTIONS.relaxed, tint:[...EMOTIONS.relaxed.tint] },

  // ── 角色系统 ──
  character: 'slime',  // 当前角色：slime/cat/ghost/flame/robot
  skin: 'default',     // 当前皮肤：角色的外观变体，不改变角色类型

  // 物理
  bobY: 0, walkOffset: 0,
  squashX: 1, squashY: 1,
  squashVX: 0, squashVY: 0,
  tilt: 0, tiltV: 0,

  // 眨眼
  blinkT: 0, blinkPhase: 0, blinkTimer: 3,

  // 行走
  walking: true, walkDir: 1, walkTimer: 3, idleTimer: 10,
  walkAccum: 0,
  lookAround: 0, lookDir: 0, lookTimer: 5,

  // 拖拽
  dragging: false,
  dragVelX: 0, dragVelY: 0,
  dragHist: [],
  falling: false,

  // 鼠标
  hovering: false,
  mouseRX: 0, mouseRY: 0,
  _rawMouseX: 0, _rawMouseY: 0,

  // 气泡
  bubbleText: '', bubbleTimer: 0,

  // 抚摸
  petCount: 0, petTimer: 0,

  // ── 情绪/能量系统 ──
  mood: 60,          // 0-100, 影响表情和光环颜色
  energy: 80,        // 0-100, 低能量时想睡觉
  sleeping: false,
  sleepTimer: 30,    // 30秒无交互后入睡

  // ── 连击系统 ──
  combo: 0,
  comboTimer: 0,
  comboShake: 0,

  // ── 屏震 ──
  shakeIntensity: 0,
  shakeX: 0, shakeY: 0,

  // ── 残影 ──
  trail: [],
  trailTimer: 0,

  // ── 旋转（三连击）──
  spin: 0,

  // ── 长按 ──
  longPress: 0,
  struggling: false,

  // ── 缩放 ──
  zoom: 1,
  zoomTarget: 1,

  // ── 边缘窥探 ──
  peeking: false,
  peekDir: 0,

  // ── 随机事件 ──
  eventTimer: 15,
  sneezing: false,
  hiccuping: false,

  // ── 效果粒子 ──
  hearts: [],
  sweatDrops: [],
  zzz: [],
  cracks: [],
  sparkles: [],
  stars: [],
  drips: [],           // 修复：补上缺失的 drips
  notes: [],            // 音符粒子
  footprints: [],       // 脚印
  shockwaves: [],       // 冲击波环
  thoughts: [],         // 思考气泡图标
  blush: 0,             // 脸红程度 0-1

  // ── 联机状态 ──
  hidden: false,
  flyAway: null,
  dropIn: null,
  teleportGlow: 0,

  // ── 光环 ──
  auraPhase: 0,

  // ── 日夜系统 ──
  hour: new Date().getHours(),
  isNight: false,
  dayNightCheck: 60,

  // ── 进化系统 ──
  totalPets: 0,         // 累计点击次数
  totalDrags: 0,        // 累计拖拽次数
  evolutionLevel: 0,    // 0=普通, 1=闪耀, 2=彩虹, 3=传说
  evoGlow: 0,           // 进化光环强度

  // ── 羁绊币 ──
  coins: 0,             // 当前余额（从主进程同步）
  coinPopups: [],       // 飘字动画 [{x, y, vy, life, amount}]
  coinDisplayAlpha: 0,  // 顶部计数显示的淡入淡出

  // ── 舞蹈模式 ──
  dancing: false,
  danceTimer: 0,
  dancePhase: 0,

  // ── 进食 ──
  eating: false,
  eatTimer: 0,

  // ── 磁力吸引 ──
  magnetPull: 0,

  // ── 思考 ──
  thinkTimer: 8,
  currentThought: null,

  // ── 边缘窥探 ──
  edgePeek: 0,
  edgePeekDir: 0,

  // ── H 键隐藏/显示动画 ──
  hideAnim: 0,         // 0=无动画, >0=隐藏中(0→1), <0=显示中(0→-1)
  hideAnimT: 0,        // 动画进度 0→1

  // ── 商店解锁 ──
  shopUnlocked: [],       // 已解锁商品 id（表情/特效）
  shopEffectsOn: [],      // 已启用的特效 id
  _shopTick: 0,           // 特效生成计时器
  _lastPosX: 0,           // 上次位置（用于闪电拖尾判断）
  _lastPosY: 0,
};

// ─── 颜色辅助 ───
function tinted(base, tint, a) {
  return `rgba(${clamp(base[0]+tint[0],0,255)|0},${clamp(base[1]+tint[1],0,255)|0},${clamp(base[2]+tint[2],0,255)|0},${a})`;
}

// 心情→光环颜色
function moodColor(mood) {
  if (mood > 75) return [255, 80, 140];   // 粉色 - 开心
  if (mood > 55) return [0, 200, 255];    // 青色 - 正常
  if (mood > 30) return [180, 180, 100];  // 黄绿 - 无聊
  if (mood > 15) return [100, 130, 200];  // 蓝灰 - 难过
  return [255, 80, 60];                    // 红色 - 愤怒
}

// HSL→RGB（用于彩虹光环特效）
function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  s = clamp(s, 0, 1); l = clamp(l, 0, 1);
  if (s === 0) { const v = (l * 255) | 0; return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  return [
    (hue2rgb(p, q, h + 1/3) * 255) | 0,
    (hue2rgb(p, q, h)       * 255) | 0,
    (hue2rgb(p, q, h - 1/3) * 255) | 0,
  ];
}

// ═══════════════════════════════════════════════
// H 键隐藏/显示动画
// ═══════════════════════════════════════════════
const HIDE_PHRASES = ['嗖！', '躲起来~', '不见啦~', 'biu~'];
const SHOW_PHRASES = ['我回来啦！', '哒哒！', '嘿！', 'tada~', '久等啦~'];

function triggerHideAnim() {
  // 已在动画中则忽略
  if (pet.hideAnim !== 0) return;
  if (!pet.hidden) {
    // 进入隐藏动画：缩小+淡出+喷星尘+气泡
    pet.hideAnim = 1;
    pet.hideAnimT = 0;
    pet.bubbleText = HIDE_PHRASES[Math.floor(Math.random() * HIDE_PHRASES.length)];
    pet.bubbleTimer = 1.0;
    for (let i = 0; i < 18; i++) spawnSparkle();
    spawnShockwave(CFG.cx, CFG.cy, 1.2);
    pet.squashVX += 0.5;  // 轻微挤压
  } else {
    // 进入显示动画：放大+淡入+冲击波+气泡
    pet.hideAnim = -1;
    pet.hideAnimT = 0;
    pet.hidden = false;  // 立即恢复渲染
    pet.bubbleText = SHOW_PHRASES[Math.floor(Math.random() * SHOW_PHRASES.length)];
    pet.bubbleTimer = 1.4;
    spawnShockwave(CFG.cx, CFG.cy, 1.5);
    for (let i = 0; i < 24; i++) spawnSparkle();
    pet.squashVY += 0.6;
    pet.shakeIntensity = 0.4;
  }
}

// ═══════════════════════════════════════════════
// 日夜系统
// ═══════════════════════════════════════════════
function updateDayNight(dt) {
  pet.dayNightCheck -= dt;
  if (pet.dayNightCheck <= 0) {
    pet.dayNightCheck = 300; // 每5分钟检查一次
    pet.hour = new Date().getHours();
    pet.isNight = pet.hour < 7 || pet.hour >= 22;

    // 夜晚加速入睡
    if (pet.isNight && !pet.sleeping && !pet.dragging) {
      pet.sleepTimer = Math.min(pet.sleepTimer, 10);
    }
  }
}

// ═══════════════════════════════════════════════
// 进化系统
// ═══════════════════════════════════════════════
function updateEvolution(dt) {
  const thresholds = [20, 60, 150];
  let newLevel = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (pet.totalPets + pet.totalDrags >= thresholds[i]) newLevel = i + 1;
  }

  if (newLevel > pet.evolutionLevel) {
    pet.evolutionLevel = newLevel;
    // 进化特效
    pet.shakeIntensity = 0.5;
    pet.teleportGlow = 1;
    for (let i = 0; i < 15; i++) spawnSparkle();
    const evoNames = ['', '闪耀形态！', '彩虹形态！', '传说形态！'];
    setEmotion('love', evoNames[newLevel]);
    pet.mood = 100;
  }

  // 进化光环插值
  const targetGlow = pet.evolutionLevel * 0.3;
  pet.evoGlow = lerp(pet.evoGlow, targetGlow, dt * 2);
}

// ═══════════════════════════════════════════════
// 舞蹈模式
// ═══════════════════════════════════════════════
function updateDance(dt, t) {
  if (pet.dancing) {
    pet.danceTimer -= dt;
    pet.dancePhase += dt * 6;
    if (pet.danceTimer <= 0) {
      pet.dancing = false;
      setEmotion('happy', '跳完啦~');
    } else {
      // 舞蹈动作：左右摇摆 + 弹跳
      const beat = Math.sin(pet.dancePhase);
      pet.squashVX += beat * 0.04;
      pet.squashVY += Math.abs(beat) * -0.03;
      pet.tiltV += beat * 0.02;
      pet.bobY += Math.abs(Math.sin(pet.dancePhase * 2)) * 2;

      // 舞蹈时产生音符和星尘
      if (Math.random() < dt * 4) spawnNote();
      if (Math.random() < dt * 2) spawnSparkle();
    }
  }
}

function startDance() {
  if (pet.sleeping) {
    pet.sleeping = false;
    setEmotion('shocked', '！');
    return;
  }
  pet.dancing = true;
  pet.danceTimer = 5;
  pet.dancePhase = 0;
  setEmotion('love', '♪一起来跳舞♪');
  pet.mood = clamp(pet.mood + 10, 0, 100);
  pet.sleepTimer = 30;
}

// ═══════════════════════════════════════════════
// 进食系统
// ═══════════════════════════════════════════════
function feedPet(effect) {
  if (pet.sleeping) {
    pet.sleeping = false;
    setEmotion('happy', '好吃的！');
  }
  const energyGain = effect && effect.energy != null ? effect.energy : 30;
  const moodGain = effect && effect.mood != null ? effect.mood : 15;
  pet.eating = true;
  pet.eatTimer = 1.5;
  pet.energy = clamp(pet.energy + energyGain, 0, 100);
  pet.mood = clamp(pet.mood + moodGain, 0, 100);
  setEmotion('love', '好好吃~');
  pet.sleepTimer = 30;
  for (let i = 0; i < 3; i++) spawnHeart();
  window.SoundFX?.play('eat');

  // 进食粒子
  for (let i = 0; i < 8; i++) {
    const ang = Math.random() * TAU;
    pet.sparkles.push({
      x: CFG.cx + Math.cos(ang) * 20,
      y: CFG.cy + Math.sin(ang) * 20,
      life: 1,
      size: 3 + Math.random() * 4,
      rot: ang,
    });
  }
}

function updateEating(dt) {
  if (pet.eating) {
    pet.eatTimer -= dt;
    // 进食时身体轻微抖动
    pet.squashVX += (Math.random() - 0.5) * 0.02;
    pet.squashVY += (Math.random() - 0.5) * 0.02;
    if (pet.eatTimer <= 0) {
      pet.eating = false;
      setEmotion('relaxed', '');
    }
  }
}

// ═══════════════════════════════════════════════
// 食物放置系统
// 主进程维护食物列表（屏幕坐标），渲染进程缓存并寻路
// 策略：先放先吃（foods[0] 即目标）
// ═══════════════════════════════════════════════
let foods = [];                 // 缓存主进程推送的食物列表
let windowX = 0, windowY = 0;   // 桌宠窗口在屏幕的坐标（由 cursor-pos 附带推送）
let foodSeeking = false;        // 是否正在前往食物
// 运行时设置（由 settings-changed 推送更新）
const RUNTIME = {
  walkSpeed: 28,
  foodSeekSpeed: 320,
  foodEatDist: 45,
  energyDecay: 0.3,
  energyRecover: 2.0,
  eyeTrack: true,
  blink: true,
  particles: true,
  soundEnabled: true,
  shopTheme: 'aurora', // 全局主题：aurora=极光玻璃 / sweet=甜暖风 / pixel=像素风
};
let foodMoveAccumX = 0, foodMoveAccumY = 0; // 累积移动量，减少 IPC 频率

let foodSeekLogTimer = 0;
function updateFoodSeeking(dt) {
  if (foods.length === 0) {
    if (foodSeeking) {
      foodSeeking = false;
      pet.walking = false;
      pet.walkTimer = 3;
    }
    return;
  }
  // 拖拽/坠落/睡眠时不寻路
  if (pet.dragging || pet.falling || pet.sleeping || pet.eating) {
    foodSeekLogTimer += dt;
    if (foodSeekLogTimer > 2) {
      console.log(`[FOOD] skip seeking: dragging=${pet.dragging} falling=${pet.falling} sleeping=${pet.sleeping} eating=${pet.eating}`);
      foodSeekLogTimer = 0;
    }
    return;
  }

  // 取第一个食物作为目标（先放先吃）
  const target = foods[0];
  // 桌宠中心在屏幕的坐标（窗口位置 + canvas 中心偏移）
  const petCx = windowX + CFG.cx;
  const petCy = windowY + CFG.cy;
  const dx = target.screenX - petCx;
  const dy = target.screenY - petCy;
  const dist = Math.hypot(dx, dy);

  // 到达食物 → 吃掉
  if (dist < RUNTIME.foodEatDist) {
    console.log(`[FOOD] Reached target id=${target.id}, eating!`);
    window.petAPI.eatFood(target.id);
    foods.shift(); // 本地立即移除，避免重复触发
    foodSeeking = false;
    // 重置速度与起步进度，下次重新加速
    pet._foodSpeedX = 0;
    pet._foodSpeedY = 0;
    pet._foodAccelT = 0;
    feedPet(target.effect);      // 触发进食交互（商店食物带独立效果）
    return;
  }

  // 朝目标移动（非线性缓动：起步慢加速 + 中段脉冲步态 + 接近食物减速 + 明显抖动）
  foodSeeking = true;
  const dirX = dx / dist;
  const dirY = dy / dist;

  // ── 1. 距离→速度系数（非线性：远处全速 → 近处急减速）──
  const FAR_DIST = 240;
  const NEAR_DIST = RUNTIME.foodEatDist;
  let speedFactor;
  if (dist > FAR_DIST) {
    speedFactor = 1;
  } else {
    const t = clamp((dist - NEAR_DIST) / (FAR_DIST - NEAR_DIST), 0, 1);
    // easeInExpo：近处减速特别急，营造"急刹车凑近"的笨拙感
    const eased = t < 0.35 ? Math.pow(t / 0.35, 2.5) * 0.4 : 0.4 + easeOutCubic((t - 0.35) / 0.65) * 0.6;
    speedFactor = Math.max(0.12, eased);
  }

  // ── 2. 起步 easeIn 加速（前段慢，后段跟上）──
  if (pet._foodSpeedX == null) { pet._foodSpeedX = 0; pet._foodSpeedY = 0; pet._foodAccelT = 0; }
  pet._foodAccelT = Math.min(1, pet._foodAccelT + dt * 2.0); // 约 0.5 秒完成起步
  // easeInQuad：起步慢加速，自然过渡到全速
  const accelCurve = Math.pow(pet._foodAccelT, 2);

  // 目标速度（叠加起步曲线）
  const targetVX = dirX * RUNTIME.foodSeekSpeed * speedFactor * accelCurve;
  const targetVY = dirY * RUNTIME.foodSeekSpeed * speedFactor * accelCurve;

  // lerp 逼近目标速度（平滑过渡，时间无关）
  const accelLerp = 1 - Math.pow(0.25, dt);
  pet._foodSpeedX += (targetVX - pet._foodSpeedX) * accelLerp;
  pet._foodSpeedY += (targetVY - pet._foodSpeedY) * accelLerp;

  // 合成最终位移（纯缓动，无脉冲无抖动）
  const moveX = pet._foodSpeedX * dt;
  const moveY = pet._foodSpeedY * dt;

  foodMoveAccumX += moveX;
  foodMoveAccumY += moveY;
  // 累积到 1 像素才发送 IPC，减少调用频率
  const sendX = Math.trunc(foodMoveAccumX);
  const sendY = Math.trunc(foodMoveAccumY);
  if (sendX !== 0 || sendY !== 0) {
    window.petAPI.moveWindow(sendX, sendY);
    foodMoveAccumX -= sendX;
    foodMoveAccumY -= sendY;
    windowX += sendX;
    windowY += sendY;
  }

  // 行走动画
  pet.walking = true;
  pet.walkDir = dirX > 0 ? 1 : -1;
  pet.walkTimer = 1.5; // 持续行走

  foodSeekLogTimer += dt;
  if (foodSeekLogTimer > 1.5) {
    console.log(`[FOOD] seeking pet=(${Math.round(petCx)},${Math.round(petCy)}) target=(${target.screenX},${target.screenY}) dist=${Math.round(dist)} dir=(${dirX.toFixed(2)},${dirY.toFixed(2)}) foods=${foods.length}`);
    foodSeekLogTimer = 0;
  }
}

// 食物绘制已移至独立的 food_window（全屏透明窗口，全局可见）

// ═══════════════════════════════════════════════
// 磁力吸引（鼠标靠近时身体微微倾斜）
// ═══════════════════════════════════════════════
function updateMagnet(dt) {
  if (pet.dragging || pet.falling || pet.sleeping) {
    pet.magnetPull = lerp(pet.magnetPull, 0, dt * 5);
    return;
  }
  const dist = Math.hypot(pet.mouseRX, pet.mouseRY);
  if (dist < 80 && pet.hovering) {
    const pull = (80 - dist) / 80;
    pet.magnetPull = lerp(pet.magnetPull, pull * 0.15, dt * 8);
    // 向鼠标方向轻微倾斜
    pet.tiltV += (pet.mouseRX * 0.001 - pet.tilt) * 0.03;
  } else {
    pet.magnetPull = lerp(pet.magnetPull, 0, dt * 5);
  }
}

// ═══════════════════════════════════════════════
// 脸红效果
// ═══════════════════════════════════════════════
function updateBlush(dt) {
  const targetBlush = pet.mood > 80 ? 0.6 : (pet.mood > 60 ? 0.3 : 0);
  pet.blush = lerp(pet.blush, targetBlush, dt * 3);
}

function drawBlush(ctx) {
  if (pet.blush < 0.05) return;
  const a = pet.blush;
  const ey = CFG.cy - 5;
  // 左脸
  ctx.fillStyle = `rgba(255,120,160,${a * 0.35})`;
  ctx.beginPath();
  ctx.ellipse(CFG.cx - 25, ey + 5, 7, 4, 0, 0, TAU);
  ctx.fill();
  // 右脸
  ctx.beginPath();
  ctx.ellipse(CFG.cx + 25, ey + 5, 7, 4, 0, 0, TAU);
  ctx.fill();
}

// ═══════════════════════════════════════════════
// 滴落效果
// ═══════════════════════════════════════════════
function updateDrips() {
  if (Math.random() < 0.0025 && pet.drips.length < 3) {
    pet.drips.push({
      x: CFG.cx + (Math.random() - 0.5) * 42,
      y: CFG.cy + 36,
      vy: 0.3,
      size: 2 + Math.random() * 2.5,
      life: 1,
    });
  }
  for (let i = pet.drips.length - 1; i >= 0; i--) {
    const d = pet.drips[i];
    d.vy += 0.09; d.y += d.vy; d.life -= 0.008;
    if (d.life <= 0 || d.y > CFG.cy + 85) pet.drips.splice(i, 1);
  }
}

function drawDrips(ctx, params) {
  // 直接使用 pet.drips，避免无意义的模块级别名
  for (const d of pet.drips) {
    ctx.fillStyle = `rgba(0,170,255,${d.life * 0.12})`;
    ctx.beginPath(); ctx.arc(d.x, d.y, d.size * 2.5, 0, TAU); ctx.fill();
    ctx.fillStyle = tinted([6, 6, 14], params.tint, d.life * 0.9);
    ctx.beginPath(); ctx.ellipse(d.x, d.y, d.size, d.size * 1.3, 0, 0, TAU); ctx.fill();
  }
}

// ═══════════════════════════════════════════════
// 底部积液
// ═══════════════════════════════════════════════
function drawPool(ctx, t, rx, ry, params) {
  const poolW = rx * 1.5;
  const poolY = CFG.cy + ry * 0.72;
  const ripple = Math.sin(t * 0.8) * 2.5 + Math.sin(t * 1.7) * 1.2;
  ctx.beginPath();
  ctx.moveTo(CFG.cx - poolW, poolY);
  ctx.quadraticCurveTo(CFG.cx, poolY + 17 + ripple, CFG.cx + poolW, poolY);
  ctx.quadraticCurveTo(CFG.cx, poolY + 7, CFG.cx - poolW, poolY);
  ctx.closePath();
  const g = ctx.createRadialGradient(CFG.cx, poolY + 4, 3, CFG.cx, poolY + 4, poolW);
  g.addColorStop(0, tinted([8, 8, 18], params.tint, 0.88));
  g.addColorStop(0.6, tinted([6, 6, 14], params.tint, 0.4));
  g.addColorStop(1, tinted([6, 6, 14], params.tint, 0));
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = `rgba(0,200,255,${0.08 * params.glow})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(CFG.cx - poolW * 0.85, poolY + 1);
  ctx.quadraticCurveTo(CFG.cx, poolY + 5, CFG.cx + poolW * 0.85, poolY + 1);
  ctx.stroke();
}

// ═══════════════════════════════════════════════
// 有机触手
// ═══════════════════════════════════════════════
const TENTACLES = [
  { idx: 30, base: -2.4,  len: 38, w: 12, segs: 5 },
  { idx: 42, base: -0.75, len: 40, w: 12, segs: 5 },
  { idx: 36, base: -1.57, len: 28, w: 10, segs: 4 },
  { idx: 6,  base: 0.72,  len: 34, w: 11, segs: 5 },
  { idx: 18, base: 2.42,  len: 32, w: 11, segs: 5 },
  { idx: 2,  base: 0.12,  len: 26, w: 9,  segs: 4 },
];

const tentacleState = TENTACLES.map(() => ({ phase: 0, swayVel: 0 }));

function drawTentacles(ctx, t, pts, params) {
  const tension = params.tension;
  const vertShift = (tension - 0.45) * 14;
  const swayAmp = (1 - tension * 0.5) * 8;

  for (let i = 0; i < TENTACLES.length; i++) {
    const def = TENTACLES[i];
    const st = tentacleState[i];
    const pt = pts[def.idx];
    const sway = Math.sin(t * 1.2 + i * 1.7) * swayAmp;
    st.phase = lerp(st.phase, sway * 0.5, 0.08);
    const secMotion = Math.sin(t * 2.8 + i * 2.3) * 4 + st.phase;
    const len = def.len * (0.82 + tension * 0.3);
    const ang = def.base + sway * 0.02;

    const segments = def.segs;
    const path = [];
    for (let s = 0; s <= segments; s++) {
      const f = s / segments;
      const dist = len * f;
      const w = def.w * (1 - f * 0.85);
      const bend = Math.sin(t * 1.5 + i * 2 + f * 3) * (3 + f * 6) + secMotion * f;
      const px = pt.x + Math.cos(ang) * dist + Math.sin(t * 1.4 + i + f * 2) * bend;
      const py = pt.y + Math.sin(ang) * dist + Math.cos(t * 1.4 + i + f * 2) * bend + vertShift * f;
      path.push({ x: px, y: py, w: Math.max(1.5, w) });
    }

    ctx.beginPath();
    for (let s = 0; s < path.length; s++) {
      const p = path[s];
      const prev = path[Math.max(0, s - 1)];
      const dx = p.x - prev.x, dy = p.y - prev.y;
      const dlen = Math.hypot(dx, dy) || 1;
      const nx = -dy / dlen, ny = dx / dlen;
      if (s === 0) ctx.moveTo(p.x + nx * p.w * 0.5, p.y + ny * p.w * 0.5);
      else ctx.lineTo(p.x + nx * p.w * 0.5, p.y + ny * p.w * 0.5);
    }
    for (let s = path.length - 1; s >= 0; s--) {
      const p = path[s];
      const prev = path[Math.max(0, s - 1)];
      const dx = p.x - prev.x, dy = p.y - prev.y;
      const dlen = Math.hypot(dx, dy) || 1;
      const nx = -dy / dlen, ny = dx / dlen;
      ctx.lineTo(p.x - nx * p.w * 0.5, p.y - ny * p.w * 0.5);
    }
    ctx.closePath();

    const tip = path[path.length - 1];
    const tg = ctx.createLinearGradient(pt.x, pt.y, tip.x, tip.y);
    tg.addColorStop(0, tinted([6, 6, 14], params.tint, 0.98));
    tg.addColorStop(0.7, tinted([10, 10, 22], params.tint, 0.95));
    tg.addColorStop(1, tinted([16, 20, 36], params.tint, 0.9));
    ctx.fillStyle = tg; ctx.fill();

    ctx.strokeStyle = `rgba(0,180,255,${0.12 * params.glow})`;
    ctx.lineWidth = 2.5; ctx.stroke();
    ctx.strokeStyle = `rgba(0,200,255,${0.3 * params.glow})`;
    ctx.lineWidth = 1; ctx.stroke();

    const glowR = 6 + Math.sin(t * 3 + i) * 1;
    ctx.fillStyle = `rgba(0,170,255,${0.06 * params.glow})`;
    ctx.beginPath(); ctx.arc(tip.x, tip.y, glowR * 2, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(0,200,255,${0.15 * params.glow})`;
    ctx.beginPath(); ctx.arc(tip.x, tip.y, glowR, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(120,235,255,${0.7 * params.glow})`;
    ctx.beginPath(); ctx.arc(tip.x, tip.y, 2.5, 0, TAU); ctx.fill();
  }
}

// ═══════════════════════════════════════════════
// 光环系统（心情驱动）
// ═══════════════════════════════════════════════
function drawAura(ctx, t, rx, ry) {
  let r, g, b;
  if (pet.shopEffectsOn && pet.shopEffectsOn.includes('rainbow')) {
    // 彩虹色：基于时间持续变换 hue
    const c = hslToRgb((t * 30) % 360, 80, 60);
    r = c[0]; g = c[1]; b = c[2];
  } else {
    // 常态时以角色自身的主色为主，再混入情绪色；不同角色切换后光环也有专属辨识度。
    const [mr, mg, mb] = moodColor(pet.mood);
    const appearance = getCharacterAppearance(pet.character, pet.skin);
    const [cr, cg, cb] = appearance.glowColor || [0, 200, 255];
    r = Math.round(cr * 0.72 + mr * 0.28);
    g = Math.round(cg * 0.72 + mg * 0.28);
    b = Math.round(cb * 0.72 + mb * 0.28);
  }
  const energy = clamp(pet.energy / 100, 0.22, 1);
  const activeBoost = pet.hovering ? 0.22 : 0;
  const pulse = 0.56 + Math.sin(t * (pet.sleeping ? 0.65 : 1.65) + pet.auraPhase) * (pet.sleeping ? 0.12 : 0.24) + activeBoost;
  const auraR = Math.max(rx, ry) * (1.33 + pulse * 0.2);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // 柔和外晕 + 内核晕染，形成由内向外的两层呼吸感。
  const ag = ctx.createRadialGradient(CFG.cx, CFG.cy, rx * 0.35, CFG.cx, CFG.cy, auraR * 1.18);
  ag.addColorStop(0, `rgba(${r},${g},${b},0)`);
  ag.addColorStop(0.44, `rgba(${r},${g},${b},${0.025 * energy})`);
  ag.addColorStop(0.72, `rgba(${r},${g},${b},${0.1 * pulse * energy})`);
  ag.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = ag;
  ctx.beginPath();
  ctx.arc(CFG.cx, CFG.cy, auraR * 1.18, 0, TAU);
  ctx.fill();

  const core = ctx.createRadialGradient(CFG.cx, CFG.cy + ry * 0.25, 2, CFG.cx, CFG.cy + ry * 0.25, auraR * 0.92);
  core.addColorStop(0, `rgba(${r},${g},${b},${0.09 * pulse * energy})`);
  core.addColorStop(0.55, `rgba(${r},${g},${b},${0.018 * energy})`);
  core.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.ellipse(CFG.cx, CFG.cy + ry * 0.2, auraR * 0.94, auraR * 0.68, 0, 0, TAU); ctx.fill();

  // 分段轨道使外圈更像在“运转”，不使用持续整圈描边以避免抢主体。
  const rings = [
    { radius: auraR * 0.91, width: 1.15, alpha: 0.25, speed: 0.38, span: 0.52, count: 5 },
    { radius: auraR * 1.06, width: 0.7, alpha: 0.16, speed: -0.26, span: 0.32, count: 7 },
  ];
  ctx.lineCap = 'round';
  for (const ring of rings) {
    ctx.lineWidth = ring.width;
    ctx.strokeStyle = `rgba(${r},${g},${b},${ring.alpha * pulse * energy})`;
    for (let i = 0; i < ring.count; i++) {
      const start = t * ring.speed + (i / ring.count) * TAU;
      ctx.beginPath(); ctx.arc(CFG.cx, CFG.cy, ring.radius, start, start + ring.span); ctx.stroke();
    }
  }
  ctx.restore();

  // 进化光环（彩虹色旋转）
  if (pet.evoGlow > 0.01) {
    const evoR = Math.max(rx, ry) * (1.15 + pulse * 0.1);
    for (let i = 0; i < 12; i++) {
      const ang = t * 0.5 + (i / 12) * TAU;
      const hue = (i / 12) * 360 + t * 30;
      ctx.strokeStyle = `hsla(${hue},80%,60%,${pet.evoGlow * 0.15 * pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(CFG.cx, CFG.cy, evoR, ang, ang + 0.6);
      ctx.stroke();
    }
    // 进化粒子
    if (pet.evolutionLevel >= 2 && Math.random() < 0.1) {
      const ang = Math.random() * TAU;
      pet.sparkles.push({
        x: CFG.cx + Math.cos(ang) * evoR * 0.8,
        y: CFG.cy + Math.sin(ang) * evoR * 0.8,
        life: 1,
        size: 2 + Math.random() * 3,
        rot: ang,
      });
    }
  }

  // 能量低时光环变暗
  if (pet.energy < 30) {
    const dim = (30 - pet.energy) / 30;
    ctx.fillStyle = `rgba(0,0,0,${dim * 0.08})`;
    ctx.beginPath();
    ctx.arc(CFG.cx, CFG.cy, auraR, 0, TAU);
    ctx.fill();
  }
}

// ═══════════════════════════════════════════════
// 身体绘制
// ═══════════════════════════════════════════════
// 预计算 46 点的 cos/sin 表（避免每帧重算）
const BODY_N = 46;
const BODY_COS = new Float32Array(BODY_N);
const BODY_SIN = new Float32Array(BODY_N);
for (let i = 0; i < BODY_N; i++) {
  const a = (i / BODY_N) * TAU;
  BODY_COS[i] = Math.cos(a);
  BODY_SIN[i] = Math.sin(a);
}

function drawBody(ctx, t, params) {
  const breath = pet.sleeping
    ? 1 + Math.sin(t * 0.5) * 0.015  // 睡觉时呼吸更慢
    : 1 + Math.sin(t * 1.4) * 0.03;
  const wobble = pet.sleeping ? 2.0 : 3.8 + Math.sin(t * 0.6) * 1.3;
  const rx = CFG.r * breath * pet.squashX;
  const ry = CFG.r * breath * pet.squashY;

  const pts = [];
  for (let i = 0; i < BODY_N; i++) {
    const a = (i / BODY_N) * TAU;
    const n = pnoise(a * 1.5 + t * 0.65) * wobble
            + pnoise(a * 3.2 + t * 1.1) * wobble * 0.35
            + pnoise(a * 6.1 + t * 0.4) * wobble * 0.12;
    pts.push({
      x: CFG.cx + BODY_COS[i] * (rx + n),
      y: CFG.cy + BODY_SIN[i] * (ry + n) * 0.92
    });
  }

  function tracePath() {
    ctx.beginPath();
    for (let i = 0; i < BODY_N; i++) {
      const nx = (i + 1) % BODY_N;
      const mx = (pts[i].x + pts[nx].x) / 2;
      const my = (pts[i].y + pts[nx].y) / 2;
      if (i === 0) ctx.moveTo(mx, my);
      else ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    ctx.closePath();
  }

  drawPool(ctx, t, rx, ry, params);
  drawDrips(ctx, params);
  drawTentacles(ctx, t, pts, params);

  // 1. 外层辉光
  tracePath();
  ctx.fillStyle = `rgba(0,160,255,${0.04 * params.glow})`;
  ctx.fill();

  // 2. 主体填充
  tracePath();
  const g = ctx.createRadialGradient(CFG.cx - rx * 0.15, CFG.cy - ry * 0.2, 3, CFG.cx, CFG.cy, ry * 1.4);
  g.addColorStop(0,    tinted([28, 28, 48], params.tint, 1));
  g.addColorStop(0.35, tinted([16, 16, 32], params.tint, 1));
  g.addColorStop(0.65, tinted([8, 8, 18],  params.tint, 1));
  g.addColorStop(0.88, tinted([4, 4, 10],  params.tint, 1));
  g.addColorStop(1,    tinted([2, 2, 6],   params.tint, 0.92));
  ctx.fillStyle = g; ctx.fill();

  // 3. 边缘辉光
  ctx.strokeStyle = `rgba(0,180,255,${0.10 * params.glow})`; ctx.lineWidth = 5; ctx.stroke();
  ctx.strokeStyle = `rgba(0,200,255,${0.20 * params.glow})`; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.strokeStyle = `rgba(80,220,255,${0.4 * params.glow})`; ctx.lineWidth = 1; ctx.stroke();

  // 4. 次表面散射
  ctx.save();
  tracePath(); ctx.clip();
  const sssR = ry * 0.7;
  const sss = ctx.createRadialGradient(CFG.cx, CFG.cy + 8, 0, CFG.cx, CFG.cy + 8, sssR);
  const sssPulse = 0.7 + Math.sin(t * 2.2) * 0.2;
  sss.addColorStop(0,   `rgba(0,190,255,${0.18 * params.glow * sssPulse})`);
  sss.addColorStop(0.4, `rgba(0,140,220,${0.10 * params.glow * sssPulse})`);
  sss.addColorStop(0.8, `rgba(0,80,160,${0.03 * params.glow})`);
  sss.addColorStop(1,   'rgba(0,40,100,0)');
  ctx.fillStyle = sss;
  ctx.fillRect(CFG.cx - rx * 1.2, CFG.cy - ry * 1.2, rx * 2.4, ry * 2.4);

  // 5. 内核荧光
  const corePulse = 0.55 + Math.sin(t * 2.2) * 0.28;
  const coreR = ry * 0.32 * corePulse;
  const cg = ctx.createRadialGradient(CFG.cx, CFG.cy + 5, 0, CFG.cx, CFG.cy + 5, coreR);
  cg.addColorStop(0,   `rgba(80,220,255,${0.28 * params.glow * corePulse})`);
  cg.addColorStop(0.4, `rgba(0,170,255,${0.15 * params.glow * corePulse})`);
  cg.addColorStop(1,   'rgba(0,80,160,0)');
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.arc(CFG.cx, CFG.cy + 5, coreR, 0, TAU); ctx.fill();
  ctx.restore();

  // 6. 湿润高光
  const hgx = CFG.cx - rx * 0.28, hgy = CFG.cy - ry * 0.38;
  const hg = ctx.createRadialGradient(hgx, hgy, 0, hgx, hgy, rx * 0.45);
  hg.addColorStop(0, 'rgba(140,200,255,0.25)');
  hg.addColorStop(0.5, 'rgba(100,170,240,0.1)');
  hg.addColorStop(1, 'rgba(100,170,240,0)');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.ellipse(hgx, hgy, rx * 0.38, ry * 0.22, -0.35, 0, TAU);
  ctx.fill();

  ctx.fillStyle = 'rgba(200,235,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(CFG.cx - rx * 0.34, CFG.cy - ry * 0.44, rx * 0.07, ry * 0.04, -0.3, 0, TAU);
  ctx.fill();

  // 7. Rim Light
  ctx.save();
  tracePath(); ctx.clip();
  const rg = ctx.createRadialGradient(CFG.cx + rx * 0.5, CFG.cy + ry * 0.5, 0, CFG.cx + rx * 0.5, CFG.cy + ry * 0.5, rx * 0.85);
  rg.addColorStop(0, `rgba(0,160,230,${0.2 * params.glow})`);
  rg.addColorStop(0.5, `rgba(0,120,200,${0.06 * params.glow})`);
  rg.addColorStop(1, 'rgba(0,100,180,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(CFG.cx - rx, CFG.cy - ry, rx * 2, ry * 2);
  ctx.restore();

  return { rx, ry };
}

// ═══════════════════════════════════════════════
// 眼睛绘制（新增 heart/sleep 变体）
// ═══════════════════════════════════════════════
function drawEyes(ctx, t, params) {
  const ey = CFG.cy - 11;
  const sp = 17;
  const sz = 8.5 * params.eyeS;
  let op = 1 - pet.blinkT;

  // 睡觉时眼睛几乎闭合
  if (pet.sleeping) op *= 0.05;

  const tx = clamp(pet.mouseRX * CFG.eyeTrackK, -3.5, 3.5);
  const ty = clamp(pet.mouseRY * CFG.eyeTrackK, -2.5, 2.5);

  // 睡觉时不追踪
  const etx = pet.sleeping ? 0 : tx;
  const ety = pet.sleeping ? 0 : ty;

  drawOneEye(ctx, CFG.cx - sp + etx, ey + ety, sz, op, params, 'left');
  drawOneEye(ctx, CFG.cx + sp + etx, ey + ety, sz, op, params, 'right');
}

function drawOneEye(ctx, x, y, s, op, p, side) {
  if (op < 0.02) return;
  ctx.shadowColor = 'rgba(200,240,255,0.9)';
  ctx.shadowBlur = 12 * p.glow;
  const col = (a) => `rgba(232,248,255,${a})`;

  switch (p.eye) {
    case 'crescent':
      ctx.lineWidth = s * 0.72; ctx.lineCap = 'round';
      ctx.strokeStyle = col(0.95 * op);
      ctx.beginPath();
      ctx.arc(x, y + s * 0.25, s * 0.92, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke(); break;
    case 'angry': {
      const d = side === 'left' ? 1 : -1;
      ctx.lineWidth = s * 0.58; ctx.lineCap = 'round';
      ctx.strokeStyle = col(0.95 * op);
      ctx.beginPath();
      ctx.moveTo(x - s * d, y - s * 0.65);
      ctx.lineTo(x + s * d, y + s * 0.55);
      ctx.stroke(); break;
    }
    case 'droop':
      ctx.fillStyle = col(0.92 * op);
      ctx.beginPath();
      ctx.ellipse(x, y + s * 0.15, s * 0.6, s * 0.88 * op, side === 'left' ? 0.35 : -0.35, 0, TAU);
      ctx.fill(); break;
    case 'half_lid':
      ctx.fillStyle = col(0.9 * op);
      ctx.beginPath();
      ctx.ellipse(x, y, s * 0.68, s * 0.48 * op, 0, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = tinted([4, 4, 10], p.tint, 1);
      ctx.beginPath();
      ctx.ellipse(x, y - s * 0.32, s * 0.72, s * 0.32, 0, 0, Math.PI);
      ctx.fill(); break;
    case 'gleam':
      ctx.fillStyle = col(0.92 * op);
      ctx.beginPath();
      ctx.ellipse(x, y, s * 0.82, s * 0.24 * op, 0, 0, TAU);
      ctx.fill();
      if (op > 0.3) {
        ctx.shadowBlur = 5;
        ctx.fillStyle = 'rgba(255,255,255,1)';
        ctx.beginPath();
        ctx.arc(x + s * 0.3, y - s * 0.04, s * 0.13, 0, TAU);
        ctx.fill();
      } break;
    case 'circle':
      ctx.fillStyle = col(0.95 * op);
      ctx.beginPath();
      ctx.arc(x, y, s * 1.15 * Math.max(0.25, op), 0, TAU);
      ctx.fill(); break;
    case 'dot':
      ctx.fillStyle = col(0.95 * op);
      ctx.beginPath();
      ctx.arc(x, y, s * 0.32 * Math.max(0.3, op), 0, TAU);
      ctx.fill(); break;
    case 'curve_down':
      ctx.lineWidth = s * 0.6; ctx.lineCap = 'round';
      ctx.strokeStyle = col(0.82 * op);
      ctx.beginPath();
      ctx.arc(x, y - s * 0.12, s * 0.78, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke(); break;
    case 'confident':
      ctx.fillStyle = col(0.9 * op);
      ctx.beginPath();
      ctx.ellipse(x, y + s * 0.08, s * 0.72, s * 0.38 * op, side === 'left' ? -0.22 : 0.22, 0, TAU);
      ctx.fill(); break;
    case 'heart':
      // 心形眼睛（复用 drawHeart 函数，避免重复路径代码）
      drawHeart(ctx, x, y, s * 1.6, op * 0.95, 0);
      break;
  }
  ctx.shadowBlur = 0;
}

// ═══════════════════════════════════════════════
// 嘴巴
// ═══════════════════════════════════════════════
function drawMouth(ctx, t, params) {
  const mx = CFG.cx, my = CFG.cy + 13, mw = 13;
  ctx.save();

  // 睡觉时画小口水泡嘴
  if (pet.sleeping) {
    const wobble = Math.sin(t * 2) * 2;
    ctx.fillStyle = 'rgba(4,4,10,0.7)';
    ctx.beginPath();
    ctx.ellipse(mx, my + 2, mw * 0.35, mw * 0.3 + wobble * 0.3, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    return;
  }

  switch (params.mouth) {
    case 'smile_teeth':
      mouthShape(ctx, mx, my, mw, params.curve, 14); drawTeeth(ctx, mx, my, mw, 'top'); break;
    case 'frown_teeth':
      mouthShape(ctx, mx, my, mw, params.curve, 14); drawTeeth(ctx, mx, my, mw, 'bottom'); break;
    case 'frown':
      ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(4,4,10,0.92)';
      ctx.beginPath(); ctx.moveTo(mx - mw, my + 3);
      ctx.quadraticCurveTo(mx, my - 8, mx + mw, my + 3); ctx.stroke(); break;
    case 'smirk':
      ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(4,4,10,0.92)';
      ctx.beginPath(); ctx.moveTo(mx - mw * 0.7, my + 2);
      ctx.quadraticCurveTo(mx, my - 5, mx + mw, my - 3); ctx.stroke(); break;
    case 'grin_teeth':
      mouthShape(ctx, mx, my, mw * 1.15, params.curve, 16); drawTeeth(ctx, mx, my, mw * 1.15, 'top'); break;
    case 'o_open':
      ctx.fillStyle = '#040408';
      ctx.beginPath(); ctx.ellipse(mx, my + 3, mw * 0.48, mw * 0.68, 0, 0, TAU); ctx.fill(); break;
    case 'wavy':
      ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(4,4,10,0.9)';
      ctx.beginPath(); ctx.moveTo(mx - mw, my);
      for (let i = 1; i <= 8; i++) {
        ctx.lineTo(mx - mw + (mw * 2 * i / 8), my + Math.sin(i * 1.3 + t * 3.5) * 3);
      }
      ctx.stroke(); break;
    case 'soft_smile':
      ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(4,4,10,0.65)';
      ctx.beginPath(); ctx.moveTo(mx - mw * 0.6, my + 1);
      ctx.quadraticCurveTo(mx, my + 5, mx + mw * 0.6, my + 1); ctx.stroke(); break;
    case 'smirk_teeth':
      ctx.fillStyle = '#080812';
      ctx.beginPath(); ctx.moveTo(mx - mw * 0.8, my + 2);
      ctx.quadraticCurveTo(mx, my + 10, mx + mw, my - 2);
      ctx.quadraticCurveTo(mx, my + 4, mx - mw * 0.8, my + 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#eef0f5';
      ctx.beginPath(); ctx.moveTo(mx + mw * 0.25, my + 1);
      ctx.lineTo(mx + mw * 0.5, my + 7); ctx.lineTo(mx + mw * 0.6, my + 1); ctx.closePath(); ctx.fill();
      break;
  }
  ctx.restore();
}

function mouthShape(ctx, mx, my, mw, curve, depth) {
  ctx.fillStyle = '#070710';
  ctx.beginPath(); ctx.moveTo(mx - mw, my);
  ctx.quadraticCurveTo(mx, my + depth * curve, mx + mw, my);
  ctx.quadraticCurveTo(mx, my + depth * 0.25, mx - mw, my); ctx.closePath(); ctx.fill();
}

function drawTeeth(ctx, mx, my, mw, pos) {
  ctx.fillStyle = '#eef0f5';
  const heights = [5, 6.5, 6.5, 5];
  for (let i = 0; i < 4; i++) {
    const tx = mx - mw * 0.55 + (mw * 1.1 * i / 3);
    const ty = pos === 'bottom' ? my - 2 : my + 1;
    ctx.beginPath();
    ctx.moveTo(tx - 1.7, ty); ctx.lineTo(tx + 1.7, ty);
    ctx.lineTo(tx, ty + heights[i] * (pos === 'bottom' ? -1 : 1));
    ctx.closePath(); ctx.fill();
  }
}

// ═══════════════════════════════════════════════
// 气泡（增强：动画弹入）
// ═══════════════════════════════════════════════
function drawBubble(ctx) {
  if (pet.bubbleTimer <= 0 || !pet.bubbleText) return;
  const a = clamp(pet.bubbleTimer, 0, 1);
  const popIn = clamp((2.5 - pet.bubbleTimer) / 0.2, 0, 1); // 弹入动画
  const scale = easeOutCubic(popIn);
  const bx = CFG.cx, by = Math.max(36, CFG.cy - 84 * pet.zoom - 22);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(bx, by);
  ctx.scale(scale, scale);
  ctx.translate(-bx, -by);
  ctx.font = '12px "Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center';
  const tw = ctx.measureText(pet.bubbleText).width;
  const bw = Math.min(CFG.W - 32, tw + 30), bh = 32;

  ctx.fillStyle = `rgba(0,170,255,${0.06 * a})`;
  roundRect(ctx, bx - bw / 2 - 2, by - bh / 2 - 2, bw + 4, bh + 4, 10);
  ctx.fill();

  const ui = CompanionVisual.palette(RUNTIME.shopTheme);
  ctx.fillStyle = ui.surface;
  ctx.strokeStyle = ui.border;
  ctx.lineWidth = 1;
  roundRect(ctx, bx - bw / 2, by - bh / 2, bw, bh, 8);
  ctx.fill(); ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(bx - 5, by + bh / 2); ctx.lineTo(bx, by + bh / 2 + 6);
  ctx.lineTo(bx + 5, by + bh / 2); ctx.closePath();
  ctx.fillStyle = ui.surface; ctx.fill();

  ctx.fillStyle = ui.text;
  ctx.fillText(pet.bubbleText, bx, by + 4, bw - 22);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ═══════════════════════════════════════════════
// 连击数字显示
// ═══════════════════════════════════════════════
function drawCombo(ctx) {
  if (pet.combo < 2) return;
  const a = clamp(pet.comboTimer / 2, 0, 1);
  const popScale = 1 + pet.comboShake * 0.3;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.font = `bold ${20 * popScale}px "Microsoft YaHei",sans-serif`;
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(255,200,0,0.8)';
  ctx.shadowBlur = 10;
  const colors = ['#fff', '#ffd700', '#ff8c00', '#ff4500', '#ff1493'];
  ctx.fillStyle = colors[Math.min(pet.combo - 2, colors.length - 1)];
  const text = `${pet.combo} COMBO!`;
  ctx.fillText(text, CFG.cx, CFG.cy - 95);
  ctx.restore();
}

// ═══════════════════════════════════════════════
// 状态更新
// ═══════════════════════════════════════════════
function lerpParams(dt) {
  const tgt = EMOTIONS[pet.targetEmotion];
  const p = pet.params;
  const k = clamp(0.09 * dt * 60, 0, 1);
  p.curve   = lerp(p.curve,   tgt.curve,   k);
  p.teeth   = tgt.teeth;
  p.tint[0] = lerp(p.tint[0], tgt.tint[0], k);
  p.tint[1] = lerp(p.tint[1], tgt.tint[1], k);
  p.tint[2] = lerp(p.tint[2], tgt.tint[2], k);
  p.tension = lerp(p.tension, tgt.tension, k);
  p.glow    = lerp(p.glow,    tgt.glow,    k);
  p.rate    = lerp(p.rate,    tgt.rate,    k);
  p.eyeS    = lerp(p.eyeS,    tgt.eyeS,    k);
  p.eye     = tgt.eye;
  p.mouth   = tgt.mouth;
}

function updateBlink(dt) {
  if (pet.sleeping || !RUNTIME.blink) {
    pet.blinkT = 0;
    pet.blinkPhase = 0;
    return;
  }
  if (pet.blinkPhase === 1) {
    pet.blinkT += dt * 13;
    if (pet.blinkT >= 1) { pet.blinkT = 1; pet.blinkPhase = 2; }
  } else if (pet.blinkPhase === 2) {
    pet.blinkT -= dt * 9;
    if (pet.blinkT <= 0) { pet.blinkT = 0; pet.blinkPhase = 0; }
  } else {
    pet.blinkTimer -= dt;
    if (pet.blinkTimer <= 0) {
      pet.blinkPhase = 1;
      pet.blinkTimer = 2.5 + Math.random() * 4.5;
    }
  }
}

function setEmotion(emo, bubble) {
  if (!EMOTIONS[emo]) return;
  if (pet.targetEmotion === emo && !bubble) return;
  pet.targetEmotion = emo;
  if (pet.blinkPhase === 0 && !pet.sleeping) pet.blinkPhase = 1;
  if (bubble !== undefined) { pet.bubbleText = bubble; pet.bubbleTimer = 2.5; }
}
function setStatus(status) {
  const e = STATUS_MAP[status];
  if (e) setEmotion(e, STATUS_TEXT[status]);
}

// ── 情绪/能量系统 ──
function updateMood(dt) {
  // 能量自然消耗
  if (!pet.sleeping) {
    pet.energy -= dt * RUNTIME.energyDecay;
    if (pet.dragging || pet.falling) pet.energy -= dt * 1.5;
  } else {
    pet.energy += dt * RUNTIME.energyRecover; // 睡觉恢复
  }
  pet.energy = clamp(pet.energy, 0, 100);

  // 心情自然衰减
  if (!pet.dragging && !pet.falling) {
    pet.mood -= dt * 0.2;
  }
  pet.mood = clamp(pet.mood, 0, 100);

  // 能量极低时自动入睡
  if (pet.energy < 15 && !pet.sleeping && !pet.dragging && !pet.falling) {
    pet.sleepTimer -= dt * 3;
    if (pet.sleepTimer <= 0) {
      pet.sleeping = true;
      setEmotion('sleepy', 'Zzz…');
    }
  }

  // 睡眠恢复后醒来
  if (pet.sleeping && pet.energy > 85) {
    pet.sleeping = false;
    setEmotion('happy', '精神百倍！');
    spawnSparkle(CFG.cx, CFG.cy);
    spawnSparkle(CFG.cx - 20, CFG.cy - 20);
    spawnSparkle(CFG.cx + 20, CFG.cy - 20);
  }
}

// ── 睡眠系统 ──
function updateSleep(dt) {
  if (pet.sleeping) {
    pet.sleepTimer = 30; // 重置计时器
    // 生成 Zzz
    if (Math.random() < dt * 1.5) spawnZzz();
    // 睡觉时缓慢恢复触手柔软度
    pet.squashVX += (1 - pet.squashX) * 0.02;
    pet.squashVY += (1 - pet.squashY) * 0.02;
  } else {
    pet.sleepTimer -= dt;
    if (pet.sleepTimer <= 0 && !pet.dragging && !pet.falling) {
      pet.sleeping = true;
      setEmotion('sleepy', 'Zzz…');
      window.SoundFX?.play('sleep');
    }
  }

  // 交互时重置睡眠计时器并唤醒
  if (pet.dragging || pet.hovering) {
    pet.sleepTimer = 30;
    if (pet.sleeping) {
      pet.sleeping = false;
      setEmotion('shocked', '！');
      pet.squashVY += -0.1;
      pet.squashVX += 0.08;
      window.SoundFX?.play('wake');
    }
  }
}

// ── 连击系统 ──
function updateCombo(dt) {
  if (pet.comboTimer > 0) {
    pet.comboTimer -= dt;
    if (pet.comboTimer <= 0) {
      pet.combo = 0;
      pet.comboTimer = 0;
    }
  }
  pet.comboShake = lerp(pet.comboShake, 0, dt * 8);
}

// ── 屏震 ──
function updateShake(dt) {
  if (pet.shakeIntensity > 0) {
    pet.shakeIntensity -= dt * 5;
    if (pet.shakeIntensity < 0) pet.shakeIntensity = 0;
    pet.shakeX = (Math.random() - 0.5) * pet.shakeIntensity * 8;
    pet.shakeY = (Math.random() - 0.5) * pet.shakeIntensity * 8;
  } else {
    pet.shakeX = 0; pet.shakeY = 0;
  }
}

// ── 残影 ──
function updateTrail(dt) {
  pet.trailTimer -= dt;
  if (pet.dragging || pet.falling) {
    if (pet.trailTimer <= 0) {
      pet.trailTimer = 0.04;
      pet.trail.push({ x: 0, y: pet.bobY - pet.walkOffset, life: 1, alpha: 0.15 });
      if (pet.trail.length > 8) pet.trail.shift();
    }
  }
  for (let i = pet.trail.length - 1; i >= 0; i--) {
    pet.trail[i].life -= dt * 4;
    if (pet.trail[i].life <= 0) pet.trail.splice(i, 1);
  }
}

function drawTrail(ctx, t) {
  for (const tr of pet.trail) {
    ctx.save();
    ctx.globalAlpha = tr.life * tr.alpha;
    ctx.translate(0, tr.y);
    ctx.translate(CFG.cx, CFG.cy);
    ctx.scale(0.9, 0.9);
    ctx.translate(-CFG.cx, -CFG.cy);
    // 简化的半透明身体
    const r = CFG.r * 0.9;
    ctx.fillStyle = `rgba(0,180,255,${tr.life * 0.08})`;
    ctx.beginPath();
    ctx.arc(CFG.cx, CFG.cy, r, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

// ── 随机事件 ──
function updateRandomEvents(dt) {
  if (pet.sleeping || pet.dragging || pet.falling) return;

  pet.eventTimer -= dt;
  if (pet.eventTimer <= 0) {
    pet.eventTimer = 20 + Math.random() * 30;
    const event = Math.random();
    if (event < 0.3) {
      // 打喷嚏
      triggerSneeze();
    } else if (event < 0.5) {
      // 打嗝
      triggerHiccup();
    } else if (event < 0.7) {
      // 眨眼互动
      setEmotion('happy', '嘿嘿~');
      for (let i = 0; i < 3; i++) spawnSparkle();
    } else if (event < 0.85) {
      // 突然环顾
      pet.lookAround = 1;
      pet.lookDir = Math.random() < 0.5 ? -1 : 1;
      setEmotion('shocked', '？！');
    } else {
      // 随机表情切换
      const idle = ['relaxed', 'proud', 'disdain', 'badsmile'];
      setEmotion(idle[(Math.random() * idle.length) | 0], '');
    }
  }

  // 打喷嚏动画
  if (pet.sneezing) {
    pet.sneezing -= dt;
    if (pet.sneezing <= 0) {
      pet.sneezing = 0;
      // 喷出粒子
      for (let i = 0; i < 15; i++) {
        const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.5;
        pet.cracks.push({
          x: CFG.cx, y: CFG.cy + 10,
          vx: Math.cos(ang) * (2 + Math.random() * 4),
          vy: Math.sin(ang) * (2 + Math.random() * 4),
          size: 2 + Math.random() * 3,
          life: 1,
          rot: ang,
        });
      }
      pet.shakeIntensity = 0.3;
      setEmotion('relaxed', '');
    }
  }

  // 打嗝动画
  if (pet.hiccuping) {
    pet.hiccuping -= dt;
    if (pet.hiccuping <= 0) {
      pet.hiccuping = 0;
      setEmotion('relaxed', '');
    } else {
      // 打嗝时小弹跳
      pet.squashVY += -0.03;
    }
  }
}

function triggerSneeze() {
  pet.sneezing = 0.5;
  setEmotion('shocked', '阿嚏！');
  pet.squashVX += 0.15;
  pet.squashVY += -0.1;
}

function triggerHiccup() {
  pet.hiccuping = 1.5;
  setEmotion('shocked', '嗝！');
  pet.squashVY += -0.08;
}

// ── 光标追踪 ──
function updateCursorTracking(dt) {
  const k = clamp(0.15 * dt * 60, 0, 1);
  pet.mouseRX = lerp(pet.mouseRX, pet._rawMouseX || 0, k);
  pet.mouseRY = lerp(pet.mouseRY, pet._rawMouseY || 0, k);
}

// ── 环顾 ──
function updateLookAround(dt) {
  if (pet.dragging || pet.falling || pet.sleeping) return;
  pet.lookTimer -= dt;
  if (pet.lookTimer <= 0) {
    pet.lookTimer = 4 + Math.random() * 6;
    if (Math.random() < 0.4) {
      pet.lookAround = 1;
      pet.lookDir = Math.random() < 0.5 ? -1 : 1;
    } else {
      pet.lookAround = 0;
    }
  }
  if (pet.lookAround > 0) {
    pet.lookAround -= dt * 0.8;
    const lookOffset = Math.sin(Date.now() * 0.003) * 8 * pet.lookDir;
    pet._rawMouseX = lookOffset;
    pet._rawMouseY = -2;
  }
}

// ── 弹簧物理 ──
function updateSpringPhysics(dt, t) {
  pet.bobY = pet.sleeping ? Math.sin(t * 0.5) * 1 : Math.sin(t * 1.1) * 2.2;
  pet.auraPhase += dt;

  // ── 商店特效生成 ──
  pet._shopTick = (pet._shopTick || 0) + dt;
  const fx = pet.shopEffectsOn || [];
  if (fx.length) {
    // 心形粒子：每 0.6s 生成一个
    if (fx.includes('hearts') && pet._shopTick % 0.6 < dt) spawnHeart();
    // 星尘：高频小粒子
    if (fx.includes('stardust') && Math.random() < dt * 5) {
      // 金色星尘使用轨道粒子，复用对象池而不是扫描整池寻找“最新元素”。
      const stardust = spawnParticle('orbit');
      if (stardust) {
        stardust.hue = 48;
        stardust.decay *= 0.72;
      }
    }
    // 闪电拖尾：移动时生成（基于上次位置差）
    if (fx.includes('lightning') && (pet.walking || pet.dragging)) {
      if (pet._shopTick % 0.05 < dt) {
        pet.cracks.push({
          x: CFG.cx + (Math.random() - 0.5) * 20,
          y: CFG.cy + 30 + (Math.random() - 0.5) * 20,
          vx: (Math.random() - 0.5) * 1,
          vy: 0.5,
          size: 1.5,
          life: 0.6,
          rot: 0,
        });
      }
    }
  }

  // 非商店特效也保留少量角色主色的轨道微粒；悬停时增密，睡眠时停用以节省渲染。
  if (RUNTIME.particles && !pet.sleeping) {
    const orbitRate = pet.hovering ? 2.6 : 0.42;
    if (Math.random() < dt * orbitRate) spawnParticle('orbit');
  }

  const springK = 0.12;
  const dampK = 0.82;
  const forceX = (1 - pet.squashX) * springK;
  const forceY = (1 - pet.squashY) * springK;
  pet.squashVX = (pet.squashVX + forceX) * dampK;
  pet.squashVY = (pet.squashVY + forceY) * dampK;
  pet.squashX += pet.squashVX * dt * 60;
  pet.squashY += pet.squashVY * dt * 60;

  const tiltForce = (0 - pet.tilt) * 0.1;
  pet.tiltV = (pet.tiltV + tiltForce) * 0.85;
  pet.tilt += pet.tiltV * dt * 60;

  // 旋转动画（三连击）
  if (pet.spin > 0) {
    pet.spin -= dt * 4;
    if (pet.spin < 0) pet.spin = 0;
  }

  // 缩放插值
  const oldZoom = pet.zoom;
  pet.zoom = lerp(pet.zoom, pet.zoomTarget, clamp(dt * 5, 0, 1));
  // zoom 变化时同步给主进程（用于光圈边界计算）
  if (Math.abs(pet.zoom - oldZoom) > 0.005) {
    window.petAPI.syncZoom(pet.zoom);
  }

  // 长按挣扎
  if (pet.struggling) {
    pet.squashVX += (Math.random() - 0.5) * 0.04;
    pet.squashVY += (Math.random() - 0.5) * 0.04;
    pet.tiltV += (Math.random() - 0.5) * 0.03;
  }

  // 行走（食物寻路时跳过自动方向切换，由 updateFoodSeeking 控制）
  if (pet.walking && !pet.dragging && !pet.falling && !pet.sleeping && !foodSeeking) {
    pet.walkTimer -= dt;
    if (pet.walkTimer <= 0) {
      if (Math.random() < 0.35) { pet.walking = false; pet.walkTimer = 2 + Math.random() * 3; }
      else { pet.walkDir = Math.random() < 0.5 ? -1 : 1; pet.walkTimer = 1.5 + Math.random() * 2.5; }
    }
    if (pet.walking) {
      // 边界检测：光圈快到屏幕边时反转方向（避免顶墙一直走）
      const auraR = CFG.r * pet.zoom * 1.5;
      const screenW = window.screen.availWidth;
      const screenH = window.screen.availHeight;
      // windowX 是窗口左上角屏幕坐标；宠物中心 = windowX + CFG.cx
      const petCx = windowX + CFG.cx;
      if (pet.walkDir > 0 && petCx + auraR >= screenW - 5) {
        pet.walkDir = -1;
      } else if (pet.walkDir < 0 && petCx - auraR <= 5) {
        pet.walkDir = 1;
      }
      pet.walkAccum += pet.walkDir * RUNTIME.walkSpeed * dt;
      if (Math.abs(pet.walkAccum) >= 1) {
        const move = Math.trunc(pet.walkAccum);
        pet.walkAccum -= move;
        window.petAPI.moveWindow(move, 0);
        // 行走时留脚印
        if (Math.random() < 0.15) spawnFootprint();
      }
      pet.walkOffset = Math.abs(Math.sin(t * 8)) * 4;
      pet.squashVX += (1.04 - pet.squashX) * 0.03;
      pet.squashVY += (0.98 - pet.squashY) * 0.03;
      pet.tiltV += (pet.walkDir * 0.04 - pet.tilt) * 0.02;
    }
  } else if (!pet.dragging && !pet.falling && !pet.sleeping && !foodSeeking) {
    pet.walkTimer -= dt;
    if (pet.walkTimer <= 0) { pet.walking = true; pet.walkDir = Math.random() < 0.5 ? -1 : 1; pet.walkTimer = 2 + Math.random() * 3; }
    pet.walkOffset = lerp(pet.walkOffset, 0, 0.1);
  } else if (foodSeeking) {
    // 食物寻路时只保留行走动画（squash/tilt），不再自动调 moveWindow
    pet.walkOffset = Math.abs(Math.sin(t * 8)) * 4;
    pet.squashVX += (1.04 - pet.squashX) * 0.03;
    pet.squashVY += (0.98 - pet.squashY) * 0.03;
    pet.tiltV += (pet.walkDir * 0.04 - pet.tilt) * 0.02;
  }

  // 气泡
  if (pet.bubbleTimer > 0) pet.bubbleTimer -= dt;

  // 抚摸计数
  if (pet.petTimer > 0) { pet.petTimer -= dt; if (pet.petTimer <= 0) pet.petCount = 0; }

  // 悬停反应
  if (pet.hovering && !pet.dragging && pet.blinkPhase === 0 && !pet.sleeping) {
    pet.params.eyeS = lerp(pet.params.eyeS, EMOTIONS[pet.targetEmotion].eyeS * 1.08, 0.1);
  }

  // 随机待机表情（基于心情）
  if (!pet.dragging && !pet.falling && !pet.sleeping) {
    pet.idleTimer -= dt;
    if (pet.idleTimer <= 0) {
      pet.idleTimer = 12 + Math.random() * 18;
      // 根据心情选择表情
      let idleEmo = 'relaxed';
      for (const threshold of Object.keys(MOOD_EMOTIONS).sort((a, b) => b - a)) {
        if (pet.mood >= parseInt(threshold)) { idleEmo = MOOD_EMOTIONS[threshold]; break; }
      }
      if (Math.random() < 0.3) idleEmo = 'disdain';
      if (idleEmo !== 'love') setEmotion(idleEmo, '');
    }
  }

  // 心情好时偶尔产生星尘和音符
  if (pet.mood > 70 && Math.random() < dt * 0.5) {
    spawnSparkle();
  }
  if (pet.mood > 85 && Math.random() < dt * 0.3) {
    spawnNote();
  }

  // 工作状态（proud表情）时出汗
  if (pet.targetEmotion === 'proud' && pet.energy < 50 && Math.random() < dt * 0.8) {
    spawnSweat();
  }

  updateDrips();
}

// ═══════════════════════════════════════════════
// 主渲染循环
// ═══════════════════════════════════════════════
let lastT = null;
let rafSkipCounter = 0;
let sleepDtAccum = 0;
function loop(ts) {
  // 首帧 / 异常时间戳保护
  if (lastT === null || ts < lastT) {
    lastT = ts;
    requestAnimationFrame(loop);
    return;
  }
  const rawDt = Math.min(0.05, (ts - lastT) / 1000);
  lastT = ts;
  const t = ts / 1000;
  let dt = rawDt;

  // ── H 键隐藏/显示动画进度推进 ──
  if (pet.hideAnim !== 0) {
    pet.hideAnimT += dt * 2.5;  // 0.4 秒完成
    if (pet.hideAnimT >= 1) {
      if (pet.hideAnim > 0) {
        // 隐藏动画结束：真正隐藏窗口
        pet.hidden = true;
        pet.hideAnim = 0;
        pet.hideAnimT = 0;
        window.petAPI.notifyHidden();  // 通知主进程隐藏窗口
      } else {
        // 显示动画结束
        pet.hideAnim = 0;
        pet.hideAnimT = 0;
      }
    }
    // 隐藏动画期间继续渲染（不能跳到 hidden 分支）
  }

  // 睡眠/隐藏时暂停光标 IPC；显示且清醒时恢复
  syncCursorPoll();

  // 隐藏状态：低频更新（仅维持传送光效衰减）
  if (pet.hidden && pet.hideAnim === 0) {
    rafSkipCounter++;
    if (rafSkipCounter < 6) {  // 6 帧抽 1，约 10Hz
      requestAnimationFrame(loop);
      return;
    }
    rafSkipCounter = 0;
    if (pet.teleportGlow > 0.01) pet.teleportGlow -= dt * 2;
    if (pet.teleportGlow < 0) pet.teleportGlow = 0;
    requestAnimationFrame(loop);
    return;
  }

  // 睡眠状态：约 20Hz 合并更新，逻辑用累计 dt，动画速度正常
  if (pet.sleeping && pet.hideAnim === 0 && !pet.dragging && !pet.falling) {
    sleepDtAccum += rawDt;
    rafSkipCounter++;
    if (rafSkipCounter < 3) {
      requestAnimationFrame(loop);
      return;
    }
    rafSkipCounter = 0;
    dt = Math.min(0.05, sleepDtAccum);
    sleepDtAccum = 0;
  } else {
    rafSkipCounter = 0;
    sleepDtAccum = 0;
  }

  ctx.clearRect(0, 0, CFG.W, CFG.H);

  // 更新所有系统
  lerpParams(dt);
  updateCharMorph(dt);
  updateBlink(dt);
  updateCursorTracking(dt);
  updateLookAround(dt);
  updateSpringPhysics(dt, t);
  updateParticles(dt, pet.params.rate);
  updateMood(dt);
  updateSleep(dt);
  updateCombo(dt);
  updateShake(dt);
  updateTrail(dt);
  updateRandomEvents(dt);
  updateHearts(dt);
  updateSweat(dt);
  updateZzz(dt);
  updateCracks(dt);
  updateSparkles(dt);
  updateLanAnimations(dt, t);
  updateLanSearch(dt);
  updateCoins(dt);
  updateNotes(dt);
  updateFootprints(dt);
  updateShockwaves(dt);
  updateThoughts(dt);
  updateDayNight(dt);
  updateEvolution(dt);
  updateDance(dt, t);
  updateEating(dt);
  updateMagnet(dt);
  updateBlush(dt);
  updateFoodSeeking(dt);

  // 屏震
  ctx.save();
  ctx.translate(pet.shakeX, pet.shakeY);

  // 光环（在身体下方）
  drawAura(ctx, t, CFG.r * pet.zoom, CFG.r * pet.zoom);

  // 残影
  drawTrail(ctx, t);

  ctx.save();

  // 缩放
  if (pet.zoom !== 1) {
    ctx.translate(CFG.cx, CFG.cy);
    ctx.scale(pet.zoom, pet.zoom);
    ctx.translate(-CFG.cx, -CFG.cy);
  }

  // 飞走动画
  if (pet.flyAway) {
    const fa = pet.flyAway;
    fa.t += dt;
    const prog = clamp(fa.t / 0.6, 0, 1);
    const scale = 1 - easeOut(prog) * 0.95;
    const offX = fa.dirX * easeOut(prog) * 80;
    const offY = fa.dirY * easeOut(prog) * 80;
    ctx.globalAlpha = 1 - prog;
    ctx.translate(CFG.cx + offX, CFG.cy + offY);
    ctx.scale(scale, scale);
    ctx.rotate(prog * fa.dirX * 3);
    ctx.translate(-CFG.cx, -CFG.cy);
    if (prog >= 1) { pet.flyAway = null; pet.hidden = true; }
  }

  // H 键隐藏/显示动画变换
  if (pet.hideAnim !== 0) {
    const p = clamp(pet.hideAnimT, 0, 1);
    if (pet.hideAnim > 0) {
      // 隐藏：缩小+淡出+轻微上浮
      const s = 1 - easeOut(p) * 0.9;
      ctx.globalAlpha *= 1 - p;
      ctx.translate(CFG.cx, CFG.cy - p * 20);
      ctx.scale(s, s);
      ctx.translate(-CFG.cx, -CFG.cy);
    } else {
      // 显示：从0弹性放大+淡入
      const s = easeOutCubic(p);
      ctx.globalAlpha *= p;
      ctx.translate(CFG.cx, CFG.cy);
      ctx.scale(s, s);
      ctx.translate(-CFG.cx, -CFG.cy);
    }
  }

  // 从天而降
  if (pet.dropIn) {
    const di = pet.dropIn;
    di.t += dt;
    const prog = clamp(di.t / 0.8, 0, 1);
    if (prog < 0.7) {
      const fp = prog / 0.7;
      ctx.translate(0, lerp(-200, 0, easeOut(fp)));
    } else {
      const bp = (prog - 0.7) / 0.3;
      pet.squashVY += -0.05 * (1 - bp);
      pet.squashVX += 0.04 * (1 - bp);
    }
    if (prog >= 1) {
      pet.dropIn = null;
      pet.squashVY += -0.2;
      pet.squashVX += 0.15;
    }
  }

  // 旋转（三连击）
  if (pet.spin > 0) {
    ctx.translate(CFG.cx, CFG.cy);
    ctx.rotate(pet.spin * TAU);
    ctx.translate(-CFG.cx, -CFG.cy);
  }

  ctx.translate(0, pet.bobY - pet.walkOffset);
  ctx.rotate(pet.tilt);

  // 角色切换变形动画
  const morphScale = getMorphScale();
  const morphAlpha = getMorphAlpha();
  if (morphScale !== 1) {
    ctx.translate(CFG.cx, CFG.cy);
    ctx.scale(morphScale, morphScale);
    ctx.translate(-CFG.cx, -CFG.cy);
  }
  ctx.globalAlpha = morphAlpha;

  const charDef = getCharacterAppearance(pet.character, pet.skin);
  const sprite = getSprite(pet.character, pet.skin);

  if (sprite) {
    // 精灵图渲染（AI生成高质量形象）
    drawSpriteBody(ctx, t, pet.params, sprite, charDef);
  } else {
    // 程序化渲染（精灵图加载前的降级方案）
    if (charDef.customBody) {
      charDef.customBody(ctx, t, pet.params);
    } else {
      drawBody(ctx, t, pet.params);
    }
    if (charDef.customFeatures) {
      charDef.customFeatures(ctx, t, pet.params);
    }
    drawEyes(ctx, t, pet.params);
    drawBlush(ctx);
    drawMouth(ctx, t, pet.params);
  }
  drawParticles(ctx);
  ctx.globalAlpha = 1;
  ctx.restore();

  // 效果粒子（不受旋转/位移影响）
  drawFootprints(ctx);
  drawShockwaves(ctx);
  drawCracks(ctx);
  drawSparkles(ctx);
  drawHearts(ctx);
  drawNotes(ctx);
  drawSweat(ctx);
  drawZzz(ctx);

  // 传送光效
  if (pet.teleportGlow > 0.01) {
    drawTeleportEffect(ctx, CFG.cx, CFG.cy, pet.teleportGlow, t);
  }

  // 连击数字
  drawCombo(ctx);

  // 思考气泡
  drawThoughts(ctx);

  // 气泡
  drawBubble(ctx);

  // 联机搜索状态（最上层）
  drawLanSearch(ctx);

  // 羁绊币（飘字 + 顶部计数）
  drawCoins(ctx);
  drawCompanionHUD(ctx, dt);

  ctx.restore(); // 屏震 restore

  requestAnimationFrame(loop);
}

// ═══════════════════════════════════════════════
// 联机动画 & 传送光效
// ═══════════════════════════════════════════════
function updateLanAnimations(dt, t) {
  if (pet.teleportGlow > 0) {
    pet.teleportGlow -= dt * 2;
    if (pet.teleportGlow < 0) pet.teleportGlow = 0;
  }
}

function drawTeleportEffect(ctx, cx, cy, intensity, t) {
  const r = 60 + (1 - intensity) * 40;
  const a = intensity;
  ctx.fillStyle = `rgba(0,200,255,${a * 0.06})`;
  ctx.beginPath(); ctx.arc(cx, cy, r * 1.8, 0, TAU); ctx.fill();
  ctx.fillStyle = `rgba(0,220,255,${a * 0.12})`;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
  ctx.fillStyle = `rgba(150,240,255,${a * 0.3})`;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.4 * (0.8 + Math.sin(t * 15) * 0.2), 0, TAU);
  ctx.fill();
  ctx.strokeStyle = `rgba(0,220,255,${a * 0.2})`;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    const ang = t * 4 + i * (TAU / 6);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * r * 0.5, cy + Math.sin(ang) * r * 0.5);
    ctx.lineTo(cx + Math.cos(ang) * r * 1.5, cy + Math.sin(ang) * r * 1.5);
    ctx.stroke();
  }
}

// 序列化桌宠状态（包含心情/能量）
window.__getPetStateForTransfer = function() {
  return {
    emotion: pet.targetEmotion,
    mood: pet.mood,
    energy: pet.energy,
    params: {
      eye: pet.params.eye,
      mouth: pet.params.mouth,
      curve: pet.params.curve,
      teeth: pet.params.teeth,
      tint: [...pet.params.tint],
      tension: pet.params.tension,
      glow: pet.params.glow,
      rate: pet.params.rate,
      eyeS: pet.params.eyeS,
    },
    squashX: pet.squashX,
    squashY: pet.squashY,
    totalPets: pet.totalPets,
    totalDrags: pet.totalDrags,
    evolutionLevel: pet.evolutionLevel,
    zoom: pet.zoomTarget,
    character: pet.character,
    skin: pet.skin,
  };
};

// ═══════════════════════════════════════════════
// 鼠标交互（增强版）
// ═══════════════════════════════════════════════
let dSX = 0, dSY = 0, lMX = 0, lMY = 0, downT = 0;
let pressTimer = 0;
let clickCount = 0;
let lastClickTime = 0;

// 命中检测：根据当前 zoom 动态计算宠物可点击范围
// 包括身体 + 光圈，缩小/放大时范围同步变化
function isPetHit(x, y) {
  // 自由落体时整个 canvas 都能接（方便接住）
  if (pet.falling) return true;
  const dx = x - CFG.cx, dy = y - CFG.cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  // 宠物身体半径 + 光圈（auraR = r * 1.5），都乘以 zoom
  const hitR = CFG.r * pet.zoom * 1.55;
  return dist <= hitR;
}

canvas.addEventListener('mousedown', (e) => {
  // 命中检测：缩小后只有宠物+光圈范围内可点击
  if (!isPetHit(e.clientX, e.clientY)) return;

  dSX = e.screenX; dSY = e.screenY; lMX = e.screenX; lMY = e.screenY;
  downT = Date.now();
  pet.dragging = false;
  pet.dragHist = [];
  pet.sleepTimer = 30;
  if (pet.falling) {
    // ── 自由落体中被接住：触发庆祝反应 ──
    window.petAPI.physicsCancel();
    pet.falling = false;
    onCaughtMidAir(e.clientX, e.clientY);
  }

  // 长按检测
  pressTimer = setTimeout(() => {
    if (!pet.dragging && Date.now() - downT > 500) {
      pet.struggling = true;
      setEmotion('angry', '放开放开！');
    }
  }, 500);
});

// ═══════════════════════════════════════════════
// 自由落体中被接住的庆祝反应
// ═══════════════════════════════════════════════
const CATCH_PRAISES = [
  '接得漂亮！',
  '哇！谢谢你！',
  '好身手！',
  '差点摔死我了！',
  '英雄救美！',
  '你反应真快！',
  '吓死我了~',
  '终于等到你！',
];
let catchCooldown = 0;  // 避免短时间内重复触发

function onCaughtMidAir(x, y) {
  const now = Date.now();
  if (now - catchCooldown < 1500) return; // 1.5s 冷却
  catchCooldown = now;
  // 飘字位置默认使用接住位置
  const px = x != null ? x : CFG.cx;
  const py = y != null ? y : CFG.cy - 30;

  // 心情大涨
  pet.mood = clamp(pet.mood + 18, 0, 100);
  pet.energy = clamp(pet.energy + 8, 0, 100);
  window.SoundFX?.play('catch');

  // 表情：先震惊后开心
  setEmotion('shocked', '？！');
  setTimeout(() => setEmotion('happy', CATCH_PRAISES[Math.floor(Math.random() * CATCH_PRAISES.length)]), 200);
  setTimeout(() => setEmotion('love', '♥'), 1400);
  setTimeout(() => setEmotion('relaxed', ''), 3200);

  // 弹性挤压（被接住的冲击感）
  pet.squashVY += -0.32;
  pet.squashVX += 0.25;

  // 心形粒子（感激）
  for (let i = 0; i < 6; i++) {
    setTimeout(() => spawnHeart(), i * 80);
  }
  // 星尘闪烁
  for (let i = 0; i < 10; i++) {
    spawnSparkle();
  }
  // 微屏震
  pet.shakeIntensity = 0.12;

  // 进化系统加经验
  pet.totalPets++;

  // 羁绊币奖励（被接住是大奖励，从接住位置飞出）
  gainCoins(COIN_REWARDS.catch, 'catch', px, py);

  console.log('[CATCH] Caught mid-air! Triggering celebration.');
}

// ═══════════════════════════════════════════════
// 羁绊币系统
// 接触宠物即获得，可积累用于后续兑换交互
// ═══════════════════════════════════════════════
// 金币配置从 game_config.json 读取（启用开关、冷却时间、各类奖励数值）
const COIN_CFG = (window.GAME_CONFIG && window.GAME_CONFIG.coins) || {};
const COIN_ENABLED = COIN_CFG.enabled !== false;  // 默认开启
const COIN_COOLDOWN_MS = COIN_CFG.cooldownMs != null ? COIN_CFG.cooldownMs : 80;
const COIN_REWARDS = (COIN_CFG.rewards) || {
  pet:      1,   // 单次点击抚摸
  combo3:   3,   // 三连击
  combo5:   8,   // 五连击
  catch:    15,  // 自由落体被接住
  drag:     2,   // 拖拽结束
};
let coinGainCooldown = 0;   // 防止单次操作连续触发

// 产生金币飘字动画
function spawnCoinPopup(x, y, amount) {
  pet.coinPopups.push({
    x: x != null ? x : CFG.cx,
    y: y != null ? y : CFG.cy - 20,
    vy: -1.2,
    life: 1.4,
    amount,
  });
}

// 获得金币（带冷却防刷；可在配置中关闭）
function gainCoins(amount, reason, x, y) {
  if (!COIN_ENABLED) return;       // 配置关闭则不发放
  if (amount <= 0) return;
  const now = performance.now();
  if (now - coinGainCooldown < COIN_COOLDOWN_MS) return;
  coinGainCooldown = now;
  window.petAPI.addCoins(amount);
  spawnCoinPopup(x, y, amount);
  window.SoundFX?.play('coin');
  // 顶部计数显示淡入
  pet.coinDisplayAlpha = 1;
  console.log(`[COINS] +${amount} (${reason})`);
}

// 更新金币飘字
function updateCoins(dt) {
  for (let i = pet.coinPopups.length - 1; i >= 0; i--) {
    const p = pet.coinPopups[i];
    p.y += p.vy;
    p.vy *= 0.97;
    p.life -= dt * 0.9;
    if (p.life <= 0) pet.coinPopups.splice(i, 1);
  }
}

// 绘制金币飘字
let companionHudAlpha = 0;
function drawCompanionHUD(ctx, dt) {
  const visible = pet.hovering && !pet.dragging && !pet.falling && !pet.hidden && !pet.hideAnim && !pet.flyAway;
  companionHudAlpha = lerp(companionHudAlpha, visible ? 1 : 0, Math.min(1,dt * 9));
  if (companionHudAlpha < .01) return;
  const x = CFG.cx - 101;
  const y = Math.min(CFG.H - 77, CFG.cy + 80 * pet.zoom + 14);
  ctx.save();
  ctx.globalAlpha = companionHudAlpha;
  const ui = CompanionVisual.panel(ctx,x,y,202,59,RUNTIME.shopTheme);
  ctx.font = '600 11px "Microsoft YaHei",sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = ui.text;
  ctx.fillText(CHARACTERS[pet.character]?.name || '桌宠',x+12,y+19);
  ctx.textAlign = 'right';
  ctx.fillStyle = ui.accent;
  ctx.fillText('◈ ' + pet.coins,x+190,y+19);
  const bars = [{label:'心情',value:pet.mood,color:ui.accent,x:x+12},{label:'活力',value:pet.energy,color:ui.energy,x:x+108}];
  for (const bar of bars) {
    ctx.font = '9px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'left';
    ctx.fillStyle = ui.muted; ctx.fillText(bar.label,bar.x,y+34);
    ctx.textAlign = 'right'; ctx.fillText(Math.round(bar.value),bar.x+80,y+34);
    ctx.fillStyle = ui.border; ctx.beginPath(); ctx.roundRect(bar.x,y+42,80,3,2); ctx.fill();
    ctx.fillStyle = bar.color; ctx.beginPath(); ctx.roundRect(bar.x,y+42,Math.max(0,Math.min(80,bar.value*.8)),3,1); ctx.fill();
  }
  ctx.restore();
}

function drawCoins(ctx) {
  for (const p of pet.coinPopups) {
    const a = clamp(p.life, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = 'bold 14px "Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 描边
    ctx.strokeStyle = 'rgba(120,80,0,0.9)';
    ctx.lineWidth = 3;
    ctx.strokeText(`+${p.amount}🪙`, p.x, p.y);
    // 金色填充
    ctx.fillStyle = '#ffd54a';
    ctx.fillText(`+${p.amount}🪙`, p.x, p.y);
    ctx.restore();
  }
}

canvas.addEventListener('mousemove', (e) => {
  if (e.buttons !== 1) {
    // 兜底：mouseup 丢失（拖拽中鼠标移出窗口后松开）时恢复拖拽状态
    // 穿透模式下 mousemove 仍会被 forward 转发，所以这里能捕获到
    if (pet.dragging) {
      pet.dragging = false;
      pet.mood = clamp(pet.mood - 2, 0, 100);
      setEmotion('relaxed', '');
    }
    // hovering 范围 = mousedown 命中范围（统一用 isPetHit）
    pet.hovering = isPetHit(e.clientX, e.clientY);

    // 点击穿透切换：在宠物身上 → 可点击；离开宠物 → 穿透到桌面
    // dragging/falling 期间不切换，避免拖拽中断
    if (!pet.dragging && !pet.falling) {
      window.petAPI.setClickThrough(!pet.hovering);
    }
    return;
  }

  const dx = e.screenX - lMX, dy = e.screenY - lMY;

  if (Math.abs(e.screenX - dSX) > 3 || Math.abs(e.screenY - dSY) > 3) {
    if (!pet.dragging) pet.totalDrags++; // 记录拖拽次数
    pet.dragging = true;
    pet.struggling = false;
    clearTimeout(pressTimer);
    pet.walking = false;
    pet.walkTimer = 3;

    if (pet.sleeping) {
      pet.sleeping = false;
      setEmotion('shocked', '！');
    }

    if (pet.targetEmotion !== 'shocked' && pet.targetEmotion !== 'scared' && pet.targetEmotion !== 'dizzy') {
      setEmotion('shocked', '！');
    }
    pet.squashVY += (0.92 - pet.squashY) * 0.08;
    pet.squashVX += (1.08 - pet.squashX) * 0.08;

    pet.dragHist.push({ dx, dy, t: Date.now() });
    if (pet.dragHist.length > 5) pet.dragHist.shift();

    window.petAPI.moveWindow(dx, dy);
  }
  lMX = e.screenX; lMY = e.screenY;
});

canvas.addEventListener('mouseup', (e) => {
  clearTimeout(pressTimer);
  pet.struggling = false;

  if (pet.dragging) {
    pet.dragging = false;
    pet.mood = clamp(pet.mood - 2, 0, 100); // 拖拽略降心情

    let vx = 0, vy = 0;
    if (pet.dragHist.length > 0) {
      const now = Date.now();
      const recent = pet.dragHist.filter(h => now - h.t < 120);
      if (recent.length > 0) {
        for (const h of recent) { vx += h.dx; vy += h.dy; }
        vx /= recent.length;
        vy /= recent.length;
      }
    }

    if (Math.abs(vx) > CFG.dragThrowMin || Math.abs(vy) > CFG.dragThrowMin) {
      pet.falling = true;
      window.petAPI.physicsDrop(vx, vy);
      setEmotion('scared', '啊！');
      // 自由落体期间窗口必须可点击，否则无法接住
      window.petAPI.setClickThrough(false);
    } else {
      pet.squashVY += (0.82 - pet.squashY) * 0.15;
      pet.squashVX += (1.18 - pet.squashX) * 0.15;
      setEmotion('relaxed', '');
      // 拖拽结束奖励（从释放位置飞出）
      gainCoins(COIN_REWARDS.drag, 'drag', e.clientX, e.clientY);
    }
  } else if (Date.now() - downT < 250) {
    // 点击
    const now = Date.now();
    if (now - lastClickTime < 400) {
      clickCount++;
    } else {
      clickCount = 1;
    }
    lastClickTime = now;

    pet.petCount++; pet.petTimer = 3;
    pet.totalPets++; // 记录点击次数（进化系统）
    pet.mood = clamp(pet.mood + 5, 0, 100); // 点击提升心情
    pet.sleepTimer = 30;

    // 连击系统
    pet.combo++;
    pet.comboTimer = 2;
    pet.comboShake = 1;
    window.SoundFX?.play('combo', pet.combo);

    // 产生心形/星尘
    if (pet.combo >= 3) {
      for (let i = 0; i < 2; i++) spawnHeart();
      for (let i = 0; i < 3; i++) spawnSparkle();
    } else {
      spawnSparkle();
    }

    // 三连击 → 旋转
    if (clickCount >= 3) {
      pet.spin = 1;
      setEmotion('love', '转转转~');
      clickCount = 0;
      pet.mood = clamp(pet.mood + 10, 0, 100);
      for (let i = 0; i < 5; i++) spawnHeart();
      // 五连击 → 舞蹈 + 大额金币奖励
      if (pet.combo >= 5) {
        setTimeout(() => startDance(), 600);
        gainCoins(COIN_REWARDS.combo5, 'combo5', e.clientX, e.clientY);
      } else {
        // 三连击奖励
        gainCoins(COIN_REWARDS.combo3, 'combo3', e.clientX, e.clientY);
      }
    } else if (pet.petCount >= 3) {
      setEmotion('love', '好喜欢~');
      pet.petCount = 0;
      pet.mood = clamp(pet.mood + 8, 0, 100);
      for (let i = 0; i < 3; i++) spawnHeart();
      gainCoins(COIN_REWARDS.combo3, 'pet3', e.clientX, e.clientY);
    } else {
      const r = ['happy', 'proud', 'relaxed'];
      const msgs = ['~', '嗯~', '嘿！', '舒服~', '嘿嘿', '再摸摸~'];
      setEmotion(r[(Math.random() * 3) | 0], msgs[(Math.random() * msgs.length) | 0]);
      // 单次抚摸奖励（从点击位置飞出）
      gainCoins(COIN_REWARDS.pet, 'pet', e.clientX, e.clientY);
    }
  }
  pet.hovering = false;
  // 拖拽结束，恢复穿透状态（鼠标当前位置不在宠物身上则穿透）
  const stillOnPet = isPetHit(e.clientX, e.clientY);
  window.petAPI.setClickThrough(!stillOnPet);
});

canvas.addEventListener('dblclick', (e) => {
  if (!isPetHit(e.clientX, e.clientY)) return;
  pet.squashVY += -0.3;
  pet.squashVX += 0.25;
  setEmotion('shocked', '！');
  pet.shakeIntensity = 0.2;
  setTimeout(() => setEmotion('happy', '哇！'), 350);
  for (let i = 0; i < 5; i++) spawnSparkle();
});

// 滚轮缩放
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  // ── Ctrl+滚轮：循环切换角色 ──
  if (e.ctrlKey) {
    const keys = Object.keys(CHARACTERS);
    if (keys.length === 0) return;
    const idx = keys.indexOf(pet.character);
    const next = e.deltaY > 0
      ? (idx + 1) % keys.length
      : (idx - 1 + keys.length) % keys.length;
    const newChar = keys[next];
    if (newChar === pet.character) return;
    startCharMorph(newChar, 'default');
    window.petAPI.characterSync(newChar, 'default');
    const meta = getCharacterAppearance(newChar, 'default');
    setEmotion('shocked', `${meta.icon} ${meta.name}！`);
    spawnShockwave(CFG.cx, CFG.cy, 1.2);
    for (let i = 0; i < 15; i++) spawnSparkle();
    pet.sleepTimer = 30;
    return;
  }
  // ── 普通滚轮：缩放 ──
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  pet.zoomTarget = clamp(pet.zoomTarget + delta, 0.5, 2.0);
  if (pet.zoomTarget > 1.5) setEmotion('proud', '变大！');
  else if (pet.zoomTarget < 0.7) setEmotion('scared', '好小…');
  else setEmotion('shocked', '！');
  pet.sleepTimer = 30;
  // 缩放后立即重新计算穿透状态（宠物大小变了，可点击范围也变了）
  const onPet = isPetHit(e.clientX, e.clientY);
  window.petAPI.setClickThrough(!onPet);
}, { passive: false });

// 右键喂食
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  feedPet();
});

// 键盘快捷键
window.addEventListener('keydown', (e) => {
  switch (e.key.toLowerCase()) {
    case ' ':
      e.preventDefault();
      // 空格 = 拍拍
      pet.petCount++; pet.petTimer = 3;
      pet.totalPets++;
      pet.mood = clamp(pet.mood + 5, 0, 100);
      pet.sleepTimer = 30;
      pet.combo++;
      pet.comboTimer = 2;
      pet.comboShake = 1;
      spawnSparkle();
      setEmotion('happy', '嗯~');
      break;
    case 's':
      // S = 睡眠切换
      if (pet.sleeping) {
        pet.sleeping = false;
        setEmotion('shocked', '！');
      } else {
        pet.sleeping = true;
        setEmotion('sleepy', 'Zzz…');
      }
      break;
    case 'd':
      // D = 舞蹈
      startDance();
      break;
    case 'f':
      // F = 喂食
      feedPet();
      break;
    case 'r':
      // R = 重置缩放
      pet.zoomTarget = 1;
      setEmotion('shocked', '！');
      break;
  }
});

canvas.addEventListener('mouseleave', () => { pet.hovering = false; });

// ═══════════════════════════════════════════════
// IPC 事件
// ═══════════════════════════════════════════════
window.petAPI.onEmotionChange((emo) => setEmotion(emo, EMOTION_TEXT[emo] || ''));
window.petAPI.onStatusChange((st) => setStatus(st));

// H 键隐藏/显示触发
window.petAPI.onHideToggle(() => triggerHideAnim());

window.petAPI.onAutoWalkToggle((v) => {
  pet.walking = v;
  if (!v) pet.walkTimer = 9999;
});

// 新功能事件
window.petAPI.onFeed(() => feedPet());
window.petAPI.onDance(() => startDance());
window.petAPI.onSleepToggle(() => {
  if (pet.sleeping) {
    pet.sleeping = false;
    setEmotion('shocked', '！');
  } else {
    pet.sleeping = true;
    setEmotion('sleepy', 'Zzz…');
  }
});
window.petAPI.onResetZoom(() => {
  pet.zoomTarget = 1;
  setEmotion('shocked', '！');
});

window.petAPI.onCharacterChange((selection) => {
  const next = typeof selection === 'string'
    ? { character: selection, skin: 'default' }
    : selection;
  if (next && CHARACTERS[next.character]) {
    const appearance = getCharacterAppearance(next.character, next.skin || 'default');
    startCharMorph(next.character, appearance.skinId);
  }
});

window.petAPI.onCursorPos((pos) => {
  // 附带的窗口屏幕坐标用于食物坐标转换
  if (pos.winX != null) windowX = pos.winX;
  if (pos.winY != null) windowY = pos.winY;
  if (pet.lookAround > 0 || pet.sleeping) return;
  pet._rawMouseX = pos.x;
  pet._rawMouseY = pos.y;
});

// 接收主进程推送的食物列表
window.petAPI.onFoodsUpdate((list) => {
  foods = list || [];
  console.log(`[FOOD] Received ${foods.length} foods`);
});

// 接收设置变化，实时应用
window.petAPI.onSettingsChanged(({ key, value }) => {
  if (key in RUNTIME) {
    RUNTIME[key] = value;
    console.log(`[SETTINGS] applied: ${key} = ${value}`);
    if (key === 'soundEnabled') {
      window.SoundFX?.setEnabled(value);
    }
    // 主题变化时重绘托盘图标
    if (key === 'shopTheme') {
      genTrayIcon(value);
    }
  }
});

// ═══════════════════════════════════════════════
// 羁绊币初始化与监听
// ═══════════════════════════════════════════════
(async () => {
  try {
    const balance = await window.petAPI.getCoins();
    pet.coins = balance;
    console.log(`[COINS] Initial balance: ${balance}`);
  } catch (e) {
    console.warn('[COINS] Init failed:', e.message);
  }
})();

window.petAPI.onCoinsUpdate((balance) => {
  pet.coins = balance;
});

// ═══════════════════════════════════════════════
// 商店解锁状态
// ═══════════════════════════════════════════════
function applyShopUnlocks(data) {
  if (!data) return;
  pet.shopUnlocked = Array.isArray(data.unlocked) ? data.unlocked : [];
  pet.shopEffectsOn = Array.isArray(data.effectsOn) ? data.effectsOn : [];
  console.log('[SHOP] unlocked:', pet.shopUnlocked, 'on:', pet.shopEffectsOn);
}

// 启动时主动查询一次
(async () => {
  try {
    if (window.petAPI.getShopState) {
      const state = await window.petAPI.getShopState();
      applyShopUnlocks(state);
    }
  } catch (e) { /* 旧版本无此 API，忽略 */ }
})();

// 监听解锁变化
if (window.petAPI.onShopUnlocksChanged) {
  window.petAPI.onShopUnlocksChanged((data) => applyShopUnlocks(data));
}

// 初始化：默认窗口点击穿透，鼠标移到宠物身上才可点击
window.petAPI.setClickThrough(true);
// 同步初始 zoom 给主进程
window.petAPI.syncZoom(pet.zoom);

window.petAPI.onPhysicsBounce((force) => {
  pet.squashVY += clamp(-force * 0.04, -0.2, 0);
  pet.squashVX += clamp(force * 0.03, 0, 0.15);
  window.SoundFX?.play('bounce', force);
  if (force > 4) {
    setEmotion('shocked', '！');
    pet.shakeIntensity = clamp(force * 0.05, 0, 0.5);
    spawnCracks(CFG.cx, CFG.cy + 30, Math.min(8, force | 0), force * 0.15);
  }
});

window.petAPI.onPhysicsLanded(() => {
  pet.falling = false;
  pet.squashVY += -0.18;
  pet.squashVX += 0.15;
  setEmotion('relaxed', '');
  window.SoundFX?.play('bounce', 2.0);
  spawnShockwave(CFG.cx, CFG.cy + 35, 1.5);
  spawnCracks(CFG.cx, CFG.cy + 35, 6, 0.8);
  pet.shakeIntensity = 0.15;
  // 落地后恢复穿透（让桌面可点击）
  window.petAPI.setClickThrough(true);
  setTimeout(() => setEmotion('happy', '~'), 400);
});

// ═══════════════════════════════════════════════
// 局域网联机事件
// ═══════════════════════════════════════════════
let lanEnabled = false;
let lanPeerCount = 0;           // 当前已连接的 peer 数
let lanSearchTimer = 0;         // 搜索状态闪烁计时器（>0 表示正在显示搜索提示）
let lanSearchCycleTimer = 0;    // 周期计时器（用于每隔一段时间触发一次）

window.petAPI.onLanToggle((enabled) => {
  lanEnabled = enabled;
  if (enabled) {
    setEmotion('happy', '联机已开启');
    setTimeout(() => setEmotion('relaxed', ''), 2000);
    // 开启后立即显示一次搜索提示
    lanSearchTimer = 2.2;
    lanSearchCycleTimer = 8; // 8 秒后再次显示
  } else {
    setEmotion('sad', '联机已关闭');
    setTimeout(() => setEmotion('relaxed', ''), 2000);
    lanSearchTimer = 0;
    lanSearchCycleTimer = 0;
    lanPeerCount = 0;
  }
});

window.petAPI.onPeersChanged((data) => {
  if (!lanEnabled || !data) return;
  const event = data.event;
  const info = data.info;
  if (event === 'add' && info && info.name) {
    lanPeerCount = Math.max(0, lanPeerCount + 1);
    setEmotion('happy', `${info.name} 上线`);
    setTimeout(() => setEmotion('relaxed', ''), 2500);
    // 找到 peer，停止显示搜索提示
    lanSearchTimer = 0;
    lanSearchCycleTimer = 0;
  } else if (event === 'remove') {
    const removedCount = Array.isArray(info) ? info.length : 1;
    lanPeerCount = Math.max(0, lanPeerCount - removedCount);
    const names = Array.isArray(info) ? info.map(p => p.name).join(', ') : (info && info.name || '');
    if (names) {
      setEmotion('sad', `${names} 离线`);
      setTimeout(() => setEmotion('relaxed', ''), 2500);
    }
    // peer 全没了，重新开始搜索周期
    if (lanPeerCount === 0) {
      lanSearchTimer = 2.2;
      lanSearchCycleTimer = 8;
    }
  }
});

// 更新联机搜索状态（每帧调用）
function updateLanSearch(dt) {
  if (!lanEnabled || lanPeerCount > 0) {
    return;
  }
  // 显示中：倒计时
  if (lanSearchTimer > 0) {
    lanSearchTimer -= dt;
    if (lanSearchTimer <= 0) {
      lanSearchTimer = 0;
      lanSearchCycleTimer = 8; // 隐藏后等 8 秒再显示
    }
    return;
  }
  // 等待中：周期计时
  if (lanSearchCycleTimer > 0) {
    lanSearchCycleTimer -= dt;
    if (lanSearchCycleTimer <= 0) {
      lanSearchTimer = 2.2; // 显示 2.2 秒
    }
  }
}

// 绘制联机搜索状态（头顶气泡）
function drawLanSearch(ctx) {
  if (!lanEnabled || lanPeerCount > 0) return;
  if (lanSearchTimer <= 0) return;

  // 淡入淡出：前 0.25s 淡入，后 0.4s 淡出
  const total = 2.2;
  const elapsed = total - lanSearchTimer;
  let alpha = 1;
  if (elapsed < 0.25) alpha = elapsed / 0.25;
  else if (lanSearchTimer < 0.4) alpha = lanSearchTimer / 0.4;
  alpha = clamp(alpha, 0, 1);

  const bx = CFG.cx, by = CFG.cy - 76;
  ctx.save();
  ctx.globalAlpha = alpha;

  // 脉冲呼吸效果
  const pulse = 0.95 + Math.sin(performance.now() * 0.006) * 0.05;
  ctx.translate(bx, by);
  ctx.scale(pulse, pulse);
  ctx.translate(-bx, -by);

  // ── 雷达扫描小图标（左侧）──
  const iconX = bx - 36, iconY = by;
  const r = 6;
  // 外圈
  ctx.strokeStyle = 'rgba(0,200,255,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(iconX, iconY, r, 0, TAU);
  ctx.stroke();
  // 扫描扇形
  const sweepAngle = (performance.now() * 0.004) % TAU;
  ctx.fillStyle = 'rgba(0,200,255,0.25)';
  ctx.beginPath();
  ctx.moveTo(iconX, iconY);
  ctx.arc(iconX, iconY, r, sweepAngle - 0.7, sweepAngle);
  ctx.closePath();
  ctx.fill();
  // 中心点
  ctx.fillStyle = 'rgba(0,200,255,0.9)';
  ctx.beginPath();
  ctx.arc(iconX, iconY, 1.4, 0, TAU);
  ctx.fill();

  // ── 文字气泡 ──
  ctx.font = '12px "Microsoft YaHei",sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const text = '搜索同伴中';
  const tw = ctx.measureText(text).width;
  const dotsWidth = 18;       // 三个点 + 间距
  const gapTextDots = 6;      // 文字和点之间间距
  const padX = 10;
  const padY = 12;
  const bw = tw + gapTextDots + dotsWidth + padX * 2;
  const bh = padY * 2;
  const bx2 = bx - 28; // 文字气泡左移，给图标留位置

  ctx.fillStyle = 'rgba(12,12,26,0.92)';
  ctx.strokeStyle = 'rgba(0,200,255,0.45)';
  ctx.lineWidth = 1;
  roundRect(ctx, bx2, by - bh / 2, bw, bh, 10);
  ctx.fill();
  ctx.stroke();

  // 文字
  ctx.fillStyle = 'rgba(175,228,255,0.95)';
  ctx.fillText(text, bx2 + padX, by);

  // 三个跳动的点（在文字右侧，包含在气泡内）
  const dotY = by;
  const dotBaseX = bx2 + padX + tw + gapTextDots + 3;
  for (let i = 0; i < 3; i++) {
    const ph = (performance.now() * 0.005 + i * 0.6) % 1;
    const bounce = Math.sin(ph * Math.PI) * 2;
    ctx.fillStyle = `rgba(0,200,255,${0.6 + Math.sin(ph * Math.PI) * 0.4})`;
    ctx.beginPath();
    ctx.arc(dotBaseX + i * 5, dotY - bounce, 1.5, 0, TAU);
    ctx.fill();
  }

  ctx.restore();
}

window.petAPI.onPetSendStart((info) => {
  if (!pet.flyAway) {
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.6;
    pet.flyAway = { t: 0, dirX: Math.cos(ang), dirY: Math.sin(ang) };
  }
  pet.teleportGlow = 1;
  setEmotion('shocked', `飞向 ${info.peerName}！`);
});

window.petAPI.onPetSendSuccess(() => {
  pet.hidden = true;
  pet.bubbleText = '';
  pet.bubbleTimer = 0;
});

window.petAPI.onPetSendFail((info) => {
  pet.hidden = false;
  pet.flyAway = null;
  // 把技术性错误转成人话，让用户知道为什么失败
  let reason = '发送失败…';
  if (info && info.error) {
    const err = String(info.error).toLowerCase();
    if (err.includes('econnrefused') || err.includes('connect')) reason = '对方没接住…';
    else if (err.includes('timeout')) reason = '连接超时…';
    else if (err.includes('no state')) reason = '状态丢失…';
  }
  setEmotion('sad', reason);
  setTimeout(() => setEmotion('relaxed', ''), 3000);
});

window.petAPI.onPetReceived((state) => {
  pet.hidden = false;
  pet.flyAway = null;

  if (state.emotion && EMOTIONS[state.emotion]) {
    pet.targetEmotion = state.emotion;
  }
  if (state.params) {
    pet.params = {
      eye: state.params.eye || pet.params.eye,
      mouth: state.params.mouth || pet.params.mouth,
      curve: state.params.curve ?? pet.params.curve,
      teeth: state.params.teeth ?? pet.params.teeth,
      tint: state.params.tint ? [...state.params.tint] : pet.params.tint,
      tension: state.params.tension ?? pet.params.tension,
      glow: state.params.glow ?? pet.params.glow,
      rate: state.params.rate ?? pet.params.rate,
      eyeS: state.params.eyeS ?? pet.params.eyeS,
    };
  }
  if (state.squashX) pet.squashX = state.squashX;
  if (state.squashY) pet.squashY = state.squashY;
  if (state.mood != null) pet.mood = state.mood;
  if (state.energy != null) pet.energy = state.energy;
  if (state.totalPets != null) pet.totalPets = state.totalPets;
  if (state.totalDrags != null) pet.totalDrags = state.totalDrags;
  if (state.evolutionLevel != null) pet.evolutionLevel = state.evolutionLevel;
  if (state.zoom != null) pet.zoomTarget = state.zoom;
  if (state.character && CHARACTERS[state.character]) {
    pet.character = state.character;
    pet.skin = getCharacterAppearance(state.character, state.skin || 'default').skinId;
    window.petAPI.characterSync(state.character, pet.skin);
  }

  pet.dropIn = { t: 0 };
  pet.teleportGlow = 1;

  const senderName = state.senderName || '未知';
  setEmotion('shocked', `来自 ${senderName}！`);
  setTimeout(() => {
    if (state.emotion && EMOTIONS[state.emotion]) {
      setEmotion(state.emotion, '');
    } else {
      setEmotion('happy', '~');
    }
  }, 1500);
});

window.petAPI.onEdgeEscape((info) => {
  const peer = info.peer;
  if (!peer) return;
  const len = Math.hypot(info.vx, info.vy) || 1;
  pet.flyAway = { t: 0, dirX: info.vx / len, dirY: info.vy / len };
  pet.teleportGlow = 1;
  setEmotion('shocked', `飞向 ${peer.name}！`);
  window.petAPI.sendPetTo(peer.id);
});

window.petAPI.onEdgeBounceBack(() => {
  pet.falling = false;
  pet.squashVY += -0.2;
  pet.squashVX += 0.15;
  setEmotion('scared', '没人接住！');
  setTimeout(() => setEmotion('relaxed', ''), 2000);
});

window.petAPI.onPetRecall(() => {
  pet.hidden = false;
  pet.flyAway = null;
  pet.dropIn = { t: 0 };
  pet.teleportGlow = 1;
  setEmotion('happy', '回来啦！');
});

// 启动光标轮询（睡眠/隐藏时暂停，降低主进程 IPC 开销）
let cursorPollActive = false;
function syncCursorPoll() {
  // 仅当"可见 + 清醒 + 开启了眼球追踪"时才需要 80ms 轮询光标，
  // 关闭追踪后立即暂停，避免无意义的 IPC 与主进程 getCursorScreenPoint 开销
  const need = !pet.hidden && !pet.sleeping && RUNTIME.eyeTrack;
  if (need && !cursorPollActive) {
    window.petAPI.startCursorPoll();
    cursorPollActive = true;
  } else if (!need && cursorPollActive) {
    window.petAPI.stopCursorPoll();
    cursorPollActive = false;
  }
}
syncCursorPoll();

// ═══════════════════════════════════════════════
// 托盘图标（随主题：甜暖风=圆润粉球，像素风=8-bit 方块）
function genTrayIcon(theme) {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const x = c.getContext('2d');
  const px = (cx, cy, size, color) => { x.fillStyle = color; x.fillRect(cx, cy, size, size); };

  if (theme === 'pixel') {
    // ── 8-bit 像素桌宠：青蓝底 + 深色描边 + 两只方块眼 ──
    x.fillStyle = '#0a0a14';                       // 描边
    x.fillRect(5, 4, 22, 20);
    x.fillRect(3, 10, 4, 8);
    x.fillRect(25, 10, 4, 8);
    x.fillStyle = '#22d3ee';                        // 主色
    x.fillRect(7, 6, 18, 16);
    x.fillStyle = '#7de8ff';                        // 头顶高光
    x.fillRect(7, 6, 18, 3);
    px(11, 11, 4, '#0a0a14');
    px(17, 11, 4, '#0a0a14');
    px(12, 12, 2, '#e6f8ff');
    px(18, 12, 2, '#e6f8ff');
    x.fillStyle = 'rgba(0,0,0,0.25)';               // 底部阴影
    x.fillRect(8, 22, 16, 2);
  } else if (theme === 'aurora') {
    // 极光玻璃：与透明桌宠统一的深靛蓝 + 青绿发光语言。
    const halo = x.createRadialGradient(16, 17, 2, 16, 17, 15);
    halo.addColorStop(0, 'rgba(69, 246, 255, 0.9)');
    halo.addColorStop(0.5, 'rgba(33, 120, 255, 0.42)');
    halo.addColorStop(1, 'rgba(33, 120, 255, 0)');
    x.fillStyle = halo; x.fillRect(0, 0, 32, 32);
    x.fillStyle = '#111a4a';
    x.beginPath(); x.ellipse(16, 18, 10.5, 8.8, 0, 0, TAU); x.fill();
    x.strokeStyle = '#51f4ff'; x.lineWidth = 1.4; x.stroke();
    x.fillStyle = '#b8fbff';
    x.beginPath(); x.ellipse(12, 16, 2.5, 3.1, 0, 0, TAU); x.ellipse(20, 16, 2.5, 3.1, 0, 0, TAU); x.fill();
    x.fillStyle = '#16317c';
    x.beginPath(); x.arc(12.3, 16.3, 1.2, 0, TAU); x.arc(20.3, 16.3, 1.2, 0, TAU); x.fill();
    x.fillStyle = '#6ff8ff';
    x.beginPath(); x.arc(11.8, 15.7, 0.45, 0, TAU); x.arc(19.8, 15.7, 0.45, 0, TAU); x.fill();
  } else {
    // ── 甜暖风：圆润粉色小圆宠 + 粉色光晕 ──
    x.shadowColor = 'rgba(255,122,166,0.9)';
    x.shadowBlur = 6;
    x.fillStyle = '#ff7aa6';                        // 玫瑰粉身体
    x.beginPath(); x.ellipse(16, 18, 10, 9, 0, 0, TAU); x.fill();
    x.shadowBlur = 0;
    x.fillStyle = '#fff0f5';                        // 头顶高光
    x.beginPath(); x.ellipse(13, 14, 4, 3, -0.3, 0, TAU); x.fill();
    x.fillStyle = '#5d3a3a';                        // 眼睛
    x.beginPath(); x.arc(12, 16, 1.9, 0, TAU); x.arc(20, 16, 1.9, 0, TAU); x.fill();
    x.fillStyle = '#ffffff';                        // 眼睛高光
    x.beginPath(); x.arc(12.7, 15.4, 0.7, 0, TAU); x.arc(20.7, 15.4, 0.7, 0, TAU); x.fill();
    x.fillStyle = '#ffb37e';                        // 腮红
    x.beginPath(); x.arc(9, 20, 1.6, 0, TAU); x.arc(23, 20, 1.6, 0, TAU); x.fill();
  }
  window.petAPI.setTrayIcon(c.toDataURL('image/png'));
}

// ═══════════════════════════════════════════════
// 初始化
// ═══════════════════════════════════════════════
(async () => {
  // 启动时拉取已保存设置播种 RUNTIME（修复重启后设置回退默认值的问题）
  try {
    const s = await window.petAPI.getSettings();
    for (const k of Object.keys(RUNTIME)) {
      if (s[k] !== undefined) RUNTIME[k] = s[k];
    }
    if (RUNTIME.soundEnabled !== undefined) {
      window.SoundFX?.setEnabled(RUNTIME.soundEnabled);
    }
    console.log('[SETTINGS] seeded from saved settings');
  } catch (e) {
    console.warn('[SETTINGS] seed failed:', e.message);
  }
  genTrayIcon(RUNTIME.shopTheme);
})();

// 用户首次交互时解锁 AudioContext（标准 Web Audio 规范）
window.addEventListener('mousedown', () => window.SoundFX?.unlock(), { once: true });
window.addEventListener('keydown', () => window.SoundFX?.unlock(), { once: true });

requestAnimationFrame(loop);
