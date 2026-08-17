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
    coins: 0,
    daily: null,
    inventory: [],
    dailyResetTs: 0,
    streak: { count: 0, lastDate: null },
    tasks: {},           // { taskId: { progress, claimed } }
    notifications: [],   // [{ id, icon, title, text, ts, read }]
    preferences: { fon: '', wallpaper: '', prefix: '' },
    activity: [],        // [{ ts, type, text }]
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
        if(typeof parsed.coins === 'number') base.coins = parsed.coins;
        if(parsed.daily && typeof parsed.daily === 'object') base.daily = parsed.daily;
        if(Array.isArray(parsed.inventory)) base.inventory = parsed.inventory;
        if(typeof parsed.dailyResetTs === 'number') base.dailyResetTs = parsed.dailyResetTs;
        if(parsed.streak && typeof parsed.streak === 'object'){
          base.streak = { count: Number(parsed.streak.count) || 0, lastDate: parsed.streak.lastDate || null };
        }
        if(parsed.tasks && typeof parsed.tasks === 'object') base.tasks = parsed.tasks;
        if(Array.isArray(parsed.notifications)) base.notifications = parsed.notifications;
      }
    }
    base.inventory = (base.inventory || []).filter(c =>
      c && typeof c === 'object' && c.rarity && typeof c.rarity === 'string' &&
      typeof c.reward === 'number' && isFinite(c.reward));
    base.inventory.forEach((c, i) => {
      if(!c.id) c.id = `c-${Date.now()}-${i}`;
    });
  }catch(e){}
  return base;
})();

function saveState(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      tab: state.tab,
      selected: state.selected,
      balance: state.balance,
      coins: state.coins,
      daily: state.daily,
      inventory: state.inventory,
      dailyResetTs: state.dailyResetTs,
      streak: state.streak,
      tasks: state.tasks,
      notifications: state.notifications,
      preferences: state.preferences,
      activity: state.activity,
    }));
  }catch(e){}
  scheduleSync();
}

let syncTimer = null;
function scheduleSync(){
  if(syncTimer) return;
  syncTimer = setTimeout(() => {
    syncTimer = null;
    const init = tgInitData();
    if(!init) return;
    fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: init, data: {
        balance: state.balance,
        coins: state.coins,
        inventory: state.inventory,
        tasks: state.tasks,
        daily: state.daily,
        streak: state.streak,
        dailyResetTs: state.dailyResetTs,
        preferences: state.preferences,
        activity: state.activity,
      }}),
    }).catch(() => {});
  }, 1200);
}

