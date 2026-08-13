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
  TARGET_EL.podfons.style.setProperty(CSS_VAR.podfons, `url('${state.selected.podfons}')`);
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

function renderGrid(tab){
  grid.classList.remove('fade-pane');
  void grid.offsetWidth; // restart animation
  grid.classList.add('fade-pane');
  grid.innerHTML = '';
  LIBRARY[tab].forEach((src, i) => {
    const cell = document.createElement('div');
    cell.className = 'thumb cell-in' + (state.selected[tab] === src ? ' selected' : '');
    cell.style.backgroundImage = `url('${src}')`;
    cell.style.animationDelay = `${i * 45}ms`;
    cell.innerHTML = `<span class="check"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg></span>`;
    cell.addEventListener('click', () => selectImage(tab, src, cell));
    grid.appendChild(cell);
  });
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
}

function switchTab(tab){
  state.tab = tab;
  [...tabsWrap.querySelectorAll('.tab-btn')].forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const idx = Object.keys(LIBRARY).indexOf(tab);
  tabIndicator.style.transform = `translateX(${idx * 100}%)`;
  renderGrid(tab);
  saveState();
}

tabsWrap.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function openSheet(){
  backdrop.classList.add('open');
  sheet.classList.add('open');
  renderGrid(state.tab);
  refreshLibrary();
  if(!window._scanTimer){
    window._scanTimer = setInterval(refreshLibrary, 15000); // авто-обновление в реальном времени
  }
}
function closeSheet(){
  backdrop.classList.remove('open');
  sheet.classList.remove('open');
  if(window._scanTimer){ clearInterval(window._scanTimer); window._scanTimer = null; }
}

menuBtn.addEventListener('click', openSheet);
sheetClose.addEventListener('click', closeSheet);
backdrop.addEventListener('click', closeSheet);

/* ---- нижняя навигация (пока работает только «Профиль») ---- */
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
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