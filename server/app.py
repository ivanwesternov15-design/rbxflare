# -*- coding: utf-8 -*-
"""Uxintace Mini App — сервер (Python 3.11 / Flask).

- отдаёт фронтенд (index.html, style.css, script.js, tgminiapprbx/...)
- /api/init  : проверяет initData из Telegram (HMAC-SHA256), создаёт
               пользователя при первом входе (дата первого входа)
- /api/user  : GET/PUT — профиль: bio, birthday
- данные лежат в server/data/users.json (отдельная папка, вне git)

Запуск на BotHost:  python app.py   (или python -m flask run ...)
"""
import hashlib
import hmac
import json
import logging
import os
import shutil
import time
import urllib.parse
from pathlib import Path

import requests
from flask import Flask, jsonify, request, send_from_directory

logging.getLogger("werkzeug").setLevel(logging.WARNING)  # не спамим каждый запрос

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
DATA_DIR = Path(os.environ.get("DATA_DIR") or BASE_DIR / "data")
UPLOADS_DIR = DATA_DIR / "uploads"
USERS_FILE = DATA_DIR / "users.json"
USERS_BACKUP = DATA_DIR / "users.json.bak"

ALLOWED_KINDS = ("avatars", "fons", "podfons")
OWNER_IDS = (8414792453,)  # только владелец может менять глобальные настройки и удалять фоны
PORT = int(os.environ.get("PORT", 8080))

with open(BASE_DIR / "config.json", encoding="utf-8") as fh:
    BOT_TOKEN = json.load(fh)["botToken"]

app = Flask(__name__, static_url_path="", static_folder=str(ROOT_DIR))
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 300


