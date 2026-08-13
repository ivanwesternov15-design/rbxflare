/* =========================================================
   ГАЛЕРЕЯ — авто-сканирование в реальном времени
   При каждом открытии страницы (и шторки) скрипт сам читает
   содержимое папок tgminiapprbx/avatars|fons|podfons через
   листинг сервера. Просто клади jpg/png туда — и всё.
   Fallback: manifest.js (старый способ через update-gallery.bat)
   ========================================================= */
const FOLDER = 'tgminiapprbx';
const LIBRARY = (typeof GALLERY === 'object' && GALLERY) || {
  fons: ['tgminiapprbx/fons/flaze.jpg'],
  podfons: ['tgminiapprbx/podfons/night_violet.jpg'],
};

const IMAGE_RE = /\.(jpe?g|png)$/i;

const CSS_VAR = { fons: '--fon-url', podfons: '--wallpaper-url' };
const TARGET_EL = {
  fons: document.getElementById('banner'),
  podfons: document.getElementById('app-wallpaper'),
};
const AVATAR_EL = document.getElementById('avatarPhoto');

async function scanFolder(folder){
  const kind = folder.split('/').pop();
  try{
    const res = await fetch('/api/files/' + kind + '?ts=' + Date.now());
    if(res.ok){
      const data = await res.json();
      if(data.ok && Array.isArray(data.files) && data.files.length) return data.files;
    }
  }catch(e){ /* нет бэкенда — пробуем листинг папки */ }
  try{
    const res = await fetch(folder + '/?ts=' + Date.now());
    if(!res.ok) return null;
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const names = [...doc.querySelectorAll('a[href]')]
      .map(a => a.getAttribute('href').split(/[?#]/)[0])
      .filter(h => IMAGE_RE.test(h))
      .map(h => h.split('/').pop())
      .filter(Boolean);
    return [...new Set(names)].map(n => folder + '/' + n);
  }catch(e){ return null; }
}

async function refreshLibrary(){
  const keys = Object.keys(LIBRARY);
  const results = await Promise.all(keys.map(k => scanFolder(FOLDER + '/' + k)));
  let changed = false;
  keys.forEach((k, i) => {
    if(results[i] && results[i].length){
      const same = results[i].length === LIBRARY[k].length && results[i].every((p, j) => p === LIBRARY[k][j]);
      if(!same){ LIBRARY[k] = results[i]; changed = true; }
    }
  });
  if(changed){
    keys.forEach(k => { if(!LIBRARY[k].includes(state.selected[k])) state.selected[k] = LIBRARY[k][0]; });
    saveState();
  }
  applySelected();
  if(sheet.classList.contains('open')) renderGrid(state.tab);
}

function applySelected(){
  TARGET_EL.fons.style.setProperty(CSS_VAR.fons, `url('${state.selected.fons}')`);
  const isOwner = PROFILE && OWNER_IDS.includes(PROFILE.id);
  const w = (!isOwner && GLOBAL_WALLPAPER) ? GLOBAL_WALLPAPER : state.selected.podfons;
  TARGET_EL.podfons.style.setProperty(CSS_VAR.podfons, `url('${w}')`);
}

/* ---- глобальные настройки: фон приложения применяется ко всем ---- */
let GLOBAL_WALLPAPER = '';
async function loadSettings(){
  try{
    const res = await fetch('/api/settings?ts=' + Date.now());
    const data = await res.json();
    if(!data.ok) return;
    const isOwner = PROFILE && OWNER_IDS.includes(PROFILE.id);
    if(data.wallpaper){
      GLOBAL_WALLPAPER = data.wallpaper;
      if(isOwner){
        state.selected.podfons = data.wallpaper;
        if(!LIBRARY.podfons.includes(data.wallpaper)){
          LIBRARY.podfons.unshift(data.wallpaper);
          saveState();
          if(sheet.classList.contains('open')) renderGrid(state.tab);
        }
      }
      TARGET_EL.podfons.style.setProperty(CSS_VAR.podfons, `url('${data.wallpaper}')`);
    }
  }catch(e){}
}

/* ---- тост-уведомление (rAF: въезд сверху вниз, уезд вверх) ---- */
function animateToast(toast, show){
  const token = (toast._anim = (toast._anim || 0) + 1);
  const t0 = performance.now();
  const dur = 380;
  const ease = show ? (t => 1 - Math.pow(1 - t, 3)) : (t => t * t);
  if(show) toast.style.visibility = 'visible';
  const frame = now => {
    if(token !== toast._anim) return;
    const p = Math.min(1, (now - t0) / dur);
    const e = ease(p);
    toast.style.opacity = show ? e : 1 - e;
    toast.style.transform = `translateX(-50%) translateY(${(show ? 1 - e : -e) * 40}px)`;
    if(p < 1){ requestAnimationFrame(frame); }
    else if(!show) toast.style.visibility = 'hidden';
  };
  requestAnimationFrame(frame);
}

function toastSvg(icon, cls){
  const trash =
    `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M4 7h16M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2M6.5 7l.9 12.1A2 2 0 0 0 9.4 21h5.2a2 2 0 0 0 2-1.9L17.5 7"/><path d="M10 11v6M14 11v6"/></svg>`;
  const refresh =
    `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;
  const arrow =
    `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>`;
  const win =
    `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M8 21h8M12 17v4"/><path d="M7 4h10v6a5 5 0 0 1-10 0V4z"/><path d="M7 6H4v1a4 4 0 0 0 4 4M17 6h3v1a4 4 0 0 1-4 4"/></svg>`;
  if(icon === 'trash') return trash;
  if(icon === 'arrow') return arrow;
  if(icon === 'win') return win;
  return refresh;
}

function showToast(text, ok, icon){
  let toast = document.getElementById('appToast');
  if(!toast){
    toast = document.createElement('div');
    toast.id = 'appToast';
    document.body.appendChild(toast);
  }
  toast.className = 'app-toast' + (ok ? '' : ' err');
  toast.innerHTML =
    toastSvg(icon, 't-ico') +
    `<span class="t-text">${text}</span>` +
    toastSvg('arrow', 't-arr');
  animateToast(toast, true);
  clearTimeout(toast._t);
  toast._t = setTimeout(() => animateToast(toast, false), 3000);
}

function notifyChange(tab, src){
  if(!PROFILE || !OWNER_IDS.includes(PROFILE.id)) return;
  if(tab !== 'fons' && tab !== 'podfons') return;
  const id = tgInitData();
  if(!id){ showToast('Не успешно изменить фон', false); return; }
  fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: id, kind: tab, path: src })
  })
    .then(r => r.json())
    .then(data => {
      const label = tab === 'fons' ? 'Фон карточки' : 'Фон приложения';
      if(data.ok){
        const count = tab === 'podfons' ? ` — обновилось у ${data.users} пользователей` : '';
        showToast(`Вы успешно изменили ${label}${count}`, true, 'refresh');
      }else{
        showToast('Не успешно изменить ' + label, false);
      }
    })
    .catch(() => showToast('Не успешно изменить фон', false));
}

