'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('trayAPI', {
  getState:() => ipcRenderer.invoke('tray-get-state'),
  action:id => ipcRenderer.invoke('tray-action',id),
  close:() => ipcRenderer.send('tray-close'),
  onState:callback => ipcRenderer.on('tray-state',(_event,state) => callback(state)),
});