async function loadServerState(){
  try{
    const init = tgInitData();
    if(!init) return;
    const res = await fetch('/api/sync?initData=' + encodeURIComponent(init));
    const data = await res.json();
    if(data.ok && data.data){
      const d = data.data;
      if(Array.isArray(d.inventory)) state.inventory = d.inventory;
      if(typeof d.balance === 'number' && d.balance >= 0) state.balance = d.balance;
      if(typeof d.coins === 'number' && d.coins >= 0) state.coins = d.coins;
      if(d.tasks && typeof d.tasks === 'object') state.tasks = d.tasks;
      if(d.daily && typeof d.daily === 'object') state.daily = d.daily;
      if(d.streak && typeof d.streak === 'object') state.streak = d.streak;
      if(typeof d.dailyResetTs === 'number') state.dailyResetTs = d.dailyResetTs;
      if(d.preferences && typeof d.preferences === 'object') state.preferences = d.preferences;
      if(Array.isArray(d.activity)) state.activity = d.activity;
      saveState();
    }
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

/* ---- вкладки: «Фон приложения» только для владельца, удаление — владелец + админы ---- */
function setupTabs(){
  const isOwner = OWNER_IDS.includes(PROFILE.id);
  trashBtn.style.display = isPriv() ? '' : 'none';
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
  state.bgChanged = true;
  [...grid.children].forEach(c => c.classList.remove('selected'));
  cellEl.classList.add('selected');

  const el = TARGET_EL[tab];
  crossFade(el, src);
  saveState();
  notifyChange(tab, src);
  const label = tab === 'fons' ? 'Фон карточки' : 'Фон приложения';
  addNotification('refresh', 'Фон изменён', `${label} успешно обновлён`);
  if(typeof renderTasks === 'function') renderTasks();
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

function tabBtnLeft(idx){
  const b = tabBtns[idx];
  if(!b) return 0;
  return b.offsetLeft - tabsWrap.offsetLeft;
}

function animateTabIndicator(toIdx){
  const token = ++tabAnim;
  const fromLeft = tabPosIdx;
  const toLeft = tabBtnLeft(toIdx);
  const t0 = performance.now();
  const dur = 360;
  const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const frame = now => {
    if(token !== tabAnim) return;
    const p = Math.min(1, (now - t0) / dur);
    const v = ease(p);
    const cur = fromLeft + (toLeft - fromLeft) * v;
    tabPosIdx = cur;
    tabIndicator.style.left = `${cur}px`;
    if(p < 1) requestAnimationFrame(frame);
    else { tabPosIdx = toLeft; tabIndicator.style.left = `${toLeft}px`; }
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
  animateModal(sheet, backdrop, true);
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
  animateModal(sheet, backdrop, false);
  if(window._scanTimer){ clearInterval(window._scanTimer); window._scanTimer = null; }
}

/* ---- плавное появление/исчезание модальных окон (rAF) ---- */
const modalAnimTokens = new WeakMap();
function modalToken(modal){
  let t = modalAnimTokens.get(modal) || 0;
  modalAnimTokens.set(modal, ++t);
  return t;
}
function animateModal(modal, bd, open){
  const token = modalToken(modal);
  const t0 = performance.now();
  const dur = open ? 480 : 300;
  if(open) modal.style.visibility = 'visible';
  const ease = open
    ? (t) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
    : (t) => 1 - Math.pow(1 - t, 3);

  const frame = now => {
    if(token !== modalAnimTokens.get(modal)) return;
    const p = Math.min(1, (now - t0) / dur);
    const e = ease(p);
    const rev = 1 - e;
    const o = open ? e : rev;
    bd.style.opacity = o;
    modal.style.opacity = o;
    modal.style.transform = `translate(-50%, ${rev * 30}px)`;
    if(p < 1){ requestAnimationFrame(frame); }
    else if(!open){
      modal.style.visibility = 'hidden';
      modal.style.opacity = 0;
      bd.style.opacity = 0;
    }else{
      modal.style.filter = 'blur(0px)';
      modal.style.transform = 'translate(-50%, 0)';
    }
  };
  requestAnimationFrame(frame);
}

function openModal(modal, bd){
  bd.classList.add('open');
  modal.classList.add('open');
  animateModal(modal, bd, true);
}

function closeModal(modal, bd){
  bd.classList.remove('open');
  modal.classList.remove('open');
  animateModal(modal, bd, false);
}

function closeAllSheets(){
  document.querySelectorAll('.sheet.open').forEach(m => {
    const bid = m.id === 'sheet' ? 'backdrop' : m.id.replace(/Sheet$/, 'Backdrop');
    const bd = document.getElementById(bid);
    if(bd) closeModal(m, bd);
  });
}

sheetClose.addEventListener('click', closeSheet);
backdrop.addEventListener('click', closeSheet);

/* =========================================================
   КАРТОЧКИ: ежедневные паки (Главное) + скретч 50% +
   PNG-дроп по редкости + инвентарь/стейкинг (Карточки)
   ========================================================= */
const DEFAULT_CONFIG = {
  tiers: {
    Basic:    { reward: 40,   chance: 42,   stake: { '12h': 0.5, '24h': 1,   '3d': 3,   '7d': 7 } },
    Silver:   { reward: 120,  chance: 27,   stake: { '12h': 0.75, '24h': 1.5, '3d': 4,  '7d': 9 } },
    Gold:     { reward: 300,  chance: 17,   stake: { '12h': 1,    '24h': 2,   '3d': 5,  '7d': 12 } },
    Diamond:  { reward: 800,  chance: 10,   stake: { '12h': 1.5,  '24h': 3,   '3d': 8,  '7d': 18 } },
    Mythic:   { reward: 2500, chance: 4,    stake: { '12h': 2,    '24h': 4,   '3d': 10, '7d': 25 } },
  }
};
const TIER_ORDER = ['Basic', 'Silver', 'Gold', 'Diamond', 'Mythic'];
const TIER_STYLE = {
  Basic:   { img: 'tgminiapprbx/Cards/Basic.png',   colors: ['#3D5665', '#0B151F'] },
  Silver:  { img: 'tgminiapprbx/Cards/Silver.png',  colors: ['#C7D4DC', '#2A3B4D'] },
  Gold:    { img: 'tgminiapprbx/Cards/Gold.png',    colors: ['#EAB765', '#5C4A28'] },
  Diamond: { img: 'tgminiapprbx/Cards/Diamond.png', colors: ['#67B7F3', '#122B45'] },
  Mythic:  { img: 'tgminiapprbx/Cards/Mythic.png',  colors: ['#8FA3D0', '#2E3560'] },
};
const STAKE_LABEL = { '12h': '12 часов', '24h': '24 часа', '3d': '3 дня', '7d': '7 дней' };
const STAKE_MS = { '12h': 12 * 3600e3, '24h': 24 * 3600e3, '3d': 3 * 86400e3, '7d': 7 * 86400e3 };

let APP_CONFIG = null;
function tierCfg(name){
  const base = DEFAULT_CONFIG.tiers[name];
  const cfg = ((APP_CONFIG || {}).tiers || {})[name];
  if(!cfg) return base;
  return Object.assign({}, base, cfg, { stake: Object.assign({}, base.stake, cfg.stake || {}) });
}
function tierVars(name){
  const c = TIER_STYLE[name].colors;
  return `--t1:${c[0]};--t2:${c[1]};--t3:${c[2] || c[1]}`;
}
function rollRarity(){
  const entries = TIER_ORDER.map(t => ({ t, c: Math.max(0.1, Number(tierCfg(t).chance) || 0) }));
  const total = entries.reduce((s, e) => s + e.c, 0);
  let r = Math.random() * total;
  for(const e of entries){
    r -= e.c;
    if(r <= 0) return e.t;
  }
  return entries[entries.length - 1].t;
}

const dailyGridEl = document.getElementById('dailyGrid');
const dailyDoneEl = document.getElementById('dailyDone');
const collectBtnEl = document.getElementById('collectBtn');
const rrSheet = document.getElementById('rrSheet');
const rrBackdrop = document.getElementById('rrBackdrop');
const rrMainCard = document.getElementById('rrMainCard');
const rrMainImg = document.getElementById('rrMainImg');
const rrMainNum = document.getElementById('rrMainNum');
const rrOthersRow = document.getElementById('rrOthersRow');
const rrBtn = document.getElementById('rrBtn');
const balanceValueEl = document.getElementById('balanceValue');
const heroAvatarEl = document.getElementById('heroAvatar');
const heroNameEl = document.getElementById('heroName');
const heroIdEl = document.getElementById('heroId');
const dailyTimerEl = document.getElementById('dailyTimer');
const dailyTimerTextEl = document.getElementById('dailyTimerText');
const dpHintEl = document.querySelector('.dp-hint');

function todayKey(){ return new Date().toISOString().slice(0, 10); }

function renderHero(){
  if(!PROFILE) return;
  const name = [PROFILE.first_name, PROFILE.last_name].filter(Boolean).join(' ') || 'Игрок';
  heroNameEl.textContent = name;
  heroIdEl.textContent = `ID: ${PROFILE.id}`;
  const init = (name.trim()[0] || '?').toUpperCase();
  if(PROFILE.photo_url){
    heroAvatarEl.innerHTML = `<img src="${PROFILE.photo_url}" alt="" referrerpolicy="no-referrer">`;
  }else{
    heroAvatarEl.textContent = init;
  }
}

/* таймер «обновление через N」— после того как карточка уже открыта */
let dailyTimerId = null;
function startDailyTimer(show){
  if(dailyTimerId){ clearInterval(dailyTimerId); dailyTimerId = null; }
  dailyTimerEl.classList.toggle('hidden', !show);
  if(!show) return;
  const tick = () => {
    const now = new Date();
    const end = new Date(now); end.setHours(24, 0, 0, 0);
    let s = Math.max(0, Math.floor((end - now) / 1000));
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    s %= 3600;
    const m = String(Math.floor(s / 60)).padStart(2, '0');
    const sec = String(s % 60).padStart(2, '0');
    dailyTimerTextEl.textContent = `Карточки обновятся: ${h}:${m}:${sec}`;
  };
  tick();
  dailyTimerId = setInterval(tick, 1000);
}

function ensureDaily(){
  if(!state.daily || state.daily.date !== todayKey() || (state.daily.revealed && !state.daily.rarity)){
    state.daily = { date: todayKey(), selectedId: null, revealed: false, collected: false, rarity: null, reward: 0 };
    saveState();
  }
}

function renderDaily(){
  ensureDaily();
  const d = state.daily;
  dailyGridEl.innerHTML = '';
  dailyGridEl.classList.remove('solo', 'hidden');
  collectBtnEl.classList.toggle('hidden', !(d.revealed && !d.collected));
  dailyDoneEl.classList.toggle('hidden', !(d.revealed && d.collected));
  if(dpHintEl) dpHintEl.classList.toggle('hidden', !!(d.revealed || d.collected));
  startDailyTimer(d.revealed);
  if(d.revealed && d.collected){ dailyGridEl.classList.add('hidden'); return; }
  if(d.revealed){
    dailyGridEl.classList.add('solo');
    dailyGridEl.innerHTML = dropHTML(d.rarity, d.reward);
    return;
  }
  [0, 1, 2].forEach(id => {
    const el = document.createElement('div');
    el.className = 'd-card pack';
    el.dataset.id = id;
    el.style.animationDelay = `${id * 130}ms`;
    el.innerHTML =
      `<div class="d-card-num">0${id + 1}</div>` +
      `<div class="pack-q">` +
        `<svg viewBox="0 0 48 64" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">` +
          `<rect x="3" y="3" width="42" height="58" rx="8"/>` +
          `<path d="M3 14h42"/>` +
          `<path d="M24 18.5v6M20.5 21.5h7"/>` +
          `<path d="M13 36l11 17 11-17z"/>` +
          `<path d="M24 53l-7.5-12M24 53l7.5-12"/>` +
          `<circle cx="14" cy="48" r="1.4"/><circle cx="34" cy="48" r="1.4"/>` +
        `</svg>` +
      `</div>` +
      `<div class="pack-label">Карточка</div>`;
    if(d.selectedId !== null){
      el.classList.toggle('selected', id === d.selectedId);
      el.classList.toggle('dim', id !== d.selectedId);
    }
    el.addEventListener('click', () => selectDailyCard(id));
    dailyGridEl.appendChild(el);
  });
  if(d.selectedId !== null){
    setTimeout(() => revealDailyCard(d.selectedId), 250);
  }
}

/* --- события стейта: select (выбивание) / reveal / collect --- */
function selectDailyCard(id){
  if(state.daily.revealed || state.daily.collected || state.daily.selectedId !== null) return;
  state.daily.selectedId = id;
  saveState();
  const sel = dailyGridEl.querySelector(`.d-card[data-id="${id}"]`);
  if(!sel) return;
  dailyGridEl.querySelectorAll('.d-card').forEach(el => {
    if(el !== sel){ el.classList.add('gone'); }
  });
  sel.classList.add('selected', 'burst');
  setTimeout(() => revealDailyCard(id), 800);
}

function dropHTML(rarity, reward){
  const v = tierVars(rarity);
  return `<div class="drop-wrap" style="${v}">
    <img class="drop-png" src="${TIER_STYLE[rarity].img}" alt="${rarity}">
    <div class="drop-reward-line">
      <svg class="drop-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 11h18M7 6V4a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 17 4v2"/><circle cx="16" cy="15.5" r="1.2" fill="currentColor" stroke="none"/></svg>
      <span class="drop-amount">+${reward}</span>
      <span class="stake-sub">Robux</span>
    </div>
  </div>`;
}

function revealDailyCard(id){
  if(state.daily.revealed) return;
  const rarity = rollRarity();
  const reward = Math.round(tierCfg(rarity).reward);
  state.daily.revealed = true;
  state.daily.rarity = rarity;
  state.daily.reward = reward;
  saveState();
  const sel = dailyGridEl.querySelector(`.d-card[data-id="${id}"]`);
  if(sel) sel.classList.add('gone');
  dailyGridEl.querySelectorAll('.d-card').forEach(el => {
    if(el !== sel){
      el.classList.add('gone');
      setTimeout(() => el.classList.add('hidden'), 380);
    }
  });
  setTimeout(() => {
    dailyGridEl.classList.add('solo');
    dailyGridEl.innerHTML = dropHTML(rarity, reward);
    startDailyTimer(true);
  }, 420);
  if(dpHintEl) dpHintEl.classList.add('hidden');
  addBalance(reward);
  if(rarity === 'Diamond' || rarity === 'Mythic'){
    addNotification('gem', `Выпала карта ${rarity}!`, `Тебе повезло — редкая карточка ${rarity} принесла +${reward} Robux`);
  }
  const others = [
    [randInt(5, Math.max(10, Math.round(reward * .35))), 'gold'],
    [randInt(5, Math.max(10, Math.round(reward * .7))), 'violet'],
  ];
  state.daily.others = others;
  setTimeout(() => showResultWindow(rarity, reward, others), 520);
}

function randInt(min, max){
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function showResultWindow(rarity, reward, others){
  const st = TIER_STYLE[rarity] || TIER_STYLE.Basic;
  rrSheet.classList.remove('hidden');
  rrMainCard.style.setProperty('--t1', st.colors[0]);
  rrMainCard.style.setProperty('--t2', st.colors[1]);
  rrMainImg.src = st.img;
  rrMainNum.textContent = reward;
  rrOthersRow.innerHTML = (others || []).map(o => {
    const n = Math.max(1, Math.round(o[0]));
    return `<div class="rr-other-card ${o[1] || 'gold'}">
      <div class="rr-other-num">${n}</div>
      <div class="rr-other-sub">Robux</div>
    </div>`;
  }).join('');
  openModal(rrSheet, rrBackdrop);
}

function closeResultWindow(){
  closeModal(rrSheet, rrBackdrop);
  renderDaily();
}

function collectDailyCard(){
  if(state.daily.collected || !state.daily.rarity) return;
  state.inventory.push({
    id: `daily-${state.daily.date}-${Date.now()}`,
    type: 'daily',
    rarity: state.daily.rarity,
    reward: state.daily.reward,
    status: 'available',
    until: 0,
    img: TIER_STYLE[state.daily.rarity].img,
  });
  state.daily.collected = true;
  saveState();
  logActivity('card', `Получена карточка: ${state.daily.rarity} (+${state.daily.reward} Robux)`);
  collectBtnEl.classList.add('hidden');
  dailyGridEl.classList.add('hidden');
  dailyDoneEl.classList.remove('hidden');
  if(dpHintEl) dpHintEl.classList.add('hidden');
  renderInventory();
  if(typeof renderTasks === 'function') renderTasks();
  showToast('Ежедневная карта в инвентаре', true, 'win');
}

/* --- баланс --- */
let balanceAnim = 0;
function reportBalance(){
  const init = tgInitData();
  if(!init) return;
  fetch('/api/balance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: init, balance: state.balance })
  }).catch(() => {});
}
function addBalance(delta){
  if(!delta) return;
  const target = state.balance + delta;
  const from = state.balance;
  state.balance = target;
  saveState();
  reportBalance();
  if(typeof renderWithdraw === 'function') renderWithdraw();
  if(typeof renderTasks === 'function') renderTasks();
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

/* =========================================================
   COINS — вторая валюта (временная экономика, будет дорабатываться)
   ========================================================= */
const coinsValueEl = document.getElementById('coinsValue');
let coinsAnim = 0;
function addCoins(delta){
  if(!delta) return;
  const target = state.coins + delta;
  const from = state.coins;
  state.coins = target;
  saveState();
  if(!coinsValueEl) return;
  const token = ++coinsAnim;
  const t0 = performance.now();
  const dur = 600;
  const frame = now => {
    if(token !== coinsAnim) return;
    const p = Math.min(1, (now - t0) / dur);
    const v = Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3)));
    coinsValueEl.textContent = v;
    if(p < 1) requestAnimationFrame(frame);
    else coinsValueEl.textContent = target;
  };
  requestAnimationFrame(frame);
}

/* =========================================================
   STREAK — серия дней захода (реальный подсчёт по датам)
   ========================================================= */
const streakDaysEl = document.getElementById('streakDays');
const streakBonusEl = document.getElementById('streakBonus');
const STREAK_DAILY_BONUS = 25;

function ensureStreak(){
  const today = todayKey();
  const s = state.streak;
  if(s.lastDate === today) return false; // уже засчитан сегодняшний день
  let gained = false;
  if(s.lastDate){
    const prev = new Date(s.lastDate + 'T00:00:00');
    const now = new Date(today + 'T00:00:00');
    const diffDays = Math.round((now - prev) / 86400000);
    s.count = diffDays === 1 ? s.count + 1 : 1;
  }else{
    s.count = 1;
  }
  s.lastDate = today;
  saveState();
  gained = true;
  return gained;
}

function renderStreak(){
  if(!streakDaysEl) return;
  const n = state.streak.count || 0;
  streakDaysEl.textContent = `${n} ${n === 1 ? 'день' : (n >= 2 && n <= 4 ? 'дня' : 'дней')}`;
  if(streakBonusEl) streakBonusEl.textContent = `+${STREAK_DAILY_BONUS}`;
  reportProgress();
}

/* =========================================================
   ЗАДАНИЯ — временная логика (7 простых целей на текущих данных)
   ========================================================= */
const TASKS = [
  { id: 'first_card', title: 'Собери первую карточку', desc: 'Забери любую карточку с «Главного» в инвентарь', reward: 20,
    check: () => state.inventory.length >= 1 },
  { id: 'five_cards', title: 'Собери 5 карточек', desc: 'Накопи 5 карточек в инвентаре', reward: 60,
    check: () => state.inventory.length >= 5 },
  { id: 'streak3', title: 'Заходи 3 дня подряд', desc: 'Не пропускай ежедневные карточки', reward: 40,
    check: () => (state.streak.count || 0) >= 3 },
  { id: 'stake_one', title: 'Отправь карточку в стейкинг', desc: 'Застейкай любую карточку в инвентаре', reward: 30,
    check: () => state.inventory.some(c => c.status === 'staking') },
  { id: 'invite_friend', title: 'Пригласи друга', desc: 'Поделись реферальной ссылкой', reward: 50,
    check: () => (REFERRALS.count || 0) >= 1 },
  { id: 'change_bg', title: 'Смени фон карточки', desc: 'Выбери другой фон во «Внешнем виде»', reward: 15,
    check: () => !!state.bgChanged },
  { id: 'balance500', title: 'Накопи 500 Robux', desc: 'Дойди до отметки 500 Robux на балансе', reward: 80,
    check: () => state.balance >= 500 },
];

function tasksCompletedCount(){ return TASKS.filter(t => t.check()).length; }
function tasksAllDone(){ return tasksCompletedCount() === TASKS.length; }

const tasksListEl = document.getElementById('tasksList');
const tasksProgressTextEl = document.getElementById('tasksProgressText');
const taskBtnProgressEl = document.getElementById('taskBtnProgress');

function renderTasks(){
  const done = tasksCompletedCount();
  if(tasksProgressTextEl) tasksProgressTextEl.textContent = `${done} / ${TASKS.length} выполнено`;
  if(taskBtnProgressEl) taskBtnProgressEl.textContent = `${done} / ${TASKS.length} выполнено`;
  if(tasksListEl){
    tasksListEl.innerHTML = TASKS.map(t => {
      const ok = t.check();
      const claimed = !!(state.tasks[t.id] && state.tasks[t.id].claimed);
      const status = claimed ? 'claimed' : (ok ? 'ready' : 'locked');
      return `<div class="task-row ${status}">
        <div class="task-ico">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            ${claimed ? '<path d="M5 13l4 4L19 7"/>' : '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'}
          </svg>
        </div>
        <div class="task-mid">
          <div class="task-title">${t.title}</div>
          <div class="task-desc">${t.desc}</div>
        </div>
        <div class="task-act">
          ${claimed
            ? `<span class="task-done-chip">Готово</span>`
            : ok
              ? `<button class="task-claim-btn" data-task="${t.id}">+${t.reward}</button>`
              : `<span class="task-lock-chip">+${t.reward}</span>`}
        </div>
      </div>`;
    }).join('');
    tasksListEl.querySelectorAll('.task-claim-btn').forEach(b =>
      b.addEventListener('click', () => claimTask(b.dataset.task)));
  }
  reportProgress();
}

function claimTask(id){
  const t = TASKS.find(x => x.id === id);
  if(!t || !t.check()) return;
  if(state.tasks[id] && state.tasks[id].claimed) return;
  state.tasks[id] = { claimed: true };
  saveState();
  logActivity('coins', `Задание выполнено: ${t.title} (+${t.reward} Coins)`);
  addCoins(t.reward);
  addNotification('win', 'Задание выполнено', `«${t.title}» — начислено +${t.reward} Coins`);
  showToast(`+${t.reward} Coins за задание`, true, 'win');
  renderTasks();
}

/* =========================================================
   РЕФЕРАЛЫ
   ========================================================= */
let REFERRALS = { count: 0, list: [], link: '' };
const refCountEl = document.getElementById('refCount');
const refLinkTextEl = document.getElementById('refLinkText');
const refListEl = document.getElementById('refList');
const refEmptyEl = document.getElementById('refEmpty');

async function loadReferrals(){
  try{
    const init = tgInitData();
    if(!init) return;
    const res = await fetch('/api/referrals?initData=' + encodeURIComponent(init) + '&ts=' + Date.now());
    const data = await res.json();
    if(data.ok){
      const prevCount = REFERRALS.count || 0;
      REFERRALS = { count: data.count || 0, list: data.list || [], link: data.link || '' };
      if(prevCount && REFERRALS.count > prevCount){
        addNotification('win', 'Новый реферал', 'К тебе присоединился новый игрок по твоей ссылке!');
      }
      renderReferrals();
      renderRefsNav();
    }
  }catch(e){}
}

async function claimPendingCoins(){
  try{
    const init = tgInitData();
    if(!init) return;
    const res = await fetch('/api/claim-pending', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: init }),
    });
    const data = await res.json();
    if(data.ok && data.amount > 0){
      addCoins(data.amount);
      addNotification('win', 'Награда за рефералов', `Начислено +${data.amount} Coins`);
    }
  }catch(e){}
}

