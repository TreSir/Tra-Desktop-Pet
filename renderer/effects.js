// ═══════════════════════════════════════════════════════════════
// renderer/effects.js — 桌宠效果/粒子子系统
// 负责各类粒子与悬浮效果（粒子、心形、汗滴、Zzz、裂纹、星光、
// 音符、脚印、冲击波、思考气泡）的产生 / 更新 / 绘制。
//
// 依赖 app.js 中的全局常量：pet、CFG、ctx、RUNTIME、TAU。
// 加载顺序必须位于 app.js 之前（index.html 中 effects.js 先加载）。
// 本文件不修改任何逻辑，仅从 app.js 拆出以便维护。
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════
// 通用粒子池（freeIndex 栈优化，避免 O(N) 线性扫描）
// ═══════════════════════════════════════════════
const PARTICLE_POOL_SIZE = 150;
const particlePool = [];
const particleFreeStack = [];  // 空闲槽位索引栈
for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
  particlePool.push({ active: false, x:0, y:0, vx:0, vy:0, size:0, life:0, decay:0, hue:0 });
  particleFreeStack.push(i);  // 初始全部空闲
}

function spawnParticle() {
  if (particleFreeStack.length === 0) return;  // 池满
  const idx = particleFreeStack.pop();
  const p = particlePool[idx];
  const a = Math.random() * TAU;
  const r = CFG.r * (0.5 + Math.random() * 0.55);
  p.active = true;
  p.x = CFG.cx + Math.cos(a) * r;
  p.y = CFG.cy + Math.sin(a) * r * 0.85;
  p.vx = (Math.random() - 0.5) * 0.6;
  p.vy = -0.3 - Math.random() * 0.8;
  p.size = 0.6 + Math.random() * 2.2;
  p.life = 1;
  p.decay = 0.005 + Math.random() * 0.013;
  p.hue = 178 + Math.random() * 34;
  p._idx = idx;  // 记住索引便于回收
}

function updateParticles(dt, rate) {
  if (!RUNTIME.particles) return;
  if (Math.random() < rate * dt * 0.7) spawnParticle();
  for (let i = 0; i < particlePool.length; i++) {
    const p = particlePool[i];
    if (!p.active) continue;
    p.x += p.vx; p.y += p.vy;
    p.vy -= 0.007; p.vx *= 0.99;
    p.life -= p.decay;
    if (p.life <= 0) {
      p.active = false;
      particleFreeStack.push(i);  // 回收到栈
    }
  }
}

function drawParticles(ctx) {
  for (let i = 0; i < particlePool.length; i++) {
    const p = particlePool[i];
    if (!p.active) continue;
    const a = p.life * 0.8;
    const h = p.hue | 0;
    ctx.fillStyle = `hsla(${h},100%,55%,${a * 0.06})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 5, 0, TAU); ctx.fill();
    ctx.fillStyle = `hsla(${h},100%,65%,${a * 0.15})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 2.8, 0, TAU); ctx.fill();
    ctx.fillStyle = `hsla(${h},100%,82%,${a})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
  }
}

// ═══════════════════════════════════════════════
// 心形粒子
// ═══════════════════════════════════════════════
function spawnHeart() {
  pet.hearts.push({
    x: CFG.cx + (Math.random() - 0.5) * 40,
    y: CFG.cy - 20,
    vx: (Math.random() - 0.5) * 1.5,
    vy: -1.5 - Math.random() * 1,
    size: 6 + Math.random() * 5,
    life: 1,
    rot: (Math.random() - 0.5) * 0.5,
  });
}

function updateHearts(dt) {
  for (let i = pet.hearts.length - 1; i >= 0; i--) {
    const h = pet.hearts[i];
    h.x += h.vx; h.y += h.vy;
    h.vy *= 0.97; h.vx *= 0.98;
    h.life -= dt * 0.8;
    h.rot += dt * 2;
    if (h.life <= 0) pet.hearts.splice(i, 1);
  }
}

function drawHeart(ctx, x, y, size, alpha, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(size / 10, size / 10);
  ctx.globalAlpha = alpha;
  // 心形路径
  ctx.beginPath();
  ctx.moveTo(0, 3);
  ctx.bezierCurveTo(-5, -3, -10, 0, 0, 8);
  ctx.bezierCurveTo(10, 0, 5, -3, 0, 3);
  ctx.closePath();
  // 辉光
  ctx.shadowColor = 'rgba(255,100,160,0.8)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = 'rgba(255,80,140,0.9)';
  ctx.fill();
  ctx.restore();
}

function drawHearts(ctx) {
  for (const h of pet.hearts) {
    drawHeart(ctx, h.x, h.y, h.size, h.life * 0.9, h.rot);
  }
}

// ═══════════════════════════════════════════════
// 汗滴
// ═══════════════════════════════════════════════
function spawnSweat() {
  pet.sweatDrops.push({
    x: CFG.cx + 30 + Math.random() * 10,
    y: CFG.cy - 30,
    vy: 0.5,
    size: 3 + Math.random() * 2,
    life: 1,
  });
}

function updateSweat(dt) {
  for (let i = pet.sweatDrops.length - 1; i >= 0; i--) {
    const s = pet.sweatDrops[i];
    s.vy += 0.15;
    s.y += s.vy;
    s.life -= dt * 0.6;
    if (s.life <= 0 || s.y > CFG.cy + 60) pet.sweatDrops.splice(i, 1);
  }
}

function drawSweat(ctx) {
  for (const s of pet.sweatDrops) {
    ctx.fillStyle = `rgba(120,200,255,${s.life * 0.15})`;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.size * 2, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(150,220,255,${s.life * 0.85})`;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, s.size * 0.6, s.size, 0, 0, TAU);
    ctx.fill();
  }
}

