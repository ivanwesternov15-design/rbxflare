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
    dailyResetTs: 0,
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
        if(typeof parsed.dailyResetTs === 'number') base.dailyResetTs = parsed.dailyResetTs;
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
      dailyResetTs: state.dailyResetTs,
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
  bottomNav.classList.remove('locked');
  animateModal(sheet, backdrop, false);
  if(window._scanTimer){ clearInterval(window._scanTimer); window._scanTimer = null; }
}

/* ---- плавное появление/исчезание модальных окон (rAF) ---- */
let modalAnim = 0;
function animateModal(modal, bd, open){
  const token = ++modalAnim;
  const t0 = performance.now();
  const dur = open ? 480 : 300;
  if(open) modal.style.visibility = 'visible';
  const ease = open
    ? (t) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
    : (t) => 1 - Math.pow(1 - t, 3);

  const frame = now => {
    if(token !== modalAnim) return;
    const p = Math.min(1, (now - t0) / dur);
    const e = ease(p);
    const rev = 1 - e;
    const o = open ? e : rev;
    bd.style.opacity = o;
    modal.style.opacity = o;
    modal.style.filter = `blur(${rev * 10}px)`;
    modal.style.transform = `translate(-50%, -50%) scale(${open ? 0.86 + 0.14 * e : 0.9 + 0.1 * rev}) translateY(${rev * (open ? 18 : 10)}px)`;
    if(p < 1){ requestAnimationFrame(frame); }
    else if(!open){
      modal.style.visibility = 'hidden';
      modal.style.opacity = 0;
      bd.style.opacity = 0;
    }else{
      modal.style.filter = 'blur(0px)';
      modal.style.transform = 'translate(-50%, -50%) scale(1)';
    }
  };
  requestAnimationFrame(frame);
}

function openModal(modal, bd){
  bd.classList.add('open');
  modal.classList.add('open');
  bottomNav.classList.add('locked');
  document.body.classList.add('modal-lock');
  animateModal(modal, bd, true);
}

function closeModal(modal, bd){
  bd.classList.remove('open');
  modal.classList.remove('open');
  bottomNav.classList.remove('locked');
  document.body.classList.remove('modal-lock');
  animateModal(modal, bd, false);
}