function streakPlural(n){
  const d = Math.abs(n) % 100, d1 = d % 10;
  if(d > 10 && d < 20) return 'дней';
  if(d1 === 1) return 'день';
  if(d1 > 1 && d1 < 5) return 'дня';
  return 'дней';
}

function refRowHTML(r){
  const name = r.name || 'Игрок';
  const avatar = r.avatar
    ? `<img src="${r.avatar}" alt="" referrerpolicy="no-referrer">`
    : (name.trim()[0] || '?').toUpperCase();
  const total = 7;
  const tasks = Math.min(r.tasks || 0, total);
  const pct = Math.round((tasks / total) * 100);
  const streak = r.streak || 0;
  return `<div class="ref-row">
    <div class="ref-avatar">${avatar}</div>
    <div class="ref-mid">
      <div class="ref-name">${name}</div>
      <div class="ref-progress-track"><div class="ref-progress-fill" style="width:${pct}%"></div></div>
      <div class="ref-meta">
        <span class="ref-meta-chip chip-task">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5 20 6v6c0 5-3.4 8.6-8 9.5C7.4 20.6 4 17 4 12V6l8-3.5z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>
          ${tasks} / ${total} заданий
        </span>
        <span class="ref-meta-chip chip-streak">
          <svg viewBox="0 0 24 24" fill="none"><path d="M12 1.5c1 3.1-2.1 4.3-2.8 7.3-.5 2.4.7 4.6 2.8 5.9-3.1 0-5-2-5.3-4.9-1.5 1.4-2.2 3.2-2.2 5A7.5 7.5 0 0 0 19.5 15c0-5.3-3.9-7.4-5.2-10.2-.7 1.9-1.9 3-3.4 3.5.6-3.7 0-6.3 1.1-6.8z" fill="#FF8A1E"/><path d="M12 5c.9 2.7-1.8 3.8-2.4 6.4-.4 2.1.6 4 2.4 5.1-2.7 0-4.4-1.8-4.7-4.3-1.2 1.2-1.9 2.8-1.9 4.3A6.6 6.6 0 0 0 12 23c3.7 0 6.6-3 6.6-6.7 0-4.7-3.5-6.5-4.6-9-.6 1.7-1.7 2.7-3 3.1.5-3.3 0-5.2 1-5.4z" fill="#FFC72C"/></svg>
          ${streak} ${streakPlural(streak)}
        </span>
      </div>
    </div>
  </div>`;
}

function renderReferrals(){
  if(refCountEl) refCountEl.textContent = REFERRALS.count;
  if(refLinkTextEl) refLinkTextEl.textContent = REFERRALS.link || '—';
  if(refListEl){
    refListEl.innerHTML = REFERRALS.list.map(refRowHTML).join('');
    if(refEmptyEl) refEmptyEl.classList.toggle('hidden', REFERRALS.list.length > 0);
  }
}

function copyRefLink(){
  if(!REFERRALS.link) return;
  const done = ok => showToast(ok ? 'Ссылка скопирована' : 'Не удалось скопировать', ok, 'win');
  try{
    if(tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(REFERRALS.link).then(() => done(true), () => fallbackCopy(REFERRALS.link, done));
    }else{
      fallbackCopy(REFERRALS.link, done);
    }
  }catch(e){ fallbackCopy(REFERRALS.link, done); }
}

function shareRefLink(){
  if(!REFERRALS.link) return;
  if(tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
  const text = 'Присоединяйся ко мне в Robux Game — собирай карточки и выводи Robux!';
  if(tg && tg.openTelegramLink){
    const shareUrl = 'https://t.me/share/url?url=' + encodeURIComponent(REFERRALS.link) + '&text=' + encodeURIComponent(text);
    tg.openTelegramLink(shareUrl);
    return;
  }
  if(navigator.share){
    navigator.share({ title: 'Robux Game', text, url: REFERRALS.link })
      .catch(() => {});
    return;
  }
  const done = ok => showToast(ok ? 'Ссылка скопирована' : 'Не удалось скопировать', ok, 'win');
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(REFERRALS.link).then(() => done(true), () => fallbackCopy(REFERRALS.link, done));
    }else{
      fallbackCopy(REFERRALS.link, done);
    }
  }catch(e){ fallbackCopy(REFERRALS.link, done); }
}