/* =========================================================
   КЕШИРОВАНИЕ ВЫБОРА (localStorage)
   ========================================================= */
const STORAGE_KEY = 'uxintace-gallery-v2';

const state = (() => {
  const base = {
    tab: 'fons',
    selected: {
      fons: LIBRARY.fons[0],
      podfons: LIBRARY.podfons[0],
    },
    balance: 0,
    daily: null,
    inventory: [],
  };
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      if(parsed && typeof parsed === 'object'){
        if(parsed.tab && LIBRARY[parsed.tab]) base.tab = parsed.tab;
        if(parsed.selected && typeof parsed.selected === 'object'){
          Object.keys(base.selected).forEach(k => {
            if(typeof parsed.selected[k] === 'string' && parsed.selected[k]){
              base.selected[k] = parsed.selected[k];
            }
          });
        }
        if(typeof parsed.balance === 'number') base.balance = parsed.balance;
        if(parsed.daily && typeof parsed.daily === 'object') base.daily = parsed.daily;
        if(Array.isArray(parsed.inventory)) base.inventory = parsed.inventory;
      }
    }
  }catch(e){}
  return base;
})();

function saveState(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      tab: state.tab,
      selected: state.selected,
      balance: state.balance,
      daily: state.daily,
      inventory: state.inventory,
    }));
  }catch(e){}
}

/* =========================================================
   T E L E G R A M  ИНТЕГРАЦИЯ
   Реальные данные профиля: имя, username, id, аватар, о себе,
   день рождения (или дата первого входа — хранится на сервере)
   ========================================================= */
const tg = (window.Telegram && Telegram.WebApp) ? Telegram.WebApp : null;
const OWNER_IDS = [8414792453]; // показывается бейдж «ВЛАДЕЛЕЦ»

