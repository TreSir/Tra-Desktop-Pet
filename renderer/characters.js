'use strict';

// ═══════════════════════════════════════════════
// 多角色系统 — AI生成高质量精灵图 + 动画适配
// ═══════════════════════════════════════════════

// ── 角色定义（从 game_config.json 加载，失败时回退到内置默认）──
const CHARACTERS = (window.GAME_CONFIG && window.GAME_CONFIG.characters) || {
  slime: {
    name: '史莱姆',
    icon: '🟦',
    glowColor: [0, 200, 255],
    particleHue: 178,
    spriteSrc: 'assets/slime.jpg',
  },
  cat: {
    name: '小猫',
    icon: '🐱',
    glowColor: [255, 180, 100],
    particleHue: 35,
    spriteSrc: 'assets/cat.jpg',
  },
  ghost: {
    name: '幽灵',
    icon: '👻',
    glowColor: [180, 220, 255],
    particleHue: 200,
    spriteSrc: 'assets/ghost.jpg',
  },
  flame: {
    name: '火焰',
    icon: '🔥',
    glowColor: [255, 140, 40],
    particleHue: 20,
    spriteSrc: 'assets/flame.jpg',
  },
  robot: {
    name: '机器人',
    icon: '🤖',
    glowColor: [100, 255, 150],
    particleHue: 140,
    spriteSrc: 'assets/robot.jpg',
  },
  kunkun: {
    name: '坤坤',
    icon: '🐔',
    glowColor: [200, 200, 255],
    particleHue: 260,
    spriteSrc: 'assets/kunkun.jpg',
    isHumanoid: true,
  },
  tree: {
    name: '小树',
    icon: '🌳',
    glowColor: [80, 200, 100],
    particleHue: 120,
    spriteSrc: 'assets/tree.jpg',
  },
};

const CHARACTER_LIST = Object.keys(CHARACTERS);

// ═══════════════════════════════════════════════
// 精灵图加载 + 绿幕抠图
// ═══════════════════════════════════════════════
const spriteCache = {};