// ═══════════════════════════════════════════════
// Zzz 睡眠粒子
// ═══════════════════════════════════════════════
function spawnZzz() {
  pet.zzz.push({
    x: CFG.cx + 25,
    y: CFG.cy - 40,
    vx: 0.3,
    vy: -0.8,
    size: 10 + Math.random() * 6,
    life: 1,
    wobble: 0,
  });
}

function updateZzz(dt) {
  for (let i = pet.zzz.length - 1; i >= 0; i--) {
    const z = pet.zzz[i];
    z.wobble += dt * 3;
    z.x += z.vx + Math.sin(z.wobble) * 0.5;
    z.y += z.vy;
    z.vy *= 0.99;
    z.life -= dt * 0.4;
    if (z.life <= 0) pet.zzz.splice(i, 1);
  }
}

function drawZzz(ctx) {
  for (const z of pet.zzz) {
    ctx.save();
    ctx.globalAlpha = z.life * 0.7;
    ctx.font = `bold ${z.size}px "Microsoft YaHei",sans-serif`;
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,200,255,0.5)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = 'rgba(180,230,255,0.9)';
    ctx.fillText('Z', z.x, z.y);
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════
// 冲击裂缝粒子
// ═══════════════════════════════════════════════
function spawnCracks(x, y, count, intensity) {
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * TAU;
    const speed = 2 + Math.random() * 5 * intensity;
    pet.cracks.push({
      x: x, y: y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed - 1,
      size: 2 + Math.random() * 4,
      life: 1,
      rot: ang,
    });
  }
}

function updateCracks(dt) {
  for (let i = pet.cracks.length - 1; i >= 0; i--) {
    const c = pet.cracks[i];
    c.vy += 0.3;
    c.x += c.vx; c.y += c.vy;
    c.vx *= 0.95;
    c.life -= dt * 1.5;
    if (c.life <= 0) pet.cracks.splice(i, 1);
  }
}