let progressSentAt = 0;
function reportProgress(){
  const init = tgInitData();
  if(!init) return;
  const now = Date.now();
  if(now - progressSentAt < 10000) return;
  progressSentAt = now;
  fetch('/api/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: init, tasks: tasksCompletedCount(), streak: state.streak.count || 0 }),
  }).catch(() => {});
}

/* =========================================================
   ВЫВОД — временная витрина прогресса (порог для наглядности)
   ========================================================= */
const WITHDRAW_GOAL = 40;
const wdProgressFillEl = document.getElementById('wdProgressFill');
const wdProgressTextEl = document.getElementById('wdProgressText');
const wdBalanceEl = document.getElementById('wdBalance');
const withdrawSubEl = document.getElementById('withdrawSub');

function renderWithdraw(){
  const cur = Math.min(state.balance, WITHDRAW_GOAL);
  const pct = Math.round((cur / WITHDRAW_GOAL) * 100);
  if(wdProgressFillEl) wdProgressFillEl.style.width = pct + '%';
  if(wdProgressTextEl) wdProgressTextEl.textContent = `${Math.round(cur * 100) / 100} / ${WITHDRAW_GOAL} Robux`;
  if(wdBalanceEl) wdBalanceEl.textContent = state.balance;
  if(withdrawSubEl) withdrawSubEl.textContent = `${Math.round(state.balance * 100) / 100} / ${WITHDRAW_GOAL} Robux`;
}

/* =========================================================
   СТЕЙКИНГ — обзор (переход к реальному инвентарю)
   ========================================================= */
const stakeOvCountEl = document.getElementById('stakeOvCount');
const stakeOvListEl = document.getElementById('stakeOvList');
const stakeOvEmptyEl = document.getElementById('stakeOvEmpty');
const stakingSubEl = document.getElementById('stakingSub');

function renderStakingOverview(){
  const staking = state.inventory.filter(c => c.status === 'staking');
  if(stakingSubEl) stakingSubEl.textContent = `${staking.length} ${staking.length === 1 ? 'карточка' : 'карточки'}`;
  if(stakeOvCountEl) stakeOvCountEl.textContent = staking.length;
  if(stakeOvListEl){
    stakeOvListEl.innerHTML = staking.map(c => {
      const st = TIER_STYLE[c.rarity] || TIER_STYLE.Basic;
      const done = c.until <= Date.now();
      return `<div class="so-row ${done ? 'so-done' : ''}" data-id="${c.id}">
        <img class="so-row-img" src="${c.img}" alt="${c.rarity}">
        <div class="so-row-mid">
          <div class="so-row-title">${c.rarity}</div>
          <div class="so-row-left">${done ? 'готово к стиранию' : `осталось ${fmtLeft(c.until)}`}</div>
        </div>
        <div class="so-row-reward">${STAKE_LABEL[c.period] || ''}</div>
      </div>`;
    }).join('');
    stakeOvListEl.querySelectorAll('.so-row').forEach(row => {
      row.addEventListener('click', () => {
        const card = state.inventory.find(c => c.id === row.dataset.id);
        if(card && card.status === 'staking') openStakeProgress(card);
      });
    });
    if(stakeOvEmptyEl) stakeOvEmptyEl.classList.toggle('hidden', staking.length > 0);
  }
}

/* =========================================================
   УВЕДОМЛЕНИЯ
   ========================================================= */
const notifBellBtn = document.getElementById('notifBellBtn');
const notifBadgeEl = document.getElementById('notifBadge');
const notifListEl = document.getElementById('notifList');
const notifEmptyEl = document.getElementById('notifEmpty');

function addNotification(icon, title, text){
  state.notifications.unshift({ id: `n${Date.now()}${Math.random().toString(16).slice(2, 6)}`, icon, title, text, ts: Date.now(), read: false });
  if(state.notifications.length > 40) state.notifications.length = 40;
  saveState();
  updateNotifBadge();
  if(notifSheet && notifSheet.classList.contains('open')) renderNotifications();
}

function updateNotifBadge(){
  if(!notifBadgeEl) return;
  const unread = state.notifications.filter(n => !n.read).length;
  notifBadgeEl.textContent = unread > 9 ? '9+' : String(unread);
  notifBadgeEl.classList.toggle('hidden', unread === 0);
}

function notifIconSvg(icon){
  const map = {
    win: '<path d="M8 21h8M12 17v4"/><path d="M7 4h10v6a5 5 0 0 1-10 0V4z"/><path d="M7 6H4v1a4 4 0 0 0 4 4M17 6h3v1a4 4 0 0 1-4 4"/>',
    refresh: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    gem: '<path d="M7 3h10l4 6-9 12L3 9z"/>',
  };
  return map[icon] || map.refresh;
}

function renderNotifications(){
  if(!notifListEl) return;
  notifListEl.innerHTML = state.notifications.map(n => {
    const d = new Date(n.ts);
    const time = d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return `<div class="notif-row ${n.read ? '' : 'unread'}">
      <div class="notif-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${notifIconSvg(n.icon)}</svg></div>
      <div class="notif-mid">
        <div class="notif-title">${n.title}</div>
        <div class="notif-text">${n.text}</div>
        <div class="notif-time">${time}</div>
      </div>
    </div>`;
  }).join('');
  if(notifEmptyEl) notifEmptyEl.classList.toggle('hidden', state.notifications.length > 0);
  state.notifications.forEach(n => n.read = true);
  saveState();
  updateNotifBadge();
}

/* =========================================================
   ИНВЕНТАРЬ (вкладка «Карточки») + СТЕЙКИНГ
   ========================================================= */
const inventoryListEl = document.getElementById('inventoryList');
const inventoryEmptyEl = document.getElementById('inventoryEmpty');
const invCountEl = document.getElementById('invCount');
const dailyResetBtn = document.getElementById('dailyResetBtn');

function fmtUntil(ts){
  return new Date(ts).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function fmtLeft(ts){
  let s = Math.max(0, Math.round((ts - Date.now()) / 1000));
  if(s < 60) return 'менее минуты';
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60);
  if(d) return `${d}д ${h}ч`;
  if(h) return `${h}ч ${m}м`;
  return `${m} мин`;
}

const INV_BG = {
  Basic:   ['#161D31', '#0C1220'],
  Silver:  ['#232B44', '#12182E'],
  Gold:    ['#2A240D', '#1E1906'],
  Diamond: ['#12233F', '#081226'],
  Mythic:  ['#221633', '#1A1126'],
};

function renderInventory(){
  invCountEl.textContent = state.inventory.length;
  const cards = state.inventory.slice().reverse();
  inventoryListEl.innerHTML = '';
  inventoryEmptyEl.classList.toggle('hidden', cards.length > 0);
  cards.forEach((card, i) => {
    const st = TIER_STYLE[card.rarity] || TIER_STYLE.Basic;
    const bg = INV_BG[card.rarity] || INV_BG.Basic;
    const staked = card.status === 'staking';
    const stakedDone = staked && card.until <= Date.now();
    const el = document.createElement('div');
    el.className = 'inv-tile' + (card.status === 'used' ? ' used' : '') + (staked ? (stakedDone ? ' done' : ' staking') : '');
    el.style.setProperty('--t1', st.colors[0]);
    el.style.setProperty('--t2', st.colors[1]);
    el.style.setProperty('--t3', st.colors[2] || st.colors[1]);
    el.style.setProperty('--t1g', `${st.colors[0]}55`);
    el.style.setProperty('--bg1', bg[0]);
    el.style.setProperty('--bg2', bg[1]);
    el.style.animationDelay = `${i * 70}ms`;
    const statusText = staked ? (stakedDone ? 'Стейкинг завершён' : 'В стейкинге') : (card.status === 'used' ? 'Использована' : 'Доступна');
    const statusCls = stakedDone ? 'done' : (staked ? 'staking' : (card.status === 'used' ? 'used' : ''));
    el.innerHTML =
      `<div class="it-top">` +
        `<div class="it-card">` +
          `<svg class="it-rays" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3.5 20.5 20.5 3.5"/><path d="M8.5 21.5l3.4-5.6"/><path d="M21.5 8.5l-5.6-3.4"/></svg>` +
          `<svg class="it-spark" viewBox="0 0 24 24"><path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6-5.6-1.9 5.6-1.9z" fill="currentColor"/></svg>` +
          `<img class="it-png" src="${card.img}" alt="${card.rarity}">` +
        `</div>` +
        `<div class="it-reward">` +
          `<div class="it-num">${card.reward}</div>` +
          `<div class="it-sub">Robux</div>` +
        `</div>` +
      `</div>` +
      `<div class="it-title">${card.rarity}</div>` +
      `<div class="it-status ${statusCls}">${statusText}</div>` +
      (staked ? `<div class="it-until">${stakedDone ? 'Можно стереть награду' : 'Осталось ' + fmtLeft(card.until)}</div>` : '') +
      `<div class="it-act">` +
        (card.status === 'available'
          ? `<button class="stake-btn" data-id="${card.id}" data-i="${i}">Стейкинг</button>`
          : card.status === 'staking'
            ? `<button class="stake-btn off" data-id="${card.id}" data-i="${i}">Прогресс</button>`
            : `<span class="it-used-tag">×</span>`) +
      `</div>`;
    inventoryListEl.appendChild(el);
  });
}

inventoryListEl.addEventListener('click', e => {
  const btn = e.target.closest('.stake-btn');
  if(!btn || !btn.dataset.id) return;
  let card = state.inventory.find(c => c.id === btn.dataset.id);
  if(!card && btn.dataset.i !== undefined){
    const cards = state.inventory.slice().reverse();
    card = cards[Number(btn.dataset.i)];
  }
  if(!card) return;
  if(card.status === 'staking') openStakeProgress(card);
  else openStake(card);
});

function resetDaily(){
  state.daily = { date: todayKey(), selectedId: null, revealed: false, collected: false, rarity: null, reward: 0 };
  saveState();
  renderDaily();
  showToast('Ежедневные карточки сброшены', true, 'refresh');
}
dailyResetBtn.addEventListener('click', resetDaily);

