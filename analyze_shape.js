// 分析 tree_keyed.png 的实际边界形状，找出侧面问题
const { app, nativeImage } = require('electron');
const path = require('path');

app.setPath('userData', path.join(__dirname, '.userdata'));

app.whenReady().then(() => {
  const img = nativeImage.createFromPath(path.join(__dirname, 'renderer', 'assets', 'tree_keyed.png'));
  const { width: w, height: h } = img.getSize();
  const buf = img.toBitmap();

  function a(x, y) {
    return buf[(y * w + x) * 4 + 3];
  }

  console.log(`\n=== tree_keyed.png 边界形状 ===`);
  console.log(`size: ${w} x ${h}`);

  // 每行最左/最右非透明像素
  console.log(`\ny, leftmost_x, rightmost_x, width_px`);
  for (let y = 0; y < h; y += 10) {
    let leftX = -1, rightX = -1;
    for (let x = 0; x < w; x++) {
      if (a(x, y) > 30) {
        if (leftX === -1) leftX = x;
        rightX = x;
      }
    }
    if (leftX >= 0) {
      console.log(`${y}, ${leftX}, ${rightX}, ${rightX - leftX}`);
    } else {
      console.log(`${y}, -, -, 0`);
    }
  }

  // 检查 alpha 在边缘的过渡（找几个有代表性的行）
  console.log(`\n--- 行 y=200 (树冠中部) 的 alpha 过渡 ---`);
  console.log(`x, A`);
  for (let x = 0; x < w; x++) {
    const av = a(x, 200);
    if (av > 0 && av < 255) {
      console.log(`${x}, ${av}`);
    }
  }

  app.quit();
});