function drawCracks(ctx) {
  for (const c of pet.cracks) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rot);
    ctx.globalAlpha = c.life;
    ctx.fillStyle = `rgba(0,220,255,${c.life * 0.3})`;
    ctx.beginPath();
    ctx.arc(0, 0, c.size * 2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(150,240,255,${c.life})`;
    ctx.fillRect(-c.size * 0.5, -c.size * 0.2, c.size, c.size * 0.4);
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════
// 星尘闪烁（开心/兴奋时）
// ═══════════════════════════════════════════════
function spawnSparkle(x, y) {
  pet.sparkles.push({
    x: x || CFG.cx + (Math.random() - 0.5) * 80,
    y: y || CFG.cy + (Math.random() - 0.5) * 60,
    life: 1,
    size: 3 + Math.random() * 5,
    rot: Math.random() * TAU,
  });
}

function updateSparkles(dt) {
  for (let i = pet.sparkles.length - 1; i >= 0; i--) {
    const s = pet.sparkles[i];
    s.life -= dt * 1.2;
    s.rot += dt * 4;
    if (s.life <= 0) pet.sparkles.splice(i, 1);
  }
}

function drawSparkles(ctx) {
  for (const s of pet.sparkles) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);
    ctx.globalAlpha = s.life;
    const sz = s.size * s.life;
    // 四角星
    ctx.fillStyle = `rgba(255,240,180,${s.life * 0.9})`;
    ctx.shadowColor = 'rgba(255,220,100,0.8)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(0, -sz);
    ctx.lineTo(sz * 0.3, -sz * 0.3);
    ctx.lineTo(sz, 0);
    ctx.lineTo(sz * 0.3, sz * 0.3);
    ctx.lineTo(0, sz);
    ctx.lineTo(-sz * 0.3, sz * 0.3);
    ctx.lineTo(-sz, 0);
    ctx.lineTo(-sz * 0.3, -sz * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════
// 音符粒子（开心时飘出）
// ═══════════════════════════════════════════════
const NOTE_SYMBOLS = ['♪', '♫', '♬', '♩', '♭'];
function spawnNote() {
  pet.notes.push({
    x: CFG.cx + (Math.random() - 0.5) * 30,
    y: CFG.cy - 30,
    vx: (Math.random() - 0.5) * 0.8,
    vy: -1.2 - Math.random() * 0.6,
    size: 12 + Math.random() * 8,
    life: 1,
    rot: (Math.random() - 0.5) * 0.4,
    sym: NOTE_SYMBOLS[(Math.random() * NOTE_SYMBOLS.length) | 0],
    hue: 280 + Math.random() * 80,
  });
}

function updateNotes(dt) {
  for (let i = pet.notes.length - 1; i >= 0; i--) {
    const n = pet.notes[i];
    n.x += n.vx + Math.sin(n.life * 8) * 0.3;
    n.y += n.vy;
    n.vy *= 0.99;
    n.life -= dt * 0.5;
    if (n.life <= 0) pet.notes.splice(i, 1);
  }
}

function drawNotes(ctx) {
  for (const n of pet.notes) {
    ctx.save();
    ctx.globalAlpha = n.life * 0.85;
    ctx.font = `bold ${n.size}px serif`;
    ctx.textAlign = 'center';
    ctx.translate(n.x, n.y);
    ctx.rotate(n.rot);
    ctx.shadowColor = `hsla(${n.hue},80%,60%,0.6)`;
    ctx.shadowBlur = 6;
    ctx.fillStyle = `hsla(${n.hue},80%,70%,${n.life})`;
    ctx.fillText(n.sym, 0, 0);
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════
// 脚印（行走时留下）
// ═══════════════════════════════════════════════
function spawnFootprint() {
  pet.footprints.push({
    x: CFG.cx + (Math.random() - 0.5) * 10,
    y: CFG.cy + 45 + Math.random() * 5,
    life: 1,
    size: 4 + Math.random() * 2,
  });
}

function updateFootprints(dt) {
  for (let i = pet.footprints.length - 1; i >= 0; i--) {
    const f = pet.footprints[i];
    f.life -= dt * 0.6;
    if (f.life <= 0) pet.footprints.splice(i, 1);
  }
}

function drawFootprints(ctx) {
  for (const f of pet.footprints) {
    ctx.fillStyle = `rgba(0,180,255,${f.life * 0.2})`;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.size * (2 - f.life), 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(120,220,255,${f.life * 0.4})`;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.size * 0.6, 0, TAU);
    ctx.fill();
  }
}

// ═══════════════════════════════════════════════
// 冲击波环（着陆/重击时）
// ═══════════════════════════════════════════════
function spawnShockwave(x, y, intensity) {
  pet.shockwaves.push({
    x, y, r: 5, maxR: 40 + intensity * 20, life: 1, intensity,
  });
}

function updateShockwaves(dt) {
  for (let i = pet.shockwaves.length - 1; i >= 0; i--) {
    const s = pet.shockwaves[i];
    s.r += dt * 120;
    s.life -= dt * 2;
    if (s.life <= 0 || s.r > s.maxR) pet.shockwaves.splice(i, 1);
  }
}

