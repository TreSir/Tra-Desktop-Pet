// 验证 tree_keyed.png 抠图效果：分析非透明像素分布
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

  console.log(`\n=== tree_keyed.png ===`);
  console.log(`size: ${w} x ${h}`);

  // 总像素数与非透明像素数
  let totalPx = buf.length / 4;
  let opaquePx = 0;
  let semiPx = 0;
  let transparentPx = 0;
  for (let i = 3; i < buf.length; i += 4) {
    const a = buf[i];
    if (a === 0) transparentPx++;
    else if (a >= 250) opaquePx++;
    else semiPx++;
  }
  console.log(`\n透明度分布:`);
  console.log(`  完全透明 (alpha=0): ${transparentPx} (${(transparentPx/totalPx*100).toFixed(1)}%)`);
  console.log(`  半透明 (0<alpha<250): ${semiPx} (${(semiPx/totalPx*100).toFixed(1)}%)`);
  console.log(`  不透明 (alpha>=250): ${opaquePx} (${(opaquePx/totalPx*100).toFixed(1)}%)`);

  // 检查关键采样点是否保留（应该是树叶/树干）
  const samples = [
    [Math.floor(w*0.5), Math.floor(h*0.5), '图像中心'],
    [Math.floor(w*0.3), Math.floor(h*0.4), '左上树叶区'],
    [Math.floor(w*0.7), Math.floor(h*0.4), '右上树叶区'],
    [Math.floor(w*0.5), Math.floor(h*0.3), '树冠中心'],
    [Math.floor(w*0.4), Math.floor(h*0.5), '树冠左侧'],
    [Math.floor(w*0.5), Math.floor(h*0.7), '中下(可能树干)'],
    [Math.floor(w*0.3), Math.floor(h*0.7), '左侧树干'],
    [Math.floor(w*0.7), Math.floor(h*0.7), '右侧树干'],
    [Math.floor(w*0.5), Math.floor(h*0.85), '树干底部'],
    [Math.floor(w*0.5), Math.floor(h*0.1), '顶部背景'],
    [Math.floor(w*0.1), Math.floor(h*0.1), '左上背景'],
    [Math.floor(w*0.9), Math.floor(h*0.9), '右下背景'],
  ];

  console.log(`\n关键采样点 alpha & RGB:`);
  console.log(`  位置(label) -> R,G,B,A | 状态`);
  for (const [x, y, label] of samples) {
    const c = px(x, y);
    let status = '';
    if (c.a === 0) status = '已扣除';
    else if (c.a >= 250) status = '完整保留';
    else status = `半透明(${c.a})`;
    console.log(`  (${x},${y}) ${label}: ${c.r},${c.g},${c.b},A=${c.a} | ${status}`);
  }

  app.quit();
});