/* --- окно стейкинга --- */
const stakeSheet = document.getElementById('stakeSheet');
const stakeBackdrop = document.getElementById('stakeBackdrop');
const stakeClose = document.getElementById('stakeClose');
const stakePreview = document.getElementById('stakePreview');
const stakeOptions = document.getElementById('stakeOptions');
let stakeCard = null;

function openStake(card){
  if(!card || card.status !== 'available') return;
  stakeCard = card;
  const st = TIER_STYLE[card.rarity] || TIER_STYLE.Basic;
  stakePreview.innerHTML =
    `<img class="stake-png tier-shine" src="${card.img}" alt="${card.rarity}" style="${tierVars(card.rarity)}">` +
    `<div class="stake-title">${card.rarity}</div>` +
    `<div class="stake-sub">Сумма карточки — <b>+${card.reward} Robux</b></div>`;
  stakeOptions.innerHTML = '';
  const stake = (tierCfg(card.rarity).stake) || {};
  Object.keys(STAKE_LABEL).forEach(period => {
    const pct = stake[period] || 0;
    const plus = Math.round(card.reward * pct / 100);
    const opt = document.createElement('button');
    opt.className = 'stake-opt';
    opt.innerHTML =
      `<span class="so-dot"></span>` +
      `<span class="so-period">${STAKE_LABEL[period]}</span>` +
      `<span class="so-meta"><span class="so-pct">+${pct}%</span><span class="so-plus">+${plus} Robux</span></span>`;
    opt.addEventListener('click', () => confirmStake(period));
    stakeOptions.appendChild(opt);
  });
  openModal(stakeSheet, stakeBackdrop);
}

function confirmStake(period){
  const card = stakeCard;
  if(!card) return;
  card.status = 'staking';
  card.period = period;
  card.pct = (tierCfg(card.rarity).stake || {})[period] || 0;
  card.start = Date.now();
  card.until = card.start + STAKE_MS[period];
  saveState();
  closeModal(stakeSheet, stakeBackdrop);
  renderInventory();
  if(typeof renderTasks === 'function') renderTasks();
  if(typeof renderStakingOverview === 'function') renderStakingOverview();
  showToast('Карточка отправлена в стейкинг', true, 'win');
}

function withdrawStake(card){
  openStakeProgress(card);
}

/* =========================================================
   СТЕЙКИНГ — ПРОГРЕСС (08): текущий стейкинг карточки
   Robux начисляются ТОЛЬКО при стирании карточки
   ========================================================= */
const stakeProgSheet = document.getElementById('stakeProgSheet');
const stakeProgBackdrop = document.getElementById('stakeProgBackdrop');
const stakeProgClose = document.getElementById('stakeProgClose');
const spCardEl = document.getElementById('spCard');
const spPeriodEl = document.getElementById('spPeriod');
const spTimeEl = document.getElementById('spTime');
const spProgressFillEl = document.getElementById('spProgressFill');
const spProgressTextEl = document.getElementById('spProgressText');
const spRewardEl = document.getElementById('spReward');
const spScratchBtn = document.getElementById('spScratchBtn');
const spKeepBtn = document.getElementById('spKeepBtn');
const spAbortBtn = document.getElementById('spAbortBtn');
const spConfirm = document.getElementById('spConfirm');
const spConfirmText = document.getElementById('spConfirmText');
const spConfirmYes = document.getElementById('spConfirmYes');
const spConfirmNo = document.getElementById('spConfirmNo');

let stakeProgCard = null;
let stakeProgTimer = null;

function stakeRange(card, pct){
  const min = Math.round(card.reward || 0);
  const bonus = Math.round(min * (pct || 0) / 100);
  return { min, max: min + bonus };
}

function stakeElapsed(card){
  const start = card.start || (card.until - STAKE_MS[card.period]);
  const total = Math.max(1, card.until - start);
  const elapsed = Math.min(Math.max(0, Date.now() - start), total);
  return { start, total, elapsed, pct: total ? (elapsed / total) * 100 : 0 };
}

function fmtStakeLeft(ms){
  if(ms <= 0) return 'Стейкинг завершён';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = n => String(n).padStart(2, '0');
  return d ? `${d}д ${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

let spRenderSig = null;
function renderStakeProgress(){
  const card = stakeProgCard;
  if(!card) return;
  const st = TIER_STYLE[card.rarity] || TIER_STYLE.Basic;
  const { pct } = stakeElapsed(card);
  const done = pct >= 100;
  const rp = Math.round(pct);
  const sig = `${done}|${rp}|${card.period}|${card.rarity}`;
  if(spRenderSig !== sig){
    spRenderSig = sig;
    if(spCardEl){
      spCardEl.innerHTML =
        `<img src="${card.img}" alt="${card.rarity}">` +
        `<div class="sp-card-name">${card.rarity}</div>`;
      const glow = st.colors[0] || '#9BA7B6';
      spCardEl.style.setProperty('--t1', done ? '#4FD18B' : glow);
      spCardEl.style.setProperty('--t1b', done ? 'rgba(79,209,139,.8)' : `${glow}aa`);
      spCardEl.style.setProperty('--t1g', done ? 'rgba(79,209,139,.5)' : `${glow}55`);
    }
    if(spPeriodEl) spPeriodEl.textContent = STAKE_LABEL[card.period] || card.period;
    const r = stakeRange(card, card.pct);
    if(spRewardEl) spRewardEl.textContent = `${r.min}–${r.max} Robux`;
    if(spProgressFillEl) spProgressFillEl.style.width = `${rp}%`;
    if(spProgressTextEl) spProgressTextEl.textContent = `${rp}%`;
    if(spScratchBtn) spScratchBtn.classList.toggle('hidden', !done);
    if(spKeepBtn) spKeepBtn.classList.toggle('hidden', done);
    if(spAbortBtn) spAbortBtn.classList.toggle('hidden', done);
  }
  if(spTimeEl){
    const pad = n => String(n).padStart(2, '0');
    if(done){
      spTimeEl.innerHTML =
        `<span class="sp-clock done">` +
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/></svg>` +
        `<b>Стейкинг завершён</b></span>`;
    }else{
      const leftMs = Math.max(0, card.until - Date.now());
      let s = Math.floor(leftMs / 1000);
      const d = Math.floor(s / 86400); s %= 86400;
      const h = Math.floor(s / 3600); s %= 3600;
      const m = Math.floor(s / 60); const sec = s % 60;
      spTimeEl.innerHTML =
        `<span class="sp-clock">` +
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>` +
        (d > 0 ? `<b class="sc-days">${d}<em>дн</em></b><i>:</i>` : '') +
        `<b>${pad(h)}</b><i>:</i><b>${pad(m)}</b><i>:</i><b>${pad(sec)}</b>` +
        `</span>`;
    }
    spTimeEl.classList.toggle('done', done);
  }
}

function openStakeProgress(card){
  if(!card || card.status !== 'staking') return;
  stakeProgCard = card;
  spConfirm.classList.add('hidden');
  renderStakeProgress();
  openModal(stakeProgSheet, stakeProgBackdrop);
  if(stakeProgTimer) clearInterval(stakeProgTimer);
  stakeProgTimer = setInterval(renderStakeProgress, 1000);
}

function closeStakeProgress(){
  closeModal(stakeProgSheet, stakeProgBackdrop);
  if(stakeProgTimer){ clearInterval(stakeProgTimer); stakeProgTimer = null; }
  stakeProgCard = null;
}

function destroyStakedCard(value){
  const idx = state.inventory.findIndex(c => c.id === stakeProgCard.id);
  const rarity = idx >= 0 ? (state.inventory[idx].rarity || '') : '';
  if(idx >= 0) state.inventory.splice(idx, 1);
  stakeProgCard = null;
  saveState();
  logActivity('stake', rarity ? `Карточка стёрта: ${rarity} (+${value} Robux)` : `Стейкинг: +${value} Robux`);
  renderInventory();
  if(typeof renderStakingOverview === 'function') renderStakingOverview();
  if(typeof renderTasks === 'function') renderTasks();
  addBalance(value);
  closeStakeProgress();
  showToast(`+${value} Robux — карточка стёрта`, true, 'win');
}

function scratchStake(){
  const card = stakeProgCard;
  if(!card || card.status !== 'staking') return;
  const { pct } = stakeElapsed(card);
  if(pct < 100) return;
  const r = stakeRange(card, card.pct);
  const value = r.min + Math.floor(Math.random() * (r.max - r.min + 1));
  destroyStakedCard(value);
}

function abortStake(){
  const card = stakeProgCard;
  if(!card || card.status !== 'staking') return;
  const { pct } = stakeElapsed(card);
  const partialPct = Math.round((card.pct || 0) * pct / 100);
  const r = stakeRange(card, partialPct);
  spConfirmText.textContent = `Прервать стейкинг? Карточка будет стёрта, награда из диапазона ${r.min}–${r.max} Robux. После прерывания стейкинг нельзя восстановить.`;
  spConfirmYes.dataset.min = r.min;
  spConfirmYes.dataset.max = r.max;
  spConfirm.classList.remove('hidden');
}

spScratchBtn.addEventListener('click', scratchStake);
spKeepBtn.addEventListener('click', closeStakeProgress);
spAbortBtn.addEventListener('click', abortStake);
spConfirmYes.addEventListener('click', () => {
  const min = Number(spConfirmYes.dataset.min || 0);
  const max = Number(spConfirmYes.dataset.max || 0);
  const value = min + Math.floor(Math.random() * (Math.max(1, max - min) + 1));
  destroyStakedCard(value);
});
spConfirmNo.addEventListener('click', () => spConfirm.classList.add('hidden'));
stakeProgClose.addEventListener('click', closeStakeProgress);
stakeProgBackdrop.addEventListener('click', closeStakeProgress);

/* =========================================================
   АДМИН-ПАНЕЛЬ: суммы выпадения и проценты стейкинга
   ========================================================= */
const adminSheet = document.getElementById('adminSheet');
const adminBackdrop = document.getElementById('adminBackdrop');
const adminClose = document.getElementById('adminClose');
const adminBtn = document.getElementById('adminBtn');
const adminTiersEl = document.getElementById('adminTiers');
const adminSaveBtn = document.getElementById('adminSave');
const adminForm = [];

function renderAdminTiers(){
  adminTiersEl.innerHTML = '';
  adminForm.length = 0;
  TIER_ORDER.forEach(tier => {
    const st = TIER_STYLE[tier];
    const cfg = tierCfg(tier);
    const card = document.createElement('div');
    card.className = 'admin-tier';
    card.innerHTML =
      `<div class="admin-tier-top">` +
        `<img class="at-img tier-shine" src="${st.img}" alt="${tier}" style="${tierVars(tier)}">` +
        `<div><div class="at-name">${tier}</div><div class="at-sub">Сумма выпадения · ${cfg.reward} Robux</div></div>` +
      `</div>` +
      `<div class="admin-tier-grid">` +
        `<div class="at-field"><label>Сумма выпадения, Robux</label>` +
          `<input class="at-input" type="number" min="1" max="100000" step="1" data-tier="${tier}" data-f="reward" value="${cfg.reward}"></div>` +
        `<div class="at-field"><label>Шанс выпадения, %</label>` +
          `<input class="at-input" type="number" min="0.1" max="100" step="0.1" data-tier="${tier}" data-f="chance" value="${cfg.chance}"></div>` +
        Object.keys(STAKE_LABEL).map(p =>
          `<div class="at-field"><label>Стейкинг ${STAKE_LABEL[p].toLowerCase()} +%</label>` +
          `<input class="at-input" type="number" min="0" max="1000" step="0.25" data-tier="${tier}" data-f="${p}" value="${cfg.stake[p]}"></div>`
        ).join('') +
      `</div>`;
    card.querySelectorAll('.at-input').forEach(inp => {
      inp.addEventListener('input', () => inp.classList.add('dirty'));
      adminForm.push(inp);
    });
    adminTiersEl.appendChild(card);
  });
  adminSaveBtn.innerHTML =
    `<svg class="as-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>` +
    `Сохранить изменения`;
}