let PROFILE = null;
const $ = id => document.getElementById(id);

function tgInitData(){
  return tg && tg.initData ? tg.initData : null;
}

function fmtDate(iso, withYear){
  if(!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(!m) return iso;
  const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const label = `${parseInt(m[3],10)} ${months[parseInt(m[2],10) - 1]}`;
  return withYear ? `${label} ${parseInt(m[1],10)} г.` : label;
}

async function loadProfile(){
  const id = tgInitData();
  if(!id){
    PROFILE = {
      first_name: 'Uxintace', last_name: '', username: 'uxintace',
      id: 1095059074, photo_url: '',
      bio: 'Занимаюсь разработкой Telegram ботов', birthday: '',
      first_login: '2026-08-12',
    };
    renderProfile();
    return;
  }
  try{
    const res = await fetch('/api/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: id })
    });
    const data = await res.json();
    if(data.ok && data.user){ PROFILE = data.user; renderProfile(); }
  }catch(e){
    console.warn('[api] недоступен:', e);
  }
}

function renderProfile(){
  if(!PROFILE) return;
  const p = PROFILE;
  const name = [p.first_name, p.last_name].filter(Boolean).join(' ');
  $('displayName').textContent = name || '—';
  $('handle').textContent = p.username ? '@' + p.username : 'без username';
  $('idPill').textContent = 'ID: ' + p.id;
  if(OWNER_IDS.includes(p.id)) $('ownerBadge').style.display = 'inline-flex';

  if(p.photo_url){
    AVATAR_EL.style.setProperty('--avatar-url', `url('${p.photo_url}')`);
  }
  $('bioValue').textContent = p.bio || '—';
  $('dateLabel').textContent = 'Первый вход';
  $('dateValue').textContent = p.first_login ? fmtDate(p.first_login, true) : '—';
  setupTabs();
}

$('datePanel').addEventListener('click', () => {
  // дата не редактируется: первый вход фиксируется при открытии мини-аппа
});

/* ---- глобальные прокрутки и шторка ---- */
const grid = document.getElementById('grid');
const tabsWrap = document.querySelector('.tabs');
const tabIndicator = document.getElementById('tabIndicator');
const menuBtn = document.getElementById('menuBtn');
const backdrop = document.getElementById('backdrop');
const sheet = document.getElementById('sheet');
const sheetClose = document.getElementById('sheetClose');
const bottomNav = document.getElementById('bottomNav');

function renderGrid(tab){
  const list = LIBRARY[tab];
  const existing = new Map();
  grid.querySelectorAll('.thumb').forEach(c => {
    if(c.dataset && c.dataset.src) existing.set(c.dataset.src, c);
    else c.remove();
  });

  list.forEach((src, i) => {
    let cell = existing.get(src);
    if(!cell){
      cell = document.createElement('div');
      cell.className = 'thumb cell-in';
      cell.dataset.src = src;
      cell.style.backgroundImage = `url('${src}')`;
      cell.innerHTML = `<span class="check"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg></span>`;
      cell.addEventListener('click', () => {
        if(deleteMode){ toggleDel(cell); return; }
        selectImage(tab, src, cell);
      });
      grid.appendChild(cell);
    }
    cell.style.animationDelay = `${Math.min(i, 5) * 45}ms`;
    cell.classList.toggle('selected', state.selected[tab] === src);
    cell.classList.toggle('armed', deleteMode && selectedToDelete.has(src));
  });

  existing.forEach((cell, src) => {
    if(!list.includes(src)) cell.remove(); // убрать удалённые файлы
  });
}

/* ---- удаление фонов (только владелец) ---- */
let deleteMode = false;
const selectedToDelete = new Set();
const trashBtn = document.getElementById('sheetTrash');
const delBar = document.getElementById('delBar');
const delCount = document.getElementById('delCount');
const delConfirm = document.getElementById('delConfirm');
const delCancel = document.getElementById('delCancel');

function updateDelBar(){
  delCount.textContent = selectedToDelete.size ? `Выбрано: ${selectedToDelete.size}` : 'Выбери фото';
  delConfirm.disabled = selectedToDelete.size === 0;
}

function toggleDel(cell){
  const src = cell.dataset.src;
  if(selectedToDelete.has(src)){ selectedToDelete.delete(src); cell.classList.remove('armed'); }
  else{ selectedToDelete.add(src); cell.classList.add('armed'); }
  updateDelBar();
}

