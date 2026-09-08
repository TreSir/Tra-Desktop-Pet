'use strict';
const canvas = document.getElementById('foodCanvas');
const ctx = canvas.getContext('2d');
let foods = [], rafId = 0, theme = 'aurora';
const TAU = Math.PI * 2;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1,2);
  canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
  canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  schedule();
}
function schedule() { if (!rafId) rafId = requestAnimationFrame(draw); }
function draw(now) {
  rafId = 0;
  ctx.clearRect(0,0,innerWidth,innerHeight);
  const ui = CompanionVisual.palette(theme);
  foods.forEach((food,index) => {
    const bob = reducedMotion ? 0 : Math.sin(now*.0025+index)*2;
    const x = food.screenX, y = food.screenY+bob;
    ctx.save();
    ctx.fillStyle = '#0002'; ctx.beginPath(); ctx.ellipse(x,food.screenY+24,20,4,0,0,TAU); ctx.fill();
    ctx.fillStyle = ui.surface; ctx.strokeStyle = ui.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x,y,23,0,TAU); ctx.fill(); ctx.stroke();
    ctx.font = '27px "Segoe UI Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(food.type || '🍎',x,y+1);
    if (index === 0) {
      const angle = reducedMotion ? -.6 : now*.00065;
      ctx.strokeStyle = ui.accent; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      for (let segment=0;segment<3;segment++) {
        const start = angle+segment*TAU/3;
        ctx.beginPath(); ctx.arc(x,y,28,start,start+1.15); ctx.stroke();
      }
      CompanionVisual.panel(ctx,x-26,y-49,52,17,theme);
      ctx.fillStyle = ui.text; ctx.font = '9px "Microsoft YaHei",sans-serif';
      ctx.fillText('开饭啦',x,y-40);
    } else {
      ctx.fillStyle = ui.muted; ctx.font = '8px "Segoe UI",sans-serif';
      ctx.fillText(String(index+1),x+25,y-20);
    }
    ctx.restore();
  });
  if (foods.length && !reducedMotion) schedule();
}
window.foodAPI.onFoodsUpdate(list => { foods = Array.isArray(list) ? list : []; schedule(); });
window.foodAPI.onThemeChanged(value => { theme=value; schedule(); });
window.foodAPI.getTheme().then(value => { theme=value; schedule(); }).catch(() => {});
window.addEventListener('resize',resize);
resize();