function saveAdmin(){
  const init = tgInitData();
  if(!init){ showToast('Ошибка авторизации', false); return; }
  const tiers = {};
  const initTier = name => {
    if(!tiers[name]){
      const base = tierCfg(name);
      tiers[name] = {
        reward: base.reward,
        chance: base.chance,
        stake: Object.assign({}, base.stake),
      };
    }
    return tiers[name];
  };
  for(const inp of adminForm){
    const val = parseFloat(inp.value);
    if(!isFinite(val) || val < 0){
      inp.classList.add('dirty');
      showToast('Проверь заполнение полей', false);
      return;
    }
    const name = inp.dataset.tier;
    if(inp.dataset.f === 'reward'){
      if(val < 1){ inp.classList.add('dirty'); showToast('Сумма не может быть меньше 1', false); return; }
      initTier(name).reward = val;
    }else if(inp.dataset.f === 'chance'){
      if(val < 0.1 || val > 100){ inp.classList.add('dirty'); showToast('Шанс — от 0.1 до 100%', false); return; }
      initTier(name).chance = val;
    }else{
      initTier(name).stake[inp.dataset.f] = val;
    }
  }
  adminSaveBtn.classList.add('saving');
  fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: init, tiers })
  })
    .then(r => r.json())
    .then(data => {
      adminSaveBtn.classList.remove('saving');
      if(data.ok && data.config){
        APP_CONFIG = data.config;
        adminSaveBtn.classList.add('done');
        adminSaveBtn.innerHTML =
          `<svg class="as-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>` +
          `Сохранено`;
        setTimeout(() => {
          adminSaveBtn.classList.remove('done');
          renderAdminTiers();
        }, 1300);
        document.querySelectorAll('.at-input').forEach(i => i.classList.remove('dirty'));
        showToast('Настройки карточек сохранены', true, 'refresh');
      }else{
        showToast('Не удалось сохранить настройки', false);
      }
    })
    .catch(() => { adminSaveBtn.classList.remove('saving'); showToast('Ошибка сети', false); });
}

function openAdmin(){
  renderAdminTiers();
  openModal(adminSheet, adminBackdrop);
}

/* =========================================================
   АДМИНКА: шестерёнка в профиле — управление админами
   и принудительный сброс ежедневных карточек игрокам
   ========================================================= */
let ADMINS = [];
const stAdminBtn = document.getElementById('stAdminBtn');
const adminPanelSheet = document.getElementById('adminPanelSheet');
const adminPanelBackdrop = document.getElementById('adminPanelBackdrop');
const adminPanelClose = document.getElementById('adminPanelClose');
const adminListEl = document.getElementById('adminList');
const adminAddInput = document.getElementById('adminAddInput');
const adminAddBtn = document.getElementById('adminAddBtn');
const dailyResetUserInput = document.getElementById('dailyResetUserInput');
const dailyResetUserBtn = document.getElementById('dailyResetUserBtn');

function isPriv(){
  return !!(PROFILE && (OWNER_IDS.includes(PROFILE.id) || ADMINS.includes(PROFILE.id)));
}

async function loadAdmins(){
  try{
    const init = tgInitData();
    if(!init) return;
    const res = await fetch('/api/admins?initData=' + encodeURIComponent(init) + '&ts=' + Date.now());
    const data = await res.json();
    if(data.ok && Array.isArray(data.adminIds)){
      ADMINS = data.adminIds;
      if(isPriv() && stAdminBtn) stAdminBtn.classList.remove('hidden');
    }
  }catch(e){}
}

async function loadDailyPointer(){
  try{
    const init = tgInitData();
    if(!init) return;
    const res = await fetch('/api/daily-pointer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: init }),
    });
    const data = await res.json();
    if(data.ok && typeof data.resetTs === 'number'){
      if(data.resetTs > (state.dailyResetTs || 0)){
        state.dailyResetTs = data.resetTs;
        state.daily = { date: todayKey(), selectedId: null, revealed: false, collected: false, rarity: null, reward: 0 };
        saveState();
        renderDaily();
        showToast('Карточки обновлены администратором', true, 'refresh');
        addNotification('refresh', 'Карточки обновлены', 'Администратор сбросил твои ежедневные карточки — можно выбирать заново');
      }
    }
  }catch(e){}
}

function renderAdminList(){
  const ids = OWNER_IDS.concat(ADMINS);
  adminListEl.innerHTML = ids.map(id => {
    const isOwner = OWNER_IDS.includes(id);
    return `<div class="ap-item">
      <span class="ap-id">${id}${isOwner ? ' <em>владелец</em>' : ''}</span>
      ${isOwner ? '' : `<button class="ap-mini" data-rm="${id}">Убрать</button>`}
    </div>`;
  }).join('');
  adminListEl.querySelectorAll('.ap-mini').forEach(b =>
    b.addEventListener('click', () => removeAdmin(Number(b.dataset.rm))));
}

function postAdmin(action, userId, okMsg, errHtml){
  const init = tgInitData();
  if(!init){ showToast('Ошибка авторизации', false); return; }
  fetch('/api/admins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: init, action, userId })
  })
    .then(r => r.json())
    .then(data => {
      if(data.ok && Array.isArray(data.adminIds)){
        ADMINS = data.adminIds;
        renderAdminList();
        showToast(okMsg, true, 'refresh');
      }else{
        showToast(errHtml, false);
      }
    })
    .catch(() => showToast('Ошибка сети', false));
}

function addAdmin(){
  const id = parseInt(adminAddInput.value, 10);
  if(!isFinite(id) || id <= 0){ showToast('Введи корректный ID игрока', false); return; }
  postAdmin('add', id, 'Админ добавлен', 'Не удалось добавить админа');
  adminAddInput.value = '';
}

function removeAdmin(id){
  postAdmin('remove', id, 'Админ убран', 'Не удалось убрать админа');
}

function resetUserDaily(){
  const id = parseInt(dailyResetUserInput.value, 10);
  if(!isFinite(id) || id <= 0){ showToast('Введи корректный ID игрока', false); return; }
  const init = tgInitData();
  if(!init){ showToast('Ошибка авторизации', false); return; }
  dailyResetUserBtn.classList.add('saving');
  fetch('/api/daily-reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: init, userId: id })
  })
    .then(r => r.json())
    .then(data => {
      if(data.ok){
        showToast(`Карточки игрока ${id} сброшены`, true, 'refresh');
        dailyResetUserInput.value = '';
      }else{
        showToast('Не удалось сбросить', false);
      }
    })
    .catch(() => showToast('Ошибка сети', false))
    .finally(() => dailyResetUserBtn.classList.remove('saving'));
}

function openAdminPanel(){
  if(!isPriv()) return;
  renderAdminList();
  openModal(adminPanelSheet, adminPanelBackdrop);
}

stAdminBtn.addEventListener('click', openAdminPanel);
adminAddBtn.addEventListener('click', addAdmin);
dailyResetUserBtn.addEventListener('click', resetUserDaily);

/* клики админки/пользователей через делегирование — работает
   даже если прямые слушатели потерялись из-за пересоздания DOM */
document.addEventListener('click', e => {
  const el = e.target.closest('#adminPanelClose, #usersClose, #adminUsersBtn, #usersBackBtn, #adminPanelBackdrop, #usersBackdrop');
  if(!el) return;
  switch(el.id){
    case 'adminPanelClose':
    case 'adminPanelBackdrop':
      closeModal(adminPanelSheet, adminPanelBackdrop);
      break;
    case 'usersClose':
    case 'usersBackdrop':
      closeModal(usersSheet, usersBackdrop);
      break;
    case 'adminUsersBtn':
      openUsersList();
      break;
    case 'usersBackBtn':
      backToAdmin();
      break;
  }
});

/* =========================================================
   ОКНО ПОЛЬЗОВАТЕЛЕЙ: аватар, имя, ID, баланс + копирование
   ========================================================= */
const usersBackdrop = document.getElementById('usersBackdrop');
const usersSheet = document.getElementById('usersSheet');
const usersClose = document.getElementById('usersClose');
const usersBackBtn = document.getElementById('usersBackBtn');
const adminUsersBtn = document.getElementById('adminUsersBtn');
const usersListEl = document.getElementById('usersList');

