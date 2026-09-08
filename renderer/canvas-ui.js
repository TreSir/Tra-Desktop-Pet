'use strict';
window.CompanionVisual = {
  palette(theme) {
    if (theme === 'sweet') return { surface:'rgba(255,250,243,.97)', border:'#d8c3ab', text:'#493c31', muted:'#8b7663', accent:'#936044', energy:'#568a66' };
    if (theme === 'pixel') return { surface:'rgba(30,26,47,.97)', border:'#625378', text:'#f5eedc', muted:'#b9aace', accent:'#d3ef8c', energy:'#a7c8ff' };
    return { surface:'rgba(20,29,34,.97)', border:'#40544e', text:'#f0f5ee', muted:'#a1b6b0', accent:'#b9efcf', energy:'#edc89a' };
  },
  panel(ctx,x,y,w,h,theme) {
    const palette = this.palette(theme);
    ctx.fillStyle = palette.surface;
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x,y,w,h,theme === 'pixel' ? 3 : 12);
    ctx.fill(); ctx.stroke();
    return palette;
  },
};
