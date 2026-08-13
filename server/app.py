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


# ---------- список картинок и аплоады ----------
@app.get("/api/files/<kind>")
def api_files(kind):
    """Имена картинок из папок галереи + аплоады бота (для авто-обновления в реальном времени)."""
    if kind not in ALLOWED_KINDS:
        return jsonify(ok=False, error="bad kind"), 400
    files = []

    src = ROOT_DIR / "tgminiapprbx" / kind
    if src.is_dir():
        for f in sorted(src.glob("*")):
            if f.suffix.lower() in (".jpg", ".jpeg", ".png"):
                files.append(f"/tgminiapprbx/{kind}/{f.name}")

    up = UPLOADS_DIR / kind
    if up.is_dir():
        for f in sorted(up.glob("*")):
            if f.suffix.lower() in (".jpg", ".jpeg", ".png"):
                files.append(f"/uploads/{kind}/{f.name}")

    return jsonify(ok=True, files=files)


@app.get("/uploads/<path:path>")
def uploads(path):
    return send_from_directory(str(UPLOADS_DIR), path)


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
    }


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

    if "bio" in data:
        user["bio"] = str(data.get("bio") or "").strip()[:200]
    if "birthday" in data:
        user["birthday"] = str(data.get("birthday") or "").strip()[:10]
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