async function renderUsersList(){
  const init = tgInitData();
  if(!init){ showToast('Ошибка авторизации', false); return; }
  usersListEl.innerHTML = '<div class="ap-note">Загрузка…</div>';
  try{
    const res = await fetch('/api/users?initData=' + encodeURIComponent(init) + '&ts=' + Date.now());
    const data = await res.json();
    if(!data.ok || !Array.isArray(data.users)){
      usersListEl.innerHTML = data.error === 'Forbidden'
        ? '<div class="ap-note">Нет доступа</div>'
        : '<div class="ap-note">Не удалось загрузить список</div>';
      return;
    }
    if(!data.users.length){
      usersListEl.innerHTML = '<div class="ap-note">Пока нет игроков</div>';
      return;
    }
    usersListEl.innerHTML = data.users.map(u => {
      const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Без имени';
      const initials = name.split(' ').slice(0, 2).map(w => (w[0] || '').toUpperCase()).join('');
      const bal = Math.round(u.balance || 0).toLocaleString('ru-RU');
      return `<div class="us-item" data-id="${u.id}">
        <div class="us-avatar" style="background:linear-gradient(135deg,#4E9BE0,#9FB0D8)">
          ${u.photo_url ? `<img src="${u.photo_url}" alt="" referrerpolicy="no-referrer">` : `<span>${initials || '—'}</span>`}
        </div>
        <div class="us-info">
          <div class="us-name">${name}</div>
          <div class="us-sub">${u.username ? '@' + u.username : ''} · ID ${u.id}</div>
        </div>
        <div class="us-bal">
          <span class="us-bal-num">${bal}</span>
          <span class="us-bal-label">Robux</span>
        </div>
      </div>`;
    }).join('');
    usersListEl.querySelectorAll('.us-item').forEach(row =>
      row.addEventListener('click', () => copyUserId(row.dataset.id)));
  }catch(e){
    usersListEl.innerHTML = '<div class="ap-note">Не удалось загрузить список</div>';
  }
}

function copyUserId(id){
  const done = ok => showToast(ok ? `ID ${id} скопирован` : `ID: ${id}`, true);
  try{
    const tgW = window.Telegram && window.Telegram.WebApp;
    if(tgW && tgW.ClipboardText && tgW.ClipboardText.set){
      tgW.ClipboardText.set(String(id));
      done(true);
      return;
    }
  }catch(e){}
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(String(id)).then(() => done(true), () => fallbackCopy(id, done));
      return;
    }
  }catch(e){}
  fallbackCopy(id, done);
}

function fallbackCopy(id, done){
  try{
    const ta = document.createElement('textarea');
    ta.value = String(id);
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    let ok = false;
    try{ ok = document.execCommand('copy'); }catch(e){}
    ta.remove();
    done(ok);
  }catch(e){
    done(false);
  }
}

function openUsersList(){
  closeModal(adminPanelSheet, adminPanelBackdrop);
  renderUsersList();
  openModal(usersSheet, usersBackdrop);
}

function backToAdmin(){
  closeModal(usersSheet, usersBackdrop);
  renderAdminList();
  openModal(adminPanelSheet, adminPanelBackdrop);
}

/* =========================================================
   НОВЫЕ ОКНА ГЛАВНОЙ: уведомления / задания / рефералы /
   стейкинг-обзор / вывод
   ========================================================= */
const notifSheet = document.getElementById('notifSheet');
const notifBackdrop = document.getElementById('notifBackdrop');
const notifCloseBtn = document.getElementById('notifClose');

const tasksSheet = document.getElementById('tasksSheet');
const tasksBackdrop = document.getElementById('tasksBackdrop');
const tasksCloseBtn = document.getElementById('tasksClose');
const tasksBtnMain = document.getElementById('tasksBtn');

const refsSheet = document.getElementById('refsSheet');
const refsBackdrop = document.getElementById('refsBackdrop');
const refsCloseBtn = document.getElementById('refsClose');
const refsBtnMain = document.getElementById('refsBtnMain');
const refCountBigEl = document.getElementById('refCountBig');
const refCopyBtn = document.getElementById('refCopyBtn');

const stakeOvSheet = document.getElementById('stakeOvSheet');
const stakeOvBackdrop = document.getElementById('stakeOvBackdrop');
const stakeOvCloseBtn = document.getElementById('stakeOvClose');
const stakingBtnMain = document.getElementById('stakingBtn');

const withdrawSheet = document.getElementById('withdrawSheet');
const withdrawBackdrop = document.getElementById('withdrawBackdrop');
const withdrawCloseBtn = document.getElementById('withdrawClose');
const withdrawBtnMain = document.getElementById('withdrawBtn');

notifBellBtn.addEventListener('click', () => { renderNotifications(); openModal(notifSheet, notifBackdrop); });
notifCloseBtn.addEventListener('click', () => closeModal(notifSheet, notifBackdrop));
notifBackdrop.addEventListener('click', () => closeModal(notifSheet, notifBackdrop));

tasksBtnMain.addEventListener('click', () => goToNav('tasks'));
tasksCloseBtn.addEventListener('click', () => closeModal(tasksSheet, tasksBackdrop));
tasksBackdrop.addEventListener('click', () => closeModal(tasksSheet, tasksBackdrop));

refsBtnMain.addEventListener('click', () => goToNav('refs'));
refsCloseBtn.addEventListener('click', () => closeModal(refsSheet, refsBackdrop));
refsBackdrop.addEventListener('click', () => closeModal(refsSheet, refsBackdrop));
refCopyBtn.addEventListener('click', copyRefLink);

stakingBtnMain.addEventListener('click', () => goToNav('cards'));
stakeOvCloseBtn.addEventListener('click', () => closeModal(stakeOvSheet, stakeOvBackdrop));
stakeOvBackdrop.addEventListener('click', () => closeModal(stakeOvSheet, stakeOvBackdrop));

withdrawBtnMain.addEventListener('click', () => { renderWithdraw(); openModal(withdrawSheet, withdrawBackdrop); });
withdrawCloseBtn.addEventListener('click', () => closeModal(withdrawSheet, withdrawBackdrop));
withdrawBackdrop.addEventListener('click', () => closeModal(withdrawSheet, withdrawBackdrop));

/* =========================================================
   РЕАЛТАЙМ: если админ сбросил карточки — обновимся сами,
   без перезахода в мини-апп (опрос + при фокусе вкладки)
   ========================================================= */
let realtimeTimer = null;
function startRealtime(){
  stopRealtime();
  realtimeTimer = setInterval(() => { loadDailyPointer(); loadReferrals(); }, 5000);
}
function stopRealtime(){
  if(realtimeTimer){ clearInterval(realtimeTimer); realtimeTimer = null; }
}
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'visible'){ loadDailyPointer(); loadReferrals(); }
});
window.addEventListener('focus', () => { loadDailyPointer(); loadReferrals(); });

/* =========================================================
   КОНФИГ СЕРВЕРА + ПРЕДЗАГРУЗКА
   ========================================================= */
async function loadConfig(){
  try{
    const res = await fetch('/api/config?ts=' + Date.now());
    const data = await res.json();
    if(data.ok && data.config) APP_CONFIG = data.config;
  }catch(e){}
}

function preloadPNGs(){
  return Promise.all(TIER_ORDER.map(t => new Promise(res => {
    const im = new Image();
    im.onload = im.onerror = res;
    im.src = TIER_STYLE[t].img;
  })));
}

