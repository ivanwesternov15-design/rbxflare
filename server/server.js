/* =========================================================
   Uxintace Mini App — сервер
   - отдаёт фронтенд (index.html, style.css, script.js, ...)
   - /api/init : проверяет initData из Telegram (HMAC-SHA256),
     создаёт пользователя при первом входе (записывает дату
     первого входа и nickname/username)
   - /api/user : получение и обновление профиля (bio, birthday)
   - данные хранятся в server/data/users.json (отдельная папка)
   ========================================================= */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');

const config = require('./config.json');
const BOT_TOKEN = config.botToken;
const PORT = process.env.PORT || 8080;

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const USERS_FILE_BACKUP = path.join(DATA_DIR, 'users.json.bak');

const app = express();
app.use(express.json({ limit: '100kb' }));

/* ---------- хранилище ---------- */
function loadUsers(){
  try{ return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
  catch{ return {}; }
}
function saveUsers(users){
  fs.writeFileSync(USERS_FILE_BACKUP, JSON.stringify(users, null, 2), 'utf8');
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}
if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

/* ---------- валидация initData ----------
   initData — строка вида: auth_date=...&hash=...&user={...}
   Правило: подпись = hex(HMAC_SHA256(secret_key, check_string))
   где secret_key = HMAC_SHA256('WebAppData', bot_token)          */
function verifyInitData(initData){
  if(!initData || typeof initData !== 'string') return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if(!hash) return null;
  params.delete('hash');

  const checkString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const calcHash = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');

  if(calcHash !== hash){
    const a = Buffer.from(calcHash, 'hex');
    const b = Buffer.from(hash, 'hex');
    if(a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  }

  const authDate = parseInt(params.get('auth_date') || '0', 10);
  if(!authDate || Date.now() / 1000 - authDate > 86400 * 2) return null; // максимум 2 суток

  let user = null;
  try{ user = JSON.parse(params.get('user')); }catch{ return null; }
  if(!user || !user.id) return null;

  return {
    authDate,
    user: {
      id: user.id,
      first_name: String(user.first_name || ''),
      last_name: String(user.last_name || ''),
      username: String(user.username || ''),
      photo_url: String(user.photo_url || ''),
      language_code: String(user.language_code || ''),
      is_premium: !!user.is_premium,
    }
  };
}

function publicUser(u){
  return {
    id: u.id,
    first_name: u.first_name,
    last_name: u.last_name,
    username: u.username,
    photo_url: u.photo_url,
    bio: u.bio || '',
    birthday: u.birthday || '',
    first_login: u.first_login || null,
  };
}

/* ---------- маршруты ---------- */
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: Date.now() });
});

app.post('/api/init', (req, res) => {
  const verified = verifyInitData(req.body && req.body.initData);
  if(!verified) return res.status(401).json({ ok: false, error: 'Invalid initData' });

  const users = loadUsers();
  const id = String(verified.user.id);
  if(!users[id]){
    users[id] = {
      ...verified.user,
      created_at: Date.now(),
      first_login: new Date().toISOString().slice(0, 10),
      bio: '',
      birthday: '',
    };
    saveUsers(users);
  }else{
    let changed = false;
    ['first_name', 'last_name', 'username', 'photo_url', 'language_code', 'is_premium'].forEach(k => {
      if(users[id][k] !== verified.user[k]){ users[id][k] = verified.user[k]; changed = true; }
    });
    if(changed) saveUsers(users);
  }

  res.json({ ok: true, user: publicUser(users[id]) });
});

app.get('/api/user', (req, res) => {
  const verified = verifyInitData(req.query.initData);
  if(!verified) return res.status(401).json({ ok: false, error: 'Invalid initData' });

  const users = loadUsers();
  const u = users[String(verified.user.id)];
  if(!u) return res.status(404).json({ ok: false, error: 'User not found' });
  res.json({ ok: true, user: publicUser(u) });
});

app.put('/api/user', (req, res) => {
  const verified = verifyInitData(req.body.initData);
  if(!verified) return res.status(401).json({ ok: false, error: 'Invalid initData' });

  const users = loadUsers();
  const u = users[String(verified.user.id)];
  if(!u) return res.status(404).json({ ok: false, error: 'User not found' });

  const bio = String(req.body.bio || '').trim().slice(0, 200);
  const birthday = String(req.body.birthday || '').trim().slice(0, 10);
  if(req.body.bio !== undefined) u.bio = bio;
  if(req.body.birthday !== undefined) u.birthday = birthday;
  saveUsers(users);

  res.json({ ok: true, user: publicUser(u) });
});

/* ---------- статика фронтенда ---------- */
const WEB_ROOT = path.join(__dirname, '..');
app.use(express.static(WEB_ROOT, {
  index: 'index.html',
  maxAge: '5m',
}));

app.get('*', (req, res) => {
  res.sendFile(path.join(WEB_ROOT, 'index.html'));
});

const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}, data in ${DATA_DIR}`);
});