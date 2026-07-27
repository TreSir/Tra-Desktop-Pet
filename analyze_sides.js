// 分析 tree_keyed.png 侧面区域的抠图问题
const { app, nativeImage } = require('electron');
const path = require('path');

app.setPath('userData', path.join(__dirname, '.userdata'));

app.whenReady().then(() => {
  const img = nativeImage.createFromPath(path.join(__dirname, 'renderer', 'assets', 'tree_keyed.png'));
  const { width: w, height: h } = img.getSize();
  const buf = img.toBitmap(); // BGRA

  function px(x, y) {
    const i = (y * w + x) * 4;
    return { r: buf[i+2], g: buf[i+1], b: buf[i], a: buf[i+3] };
  }

  console.log(`\n=== tree_keyed.png 侧面分析 ===`);
  console.log(`size: ${w} x ${h}`);

  // 扫描侧面边缘：左边缘 x=0~30, 右边缘 x=w-30~w
  console.log(`\n--- 左边缘扫描 (x=0~40, 各y) ---`);
  console.log(`y, x, R, G, B, A`);
  for (let y = 0; y < h; y += 25) {
    for (let x = 0; x < 40; x += 5) {
      const c = px(x, y);
      if (c.a > 0) {
        console.log(`${y}, ${x}, ${c.r}, ${c.g}, ${c.b}, ${c.a}`);
      }
    }
  }

  console.log(`\n--- 右边缘扫描 (x=w-40~w, 各y) ---`);
  for (let y = 0; y < h; y += 25) {
    for (let x = w - 40; x < w; x += 5) {
      const c = px(x, y);
      if (c.a > 0) {
        console.log(`${y}, ${x}, ${c.r}, ${c.g}, ${c.b}, ${c.a}`);
      }
    }
  }

  // 找出侧面"应该是树叶但被扣除"的像素：在 x=30~80 范围内，A=0 但 G>R+30
  console.log(`\n--- 侧面被误扣的像素统计 (x=20~80, A=0 但颜色偏绿) ---`);
  let wrongCut = 0;
  let totalSide = 0;
  for (let y = h*0.2; y < h*0.8; y++) {
    for (let x = 20; x < 80; x++) {
      const c = px(x, y);
      if (c.a === 0 && c.g > c.r + 20 && c.g > c.b + 20) {
        wrongCut++;
      }
      totalSide++;
    }
  }
  console.log(`左侧误扣像素: ${wrongCut} / ${totalSide} (${(wrongCut/totalSide*100).toFixed(1)}%)`);

  // 检查原图tree.jpg对应位置的颜色，看是树叶还是边缘半透明
  console.log(`\n--- 原图 tree.jpg 左侧边缘颜色 ---`);
  const origImg = nativeImage.createFromPath(path.join(__dirname, 'renderer', 'assets', 'tree.jpg'));
  const { width: ow, height: oh } = origImg.getSize();
  const obuf = origImg.toBitmap();
  function opx(x, y) {
    const i = (y * ow + x) * 4;
    return { r: obuf[i+2], g: obuf[i+1], b: obuf[i] };
  }
  // 转换到原图坐标（keyed 是 500x500，原图是 4096x4096，且裁剪了 6% 边缘）
  const cropRatio = 0.08;
  const srcW = ow * (1 - cropRatio * 2);
  const srcH = oh * (1 - cropRatio * 2);
  const srcX = ow * cropRatio;
  const srcY = oh * cropRatio;
  console.log(`原图: ${ow}x${oh}, cropRatio=${cropRatio}`);
  console.log(`srcX=${srcX}, srcY=${srcY}, srcW=${srcW}, srcH=${srcH}`);

  // 检查 keyed.png 左边缘 x=20~40 在原图中的对应位置
  console.log(`\ny, keyed_x, R,G,B,A | orig_x, orig_R,orig_G,orig_B`);
  for (let y = 100; y < 400; y += 30) {
    for (let x = 20; x < 50; x += 10) {
      const c = px(x, y);
      // 反推到原图坐标
      const ox = Math.floor(srcX + (x / w) * srcW);
      const oy = Math.floor(srcY + (y / h) * srcH);
      const oc = opx(ox, oy);
      console.log(`${y}, ${x}, ${c.r},${c.g},${c.b},A=${c.a} | ${ox}, ${oc.r},${oc.g},${oc.b}`);
    }
  }

  app.quit();
});
