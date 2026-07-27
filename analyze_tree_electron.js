// 用 Electron nativeImage 分析 tree.jpg 各点颜色，不依赖 canvas 模块
const { app, nativeImage } = require('electron');
const path = require('path');

// 避免 TRAE Sandbox 拦截 AppData
app.setPath('userData', path.join(__dirname, '.userdata'));

app.whenReady().then(() => {
  const imgPath = path.join(__dirname, 'renderer', 'assets', 'tree.jpg');
  const img = nativeImage.createFromPath(imgPath);
  const { width: w, height: h } = img.getSize();
  const buf = img.toBitmap(); // BGRA 4字节每像素

  function px(x, y) {
    const i = (y * w + x) * 4;
    return { r: buf[i+2], g: buf[i+1], b: buf[i] };
  }

  console.log(`\n=== tree.jpg ===`);
  console.log(`size: ${w} x ${h}`);

  const samples = [
    [10, 10, '左上角背景'],
    [w-10, 10, '右上角背景'],
    [10, h-10, '左下角背景'],
    [w-10, h-10, '右下角背景'],
    [Math.floor(w/2), 10, '顶部中央'],
    [Math.floor(w/2), Math.floor(h/2), '中心(可能树冠)'],
    [Math.floor(w/2), Math.floor(h*0.7), '中下(可能树干)'],
    [Math.floor(w*0.3), Math.floor(h*0.4), '左上树叶区'],
    [Math.floor(w*0.7), Math.floor(h*0.4), '右上树叶区'],
    [Math.floor(w*0.3), Math.floor(h*0.7), '左侧树干'],
    [Math.floor(w*0.7), Math.floor(h*0.7), '右侧树干'],
    [Math.floor(w/2), Math.floor(h*0.85), '树干底部'],
    [Math.floor(w*0.5), Math.floor(h*0.3), '树冠中心'],
    [Math.floor(w*0.4), Math.floor(h*0.5), '树冠左侧'],
  ];

  // 估算背景色（取四角中值）
  const corners = [];
  for (const [sx, sy] of [[5,5],[w-15,5],[5,h-15],[w-15,h-15]]) {
    for (let y = sy; y < sy+10; y++) {
      for (let x = sx; x < sx+10; x++) {
        corners.push(px(x, y));
      }
    }
  }
  corners.sort((a,b) => a.g - b.g);
  const bg = corners[Math.floor(corners.length/2)];

  console.log(`\n估算背景色: R=${bg.r} G=${bg.g} B=${bg.b}`);
  const isPureGreen = bg.g > 180 && bg.r < 80 && bg.b < 80 && (bg.g-bg.r)>100 && (bg.g-bg.b)>100;
  console.log(`isPureGreenScreen? ${isPureGreen}`);

  console.log(`\n采样点 (x,y,label) -> R,G,B | dist-to-bg | 满足严格绿幕特征?`);
  for (const [x, y, label] of samples) {
    const c = px(x, y);
    const dist = Math.sqrt((c.r-bg.r)**2 + (c.g-bg.g)**2 + (c.b-bg.b)**2);
    const pureLike = c.g > 140 && c.r < 130 && c.b < 130 && (c.g - Math.max(c.r, c.b)) > 30;
    console.log(`  (${x},${y}) ${label}: ${c.r},${c.g},${c.b} | dist=${dist.toFixed(0)} | pureLike=${pureLike}`);
  }

  // 像素分布统计
  const buckets = {
    bgPure: 0,        // 纯绿幕
    bgLikely: 0,      // 接近纯绿幕（满足严格特征）
    leafGreen: 0,     // 树叶绿色（g高但带黄/暗调）
    brown: 0,         // 树干褐色
    other: 0,
  };
  for (let i = 0; i < buf.length; i += 4) {
    const r = buf[i+2], g = buf[i+1], b = buf[i];
    const dist = Math.sqrt((r-bg.r)**2 + (g-bg.g)**2 + (b-bg.b)**2);
    const pureLike = g > 140 && r < 130 && b < 130 && (g - Math.max(r, b)) > 30;
    if (dist < 30) buckets.bgPure++;
    else if (pureLike) buckets.bgLikely++;
    else if (g > r + 20 && g > b + 20 && g > 80) buckets.leafGreen++;
    else if (r > 80 && r < 220 && g > 50 && g < 160 && b < 100 && r > g) buckets.brown++;
    else buckets.other++;
  }
  const total = buf.length / 4;
  console.log(`\n像素分布 (共 ${total} 像素):`);
  for (const [k, v] of Object.entries(buckets)) {
    console.log(`  ${k}: ${v} (${(v/total*100).toFixed(1)}%)`);
  }

  app.quit();
});