function enterDeleteMode(){
  deleteMode = true;
  trashBtn.classList.add('active');
  sheet.classList.add('delete-on');
  delBar.classList.add('open');
  selectedToDelete.clear();
  updateDelBar();
}

function exitDeleteMode(){
  deleteMode = false;
  trashBtn.classList.remove('active');
  sheet.classList.remove('delete-on');
  delBar.classList.remove('open');
  selectedToDelete.clear();
  document.querySelectorAll('.thumb.armed').forEach(c => c.classList.remove('armed'));
}

trashBtn.addEventListener('click', () => {
  if(sheet.classList.contains('open')) deleteMode ? exitDeleteMode() : enterDeleteMode();
});
delCancel.addEventListener('click', exitDeleteMode);
delConfirm.addEventListener('click', async () => {
  if(!selectedToDelete.size) return;
  const paths = [...selectedToDelete];
  const id = tgInitData();
  try{
    const res = await fetch('/api/files', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: id, paths })
    });
    const data = await res.json();
    if(data.ok && data.deleted){
      const kinds = new Set();
      paths.forEach(p => {
        const kind = p.split('/')[2];
        kinds.add(kind);
        if(LIBRARY[kind]) LIBRARY[kind] = LIBRARY[kind].filter(x => x !== p);
        if(state.selected[kind] === p) state.selected[kind] = LIBRARY[kind] && LIBRARY[kind][0] ? LIBRARY[kind][0] : '';
      });
      exitDeleteMode();
      renderGrid(state.tab);
      applySelected();
      saveState();
      const n = data.deleted;
      const word = n === 1 ? 'фотографию' : (n >= 2 && n <= 4 ? 'фотографии' : 'фотографий');
      const label = kinds.size > 1
        ? word
        : word + ' из «' + (kinds.has('podfons') ? 'Фон приложения' : 'Фон карточки') + '»';
      showToast(`Вы успешно удалили ${n} ${label}`, true, 'trash');
    }else{
      alert('Не удалось удалить: ' + (data.error || 'ошибка'));
    }
  }catch(e){
    console.warn('[api] delete error:', e);
    alert('Ошибка сети при удалении');
  }
});

/* ---- вкладки: «Фон приложения» только для владельца ---- */
function setupTabs(){
  const isOwner = OWNER_IDS.includes(PROFILE.id);
  trashBtn.style.display = isOwner ? '' : 'none';
  tabBtns.forEach(b => {
    b.style.display = (b.dataset.tab === 'podfons' && !isOwner) ? 'none' : '';
  });
  tabsWrap.classList.toggle('tabs-single', !isOwner);
  if(!isOwner && state.tab === 'podfons'){
    state.tab = 'fons';
    tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === 'fons'));
    tabsWrap.classList.remove('tabs-single');
    animateGrid(-1);
    saveState();
  }
}

function crossFade(el, src){
  el.querySelectorAll('.swap-fade').forEach(n => n.remove());
  const overlay = document.createElement('div');
  overlay.className = 'swap-fade';
  overlay.style.backgroundImage = `url('${src}')`;
  el.appendChild(overlay);
  overlay.addEventListener('animationend', () => {
    overlay.remove();
    el.style.backgroundImage = `url('${src}')`;
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
  }, { once:true });
}

function selectImage(tab, src, cellEl){
  state.selected[tab] = src;
  [...grid.children].forEach(c => c.classList.remove('selected'));
  cellEl.classList.add('selected');

  const el = TARGET_EL[tab];
  crossFade(el, src);
  saveState();
  notifyChange(tab, src);
}

/* ---- плавный переход между вкладками галереи (выезд/въезд по направлению) ---- */
let gridAnim = 0;
function animateGrid(dir){
  const token = ++gridAnim;
  const t0 = performance.now();
  const dur = 420;
  const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  let swapped = false;

  const frame = now => {
    if(token !== gridAnim) return;
    const p = Math.min(1, (now - t0) / dur);
    if(p < .5){
      const v = ease(p * 2);
      grid.style.opacity = 1 - v * .6;
      grid.style.transform = `translateX(${dir * 34 * v}px) scale(${1 - v * .03})`;
      grid.style.filter = `blur(${v * 4}px)`;
    }else{
      if(!swapped){ swapped = true; grid.classList.add('tab-switching'); renderGrid(state.tab); }
      const v = ease((p - .5) * 2);
      grid.style.opacity = .4 + v * .6;
      grid.style.transform = `translateX(${dir * 34 * (1 - v)}px) scale(${.97 + v * .03})`;
      grid.style.filter = `blur(${(1 - v) * 4}px)`;
    }
    if(p < 1){ requestAnimationFrame(frame); }
    else{
      grid.classList.remove('tab-switching');
      grid.style.opacity = '';
      grid.style.transform = '';
      grid.style.filter = '';
    }
  };
  requestAnimationFrame(frame);
}

