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
import os
import time
import urllib.parse
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
DATA_DIR = BASE_DIR / "data"
USERS_FILE = DATA_DIR / "users.json"
USERS_BACKUP = DATA_DIR / "users.json.bak"
PORT = int(os.environ.get("PORT", 8080))

with open(BASE_DIR / "config.json", encoding="utf-8") as fh:
    BOT_TOKEN = json.load(fh)["botToken"]

app = Flask(__name__, static_url_path="", static_folder=str(ROOT_DIR))


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

    return jsonify(ok=True, user=public_user(users[uid]))


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