/* ---- переключение экранов нижней навигации (контент рендерится один раз) ---- */
function switchView(view){
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  const map = { main: 'viewMain', cards: 'viewCards', refs: 'viewRefs', tasks: 'viewTasks', profile: 'viewProfile' };
  const target = document.getElementById(map[view] || 'viewMain');
  if(target) target.classList.remove('hidden');
  if(view === 'tasks'){ renderTasks(); renderTasksNav(); }
  if(view === 'refs'){ renderReferrals(); renderRefsNav(); loadReferrals(); }
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
tabIndicator.style.left = `${tabBtnLeft(Math.round(tabPosIdx))}px`;
tabIndicator.style.transform = 'none';
window.addEventListener('resize', () => {
  const idx = Math.round(tabPosIdx);
  tabPosIdx = tabBtnLeft(idx);
  tabIndicator.style.left = `${tabPosIdx}px`;
});

function renderTasksNav(){
  const list = document.getElementById('tasksListNav');
  if(!list) return;
  const done = tasksCompletedCount();
  const p = document.getElementById('tasksProgressNav'); if(p) p.textContent = `${done} / ${TASKS.length}`;
  list.innerHTML = tasksListEl ? tasksListEl.innerHTML : '';
  list.querySelectorAll('.task-claim-btn').forEach(b => b.addEventListener('click', () => { claimTask(b.dataset.task); renderTasksNav(); }));
}
function renderRefsNav(){
  const count = document.getElementById('refCountNav'); if(count) count.textContent = REFERRALS.count;
  const link = document.getElementById('refLinkTextNav'); if(link) link.textContent = REFERRALS.link || '—';
  const list = document.getElementById('refListNav'); if(list) list.innerHTML = REFERRALS.list.map(refRowHTML).join('');
  const empty = document.getElementById('refEmptyNav'); if(empty) empty.classList.toggle('hidden', REFERRALS.list.length > 0);
}
function goToNav(view){
  const idx = navBtns.findIndex(b => b.dataset.view === view);
  if(idx < 0) return;
  closeAllSheets();
  activeIdx = idx;
  navBtns.forEach(b => b.classList.toggle('active', b === navBtns[idx]));
  moveNavIndicator(idx, true);
  switchView(view);
  if(view === 'tasks') renderTasksNav();
  if(view === 'refs') renderRefsNav();
}

const refShareBtnNav = document.getElementById('refShareBtnNav');
document.getElementById('refCopyBtnNav')?.addEventListener('click', copyRefLink);

navBtns.forEach((btn, idx) => {
  btn.addEventListener('click', () => {
    if(activeIdx === idx) return; // уже в этой категории — повторные клики игнорируем
    closeAllSheets();
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
  tg.setHeaderColor('#081018');
  tg.setBackgroundColor('#081018');
}

collectBtnEl.addEventListener('click', collectDailyCard);
rrBtn.addEventListener('click', () => { closeModal(rrSheet, rrBackdrop); collectDailyCard(); });
rrBackdrop.addEventListener('click', () => closeResultWindow());

stakeClose.addEventListener('click', () => closeModal(stakeSheet, stakeBackdrop));
stakeBackdrop.addEventListener('click', () => closeModal(stakeSheet, stakeBackdrop));
adminClose.addEventListener('click', () => closeModal(adminSheet, adminBackdrop));
adminBackdrop.addEventListener('click', () => closeModal(adminSheet, adminBackdrop));
adminSaveBtn.addEventListener('click', saveAdmin);
adminBtn.addEventListener('click', openAdmin);

applySelected();
balanceValueEl.textContent = state.balance;
if(coinsValueEl) coinsValueEl.textContent = state.coins;

/* =========================================================
   Профиль-меню: Настройки / История / Поддержка / О приложении
   ========================================================= */
const prefixImgEl = document.getElementById('prefixImg');
const heroPrefixImgEl = document.getElementById('heroPrefixImg');
const settingsSheetEl = document.getElementById('settingsSheet');
const settingsBackdropEl = document.getElementById('settingsBackdrop');
const settingsCloseEl = document.getElementById('settingsClose');
const activitySheetEl = document.getElementById('activitySheet');
const activityBackdropEl = document.getElementById('activityBackdrop');
const activityCloseEl = document.getElementById('activityClose');
const supportSheetEl = document.getElementById('supportSheet');
const supportBackdropEl = document.getElementById('supportBackdrop');
const supportCloseEl = document.getElementById('supportClose');
const aboutSheetEl = document.getElementById('aboutSheet');
const aboutBackdropEl = document.getElementById('aboutBackdrop');
const aboutCloseEl = document.getElementById('aboutClose');

document.querySelectorAll('.pf-item').forEach(item => {
  item.addEventListener('click', () => {
    const id = item.dataset.open;
    if(id === 'settingsSheet'){
      openModal(settingsSheetEl, settingsBackdropEl);
      renderSettings();
    }else if(id === 'activitySheet'){
      renderActivity();
      openModal(activitySheetEl, activityBackdropEl);
    }else if(id === 'supportSheet'){
      openModal(supportSheetEl, supportBackdropEl);
    }else if(id === 'aboutSheet'){
      openModal(aboutSheetEl, aboutBackdropEl);
    }
  });
});
settingsCloseEl.addEventListener('click', () => closeModal(settingsSheetEl, settingsBackdropEl));
settingsBackdropEl.addEventListener('click', () => closeModal(settingsSheetEl, settingsBackdropEl));
activityCloseEl.addEventListener('click', () => closeModal(activitySheetEl, activityBackdropEl));
activityBackdropEl.addEventListener('click', () => closeModal(activitySheetEl, activityBackdropEl));
supportCloseEl.addEventListener('click', () => closeModal(supportSheetEl, supportBackdropEl));
supportBackdropEl.addEventListener('click', () => closeModal(supportSheetEl, supportBackdropEl));
aboutCloseEl.addEventListener('click', () => closeModal(aboutSheetEl, aboutBackdropEl));
aboutBackdropEl.addEventListener('click', () => closeModal(aboutSheetEl, aboutBackdropEl));

const SUPPORT_TG = 'https://t.me/darkgeniy';
document.getElementById('supportWriteBtn').addEventListener('click', e => {
  e.preventDefault();
  if(tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
  if(tg && tg.openTelegramLink) tg.openTelegramLink(SUPPORT_TG);
});

function applyPreferences(){
  const p = state.preferences || {};
  if(p.fon){
    document.getElementById('banner').style.setProperty('--fon-url', `url('${p.fon}')`);
  }
  if(p.wallpaper){
    document.getElementById('app-wallpaper').style.setProperty('--wallpaper-url', `url('${p.wallpaper}')`);
  }
  if(prefixImgEl){
    if(p.prefix){
      prefixImgEl.src = p.prefix;
      prefixImgEl.classList.remove('hidden');
    }else{
      prefixImgEl.classList.add('hidden');
    }
  }
  if(heroPrefixImgEl){
    if(p.prefix){
      heroPrefixImgEl.src = p.prefix;
      heroPrefixImgEl.classList.remove('hidden');
    }else{
      heroPrefixImgEl.classList.add('hidden');
    }
  }
}

function logActivity(type, text){
  state.activity.unshift({ ts: Date.now(), type, text });
  if(state.activity.length > 60) state.activity.length = 60;
  saveState();
}

const ACT_ICONS = {
  card:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18M7.5 15h5"/></svg>',
  stake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><circle cx="12" cy="12" r="4.5"/></svg>',
  coins: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M14.5 9.5h-3a1.7 1.7 0 0 0 0 3.4h1a1.7 1.7 0 0 1 0 3.4h-3"/></svg>',
  ref:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>',
  streak:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c4.4 0 8-3.6 8-8 0-5.3-3.9-8.2-6.6-11-.7 2.5-2.3 3.9-4.3 4.3C8 6.9 6.6 8.6 6.6 11a5.4 5.4 0 0 0 5.4 5.4c.5 0 1-.1 1.5-.2C12.4 18.4 11 20 9 20.5c.9.9 1.9 1.5 3 1.5z"/></svg>',
};
const ACT_COLORS = {
  card: '#4E9BE0', stake: '#9FB0D8', coins: '#EAB765', ref: '#4FD18B', streak: '#D9A05B',
};

function fmtAgo(ts){
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if(s < 60) return 'только что';
  const m = Math.floor(s / 60);
  if(m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if(h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  return `${d} дн назад`;
}

function renderActivity(){
  const listEl = document.getElementById('acList');
  const emptyEl = document.getElementById('acEmpty');
  const items = [];
  state.activity.forEach(a => {
    items.push(`<div class="ac-item" style="--ac-c:${ACT_COLORS[a.type] || '#1ED4FF'}">
      <span class="ac-ico">${ACT_ICONS[a.type] || ACT_ICONS.coins}</span>
      <div class="ac-body">
        <div class="ac-text">${a.text || ''}</div>
        <div class="ac-time">${fmtAgo(a.ts)}</div>
      </div>
    </div>`);
  });
  if(REFERRALS.list.length){
    REFERRALS.list.forEach(r => {
      const name = r.name || r.first_name || ('ID ' + r.id);
      items.push(`<div class="ac-item" style="--ac-c:#4FD18B">
        <span class="ac-ico">${ACT_ICONS.ref}</span>
        <div class="ac-body">
          <div class="ac-text">Приглашён: <b>${name}</b></div>
          <div class="ac-time">${r.tasks_done || 0} заданий</div>
        </div>
      </div>`);
    });
  }
  emptyEl.classList.toggle('hidden', items.length > 0);
  listEl.innerHTML = items.join('');
}

const ST_FONTS = { fons: 'stFons', podfons: 'stPodfons', prefixes: 'stPrefixes' };
const ST_LABELS = { fons: 'Фон профиля', podfons: 'Фон карточек', prefixes: 'Префикс' };
const ST_STATE = { fons: 'fon', podfons: 'wallpaper', prefixes: 'prefix' };
let stLists = { fons: null, podfons: null, prefixes: null };

async function loadPrefList(kind){
  const out = [];
  try{
    const res = await fetch('/api/files/' + kind + '?ts=' + Date.now());
    if(res.ok){
      const data = await res.json();
      if(data.ok && Array.isArray(data.files)) out.push(...data.files);
    }
  }catch(e){}
  if(!out.length){
    try{
      const res = await fetch('tgminiapprbx/' + kind + '/?ts=' + Date.now());
      if(res.ok){
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        const names = [...doc.querySelectorAll('a[href]')]
          .map(a => a.getAttribute('href').split(/[?#]/)[0])
          .filter(h => /\.(jpe?g|png)$/i.test(h))
          .map(h => h.split('/').pop())
          .filter(Boolean);
        out.push(...[...new Set(names)].map(n => 'tgminiapprbx/' + kind + '/' + n));
      }
    }catch(e){}
  }
  return [...new Set(out)];
}

async function renderSettings(){
  for(const kind of ['fons', 'podfons', 'prefixes']){
    const box = document.getElementById(ST_FONTS[kind]);
    if(!stLists[kind]){
      stLists[kind] = await loadPrefList(kind);
    }
    const cur = state.preferences[ST_STATE[kind]];
    box.innerHTML = '';
    if(!stLists[kind].length){
      box.innerHTML = '<div class="st-none">Нет файлов</div>';
      continue;
    }
    stLists[kind].forEach(url => {
      const t = document.createElement('button');
      t.className = 'st-thumb' + (url === cur ? ' sel' : '') + (kind === 'prefixes' ? ' st-pfx' : '');
      t.style.setProperty('--pv', `url('${url}')`);
      t.addEventListener('click', () => {
        state.preferences[ST_STATE[kind]] = url;
        saveState();
        applyPreferences();
        renderSettings();
      });
      box.appendChild(t);
    });
  }
}

/* ---- Загрузка при старте: сплеш, затем вся вкладка ---- */
const splashEl = document.getElementById('splash');
const bootStart = performance.now();
Promise.allSettled([
  loadServerState(),
  loadProfile(),
  refreshLibrary(),
  loadSettings(),
  loadConfig(),
  preloadPNGs(),
  loadAdmins(),
  loadDailyPointer(),
  loadReferrals(),
]).then(() => {
  if(PROFILE && OWNER_IDS.includes(PROFILE.id)){
    adminBtn.classList.remove('hidden');
  }
  if(isPriv()){
    dailyResetBtn.classList.remove('hidden');
    if(stAdminBtn) stAdminBtn.classList.remove('hidden');
  }
  if(PROFILE) setupTabs(); // ADMINS уже точно загружены — пересчитать видимость кнопки удаления
  const streakGained = ensureStreak();
if(streakGained){
    addCoins(STREAK_DAILY_BONUS);
    logActivity('streak', `Стрик: ${state.streak.count} ${state.streak.count === 1 ? 'день' : 'дней'} подряд (+${STREAK_DAILY_BONUS} Coins)`);
    showToast(`Стрик ${state.streak.count} ${state.streak.count === 1 ? 'день' : 'дней'}! +${STREAK_DAILY_BONUS} Coins`, true, 'win');
  }
  renderHero();
  applyPreferences();
  renderDaily();
  renderInventory();
  renderStreak();
  renderTasks();
  renderStakingOverview();
  renderWithdraw();
  updateNotifBadge();
  document.body.classList.add('preloaded');
  reportBalance();
  claimPendingCoins();
  startRealtime();
  const wait = Math.max(0, 1400 - (performance.now() - bootStart));
  setTimeout(() => splashEl.classList.add('done'), wait);
  setTimeout(() => document.body.classList.add('ready'), wait + 80);
});