const tabBtns = [...tabsWrap.querySelectorAll('.tab-btn')];
let tabAnim = 0;
let tabPosIdx = 0;

function animateTabIndicator(toIdx){
  const token = ++tabAnim;
  const from = tabPosIdx;
  const t0 = performance.now();
  const dur = 360;
  const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const frame = now => {
    if(token !== tabAnim) return;
    const p = Math.min(1, (now - t0) / dur);
    const v = ease(p);
    tabPosIdx = from + (toIdx - from) * v;
    tabIndicator.style.transform = `translateX(${tabPosIdx * 100}%)`;
    if(p < 1) requestAnimationFrame(frame);
    else tabPosIdx = toIdx;
  };
  requestAnimationFrame(frame);
}

/* ---- предзагрузка картинок вкладки (чтобы анимация свапа не была рваной) ---- */
const imgCache = new Set();
function preloadTab(tab){
  const srcs = LIBRARY[tab] || [];
  return new Promise(resolve => {
    if(!srcs.length){ resolve(); return; }
    let done = 0;
    let finished = false;
    const finish = () => { if(!finished){ finished = true; resolve(); } };
    const timer = setTimeout(finish, 900); // максимум ждём 0.9 с — потом анимируем как есть
    srcs.forEach(s => {
      if(imgCache.has(s)){ done++; if(done === srcs.length) finish(); return; }
      const im = new Image();
      im.onload = im.onerror = () => {
        imgCache.add(s);
        done++;
        clearTimeout(timer);
        if(done === srcs.length) finish();
      };
      im.src = s;
    });
  });
}

function switchTab(tab){
  const keys = Object.keys(LIBRARY);
  const prevIdx = keys.indexOf(state.tab);
  const nextIdx = keys.indexOf(tab);
  const dir = nextIdx > prevIdx ? 1 : -1;
  state.tab = tab;
  tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  animateTabIndicator(nextIdx);
  const myTab = tab;
  preloadTab(myTab).then(() => { if(state.tab === myTab) animateGrid(dir); });
  saveState();
}

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function openSheet(){
  backdrop.classList.add('open');
  sheet.classList.add('open');
  bottomNav.classList.add('locked');
  animateSheet(true);
  renderGrid(state.tab);
  refreshLibrary();
  Object.keys(LIBRARY).forEach(t => preloadTab(t));
  if(!window._scanTimer){
    window._scanTimer = setInterval(refreshLibrary, 15000); // авто-обновление в реальном времени
  }
}
function closeSheet(){
  if(deleteMode) exitDeleteMode();
  backdrop.classList.remove('open');
  sheet.classList.remove('open');
  bottomNav.classList.remove('locked');
  animateSheet(false);
  if(window._scanTimer){ clearInterval(window._scanTimer); window._scanTimer = null; }
}

/* ---- плавное появление/исчезание окна (rAF, не зависит от системных настроек) ---- */
let sheetAnim = 0;
function animateSheet(open){
  const token = ++sheetAnim;
  const t0 = performance.now();
  const dur = open ? 480 : 300;
  if(open) sheet.style.visibility = 'visible';
  const ease = open
    ? (t) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
    : (t) => 1 - Math.pow(1 - t, 3);

  const frame = now => {
    if(token !== sheetAnim) return;
    const p = Math.min(1, (now - t0) / dur);
    const e = ease(p);
    const rev = 1 - e;
    const o = open ? e : rev;
    backdrop.style.opacity = o;
    sheet.style.opacity = o;
    sheet.style.filter = `blur(${rev * 10}px)`;
    sheet.style.transform = `translate(-50%, -50%) scale(${open ? 0.86 + 0.14 * e : 0.9 + 0.1 * rev}) translateY(${rev * (open ? 18 : 10)}px)`;
    if(p < 1){ requestAnimationFrame(frame); }
    else if(!open){
      sheet.style.visibility = 'hidden';
      sheet.style.opacity = 0;
      backdrop.style.opacity = 0;
    }else{
      sheet.style.filter = 'blur(0px)';
      sheet.style.transform = 'translate(-50%, -50%) scale(1)';
    }
  };
  requestAnimationFrame(frame);
}