function chromaKey(sourceImg, cropRatio, charDef) {
  // 裁掉边缘（去除多余绿幕）
  const crop = cropRatio || 0.06;
  const srcW = sourceImg.width * (1 - crop * 2);
  const srcH = sourceImg.height * (1 - crop * 2);
  const srcX = sourceImg.width * crop;
  const srcY = sourceImg.height * crop;

  // 缩放到合理尺寸（最大 500px，节省内存）
  const maxDim = 500;
  const scale = Math.min(1, maxDim / srcW);
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c2d = canvas.getContext('2d');
  c2d.drawImage(sourceImg, srcX, srcY, srcW, srcH, 0, 0, w, h);

  // ── 去除右下角水印：把右下角 15% 区域当作背景色清除 ──
  const wmData = c2d.getImageData(0, 0, w, h);
  const wd = wmData.data;
  const wmW = Math.floor(w * 0.15);
  const wmH = Math.floor(h * 0.08);
  const wmX0 = w - wmW;
  const wmY0 = h - wmH;
  for (let y = wmY0; y < h; y++) {
    for (let x = wmX0; x < w; x++) {
      const idx = (y * w + x) * 4;
      // 水印区域直接清零
      wd[idx + 3] = 0;
    }
  }
  c2d.putImageData(wmData, 0, 0);

  const imgData = c2d.getImageData(0, 0, w, h);
  const d = imgData.data;

  // ── 第1步：采样背景颜色（取四角像素的中值）──
  const corners = [];
  const cornerSize = 5;
  for (const [sx, sy] of [[0,0],[w-cornerSize,0],[0,h-cornerSize],[w-cornerSize,h-cornerSize]]) {
    for (let y = sy; y < sy + cornerSize; y++) {
      for (let x = sx; x < sx + cornerSize; x++) {
        const idx = (y * w + x) * 4;
        corners.push({ r: d[idx], g: d[idx+1], b: d[idx+2] });
      }
    }
  }
  // 取中值作为背景色
  corners.sort((a,b) => a.g - b.g);
  const mid = corners[Math.floor(corners.length / 2)];
  const bgR = mid.r, bgG = mid.g, bgB = mid.b;

  // 检测背景是否是典型纯绿幕（高G、低R、低B）
  // 若是则启用"严格绿幕模式"，避免把树叶绿色误扣
  const isPureGreenScreen =
    bgG > 180 && bgR < 80 && bgB < 80 &&
    (bgG - bgR) > 100 && (bgG - bgB) > 100;

  // 采样中心像素用于调试
  const cIdx = (Math.floor(h/2) * w + Math.floor(w/2)) * 4;
  console.log(`[ChromaKey] bg=(${bgR},${bgG},${bgB}) pureGreen=${isPureGreenScreen} center=(${d[cIdx]},${d[cIdx+1]},${d[cIdx+2]})`);

  // ── 第2步：基于实际背景色抠图（锐利边缘版） ──
  // 严格绿幕模式：用 R/B 是否接近背景来精准区分
  // 实测 tree.jpg：背景 R=43~62，树叶 R=82~149（最小82，差20+）
  // 使用窄过渡区（hardCutoff ~ hardKeep）让边缘锐利不发糊
  // 阈值可从 game_config.json 的 charDef.chromaKey 覆盖，未配置则用默认值
  const ck = (charDef && charDef.chromaKey) || {};
  const hardCutoff = ck.hardCutoff != null ? ck.hardCutoff : (isPureGreenScreen ? 35 : 25);    // 距离 < 此值 → 完全透明
  const hardKeep   = ck.hardKeep   != null ? ck.hardKeep   : (isPureGreenScreen ? 55 : 120);   // 距离 > 此值 → 完全保留
  const rTol = ck.rTol != null ? ck.rTol : (isPureGreenScreen ? 22 : 999); // R 容差（树叶 R 比背景大 20+）
  const bTol = ck.bTol != null ? ck.bTol : (isPureGreenScreen ? 22 : 999); // B 容差

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const dr = r - bgR, dg = g - bgG, db = b - bgB;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);

    // 严格绿幕模式：必须满足"高饱和度纯绿幕特征"才扣
    // 要求 R/B 都接近背景（防止树叶绿被误扣）
    let shouldKey = dist < hardKeep;
    if (shouldKey && isPureGreenScreen) {
      shouldKey = (r - bgR) < rTol && (b - bgB) < bTol && g > 150;
    }

    if (shouldKey) {
      // 窄过渡抗锯齿：< hardCutoff 全透明，> hardKeep 全保留
      let alpha;
      if (dist <= hardCutoff) {
        alpha = 0;
      } else if (dist >= hardKeep) {
        alpha = 1; // 不会到这里，但保留逻辑清晰
      } else {
        alpha = (dist - hardCutoff) / (hardKeep - hardCutoff);
      }
      d[i + 3] = Math.round(d[i + 3] * alpha);

      // 溢色修正：将边缘的绿色通道拉向 R/B 的最大值
      if (alpha > 0 && alpha < 1) {
        const maxRB = Math.max(r, b);
        d[i + 1] = Math.round(maxRB + (g - maxRB) * alpha);
        if (g > maxRB + 15) {
          d[i + 1] = Math.round(maxRB + 10);
        }
      }
    }
  }

  c2d.putImageData(imgData, 0, 0);

  // ── 第3步：彻底清除残留低 alpha 像素 + 边缘收缩 ──
  const edgeData = c2d.getImageData(0, 0, w, h);
  const ed = edgeData.data;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      const alpha = ed[idx + 3];

      // 低于阈值的像素直接清零，防止 shadowBlur 放大成矩形白框
      if (alpha < 12) {
        ed[idx + 3] = 0;
        continue;
      }

      // 半透明边缘像素：检查周围邻居
      if (alpha < 200) {
        let solidNeighbors = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nidx = ((y+dy) * w + (x+dx)) * 4;
            if (ed[nidx + 3] > 100) solidNeighbors++;
          }
        }
        if (solidNeighbors < 2) {
          ed[idx + 3] = 0;
        }
      }
    }
  }
  c2d.putImageData(edgeData, 0, 0);

  return canvas;
}

function loadSprites() {
  for (const [key, def] of Object.entries(CHARACTERS)) {
    const img = new Image();
    img.onload = () => {
      // 坤坤图片有右下角水印，裁掉更多边缘
      const cropRatio = def.cropRatio || 0.08;
      const keyed = chromaKey(img, cropRatio, def);
      spriteCache[key] = keyed;
      console.log(`[Sprite] Loaded: ${key} (${keyed.width}x${keyed.height})`);
      // 调试：保存抠图结果到文件
      try {
        const dataUrl = keyed.toDataURL('image/png');
        window.petAPI.saveSpriteDebug(key, dataUrl);
      } catch(e) { console.warn('[Sprite] Debug save failed:', e); }
    };
    img.onerror = () => {
      console.warn(`[Sprite] Failed to load: ${def.spriteSrc}`);
    };
    img.src = def.spriteSrc;
  }
}

function getSprite(charKey) {
  return spriteCache[charKey] || null;
}

