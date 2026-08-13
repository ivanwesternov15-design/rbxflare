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
  const frame = now => {
    if(token !== toast._anim) return;
    const p = Math.min(1, (now - t0) / dur);
    const e = ease(p);
    toast.style.opacity = show ? e : 1 - e;
    toast.style.transform = `translateX(-50%) translateY(${(show ? 1 - e : -e) * 40}px)`;
    if(p < 1){ requestAnimationFrame(frame); }
    else if(!show) toast.style.visibility = 'hidden';
    else toast.style.visibility = 'visible';
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
  return icon === 'trash' ? trash : refresh;
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
    }
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
      }
    }
  }catch(e){}
  return base;
})();

function saveState(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tab: state.tab, selected: state.selected }));
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
      if(!swapped){ swapped = true; renderGrid(state.tab); }
      const v = ease((p - .5) * 2);
      grid.style.opacity = .4 + v * .6;
      grid.style.transform = `translateX(${dir * 34 * (1 - v)}px) scale(${.97 + v * .03})`;
      grid.style.filter = `blur(${(1 - v) * 4}px)`;
    }
    if(p < 1){ requestAnimationFrame(frame); }
    else{
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

function switchTab(tab){
  const keys = Object.keys(LIBRARY);
  const prevIdx = keys.indexOf(state.tab);
  const nextIdx = keys.indexOf(tab);
  const dir = nextIdx > prevIdx ? 1 : -1;
  state.tab = tab;
  tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  animateTabIndicator(nextIdx);
  animateGrid(dir);
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
    if(btn.dataset.view === 'profile'){
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
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

applySelected();
refreshLibrary();
loadProfile();
loadSettings();