menuBtn.addEventListener('click', openSheet);
sheetClose.addEventListener('click', closeSheet);
backdrop.addEventListener('click', closeSheet);

/* =========================================================
   КАРТОЧКИ: ежедневные карточки + скретч + инвентарь
   ========================================================= */
const REWARD_POOL = [10, 25, 50, 100, 250, 500, 1000];
const CARD_IMAGES = (typeof GALLERY === 'object' && GALLERY)
  ? ['tgminiapprbx/fons/flaze.jpg', 'tgminiapprbx/fons/crystal.jpg', 'tgminiapprbx/fons/moon.jpg']
  : ['tgminiapprbx/fons/flaze.jpg', 'tgminiapprbx/fons/crystal.jpg', 'tgminiapprbx/fons/moon.jpg'];
const dailyGridEl = document.getElementById('dailyGrid');
const dailyDoneEl = document.getElementById('dailyDone');
const collectBtnEl = document.getElementById('collectBtn');
const balanceValueEl = document.getElementById('balanceValue');

function todayKey(){ return new Date().toISOString().slice(0, 10); }

function ensureDaily(){
  if(!state.daily || state.daily.date !== todayKey()){
    const rewards = [0, 1, 2].reduce((acc, id) => {
      acc[id] = REWARD_POOL[Math.floor(Math.random() * REWARD_POOL.length)];
      return acc;
    }, {});
    state.daily = { date: todayKey(), rewards, selectedId: null, revealed: false, collected: false };
    saveState();
  }
}

function dailyCardImage(id){
  const srcs = (LIBRARY.fons && LIBRARY.fons.length) ? LIBRARY.fons : CARD_IMAGES;
  return srcs[id % srcs.length];
}

function renderDaily(){
  ensureDaily();
  scratchState = null;
  const d = state.daily;
  dailyGridEl.innerHTML = '';
  dailyGridEl.classList.toggle('solo', d.revealed);
  [0, 1, 2].forEach(id => {
    const el = document.createElement('div');
    el.className = 'd-card';
    el.dataset.id = id;
    el.style.backgroundImage = `url('${dailyCardImage(id)}')`;
    el.innerHTML =
      `<div class="d-card-num">0${id + 1}</div>` +
      `<div class="d-reward">` +
      toastSvg('win', 'd-win') +
      `<div class="d-amount">+${d.rewards[id]}</div>` +
      `<div class="d-robux">Robux</div>` +
      `</div>`;
    if(d.selectedId !== null){
      if(id === d.selectedId) el.classList.add('selected');
      else if(d.revealed) el.classList.add('gone', 'hidden');
      else el.classList.add('dim');
    }
    if(d.revealed && id === d.selectedId){
      el.classList.add('raised');
      const reward = el.querySelector('.d-reward');
      setTimeout(() => reward.classList.add('shown'), 60);
    }
    el.addEventListener('click', () => selectDailyCard(id));
    dailyGridEl.appendChild(el);
  });
  collectBtnEl.classList.toggle('hidden', !(d.revealed && !d.collected));
  dailyDoneEl.classList.toggle('hidden', !(d.revealed && d.collected));
  if(d.revealed && d.collected) dailyGridEl.classList.add('hidden');
}

/* --- события стейта: select / reveal / collect --- */
function selectDailyCard(id){
  if(state.daily.revealed || state.daily.collected) return;
  state.daily.selectedId = id;
  saveState();
  dailyGridEl.querySelectorAll('.d-card').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === String(id));
    el.classList.toggle('dim', el.dataset.id !== String(id));
  });
  initScratch(dailyGridEl.querySelector(`.d-card[data-id="${id}"]`), id);
}

function revealDailyCard(id){
  state.daily.revealed = true;
  saveState();
  const sel = dailyGridEl.querySelector(`.d-card[data-id="${id}"]`);
  const canvas = sel && sel.querySelector('.scratch-layer');
  if(canvas){
    canvas.classList.add('reveal');
    canvas.addEventListener('transitionend', () => canvas.remove(), { once: true });
    setTimeout(() => canvas.remove(), 520);
  }
  const reward = sel && sel.querySelector('.d-reward');
  if(reward) setTimeout(() => reward.classList.add('shown'), 80);
  dailyGridEl.querySelectorAll('.d-card').forEach(el => {
    if(el.dataset.id !== String(id)){
      el.classList.add('gone');
      setTimeout(() => el.classList.add('hidden'), 380);
    }
  });
  setTimeout(() => {
    dailyGridEl.classList.add('solo');
    if(sel) sel.classList.add('raised');
    collectBtnEl.classList.remove('hidden');
  }, 400);
  addBalance(state.daily.rewards[id]);
}