menuBtn.addEventListener('click', openSheet);
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
  Basic:   { img: 'tgminiapprbx/Cards/Basic.png',   colors: ['#070d17', '#4e5568'] },
  Silver:  { img: 'tgminiapprbx/Cards/Silver.png',  colors: ['#7680a6', '#212842'] },
  Gold:    { img: 'tgminiapprbx/Cards/Gold.png',    colors: ['#ffd838', '#b57528'] },
  Diamond: { img: 'tgminiapprbx/Cards/Diamond.png', colors: ['#188cfe', '#01114c'] },
  Mythic:  { img: 'tgminiapprbx/Cards/Mythic.png',  colors: ['#bf3cde', '#c64dfa', '#300f47'] },
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
const balanceValueEl = document.getElementById('balanceValue');
const heroAvatarEl = document.getElementById('heroAvatar');
const heroNameEl = document.getElementById('heroName');
const heroIdEl = document.getElementById('heroId');
const dailyTimerEl = document.getElementById('dailyTimer');
const dailyTimerTextEl = document.getElementById('dailyTimerText');

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
    dailyTimerTextEl.textContent = `обновление через ${h}:${m}:${sec}`;
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
      `<div class="pack-q"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9.8 9a2.4 2.4 0 0 1 4.6 1c0 1.6-2.4 2-2.4 3.4"/><circle cx="12" cy="17" r="1.1" fill="currentColor" stroke="none"/></svg></div>` +
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
  const sparks = [0,1,2,3,4,5].map(i => {
    const ang = i * 60 * Math.PI / 180;
    const dst = 54 + (i % 3) * 16;
    return `<i style="--dx:${Math.round(Math.cos(ang) * dst)}px;--dy:${Math.round(Math.sin(ang) * dst)}px"></i>`;
  }).join('');
  return `<div class="drop-wrap tier-shine" style="${v}">
    <div class="drop-flash" style="${v}"></div>
    <div class="drop-sparks" style="${v}">${sparks}</div>
    <div class="drop-halo tier-glow" style="${v}"></div>
    <div class="tier-chip tier-glow" style="${v}">
      <svg class="dc-gem" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h10l4 6-9 12L3 9z"/></svg>${rarity}
    </div>
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
    collectBtnEl.classList.remove('hidden');
    startDailyTimer(true);
  }, 420);
  addBalance(reward);
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
  collectBtnEl.classList.add('hidden');
  dailyGridEl.classList.add('hidden');
  dailyDoneEl.classList.remove('hidden');
  renderInventory();
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

function renderInventory(){
  invCountEl.textContent = state.inventory.length;
  const cards = state.inventory.slice().reverse();
  inventoryListEl.innerHTML = '';
  inventoryEmptyEl.classList.toggle('hidden', cards.length > 0);
  cards.forEach((card, i) => {
    const st = TIER_STYLE[card.rarity] || TIER_STYLE.Basic;
    const el = document.createElement('div');
    el.className = 'inv-row' + (card.status === 'used' ? ' used' : '');
    el.style.setProperty('--t1', st.colors[0]);
    el.style.setProperty('--t2', st.colors[1]);
    el.style.setProperty('--t3', st.colors[2] || st.colors[1]);
    el.style.animationDelay = `${i * 70}ms`;
    const statusText = card.status === 'staking' ? 'В стейкинге' : (card.status === 'used' ? 'Использована' : 'Доступна');
    el.innerHTML =
      `<div class="inv-thumb">` +
        `<img class="inv-png" src="${card.img}" alt="${card.rarity}">` +
      `</div>` +
      `<div class="inv-mid">` +
        `<div class="inv-title">${card.rarity}</div>` +
        `<div class="inv-reward">+${card.reward} Robux</div>` +
        `<div class="inv-rowfoot">` +
          `<span class="inv-status ${card.status === 'staking' ? 'staking' : card.status === 'used' ? 'used' : ''}">${statusText}</span>` +
          (card.status === 'staking' ? `<span class="inv-until">осталось ${fmtLeft(card.until)}</span>` : '') +
        `</div>` +
      `</div>` +
      `<div class="inv-act">` +
        (card.status === 'available'
          ? `<button class="stake-btn" data-i="${i}">Стейкинг</button>`
          : card.status === 'staking'
            ? `<button class="stake-btn off" data-i="${i}">Забрать</button>`
            : '') +
      `</div>`;
    const btn = el.querySelector('.stake-btn');
    if(btn) btn.addEventListener('click', () => card.status === 'staking' ? withdrawStake(card) : openStake(card));
    inventoryListEl.appendChild(el);
  });
}

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
  card.until = Date.now() + STAKE_MS[period];
  saveState();
  closeModal(stakeSheet, stakeBackdrop);
  renderInventory();
  showToast('Карточка отправлена в стейкинг', true, 'win');
}

function withdrawStake(card){
  if(!card || card.status !== 'staking') return;
  if(card.until > Date.now()){
    showToast(`Стейкинг завершится ${fmtUntil(card.until)}`, false);
    return;
  }
  const bonus = Math.round(card.reward * (card.pct || 0) / 100);
  card.status = 'used';
  saveState();
  renderInventory();
  if(bonus > 0){
    addBalance(bonus);
    showToast(`Стейкинг завершён: +${bonus} Robux`, true, 'win');
  }else{
    showToast('Стейкинг завершён', true, 'win');
  }
}

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
const adminGear = document.getElementById('adminGear');
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
      if(isPriv()) adminGear.classList.remove('hidden');
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

adminGear.addEventListener('click', openAdminPanel);
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
        <div class="us-avatar" style="background:linear-gradient(135deg,#22d3ee,#a78bfa)">
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
   РЕАЛТАЙМ: если админ сбросил карточки — обновимся сами,
   без перезахода в мини-апп (опрос + при фокусе вкладки)
   ========================================================= */
let realtimeTimer = null;
function startRealtime(){
  stopRealtime();
  realtimeTimer = setInterval(loadDailyPointer, 10000);
}
function stopRealtime(){
  if(realtimeTimer){ clearInterval(realtimeTimer); realtimeTimer = null; }
}
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'visible') loadDailyPointer();
});
window.addEventListener('focus', loadDailyPointer);

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
  const map = { main: 'viewMain', cards: 'viewCards', refs: 'viewSoon', tasks: 'viewSoon', profile: 'viewProfile' };
  document.getElementById(map[view] || 'viewMain').classList.remove('hidden');
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

stakeClose.addEventListener('click', () => closeModal(stakeSheet, stakeBackdrop));
stakeBackdrop.addEventListener('click', () => closeModal(stakeSheet, stakeBackdrop));
adminClose.addEventListener('click', () => closeModal(adminSheet, adminBackdrop));
adminBackdrop.addEventListener('click', () => closeModal(adminSheet, adminBackdrop));
adminSaveBtn.addEventListener('click', saveAdmin);
adminBtn.addEventListener('click', openAdmin);

applySelected();
balanceValueEl.textContent = state.balance;

/* ---- экран загрузки: ждём все данные, затем красиво уходим ---- */
const splashEl = document.getElementById('splash');
const bootStart = performance.now();
Promise.allSettled([
  loadProfile(),
  refreshLibrary(),
  loadSettings(),
  loadConfig(),
  preloadPNGs(),
  loadAdmins(),
  loadDailyPointer(),
]).then(() => {
  if(PROFILE && OWNER_IDS.includes(PROFILE.id)){
    adminBtn.classList.remove('hidden');
  }
  if(isPriv()){
    dailyResetBtn.classList.remove('hidden');
    adminGear.classList.remove('hidden');
  }
  renderHero();
  renderDaily();
  renderInventory();
  document.body.classList.add('preloaded');
  reportBalance();
  startRealtime();
  const wait = Math.max(0, 1400 - (performance.now() - bootStart));
  setTimeout(() => splashEl.classList.add('done'), wait);
  setTimeout(() => document.body.classList.add('ready'), wait + 80);
});