function drawShockwaves(ctx) {
  for (const s of pet.shockwaves) {
    ctx.strokeStyle = `rgba(0,220,255,${s.life * 0.5})`;
    ctx.lineWidth = 2 * s.life;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = `rgba(150,240,255,${s.life * 0.3})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r * 0.7, 0, TAU);
    ctx.stroke();
  }
}

// ═══════════════════════════════════════════════
// 思考气泡（待机时随机想法）
// ═══════════════════════════════════════════════
const THOUGHT_ICONS = ['💭', '❓', '❗', '💡', '⭐', '🌟', '💤', '🍖', '🎮', '❤️', '🎵', '🌈'];
const THOUGHT_TEXTS = ['想吃东西…', '好无聊~', '在想什么？', '嘿嘿~', '困了…', '饿了！', '想玩耍！', '你好呀~', '哼哼~', '在发呆…', '想睡觉…', '好开心~', '咦？', '咕咕咕…'];

function spawnThought() {
  const isIcon = Math.random() < 0.4;
  pet.currentThought = {
    type: isIcon ? 'icon' : 'text',
    content: isIcon
      ? THOUGHT_ICONS[(Math.random() * THOUGHT_ICONS.length) | 0]
      : THOUGHT_TEXTS[(Math.random() * THOUGHT_TEXTS.length) | 0],
    life: 1,
    t: 0,
  };
}

function updateThoughts(dt) {
  // 睡觉时显示梦境
  if (pet.sleeping) {
    pet.thinkTimer -= dt;
    if (pet.thinkTimer <= 0) {
      pet.thinkTimer = 5 + Math.random() * 8;
      if (Math.random() < 0.5) {
        const dreams = ['🍖', '🍬', '🎮', '⭐', '🌈', '💝', '🎵', '🍰'];
        pet.currentThought = {
          type: 'icon',
          content: dreams[(Math.random() * dreams.length) | 0],
          life: 0,
          t: 0,
        };
      }
    }
    if (pet.currentThought) {
      pet.currentThought.t += dt;
      if (pet.currentThought.t < 0.5) {
        pet.currentThought.life = pet.currentThought.t / 0.5;
      } else if (pet.currentThought.t > 3) {
        pet.currentThought.life = Math.max(0, 1 - (pet.currentThought.t - 3) / 0.5);
      } else {
        pet.currentThought.life = 1;
      }
      if (pet.currentThought.t > 3.5) pet.currentThought = null;
    }
    return;
  }

  if (pet.dragging || pet.falling || pet.dancing || pet.eating) {
    pet.currentThought = null;
    return;
  }
  pet.thinkTimer -= dt;
  if (pet.thinkTimer <= 0) {
    pet.thinkTimer = 10 + Math.random() * 15;
    if (Math.random() < 0.6) spawnThought();
  }
  if (pet.currentThought) {
    pet.currentThought.t += dt;
    if (pet.currentThought.t < 0.3) {
      pet.currentThought.life = pet.currentThought.t / 0.3;
    } else if (pet.currentThought.t > 2.5) {
      pet.currentThought.life = Math.max(0, 1 - (pet.currentThought.t - 2.5) / 0.5);
    } else {
      pet.currentThought.life = 1;
    }
    if (pet.currentThought.t > 3) pet.currentThought = null;
  }
}

function drawThoughts(ctx) {
  if (!pet.currentThought) return;
  const th = pet.currentThought;
  const a = th.life;
  const bx = CFG.cx + 35, by = CFG.cy - 55;

  ctx.save();

  // 小圆点连接
  ctx.fillStyle = `rgba(12,12,26,${a * 0.8})`;
  ctx.beginPath(); ctx.arc(bx - 18, by + 8, 2.5, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(bx - 12, by + 4, 3.5, 0, TAU); ctx.fill();

  // 气泡
  ctx.fillStyle = `rgba(12,12,26,${a * 0.9})`;
  ctx.strokeStyle = `rgba(0,200,255,${a * 0.5})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(bx, by, 22, 16, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // 内容
  ctx.globalAlpha = a;
  if (th.type === 'icon') {
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(th.content, bx, by);
  } else {
    ctx.font = '9px "Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(175,228,255,1)`;
    ctx.fillText(th.content, bx, by);
  }

  ctx.restore();
}
