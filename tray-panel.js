'use strict';
const { BrowserWindow, ipcMain, screen, app } = require('electron');
const path = require('path');

// Use the same actions as the native menu so both entry points stay in sync.
module.exports = function createTrayPanel({ buildMenu, getState, fallback }) {
  let win = null, timer = null, lastState = '', opening = false, lastBlur = 0;
  function menuSnapshot() {
    const actions = new Map();
    function walk(menu, prefix = '') {
      return menu.items.filter(item => item.visible && item.type !== 'separator' && (prefix || item.id)).map(item => {
        const id = prefix + '/' + (item.id || item.label);
        actions.set(id, item);
        return { id, key:item.id, label:item.label, type:item.type, checked:item.checked,
          enabled:item.enabled, children:item.submenu ? walk(item.submenu,id) : null };
      });
    }
    return { menus:walk(buildMenu()), actions };
  }
  function snapshot() { return { ...getState(), menus:menuSnapshot().menus }; }
  function publish() {
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    const state = snapshot(), encoded = JSON.stringify(state);
    if (encoded !== lastState) { lastState = encoded; win.webContents.send('tray-state',state); }
  }
  function hide() {
    clearInterval(timer); timer = null;
    if (win && !win.isDestroyed()) win.hide();
  }
  function allowed(event) { return win && !win.isDestroyed() && event.sender === win.webContents; }
  ipcMain.handle('tray-get-state', event => allowed(event) ? snapshot() : null);
  ipcMain.on('tray-close', event => { if (allowed(event)) hide(); });
  ipcMain.handle('tray-action', async (event,id) => {
    if (!allowed(event) || typeof id !== 'string') return { ok:false };
    const item = menuSnapshot().actions.get(id);
    if (!item || !item.enabled || item.submenu || typeof item.click !== 'function') return { ok:false };
    if (['shop','settings','quit','bottom','recall'].includes(item.id) || id.startsWith('/peers/')) hide();
    try {
      // Electron's MenuItem.click wrapper performs checkbox/radio toggling.
      await item.click(undefined,win);
      publish();
      return { ok:true, state:snapshot() };
    } catch (error) { console.warn('[TRAY] Action failed:',error.message); return { ok:false }; }
  });
  async function toggle(anchor) {
    if (opening) return;
    if (win && !win.isDestroyed() && win.isVisible()) { hide(); return; }
    // A taskbar click blurs the popup before the Tray click event arrives.
    if (Date.now()-lastBlur < 180) return;
    opening = true;
    try {
      const point = anchor && Number.isFinite(anchor.x) ? anchor : screen.getCursorScreenPoint();
      const area = screen.getDisplayNearestPoint({x:Math.round(point.x),y:Math.round(point.y)}).workArea;
      const width = Math.min(420,area.width), height = Math.min(704,area.height);
      if (!win || win.isDestroyed()) {
        win = new BrowserWindow({ width,height,frame:false,transparent:true,show:false,
          resizable:false,minimizable:false,maximizable:false,skipTaskbar:true,alwaysOnTop:true,
          hasShadow:false,backgroundColor:'#00000000',
          webPreferences:{preload:path.join(__dirname,'tray_preload.js'),contextIsolation:true,nodeIntegration:false} });
        win.setAlwaysOnTop(true,'screen-saver');
        win.on('blur',() => { lastBlur = Date.now(); hide(); });
        win.on('closed',() => { clearInterval(timer); timer = null; win = null; });
        win.webContents.on('render-process-gone',() => { if(win) win.destroy(); fallback(); });
        win.webContents.setWindowOpenHandler(() => ({action:'deny'}));
        win.webContents.on('will-navigate',event => event.preventDefault());
        await win.loadFile(path.join(__dirname,'renderer','tray.html'));
      }
      win.setSize(width,height);
      const x = Math.round(Math.max(area.x,Math.min(point.x + (point.width || 0) - width + 8,area.x+area.width-width)));
      const desiredY = point.y - height >= area.y ? point.y-height+8 : point.y+(point.height || 0)-8;
      const y = Math.round(Math.max(area.y,Math.min(desiredY,area.y+area.height-height)));
      win.setPosition(x,y);
      win.show(); win.focus(); lastState = ''; publish();
      timer = setInterval(publish,800);
    } catch (error) {
      console.warn('[TRAY] Panel unavailable:',error.message);
      if (win && !win.isDestroyed()) win.destroy();
      fallback();
    } finally { opening = false; }
  }
  app.on('before-quit',hide);
  return { toggle, hide };
};