// ═══════════════════════════════════════════════
// 精灵图绘制（带动画适配）
// ═══════════════════════════════════════════════
function drawSpriteBody(ctx, t, params, sprite, charDef) {
  // 呼吸缩放
  const breath = pet.sleeping
    ? 1 + Math.sin(t * 0.5) * 0.015
    : 1 + Math.sin(t * 1.4) * 0.03;

  // 基础尺寸：人形角色和Q版差不多大小，按原图比例
  const isHumanoid = charDef.isHumanoid;
  const spriteAspect = sprite.width / sprite.height;
  let baseW, baseH;
  if (isHumanoid) {
    // 人形角色：高度跟Q版一样，宽度按原图比例（通常更窄）
    baseH = CFG.r * 2.6;
    baseW = baseH * spriteAspect;
  } else {
    baseW = CFG.r * 2.6;
    baseH = CFG.r * 2.6;
  }
  const drawW = baseW * pet.squashX * breath;
  const drawH = baseH * pet.squashY * breath;

  // 眼球追踪：整体微移
  const lookX = pet.sleeping ? 0 : clamp((pet._rawMouseX || 0) * 0.01, -2.5, 2.5);
  const lookY = pet.sleeping ? 0 : clamp((pet._rawMouseY || 0) * 0.01, -2.5, 2.5);

  // 眨眼：垂直压缩
  let blinkScale = 1;
  if (pet.blinkT > 0.15) {
    blinkScale = 1 - pet.blinkT * 0.8;
  }

  const cx = CFG.cx + lookX;
  const cy = CFG.cy + lookY;
  const finalH = drawH * blinkScale;
  const drawX = cx - drawW / 2;
  const drawY = cy - finalH / 2;
  const [gr, gg, gb] = charDef.glowColor;

  // ── 外辉光：径向渐变（不依赖矩形图，避免方框）──
  const glowR = drawW * 0.7;
  const glow = ctx.createRadialGradient(cx, cy, drawW * 0.15, cx, cy, glowR);
  glow.addColorStop(0, `rgba(${gr},${gg},${gb},${0.18 * params.glow})`);
  glow.addColorStop(0.5, `rgba(${gr},${gg},${gb},${0.06 * params.glow})`);
  glow.addColorStop(1, `rgba(${gr},${gg},${gb},0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(cx - glowR, cy - glowR, glowR * 2, glowR * 2);

  // ── 主体精灵图 ──
  ctx.drawImage(sprite, drawX, drawY, drawW, finalH);

  // ── 情感色调叠加（只作用于非透明像素）──
  if (params.tint && (Math.abs(params.tint[0]) > 2 || Math.abs(params.tint[1]) > 2 || Math.abs(params.tint[2]) > 2)) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = 0.22;
    const tr = clamp(128 + params.tint[0], 0, 255) | 0;
    const tg = clamp(128 + params.tint[1], 0, 255) | 0;
    const tb = clamp(128 + params.tint[2], 0, 255) | 0;
    ctx.fillStyle = `rgb(${tr},${tg},${tb})`;
    ctx.fillRect(drawX, drawY, drawW, finalH);
    ctx.restore();
  }

  // ── 脸红叠加 ──
  if (pet.blush > 0.05) {
    ctx.save();
    ctx.globalAlpha = pet.blush * 0.45;
    ctx.fillStyle = 'rgba(255,90,90,0.5)';
    const blushR = drawW * 0.09;
    const blushY = cy + drawH * 0.06;
    ctx.beginPath();
    ctx.ellipse(cx - drawW * 0.16, blushY, blushR, blushR * 0.6, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + drawW * 0.16, blushY, blushR, blushR * 0.6, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════
// 角色切换动画
// ═══════════════════════════════════════════════
const charMorph = {
  active: false,
  phase: 0,      // 0=缩小消失, 1=放大出现
  progress: 0,
  fromChar: 'slime',
  toChar: 'slime',
};

function startCharMorph(newChar) {
  if (newChar === pet.character || charMorph.active) return;
  charMorph.active = true;
  charMorph.phase = 0;
  charMorph.progress = 0;
  charMorph.fromChar = pet.character;
  charMorph.toChar = newChar;
}

function updateCharMorph(dt) {
  if (!charMorph.active) return;
  charMorph.progress += dt * 2.5;

  if (charMorph.phase === 0 && charMorph.progress >= 1) {
    // 切换到新角色
    pet.character = charMorph.toChar;
    charMorph.phase = 1;
    charMorph.progress = 0;
    // 切换时爆出星尘
    for (let i = 0; i < 12; i++) spawnSparkle();
    pet.teleportGlow = 0.8;
    pet.shakeIntensity = 0.2;
  }

  if (charMorph.phase === 1 && charMorph.progress >= 1) {
    charMorph.active = false;
    charMorph.progress = 0;
  }
}

function getMorphScale() {
  if (!charMorph.active) return 1;
  if (charMorph.phase === 0) {
    return 1 - easeInExpo(charMorph.progress);
  } else {
    return easeOutCubic(charMorph.progress);
  }
}

function getMorphAlpha() {
  if (!charMorph.active) return 1;
  if (charMorph.phase === 0) {
    return 1 - charMorph.progress * 0.7;
  } else {
    return 0.3 + charMorph.progress * 0.7;
  }
}

// ── 启动精灵图加载 ──
loadSprites();
