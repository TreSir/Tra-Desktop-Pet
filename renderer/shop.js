'use strict';
let state = null;
let category = 'all';
const pending = new Set();
const labels = { all:'探索全部好物', food:'补给小食', emotion:'让心情有个表情', effect:'一点点桌面魔法', owned:'我的收藏', active:'正在使用的魔法' };
const colors = { food:'#edc89a', emotion:'#dfb1e3', effect:'#a1ded9' };
const grid = document.getElementById('productGrid');
function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function render() {
  if (!state) return;
  const focused = document.activeElement?.dataset.action;
  document.getElementById('balanceText').textContent = state.coins.toLocaleString('zh-CN');
  document.getElementById('collectionCount').textContent = '收藏 ' + state.unlocked.length + ' 件';
  document.getElementById('ownedTotal').textContent = state.unlocked.length + ' 件';
  document.getElementById('activeTotal').textContent = state.effectsOn.length + ' 种';
  document.getElementById('walletTotal').textContent = state.coins.toLocaleString('zh-CN') + ' 币';
  document.getElementById('categoryTitle').textContent = labels[category];
  grid.replaceChildren();
  let count = 0;
  const query = document.getElementById('searchInput').value.trim().toLocaleLowerCase('zh-CN');
  const affordable = document.getElementById('affordableOnly').checked;
  const sort = document.getElementById('sortOrder').value;
  document.getElementById('clearFilters').hidden = !query && !affordable && sort === 'default';
  const products = [];
  for (const [group, items] of Object.entries(state.catalog)) {
    if (!['all','owned','active',group].includes(category)) continue;
    for (const item of items) {
      const owned = state.unlocked.includes(item.id);
      if (category === 'owned' && !owned) continue;
      if (category === 'active' && !state.effectsOn.includes(item.id)) continue;
      if (query && !(item.name + ' ' + item.desc).toLocaleLowerCase('zh-CN').includes(query)) continue;
      if (affordable && !owned && state.coins < item.price) continue;
      products.push({group,item,owned});
    }
  }
  if (sort === 'price') products.sort((a,b) => a.item.price - b.item.price);
  if (sort === 'name') products.sort((a,b) => a.item.name.localeCompare(b.item.name,'zh-CN'));
  for (const {group,item,owned} of products) {
      count++;
      const enabled = state.effectsOn.includes(item.id);
      const card = make('article', 'product' + (owned ? ' owned' : ''));
      card.style.setProperty('--item-color', colors[group]);
      const top = make('div', 'product-top');
      const icon = make('span','product-icon',item.icon);
      icon.setAttribute('aria-hidden','true');
      icon.dataset.category = group;
      top.append(icon, make('span','badge' + (enabled ? ' active' : ''), enabled ? '使用中' : owned ? '已收藏' : group === 'food' ? '即买即投喂' : '永久解锁'));
      const bottom = make('div','product-bottom');
      bottom.append(make('span','price',owned ? '已拥有' : '◈ ' + item.price));
      const button = make('button','button' + (enabled ? ' enabled' : ' primary'));
      button.dataset.action = item.id;
      button.disabled = pending.has(item.id) || (!owned && state.coins < item.price);
      button.textContent = pending.has(item.id) ? '处理中…' : owned ? (group === 'effect' ? (enabled ? '停用' : '启用') : '使用表情') : state.coins < item.price ? '还差 ' + (item.price - state.coins) + ' 币' : group === 'food' ? '投喂 ↗' : '解锁 +';
      button.setAttribute('aria-label',item.name + ' · ' + button.textContent);
      button.addEventListener('click',() => transact(item,group,owned));
      bottom.append(button);
      card.append(top,make('h3','',item.name),make('p','product-description',item.desc),bottom);
      grid.append(card);
  }
  document.getElementById('itemCount').textContent = count + ' 件好物';
  document.getElementById('emptyState').hidden = count > 0;
  document.getElementById('emptyText').textContent = query || affordable
    ? '没有找到匹配的好物，试试其他关键词或清除筛选。'
    : category === 'active' ? '还没有启用特效。去魔法特效中挑一个吧。'
    : '还没有收藏。解锁表情和特效，让它更有个性。';
  if (focused) [...grid.querySelectorAll('button')].find(button => button.dataset.action === focused)?.focus({preventScroll:true});
}
for (const id of ['searchInput','sortOrder','affordableOnly']) {
  document.getElementById(id).addEventListener(id === 'searchInput' ? 'input' : 'change',render);
}
document.getElementById('clearFilters').addEventListener('click',() => {
  document.getElementById('searchInput').value = '';
  document.getElementById('sortOrder').value = 'default';
  document.getElementById('affordableOnly').checked = false;
  render(); document.getElementById('searchInput').focus();
});
document.addEventListener('keydown',event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault(); document.getElementById('searchInput').focus();
  }
});
async function transact(item, group, owned) {
  if (pending.has(item.id)) return;
  pending.add(item.id); render();
  try {
    const result = owned
      ? await (group === 'effect' ? window.shopAPI.toggleEffect(item.id) : window.shopAPI.useEmotion(item.id))
      : await window.shopAPI.buy(item.id);
    if (!result.ok) throw new Error(({insufficient:'羁绊币不足，再陪它玩一会儿吧。',already_owned:'已经收藏了这件好物。',not_unlocked:'请先解锁这件好物。'})[result.reason] || '操作没有完成，请再试一次。');
    state = await window.shopAPI.getState();
    StudioUI.toast(owned ? (group === 'effect' ? '特效设置已更新' : '表情已切换') : group === 'food' ? (result.placed ? item.name + ' 已放到桌面，等它来吃。' : '已购买，但食物未成功放置。') : item.name + ' 已加入收藏');
  } catch (error) { StudioUI.toast(error.message || '暂时无法连接商店'); }
  finally { pending.delete(item.id); render(); }
}
async function init() {
  grid.setAttribute('aria-busy','true');
  document.getElementById('loadError').hidden = true;
  try {
    const [loaded, theme] = await Promise.all([window.shopAPI.getState(),window.shopAPI.getTheme()]);
    state = loaded; StudioUI.theme(theme); render();
  } catch (_) {
    document.getElementById('loadError').hidden = false;
    document.getElementById('itemCount').textContent = '加载失败';
  } finally { grid.setAttribute('aria-busy','false'); }
}
document.querySelectorAll('[data-category]').forEach(button => {
  if (!button.matches('button')) return;
  button.addEventListener('click',() => {
    category = button.dataset.category;
    document.querySelectorAll('button[data-category]').forEach(tab => tab.setAttribute('aria-pressed', String(tab === button)));
    render();
    document.getElementById('shopScroll').scrollTop = 0;
  });
});
StudioUI.closeWithEscape(() => window.shopAPI.close());
document.getElementById('openSettings').addEventListener('click',() => window.shopAPI.openSettings());
document.getElementById('retryBtn').addEventListener('click',init);
window.shopAPI.onThemeChanged(theme => StudioUI.theme(theme));
window.shopAPI.onCoinsUpdate(balance => { if (state) { state.coins = balance; render(); } });
init();