function collectDailyCard(){
  if(state.daily.collected || !state.daily.selectedId) return;
  const id = state.daily.selectedId;
  state.inventory.push({
    id: `daily-${state.daily.date}-${id}`,
    type: 'daily',
    level: 'Basic',
    rewardRobux: state.daily.rewards[id],
    status: 'available',
    img: dailyCardImage(id),
  });
  state.daily.collected = true;
  saveState();
  collectBtnEl.classList.add('hidden');
  dailyGridEl.classList.add('hidden');
  dailyDoneEl.classList.remove('hidden');
  renderInventory();
  showToast('Ежедневная карта в инвентаре', true, 'win');
}

/* --- баланс --- */
let balanceAnim = 0;
function addBalance(delta){
  if(!delta) return;
  const target = state.balance + delta;
  const from = state.balance;
  state.balance = target;
  saveState();
  const token = ++balanceAnim;
  const t0 = performance.now();
  const dur = 600;
  const frame = now => {
    if(token !== balanceAnim) return;
    const p = Math.min(1, (now - t0) / dur);
    const v = Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3)));
    balanceValueEl.textContent = v;
    if(p < 1) requestAnimationFrame(frame);
    else balanceValueEl.textContent = target;
  };
  requestAnimationFrame(frame);
}

/* --- скретч (защитный слой поверх награды) --- */
const SCRATCH_THRESHOLD = 0.30;
let scratchState = null;

function initScratch(cardEl, id){
  if(scratchState) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'scratch-layer';
  cardEl.appendChild(canvas);
  const rect = cardEl.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const g = ctx.createLinearGradient(0, 0, rect.width, rect.height);
  g.addColorStop(0, '#253745');
  g.addColorStop(1, '#11212D');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, rect.width, rect.height);
  ctx.save();
  ctx.translate(rect.width / 2, rect.height / 2);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = 'rgba(94,116,134,.22)';
  for(let i = -rect.height; i < rect.width * 1.6; i += 26){
    ctx.fillRect(i, -60, 14, rect.height + 120);
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(248,250,252,.85)';
  ctx.font = '700 15px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Потри карточку', rect.width / 2, rect.height / 2 - 6);
  ctx.fillStyle = 'rgba(183,195,202,.7)';
  ctx.font = '600 13px Inter, sans-serif';
  ctx.fillText('✦ ✦ ✦', rect.width / 2, rect.height / 2 + 16);

  const brush = Math.max(14, rect.width * .11);
  const pos = e => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  let active = false;
  let last = null;
  const erase = (p, dist) => {
    ctx.globalCompositeOperation = 'destination-out';
    if(last){
      ctx.lineWidth = brush * 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }else{
      ctx.beginPath();
      ctx.arc(p.x, p.y, brush, 0, Math.PI * 2);
      ctx.fill();
    }
    scratchState.erased += dist * brush * 1.6 + Math.PI * brush * brush * .3;
    last = p;
    if(scratchState.erased / (rect.width * rect.height) >= SCRATCH_THRESHOLD) autoReveal();
  };

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    active = true;
    last = null;
    erase(pos(e), 0);
  });
  canvas.addEventListener('pointermove', e => {
    if(!active) return;
    const p = pos(e);
    const dist = last ? Math.hypot(p.x - last.x, p.y - last.y) : 0;
    erase(p, dist);
  });
  canvas.addEventListener('pointerup', () => { active = false; });
  canvas.addEventListener('pointercancel', () => { active = false; });

  scratchState = { id, erased: 0 };
}

function autoReveal(){
  if(!scratchState || state.daily.revealed) return;
  revealDailyCard(scratchState.id);
  scratchState = null;
}

/* --- инвентарь --- */
const inventoryListEl = document.getElementById('inventoryList');
const inventoryEmptyEl = document.getElementById('inventoryEmpty');

