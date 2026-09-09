'use strict';
(() => {
  let state, pending = false, bodyKey = '';
  const $ = id => document.getElementById(id);
  const clean = text => text.replace(/^[^a-zA-Z\u4e00-\u9fff]+/u,'').replace(/[…★]/g,'').trim();
  function el(tag,className,text) { const n=document.createElement(tag); if(className) n.className=className; if(text) n.textContent=text; return n; }
  function root(key) { return state.menus.find(item => item.key===key); }
  function heading(target,title,note) { const row=el('div','tray-section-head'); row.append(el('h2','',title),el('small','',note)); target.append(row); }
  function image(src,name) {
    const node=el('img'); node.alt=name; node.draggable=false;
    if (/^assets\/[\w-]+\.png$/.test(src || '')) node.src=src;
    return node;
  }
  async function act(item) {
    if(pending || !item?.enabled) return;
    pending=true;
    const active=document.activeElement; if(active?.matches('button,input')) active.disabled=true;
    try {
      const result=await window.trayAPI.action(item.id);
      if(!result?.ok) throw new Error('action failed');
      if(result.state) render(result.state);
      if(!['shop','settings','quit','bottom','recall'].includes(item.key)) StudioUI.toast('已应用 · '+clean(item.label));
    } catch { StudioUI.toast('操作暂时没完成，请再试一次。'); }
    finally { pending=false; if(active?.isConnected) active.disabled=false; if(state) render(state); }
  }
  function button(item,className,text) {
    const node=el('button',className,text || clean(item.label)); node.type='button'; node.dataset.action=item.id;
    node.disabled=!item.enabled; node.addEventListener('click',()=>act(item));
    if(item.type==='radio') node.setAttribute('aria-pressed',String(item.checked));
    return node;
  }
  function chips(parent,items) { const wrap=el('div','chips'); for(const item of items || []) wrap.append(button(item,'chip')); parent.append(wrap); }
  function home() {
    const target=$('home'); target.replaceChildren();
    const actions=root('interact')?.children || [];
    const quick=el('div','quick-grid');
    for(const [name,icon] of [['喂食','🍎'],['跳舞','♫'],['睡眠切换','☾']]) {
      const item=actions.find(x=>clean(x.label)===name); if(!item) continue;
      const b=button(item,'quick-action',name==='睡眠切换'?'睡觉 / 唤醒':name); b.prepend(el('span','action-icon',icon)); quick.append(b);
    }
    target.append(quick);
    const launches=el('div','launch-grid');
    for(const [key,name,desc,icon] of [['shop','羁绊商店','小食与魔法','✧'],['settings','偏好设置','它的生活节奏','⚙']]) {
      const item=root(key); if(!item) continue;
      const b=button(item,'launch-card'); b.replaceChildren(el('span','action-icon',icon)); const copy=el('span'); copy.append(el('b','',name),el('small','',desc)); b.append(copy,el('span','arrow','↗')); launches.append(b);
    }
    target.append(launches);
    heading(target,'换个心情','点一下，即刻表达');
    chips(target,actions[0]?.children);
    const details=el('details','fold'); details.append(el('summary','','任务状态与更多'));
    chips(details,actions[1]?.children);
    const reset=actions.find(x=>clean(x.label)==='重置缩放'); if(reset) { const row=el('div','tray-section-head'); row.append(button(reset,'footer-link')); details.append(row); }
    target.append(details);
  }
  function wardrobe() {
    const target=$('wardrobe'); target.replaceChildren();
    heading(target,'陪伴伙伴',Object.keys(state.characters).length+' 位伙伴');
    const grid=el('div','choice-grid'), characters=Object.entries(state.characters);
    for(const [key,char] of characters) {
      const item=root('characters')?.children?.find(x=>clean(x.label)===char.name); if(!item) continue;
      const b=button(item,'choice',char.name); b.prepend(image(char.spriteSrc,char.name)); grid.append(b);
    }
    target.append(grid); heading(target,'它的衣橱','只改变当前宠物外观');
    const char=state.characters[state.currentCharacter]; const skins=el('div','skin-grid');
    for(const [i,item] of (root('skins')?.children || []).entries()) {
      const skin=i===0?char:char.skins?.[i-1]; const b=button(item,'choice',clean(item.label)); b.prepend(image(skin?.spriteSrc,clean(item.label))); skins.append(b);
    }
    target.append(skins,el('p','wardrobe-note',char.skins?.length?'每套皮肤都有自己的颜色与光效，选中即可换装。':'这位伙伴目前拥有默认外观。去看看其他伙伴的衣橱吧。'));
  }
  function controls() {
    const target=$('controls'); target.replaceChildren(); heading(target,'界面氛围','和商店、设置同步');
    const themes=el('div','chips');
    for(const [i,item] of (root('theme')?.children || []).entries()) {
      const b=button(item,'chip theme-chip',['极光夜色','甜暖奶油','像素游乐'][i]); const dot=el('i'); dot.style.setProperty('--swatch',['#b9efcf','#c59b77','#b9a0e8'][i]); b.prepend(dot); themes.append(b);
    }
    target.append(themes); heading(target,'桌面上的相处方式','');
    const toggles=el('div','tray-settings');
    for(const [key,title,desc] of [['walk','自动行走','让它自由探索桌面'],['clickThrough','智能点击穿透','轻松操作宠物身后的窗口'],['foodMode','放置食物','按住 Ctrl + 左键，在桌面放下小食'],['lan','局域网联机','与同一网络中的伙伴见面']]) {
      const item=root(key); if(!item) continue;
      const label=el('label','tray-toggle'); const copy=el('span'); copy.append(el('b','',title),el('small','',desc));
      const input=el('input','switch'); input.type='checkbox'; input.setAttribute('role','switch'); input.setAttribute('aria-label',title); input.checked=!!item.checked; input.dataset.action=item.id;
      input.addEventListener('change',()=>{ input.checked=!!item.checked; act(item); }); label.append(copy,input); toggles.append(label);
    }
    target.append(toggles);
    if(state.lanEnabled) {
      heading(target,'附近的伙伴',state.peerCount+' 位在线');
      const peers=root('peers')?.children || [];
      if(peers.some(x=>x.enabled)) chips(target,peers); else target.append(el('p','peer-note','正在寻找同一局域网内的桌宠…'));
      const recall=root('recall'); if(recall) target.append(button(recall,'footer-link','召回我的桌宠 ↗'));
    }
  }
  function render(next) {
    if(!next) return;
    state=next; StudioUI.theme(state.theme); $('coinCount').textContent=state.coins.toLocaleString();
    $('connection').textContent=state.lanEnabled ? '联机中 · '+state.peerCount+' 位伙伴在线':'本机陪伴';
    const char=state.characters[state.currentCharacter];
    if(char) {
      const skin=char.skins?.find(s=>s.id===state.currentSkin);
      $('petName').textContent=char.name; $('skinName').textContent=(skin?.name || '默认外观')+' · 当前陪伴';
      const src=skin?.spriteSrc || char.spriteSrc;
      if(/^assets\/[\w-]+\.png$/.test(src)) { if($('petPortrait').getAttribute('src')!==src) $('petPortrait').src=src; $('petPortrait').hidden=false; }
    }
    const key=JSON.stringify([state.menus,state.currentCharacter,state.currentSkin]);
    if(key!==bodyKey) {
      bodyKey=key; const focus=document.activeElement?.dataset.action, top=document.querySelector('.tray-scroll').scrollTop;
      const expanded=$('home').querySelector('details')?.open;
      home(); wardrobe(); controls(); if(expanded) $('home').querySelector('details').open=true;
      document.querySelector('.tray-scroll').scrollTop=top;
      if(focus) [...document.querySelectorAll('[data-action]')].find(n=>n.dataset.action===focus)?.focus({preventScroll:true});
    }
  }
  function selectTab(key) {
    for(const tab of document.querySelectorAll('[data-tab]')) { const active=tab.dataset.tab===key; tab.setAttribute('aria-selected',String(active)); tab.tabIndex=active?0:-1; $(tab.dataset.tab).hidden=!active; }
    document.querySelector('.tray-scroll').scrollTop=0;
  }
  for(const tab of document.querySelectorAll('[data-tab]')) {
    tab.addEventListener('click',()=>selectTab(tab.dataset.tab));
    tab.addEventListener('keydown',event=>{
      const tabs=[...document.querySelectorAll('[data-tab]')], i=tabs.indexOf(tab);
      const next=event.key==='ArrowRight'?(i+1)%3:event.key==='ArrowLeft'?(i+2)%3:event.key==='Home'?0:event.key==='End'?2:null;
      if(next!==null) { event.preventDefault(); selectTab(tabs[next].dataset.tab); tabs[next].focus(); }
    });
  }
  StudioUI.closeWithEscape(()=>window.trayAPI.close());
  $('bottomBtn').addEventListener('click',()=>act(root('bottom')));
  $('quitBtn').addEventListener('click',()=>act(root('quit')));
  window.trayAPI.onState(render);
  async function init() { try { const data=await window.trayAPI.getState(); if(!data) throw new Error('unavailable'); render(data); $('loadError').hidden=true; } catch { $('loadError').hidden=false; } }
  $('retryBtn').addEventListener('click',init); init();
})();
