// 分析 tree.jpg 各点颜色，了解背景与树叶的颜色差异
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

(async () => {
  // 检查 canvas 是否可用
  let canvas;
  try {
    canvas = require('canvas');
  } catch (e) {
    console.log('canvas module not available, trying alternative...');
    process.exit(2);
  }

  const img = await canvas.loadImage(path.join(__dirname, 'renderer', 'assets', 'tree.jpg'));
  const c = canvas.createCanvas(img.width, img.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const w = img.width, h = img.height;
  const data = ctx.getImageData(0, 0, w, h).data;

  // 采样点：(x, y, label)
  const samples = [
    [10, 10, '左上角背景'],
    [w-10, 10, '右上角背景'],
    [10, h-10, '左下角背景'],
    [w-10, h-10, '右下角背景'],
    [w/2, 10, '顶部中央'],
    [w/2, h/2, '中心（可能树冠）'],
    [w/2, h*0.7, '中下（可能树干）'],
    [w*0.3, h*0.4, '左上树叶区'],
    [w*0.7, h*0.4, '右上树叶区'],
    [w*0.3, h*0.7, '左侧树干'],
    [w*0.7, h*0.7, '右侧树干'],
    [w/2, h*0.85, '树干底部'],
  ];

  console.log('Image size:', w, 'x', h);
  console.log('\nSampled colors:');
  console.log('x, y, label, R, G, B, dist-to-pure-green, isPureGreen?');
  for (const [x, y, label] of samples) {
    const idx = (y * w + x) * 4;
    const r = data[idx], g = data[idx+1], b = data[idx+2];
    const distToPureGreen = Math.sqrt(r*r + (g-255)*(g-255) + b*b);
    const isClose = distToPureGreen < 120 ? 'YES-BG' : 'NO';
    console.log(`${x},${y},${label},${r},${g},${b},${distToPureGreen.toFixed(0)},${isClose}`);
  }

  // 统计：哪些范围的绿色像素最多
  const buckets = { bg: 0, darkGreen: 0, midGreen: 0, brown: 0, other: 0 };
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i+1], b = data[i+2];
    const distToPureGreen = Math.sqrt(r*r + (g-255)*(g-255) + b*b);
    if (distToPureGreen < 80) buckets.bg++;
    else if (g > r + 30 && g > b + 30 && g < 200) buckets.darkGreen++;
    else if (g > r + 30 && g > b + 30 && g >= 200) buckets.midGreen++;
    else if (r > 100 && r < 200 && g > 60 && g < 150 && b < 100) buckets.brown++;
    else buckets.other++;
  }
  const total = data.length / 4;
  console.log('\nPixel distribution:');
  for (const [k, v] of Object.entries(buckets)) {
    console.log(`  ${k}: ${v} (${(v/total*100).toFixed(1)}%)`);
  }
})();
