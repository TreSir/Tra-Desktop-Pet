'use strict';

// ═══════════════════════════════════════════════
// 多角色系统 — 透明 PNG 精灵图 + 旧版绿幕资源兼容
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

// 皮肤是角色的外观变体，不进入角色列表。默认皮肤沿用角色本身的资源定义。
function getCharacterAppearance(charKey, skinKey = 'default') {
  const character = CHARACTERS[charKey] || CHARACTERS.slime;
  if (skinKey === 'default') return { ...character, skinId: 'default', skinName: '默认' };
  const skin = (character.skins || []).find(item => item.id === skinKey);
  return skin
    ? { ...character, ...skin, skinId: skin.id, skinName: skin.name || skin.id }
    : { ...character, skinId: 'default', skinName: '默认' };
}

function getCharacterSkins(charKey) {
  const character = CHARACTERS[charKey] || CHARACTERS.slime;
  return [
    { id: 'default', name: '默认', icon: character.icon },
    ...(character.skins || []).map(({ id, name, icon }) => ({ id, name, icon: icon || character.icon })),
  ];
}

function spriteCacheKey(charKey, skinKey = 'default') {
  return `${charKey}::${skinKey}`;
}

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
  const c2d = canvas.getContext('2d', { willReadFrequently: true });
  c2d.drawImage(sourceImg, srcX, srcY, srcW, srcH, 0, 0, w, h);

  // 单次读写像素缓冲（原先 3×getImageData + 3×putImageData）
  const imgData = c2d.getImageData(0, 0, w, h);
  const d = imgData.data;

  // ── 去除右下角水印：把右下角区域 alpha 清零 ──
  const wmW = Math.floor(w * 0.15);
  const wmH = Math.floor(h * 0.08);
  const wmX0 = w - wmW;
  const wmY0 = h - wmH;
  for (let y = wmY0; y < h; y++) {
    for (let x = wmX0; x < w; x++) {
      d[(y * w + x) * 4 + 3] = 0;
    }
  }

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

  // ── 第3步：清除残留低 alpha + 边缘孤立像素（读快照、写原缓冲）──
  const alphaSnap = new Uint8Array(w * h);
  for (let i = 0, p = 3; i < alphaSnap.length; i++, p += 4) {
    alphaSnap[i] = d[p];
  }
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const pi = y * w + x;
      const alpha = alphaSnap[pi];

      // 低于阈值的像素直接清零，防止 shadowBlur 放大成矩形白框
      if (alpha < 12) {
        d[pi * 4 + 3] = 0;
        continue;
      }

      // 半透明边缘像素：检查周围邻居（基于抠图后快照，避免读写冲突）
      if (alpha < 200) {
        let solidNeighbors = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (alphaSnap[(y + dy) * w + (x + dx)] > 100) solidNeighbors++;
          }
        }
        if (solidNeighbors < 2) {
          d[pi * 4 + 3] = 0;
        }
      }
    }
  }

  c2d.putImageData(imgData, 0, 0);
  return canvas;
}

function loadSprites() {
  for (const [charKey, character] of Object.entries(CHARACTERS)) {
    for (const skin of getCharacterSkins(charKey)) {
      const appearance = getCharacterAppearance(charKey, skin.id);
      const img = new Image();
      img.onload = () => {
        // 新资源为原生透明 PNG，直接绘制可保留柔和边缘；旧 JPG 走绿幕兼容流程。
        const sprite = appearance.transparent
          ? img
          : chromaKey(img, appearance.cropRatio || 0.08, appearance);
        spriteCache[spriteCacheKey(charKey, skin.id)] = sprite;
        console.log(`[Sprite] Loaded: ${charKey}/${skin.id} (${sprite.width}x${sprite.height}, ${appearance.transparent ? 'alpha' : 'keyed'})`);
        if (!appearance.transparent && localStorage.getItem('debugSprites') === '1' && window.petAPI?.saveSpriteDebug) {
          try {
            window.petAPI.saveSpriteDebug(`${charKey}-${skin.id}`, sprite.toDataURL('image/png'));
          } catch (e) { console.warn('[Sprite] Debug save failed:', e); }
        }
      };
      img.onerror = () => console.warn(`[Sprite] Failed to load: ${appearance.spriteSrc}`);
      img.src = appearance.spriteSrc;
    }
  }
}

function getSprite(charKey, skinKey = 'default') {
  return spriteCache[spriteCacheKey(charKey, skinKey)] || null;
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
  const artScale = charDef.spriteScale || 1;
  const drawW = baseW * artScale * pet.squashX * breath;
  const drawH = baseH * artScale * pet.squashY * breath;

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
  // glow 接近 0（如睡眠/低能量时）直接跳过，省去每帧 createRadialGradient 分配
  if (params.glow > 0.01) {
    const glowR = drawW * 0.7;
    const glow = ctx.createRadialGradient(cx, cy, drawW * 0.15, cx, cy, glowR);
    glow.addColorStop(0, `rgba(${gr},${gg},${gb},${0.18 * params.glow})`);
    glow.addColorStop(0.5, `rgba(${gr},${gg},${gb},${0.06 * params.glow})`);
    glow.addColorStop(1, `rgba(${gr},${gg},${gb},0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(cx - glowR, cy - glowR, glowR * 2, glowR * 2);
  }

  // 透明资源没有矩形底色，用一枚随呼吸起伏的柔和落地光把角色自然地“放”在桌面上。
  const padY = cy + drawH * 0.36;
  const padW = drawW * 0.34;
  const pad = ctx.createRadialGradient(cx, padY, 1, cx, padY, padW);
  pad.addColorStop(0, `rgba(${gr},${gg},${gb},${0.16 * params.glow})`);
  pad.addColorStop(0.55, `rgba(${gr},${gg},${gb},${0.055 * params.glow})`);
  pad.addColorStop(1, `rgba(${gr},${gg},${gb},0)`);
  ctx.fillStyle = pad;
  ctx.beginPath();
  ctx.ellipse(cx, padY, padW, Math.max(5, drawH * 0.055), 0, 0, TAU);
  ctx.fill();

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
  fromSkin: 'default',
  toSkin: 'default',
};

function startCharMorph(newChar, newSkin = 'default') {
  if ((newChar === pet.character && newSkin === pet.skin) || charMorph.active) return;
  charMorph.active = true;
  charMorph.phase = 0;
  charMorph.progress = 0;
  charMorph.fromChar = pet.character;
  charMorph.toChar = newChar;
  charMorph.fromSkin = pet.skin;
  charMorph.toSkin = newSkin;
}

function updateCharMorph(dt) {
  if (!charMorph.active) return;
  charMorph.progress += dt * 2.5;

  if (charMorph.phase === 0 && charMorph.progress >= 1) {
    // 切换到新角色
    pet.character = charMorph.toChar;
    pet.skin = charMorph.toSkin;
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
