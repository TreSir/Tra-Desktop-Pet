const https = require('https');
const fs = require('fs');
const path = require('path');

// NOTE: 原始 URL 包含火山引擎临时签名凭证（含 Access Key ID），已出于安全考虑移除。
// 该脚本用于一次性下载 AI 生成的「小树」角色精灵图，图片已保存至 renderer/assets/tree.jpg。
// 如需重新生成图片，请通过 VolcEngine 视觉生成 API 获取新的签名 URL 后填入下方。
const url = '';

const outPath = path.join(__dirname, 'renderer', 'assets', 'tree_anime.jpg');
const req = https.get(url, (res) => {
  console.log('Status:', res.statusCode);
  if (res.statusCode !== 200) { console.error('Failed'); process.exit(1); }
  const out = fs.createWriteStream(outPath);
  res.pipe(out);
  out.on('finish', () => {
    console.log(`Saved: ${outPath} (${fs.statSync(outPath).size} bytes)`);
  });
});
req.on('error', e => { console.error(e.message); process.exit(1); });
req.setTimeout(60000, () => { req.destroy(); process.exit(1); });