# ---------- хранилище ----------
def load_users():
    try:
        return json.loads(USERS_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save_users(users):
    USERS_BACKUP.write_text(json.dumps(users, ensure_ascii=False, indent=2), encoding="utf-8")
    USERS_FILE.write_text(json.dumps(users, ensure_ascii=False, indent=2), encoding="utf-8")


DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


DELETED_SEEDS_FILE = DATA_DIR / "deleted_seeds.json"


def load_deleted_seeds():
    try:
        return set(json.loads(DELETED_SEEDS_FILE.read_text(encoding="utf-8")))
    except (OSError, ValueError):
        return set()


def save_deleted_seeds(names):
    DELETED_SEEDS_FILE.write_text(json.dumps(sorted(names), ensure_ascii=False, indent=2), encoding="utf-8")


def mark_seed_deleted(kind, name):
    """Запоминаем, что дефолтную (репозиторную) картинку удалили — чтобы
    seed_defaults() не восстанавливал её обратно при следующем рестарте."""
    deleted = load_deleted_seeds()
    deleted.add(f"{kind}/{name}")
    save_deleted_seeds(deleted)


def seed_defaults():
    """Переносим картинки галереи из репозитория (tgminiapprbx/) в персистентное
    хранилище DATA_DIR/uploads/ — иначе удаление на BotHost не работает:
    файлы лежат в образе контейнера и восстанавливаются при редеплое,
    а удалять их оттуда нельзя (часто read-only). Пересев идемпотентен.
    Уже удалённые владельцем/админом картинки повторно не сеются."""
    deleted = load_deleted_seeds()
    for kind in ALLOWED_KINDS:
        src = ROOT_DIR / "tgminiapprbx" / kind
        if not src.is_dir():
            continue
        dest = UPLOADS_DIR / kind
        dest.mkdir(parents=True, exist_ok=True)
        for f in src.glob("*"):
            if f.suffix.lower() not in (".jpg", ".jpeg", ".png"):
                continue
            if f"{kind}/{f.name}" in deleted:
                continue
            target = dest / f.name
            if target.exists():
                continue
            try:
                shutil.copy2(f, target)
                logging.getLogger("bot").info("seed: %s -> %s", f.name, target)
            except OSError as exc:
                logging.getLogger("bot").warning("seed %s: %s", f, exc)


seed_defaults()

SETTINGS_FILE = DATA_DIR / "settings.json"
CONFIG_FILE = DATA_DIR / "config.json"

DEFAULT_CONFIG = {
    "tiers": {
        "Basic":    {"reward": 40,   "chance": 42,  "stake": {"12h": 0.5, "24h": 1,   "3d": 3,   "7d": 7}},
        "Silver":   {"reward": 120,  "chance": 27,  "stake": {"12h": 0.75, "24h": 1.5, "3d": 4,  "7d": 9}},
        "Gold":     {"reward": 300,  "chance": 17,  "stake": {"12h": 1,    "24h": 2,   "3d": 5,  "7d": 12}},
        "Diamond":  {"reward": 800,  "chance": 10,  "stake": {"12h": 1.5,  "24h": 3,   "3d": 8,  "7d": 18}},
        "Mythic":   {"reward": 2500, "chance": 4,   "stake": {"12h": 2,    "24h": 4,   "3d": 10, "7d": 25}},
    }
}
VALID_TIERS = tuple(DEFAULT_CONFIG["tiers"])
STAKE_PERIODS = ("12h", "24h", "3d", "7d")


def load_config():
    """Дефолты + сохранённые админом правки (deep merge по редкостям)."""
    merged = json.loads(json.dumps(DEFAULT_CONFIG))
    try:
        saved = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        saved = {}
    for tier, data in (saved.get("tiers") or {}).items():
        if tier not in merged["tiers"] or not isinstance(data, dict):
            continue
        if isinstance(data.get("reward"), (int, float)) and data["reward"] > 0:
            merged["tiers"][tier]["reward"] = round(float(data["reward"]), 0)
        chance = data.get("chance")
        if isinstance(chance, (int, float)) and 0.1 <= chance <= 100:
            merged["tiers"][tier]["chance"] = round(float(chance), 1)
        stake = data.get("stake")
        if isinstance(stake, dict):
            for period in STAKE_PERIODS:
                val = stake.get(period)
                if isinstance(val, (int, float)) and val >= 0:
                    merged["tiers"][tier]["stake"][period] = float(val)
    return merged


def save_config(cfg):
    CONFIG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")


@app.get("/api/config")
def api_get_config():
    """Конфиг карточек (суммы выпадения + проценты стейкинга) — всем пользователям."""
    return jsonify(ok=True, config=load_config())


@app.post("/api/config")
def api_set_config():
    """Сохранение конфига карточек — только владелец."""
    data = request.get_json(silent=True) or {}
    verified = verify_init_data(data.get("initData"))
    if not verified:
        return jsonify(ok=False, error="Invalid initData"), 401
    if verified["user"]["id"] not in OWNER_IDS:
        return jsonify(ok=False, error="Forbidden"), 403

    tiers = data.get("tiers")
    if not isinstance(tiers, dict):
        return jsonify(ok=False, error="bad config"), 400

    cleaned = {}
    for tier, spec in tiers.items():
        if tier not in VALID_TIERS or not isinstance(spec, dict):
            continue
        reward = spec.get("reward")
        if not isinstance(reward, (int, float)) or not (1 <= reward <= 100000):
            return jsonify(ok=False, error=f"bad reward for {tier}"), 400
        chance = spec.get("chance")
        if not isinstance(chance, (int, float)) or not (0.1 <= chance <= 100):
            return jsonify(ok=False, error=f"bad chance for {tier}"), 400
        stake = {}
        for period in STAKE_PERIODS:
            val = spec.get("stake", {}).get(period)
            if not isinstance(val, (int, float)) or not (0 <= val <= 1000):
                return jsonify(ok=False, error=f"bad stake {tier} {period}"), 400
            stake[period] = float(val)
        cleaned[tier] = {
            "reward": round(float(reward), 0),
            "chance": round(float(chance), 1),
            "stake": stake,
        }

    if not cleaned:
        return jsonify(ok=False, error="bad config"), 400

    save_config({"tiers": cleaned})
    logging.getLogger("bot").info("владелец обновил конфиг карточек: %s", list(cleaned))
    return jsonify(ok=True, config=load_config())


# ---------- администраторы и принудительный сброс ежедневных карточек ----------
ADMIN_FILE = DATA_DIR / "admins.json"
DAILY_RESET_FILE = DATA_DIR / "daily_resets.json"


def load_admins():
    try:
        raw = json.loads(ADMIN_FILE.read_text(encoding="utf-8")).get("adminIds", [])
        return {int(x) for x in raw if isinstance(x, (int, float)) and int(x) > 0}
    except (OSError, ValueError):
        return set()


def save_admins(ids):
    ADMIN_FILE.write_text(json.dumps({"adminIds": sorted(ids)}, ensure_ascii=False, indent=2), encoding="utf-8")


def load_daily_resets():
    try:
        return {int(k): int(v) for k, v in json.loads(DAILY_RESET_FILE.read_text(encoding="utf-8")).items()}
    except (OSError, ValueError):
        return {}


def save_daily_resets(reg):
    DAILY_RESET_FILE.write_text(json.dumps(reg, ensure_ascii=False, indent=2), encoding="utf-8")


ADMINS = load_admins()


def is_privileged(user_id):
    """Владелец или назначенный администратор."""
    return user_id in OWNER_IDS or user_id in ADMINS


@app.get("/api/admins")
def api_get_admins():
    """Список администраторов — видно владельцу и админам."""
    verified = verify_init_data(request.args.get("initData"))
    if not verified:
        return jsonify(ok=False, error="Invalid initData"), 401
    if not is_privileged(verified["user"]["id"]):
        return jsonify(ok=False, error="Forbidden"), 403
    return jsonify(ok=True, adminIds=sorted(ADMINS))


@app.post("/api/admins")
def api_set_admin():
    """Добавить/убрать администратора — только владелец."""
    data = request.get_json(silent=True) or {}
    verified = verify_init_data(data.get("initData"))
    if not verified:
        return jsonify(ok=False, error="Invalid initData"), 401
    if verified["user"]["id"] not in OWNER_IDS:
        return jsonify(ok=False, error="Forbidden"), 403
    action = data.get("action")
    user_id = data.get("userId")
    if action not in ("add", "remove") or not isinstance(user_id, (int, float)) or int(user_id) <= 0:
        return jsonify(ok=False, error="bad params"), 400
    user_id = int(user_id)
    if user_id in OWNER_IDS:
        return jsonify(ok=False, error="owner is always admin"), 400
    if action == "add":
        ADMINS.add(user_id)
    else:
        ADMINS.discard(user_id)
    save_admins(ADMINS)
    logging.getLogger("bot").info("владелец %s админа %s", "добавил" if action == "add" else "убрал", user_id)
    return jsonify(ok=True, adminIds=sorted(ADMINS))


@app.post("/api/daily-reset")
def api_reset_daily():
    """Принудительный сброс ежедневных карточек игроку — владелец или админ."""
    data = request.get_json(silent=True) or {}
    verified = verify_init_data(data.get("initData"))
    if not verified:
        return jsonify(ok=False, error="Invalid initData"), 401
    if not is_privileged(verified["user"]["id"]):
        return jsonify(ok=False, error="Forbidden"), 403
    user_id = data.get("userId")
    if not isinstance(user_id, (int, float)) or int(user_id) <= 0:
        return jsonify(ok=False, error="bad userId"), 400
    user_id = int(user_id)
    resets = load_daily_resets()
    resets[user_id] = int(time.time())
    save_daily_resets(resets)
    logging.getLogger("bot").info("сброс ежедневных карточек игроку %s", user_id)
    return jsonify(ok=True, resetTs=resets[user_id])


@app.post("/api/daily-pointer")
def api_daily_pointer():
    """Собственный маркер принудительного сброса: если сервер сбросил daily
    позже нашей отметки — клиент обнуляет карточки."""
    data = request.get_json(silent=True) or {}
    verified = verify_init_data(data.get("initData"))
    if not verified:
        return jsonify(ok=False, error="Invalid initData"), 401
    user_id = verified["user"]["id"]
    resets = load_daily_resets()
    return jsonify(ok=True, resetTs=resets.get(user_id, 0))


@app.post("/api/balance")
def api_report_balance():
    """Клиент сообщает свой баланс — для списка пользователей в админке."""
    data = request.get_json(silent=True) or {}
    verified = verify_init_data(data.get("initData"))
    if not verified:
        return jsonify(ok=False, error="Invalid initData"), 401
    balance = data.get("balance")
    if not isinstance(balance, (int, float)) or balance < 0:
        return jsonify(ok=False, error="bad balance"), 400
    users = load_users()
    uid = str(verified["user"]["id"])
    if uid in users:
        users[uid]["balance"] = int(balance)
        save_users(users)
    return jsonify(ok=True)


@app.get("/api/users")
def api_get_users():
    """Список всех пользователей с балансами — видно владельцу и админам."""
    verified = verify_init_data(request.args.get("initData"))
    if not verified:
        return jsonify(ok=False, error="Invalid initData"), 401
    if not is_privileged(verified["user"]["id"]):
        return jsonify(ok=False, error="Forbidden"), 403
    users = load_users()
    items = [public_user(u) for u in users.values()]
    items.sort(key=lambda u: u.get("balance", 0), reverse=True)
    for it in items:
        if it.get("photo_url"):
            it["photo_url"] = it["photo_url"].split("?", 1)[0]
    return jsonify(ok=True, users=items)


def load_settings():
    try:
        return json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save_settings(settings):
    SETTINGS_FILE.write_text(json.dumps(settings, ensure_ascii=False, indent=2), encoding="utf-8")


def gallery_path(raw):
    """Разбирает путь вида /uploads/<kind>/<name> или /tgminiapprbx/<kind>/<name>."""
    parts = [p for p in str(raw or "").split("/") if p]
    if len(parts) != 3 or parts[0] not in ("uploads", "tgminiapprbx"):
        return None
    kind, name = parts[1], parts[2]
    if kind not in ALLOWED_KINDS:
        return None
    if not name.lower().endswith((".jpg", ".jpeg", ".png")):
        return None
    if not name.replace(".", "").replace("-", "").replace("_", "").isalnum():
        return None
    base = UPLOADS_DIR if parts[0] == "uploads" else ROOT_DIR / "tgminiapprbx"
    target = (base / kind / name).resolve()
    if target.parent != (base / kind).resolve():
        return None
    return target


# ---------- глобальные настройки: фон приложения для всех пользователей ----------
@app.get("/api/settings")
def api_get_settings():
    s = load_settings()
    wallpaper = s.get("wallpaper") or ""
    if wallpaper:
        p = gallery_path(wallpaper)
        if not p or not p.is_file():
            wallpaper = ""
            s.pop("wallpaper", None)
            save_settings(s)
    return jsonify(ok=True, wallpaper=wallpaper, users=len(load_users()))


@app.post("/api/settings")
def api_set_settings():
    data = request.get_json(silent=True) or {}
    verified = verify_init_data(data.get("initData"))
    if not verified:
        return jsonify(ok=False, error="Invalid initData"), 401
    if verified["user"]["id"] not in OWNER_IDS:
        return jsonify(ok=False, error="Forbidden"), 403

    kind = data.get("kind")
    path = str(data.get("path") or "")
    if kind not in ("fons", "podfons") or not gallery_path(path):
        return jsonify(ok=False, error="bad path"), 400

    s = load_settings()
    if kind == "podfons":
        s["wallpaper"] = path
    else:
        s["banner"] = path
    save_settings(s)
    logging.getLogger("bot").info("владелец сменил %s: %s", kind, path)
    return jsonify(ok=True, users=len(load_users()))


# ---------- список картинок и аплоады ----------
@app.get("/api/files/<kind>")
def api_files(kind):
    """Имена картинок из персистентного хранилища (uploads = DATA_DIR).
    Дефолтные картинки репозитория пересеваются сюда при старте (seed_defaults),
    поэтому все фоны удаляются по-настоящему и не возвращаются при редеплое."""
    if kind not in ALLOWED_KINDS:
        return jsonify(ok=False, error="bad kind"), 400
    up = UPLOADS_DIR / kind
    files = []
    if up.is_dir():
        for f in sorted(up.glob("*")):
            if f.suffix.lower() in (".jpg", ".jpeg", ".png"):
                files.append(f"/uploads/{kind}/{f.name}")
    return jsonify(ok=True, files=files)


@app.get("/uploads/<path:path>")
def uploads(path):
    return send_from_directory(str(UPLOADS_DIR), path)


@app.delete("/api/files")
def api_delete_files():
    """Удаление фонов — владелец или назначенный администратор. paths — список вида
    /uploads/<kind>/<name> или /tgminiapprbx/<kind>/<name>."""
    data = request.get_json(silent=True) or {}
    verified = verify_init_data(data.get("initData"))
    if not verified:
        return jsonify(ok=False, error="Invalid initData"), 401
    if not is_privileged(verified["user"]["id"]):
        return jsonify(ok=False, error="Forbidden"), 403

    paths = data.get("paths") or []
    if not isinstance(paths, list):
        return jsonify(ok=False, error="bad paths"), 400

    deleted = 0
    s = load_settings()
    settings_changed = False
    newly_deleted_seeds = set()
    for raw in paths:
        target = gallery_path(raw)
        if not target:
            continue
        parts = [p for p in str(raw).split("/") if p]
        kind, name = parts[1], parts[2]
        try:
            if target.is_file():
                target.unlink()
                deleted += 1
                logging.getLogger("bot").info("удалено: %s", target)
                if s.get("wallpaper") == raw:
                    s.pop("wallpaper", None)
                    settings_changed = True
                if s.get("banner") == raw:
                    s.pop("banner", None)
                    settings_changed = True
                # если это была дефолтная (репозиторная) картинка — запоминаем,
                # чтобы seed_defaults() не восстановил её при следующем рестарте
                repo_file = ROOT_DIR / "tgminiapprbx" / kind / name
                if repo_file.is_file():
                    newly_deleted_seeds.add(f"{kind}/{name}")
        except OSError as exc:
            logging.getLogger("bot").warning("delete %s: %s", target, exc)
    if settings_changed:
        save_settings(s)
    if newly_deleted_seeds:
        existing = load_deleted_seeds()
        save_deleted_seeds(existing | newly_deleted_seeds)

    return jsonify(ok=True, deleted=deleted)


# ---------- валидация initData ----------
# secret_key = HMAC_SHA256('WebAppData', bot_token)
# hash = hex(HMAC_SHA256(secret_key, check_string))
# check_string = отсортированные пары "k=v", соединённые \n
def verify_init_data(init_data):
    if not init_data or not isinstance(init_data, str):
        return None

    params = {}
    for part in init_data.split("&"):
        if not part:
            continue
        key, _, value = part.partition("=")
        params[key] = urllib.parse.unquote_plus(value)

    hash_value = params.pop("hash", None)
    if not hash_value:
        return None

    check_string = "\n".join(f"{k}={params[k]}" for k in sorted(params))

    secret = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
    calc = hmac.new(secret, check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(calc, hash_value):
        return None

    auth_date = int(params.get("auth_date") or 0)
    if not auth_date or time.time() - auth_date > 86400 * 2:  # максимум 2 суток
        return None

    try:
        user = json.loads(params.get("user") or "null")
    except (ValueError, TypeError):
        return None
    if not user or not user.get("id"):
        return None

    return {
        "auth_date": auth_date,
        "user": {
            "id": user["id"],
            "first_name": str(user.get("first_name") or ""),
            "last_name": str(user.get("last_name") or ""),
            "username": str(user.get("username") or ""),
            "photo_url": str(user.get("photo_url") or ""),
            "language_code": str(user.get("language_code") or ""),
            "is_premium": bool(user.get("is_premium")),
        },
    }


def public_user(u):
    return {
        "id": u["id"],
        "first_name": u["first_name"],
        "last_name": u["last_name"],
        "username": u["username"],
        "photo_url": u["photo_url"],
        "bio": u.get("bio") or "",
        "birthday": u.get("birthday") or "",
        "first_login": u.get("first_login") or None,
        "balance": int(u.get("balance") or 0),
        "pending_coins": int(u.get("pending_coins") or 0),
    }


# ---------- рефералы ----------
REFERRALS_FILE = DATA_DIR / "referrals.json"
BOT_USERNAME = "rbxflare_bot"


def load_referrals_data():
    try:
        return json.loads(REFERRALS_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


@app.get("/api/referrals")
def api_get_referrals():
    """Список рефералов текущего пользователя + его реферальная ссылка."""
    verified = verify_init_data(request.args.get("initData"))
    if not verified:
        return jsonify(ok=False, error="Invalid initData"), 401
    uid = verified["user"]["id"]
    data = load_referrals_data()
    lst = data.get(str(uid)) or []
    users = load_users()
    items = []
    for r in lst:
        u = users.get(str(r.get("id")))
        items.append({
            "id": r.get("id"),
            "date": r.get("date"),
            "name": ([u.get("first_name"), u.get("last_name")] and " ".join(
                filter(None, [u.get("first_name"), u.get("last_name")]))) if u else "Игрок",
            "username": (u.get("username") if u else "") or "",
        })
    return jsonify(
        ok=True,
        count=len(items),
        list=list(reversed(items)),
        link=f"https://t.me/{BOT_USERNAME}?start=ref_{uid}",
    )


@app.post("/api/claim-pending")
def api_claim_pending():
    """Забрать накопленные монеты за рефералов (начисленные ботом при /start).
    Обнуляет pending_coins на сервере, клиент добавляет их к state.coins."""
    data = request.get_json(silent=True) or {}
    verified = verify_init_data(data.get("initData"))
    if not verified:
        return jsonify(ok=False, error="Invalid initData"), 401
    users = load_users()
    uid = str(verified["user"]["id"])
    amount = int((users.get(uid) or {}).get("pending_coins") or 0)
    if amount and uid in users:
        users[uid]["pending_coins"] = 0
        save_users(users)
    return jsonify(ok=True, amount=amount)


# ---------- фото профиля из Telegram (если в initData не пришло) ----------
def fetch_telegram_photo(user_id):
    """Достаёт главное фото профиля через Bot API и сохраняет локально в uploads."""
    try:
        resp = requests.get(
            f"https://api.telegram.org/bot{BOT_TOKEN}/getUserProfilePhotos",
            params={"user_id": user_id, "limit": 1},
            timeout=10,
        ).json()
        photos = (resp.get("result") or {}).get("photos") or []
        if not photos:
            return ""
        best = max(photos[0], key=lambda s: s.get("width", 0) * s.get("height", 0))
        file_id = best["file_id"]
        fdata = requests.get(
            f"https://api.telegram.org/bot{BOT_TOKEN}/getFile",
            params={"file_id": file_id},
            timeout=10,
        ).json()
        file_path = (fdata.get("result") or {}).get("file_path")
        if not file_path:
            return ""

        dl = requests.get(
            f"https://api.telegram.org/file/bot{BOT_TOKEN}/{file_path}",
            timeout=15,
        )
        if dl.status_code != 200 or not dl.content:
            return ""

        dest = UPLOADS_DIR / "avatars" / f"profile_{user_id}.jpg"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(dl.content)
        logging.getLogger("bot").info("аватар сохранён локально: %s", dest.name)
        return f"/uploads/avatars/profile_{user_id}.jpg"
    except Exception as exc:
        logging.getLogger("bot").warning("fetch photo: %s", exc)
        return ""


# ---------- маршруты ----------
@app.get("/api/health")
def health():
    return jsonify(ok=True, time=int(time.time() * 1000))


@app.post("/api/init")
def api_init():
    data = request.get_json(silent=True) or {}
    verified = verify_init_data(data.get("initData"))
    if not verified:
        return jsonify(ok=False, error="Invalid initData"), 401

    users = load_users()
    uid = str(verified["user"]["id"])
    if uid not in users:
        users[uid] = {
            **verified["user"],
            "created_at": int(time.time() * 1000),
            "first_login": time.strftime("%Y-%m-%d"),
            "bio": "",
            "birthday": "",
        }
        save_users(users)
    else:
        changed = False
        for key in ("first_name", "last_name", "username", "photo_url", "language_code", "is_premium"):
            if users[uid].get(key) != verified["user"][key]:
                users[uid][key] = verified["user"][key]
                changed = True
        if changed:
            save_users(users)

    # если аватарка не пришла в initData — вытаскиваем через Bot API
    stored_photo = users[uid].get("photo_url") or ""
    if stored_photo.startswith("https://api.telegram.org/"):
        stored_photo = ""  # старая внешняя ссылка — перекачиваем локально
    if not stored_photo:
        photo = fetch_telegram_photo(verified["user"]["id"])
        if photo:
            users[uid]["photo_url"] = photo
            save_users(users)
            logging.getLogger("bot").info("аватар подтянут из Telegram: %s", uid)

    res_user = public_user(users[uid])
    if res_user.get("photo_url"):
        res_user["photo_url"] = res_user["photo_url"].split("?", 1)[0]

    return jsonify(ok=True, user=res_user)


@app.get("/api/user")
def api_get_user():
    verified = verify_init_data(request.args.get("initData"))
    if not verified:
        return jsonify(ok=False, error="Invalid initData"), 401
    users = load_users()
    user = users.get(str(verified["user"]["id"]))
    if not user:
        return jsonify(ok=False, error="User not found"), 404
    return jsonify(ok=True, user=public_user(user))


@app.put("/api/user")
def api_put_user():
    data = request.get_json(silent=True) or {}
    verified = verify_init_data(data.get("initData"))
    if not verified:
        return jsonify(ok=False, error="Invalid initData"), 401

    users = load_users()
    user = users.get(str(verified["user"]["id"]))
    if not user:
        return jsonify(ok=False, error="User not found"), 404

    # first_login фиксируется при первом входе и не меняется
    save_users(users)

    return jsonify(ok=True, user=public_user(user))


@app.after_request
def no_cache(resp):
    """Не кешировать HTML/CSS/JS — иначе Telegram WebView показывает старую версию."""
    path = request.path or ""
    if path.endswith((".html", ".css", ".js")) or path == "/":
        resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
        resp.headers["Pragma"] = "no-cache"
        resp.headers["Expires"] = "0"
    return resp


# ---------- фронтенд ----------
@app.get("/")
def index():
    return send_from_directory(str(ROOT_DIR), "index.html")


@app.route("/<path:path>")
def static_files(path):
    target = ROOT_DIR / path
    if target.is_file():
        return send_from_directory(str(ROOT_DIR), path)
    return send_from_directory(str(ROOT_DIR), "index.html")


if __name__ == "__main__":
    print(f"[server] listening on :{PORT}, data in {DATA_DIR}")
    app.run(host="0.0.0.0", port=PORT)