'use strict';
const ranges = [
  {id:'walkSpeed', label:'散步速度', hint:'慢慢晃悠，或是活泼地探索', min:10,max:80,step:2,value:28,unit:'px/s',group:'movementControls',ends:['悠闲','活泼']},
  {id:'foodSeekSpeed',label:'寻食速度',hint:'发现好吃的，多久能跑过去',min:80,max:800,step:20,value:320,unit:'px/s',group:'movementControls',ends:['慢慢来','迫不及待']},
  {id:'foodEatDist',label:'进食距离',hint:'靠近食物到这个距离就开吃',min:20,max:100,step:5,value:45,unit:'px',group:'movementControls',ends:['更近','更远']},
  {id:'energyDecay',label:'活力消耗',hint:'数值越小，清醒陪伴的时间越长',min:.1,max:2,step:.1,value:.3,unit:'/s',group:'energyControls',ends:['耐力十足','容易犯困']},
  {id:'energyRecover',label:'睡眠恢复',hint:'好好睡一觉，重新变得精神',min:.5,max:10,step:.5,value:2,unit:'/s',group:'energyControls',ends:['慢慢充电','快速恢复']},
];
const toggles = [
  {id:'eyeTrack',label:'跟随你的目光',hint:'宠物会留意鼠标的位置'},
  {id:'blink',label:'自然眨眼',hint:'给陪伴增加一点生动感'},
  {id:'particles',label:'粒子装饰',hint:'控制桌宠的环境微粒'},
  {id:'soundEnabled',label:'互动萌系音效',hint:'抚摸、投喂与空中接住时的清脆声音'},
  {id:'autoStart',label:'开机自动启动',hint:'让它在开机时就静静陪在你身边'},
];
let saveQueue = Promise.resolve();
let saveVersion = 0;
function save(key,value) {
  const version = ++saveVersion;
  document.getElementById('saveStatus').textContent = '正在保存…';
  saveQueue = saveQueue.then(async () => {
    try {
      const result = await window.settingsAPI.set(key,value);
      if (!result?.ok) throw new Error('save failed');
      if (version === saveVersion) document.getElementById('saveStatus').textContent = '✓ 已保存，正在陪伴';
    } catch (_) {
      document.getElementById('saveStatus').textContent = '保存失败，请重试';
      StudioUI.toast('设置未能保存，请再调整一次。');
    }
  });
  return saveQueue;
}
function render(settings) {
  for (const id of ['movementControls','energyControls','interactionControls']) document.getElementById(id).replaceChildren();
  for (const config of ranges) {
    const row = document.createElement('div');
    row.className = 'setting-row';
    row.innerHTML = '<div class="setting-info"><label for="' + config.id + '">' + config.label + '</label><p>' + config.hint + '</p></div><div class="range-control"><div class="range-meta"><span>' + config.ends[0] + '</span><output for="' + config.id + '"></output></div><input type="range" id="' + config.id + '" min="' + config.min + '" max="' + config.max + '" step="' + config.step + '"><div class="range-meta"><span>' + config.min + '</span><span>' + config.ends[1] + '</span></div></div>';
    const input = row.querySelector('input'), output = row.querySelector('output');
    input.value = settings[config.id] ?? config.value;
    function preview() {
      output.textContent = Number(input.value).toFixed(config.step < 1 ? 1 : 0) + ' ' + config.unit;
      input.style.setProperty('--progress', ((Number(input.value)-config.min)/(config.max-config.min)*100) + '%');
      input.setAttribute('aria-valuetext',output.textContent);
    }
    preview();
    input.addEventListener('input',preview);
    input.addEventListener('change',() => save(config.id,Number(input.value)));
    document.getElementById(config.group).append(row);
  }
  for (const config of toggles) {
    const row = document.createElement('div');
    row.className = 'setting-row';
    row.innerHTML = '<div class="setting-info"><label for="' + config.id + '">' + config.label + '</label><p>' + config.hint + '</p></div><input class="switch" role="switch" type="checkbox" id="' + config.id + '">';
    const input = row.querySelector('input');
    input.checked = settings[config.id] ?? true;
    input.addEventListener('change',() => save(config.id,input.checked));
    document.getElementById('interactionControls').append(row);
  }
}
async function init() {
  document.getElementById('loadError').hidden = true;
  try {
    const settings = await window.settingsAPI.getAll();
    render(settings); StudioUI.theme(settings.shopTheme);
    document.getElementById('settingsFields').disabled = false;
    document.getElementById('saveStatus').textContent = '✓ 设置已同步';
  } catch (_) {
    document.getElementById('loadError').hidden = false;
    document.getElementById('saveStatus').textContent = '暂时无法加载';
  }
}
document.querySelectorAll('[data-theme-choice]').forEach(button => button.addEventListener('click',async () => {
  await save('shopTheme',button.dataset.themeChoice);
}));
StudioUI.closeWithEscape(() => window.settingsAPI.close());
document.getElementById('openShop').addEventListener('click',() => window.settingsAPI.openShop());
document.getElementById('retryBtn').addEventListener('click',init);
window.settingsAPI.onThemeChanged(theme => StudioUI.theme(theme));
init();