function renderInventory(){
  inventoryListEl.innerHTML = '';
  inventoryEmptyEl.classList.toggle('hidden', state.inventory.length > 0);
  state.inventory.forEach((card, i) => {
    const el = document.createElement('div');
    el.className = 'inv-card';
    const staking = card.status === 'staking';
    el.innerHTML =
      `<div class="inv-thumb" style="background-image:url('${card.img}')"></div>` +
      `<div class="inv-info">` +
        `<div class="inv-title">Ежедневная карта</div>` +
        `<div class="inv-meta">` +
          `<span class="chip">${card.level}</span>` +
          `<span class="chip reward">+${card.rewardRobux} Robux</span>` +
          `<span class="chip ${staking ? 'staking' : ''}">${staking ? 'В стейкинге' : 'Доступна'}</span>` +
        `</div>` +
      `</div>` +
      `<button class="stake-btn ${staking ? 'off' : ''}" data-i="${i}">` +
        (staking ? 'Забрать из стейкинга' : 'Отправить в стейкинг') +
      `</button>`;
    el.querySelector('.stake-btn').addEventListener('click', () => {
      state.inventory[i].status = staking ? 'available' : 'staking';
      saveState();
      renderInventory();
    });
    inventoryListEl.appendChild(el);
  });
}

/* ---- переключение экранов нижней навигации ---- */
function switchView(view){
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  const map = { main: 'viewSoon', cards: 'viewCards', refs: 'viewSoon', tasks: 'viewSoon', profile: 'viewProfile' };
  document.getElementById(map[view] || 'viewProfile').classList.remove('hidden');
  if(view === 'cards'){
    renderDaily();
    renderInventory();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---- нижняя навигация (пока работает только «Профиль»): плавное скольжение индикатора ---- */
const navIndicator = document.getElementById('navIndicator');
const navBtns = [...document.querySelectorAll('.nav-btn')];
let navPos = 0;      // текущая визуальная позиция индикатора
let navAnim = 0;     // токен текущей анимации
let activeIdx = 0;   // выбранная категория

function setNavIndicatorX(x, sx, sy){
  navIndicator.style.transform =
    `translateX(calc(${x} * 100% + ${x * 2}px)) scale(${sx}, ${sy})`;
}

function moveNavIndicator(idx, animate){
  const maxIdx = navBtns.length - 1;
  navAnim++; // новая анимация отменяет предыдущую
  if(!animate || idx === navPos){
    navPos = idx;
    setNavIndicatorX(idx, 1, 1);
    return;
  }
  const from = navPos;
  const token = navAnim;
  const t0 = performance.now();
  const dur = 520;
  const easeOutBack = t => {
    const c1 = 1.3, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };
  const frame = now => {
    if(token !== navAnim) return; // есть более новая анимация — старая умирает
    const p = Math.min(1, (now - t0) / dur);
    const raw = from + (idx - from) * easeOutBack(p);
    const x = Math.min(Math.max(raw, 0), maxIdx);
    navPos = x; // обновляем позицию каждый кадр — новая анимация стартует отсюда
    const jelly = Math.sin(Math.PI * Math.min(1, Math.abs(raw - from) / Math.max(idx - from, 1e-6)));
    setNavIndicatorX(x, 1 + 0.09 * jelly, 1 - 0.07 * jelly);
    if(p < 1) requestAnimationFrame(frame);
    else { navPos = idx; setNavIndicatorX(idx, 1, 1); }
  };
  requestAnimationFrame(frame);
}

const initialIdx = navBtns.findIndex(b => b.classList.contains('active'));
activeIdx = initialIdx >= 0 ? initialIdx : navBtns.length - 1;
navPos = activeIdx;
setNavIndicatorX(activeIdx, 1, 1);

tabPosIdx = Math.max(0, tabBtns.findIndex(b => b.classList.contains('active')));

navBtns.forEach((btn, idx) => {
  btn.addEventListener('click', () => {
    if(activeIdx === idx) return; // уже в этой категории — повторные клики игнорируем
    activeIdx = idx;
    navBtns.forEach(b => b.classList.toggle('active', b === btn));
    moveNavIndicator(idx, true);
    switchView(btn.dataset.view);
  });
});

/* ---- старт ---- */
if(tg){
  document.documentElement.classList.add('tg-mode');
  tg.ready();
  tg.expand();
  tg.setHeaderColor('#06141B');
  tg.setBackgroundColor('#06141B');
}

collectBtnEl.addEventListener('click', collectDailyCard);

applySelected();
refreshLibrary();
loadProfile();
loadSettings();
balanceValueEl.textContent = state.balance;
renderDaily();
renderInventory();