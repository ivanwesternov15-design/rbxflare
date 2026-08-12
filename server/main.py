# -*- coding: utf-8 -*-
"""Главный файл для BotHost (Python 3.11).

Запускает:
1. Flask-сервер (мини-апп) — из app.py
2. Telegram-бота в фоне (long polling): отвечает на /start
   кнопкой с мини-аппом и ставит Menu Button (кнопка мини-аппа).

Start command на BotHost:  python main.py
"""
import json
import logging
import os
import threading
import time
from pathlib import Path

import requests
from app import app as flask_app

BASE_DIR = Path(__file__).resolve().parent

with open(BASE_DIR / "config.json", encoding="utf-8") as fh:
    CONFIG = json.load(fh)

BOT_TOKEN = CONFIG["botToken"]
WEB_APP_URL = CONFIG.get("webAppUrl", "").rstrip("/")
API = f"https://api.telegram.org/bot{BOT_TOKEN}"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("bot")


def bot_api(method, timeout=30, **kwargs):
    resp = requests.post(f"{API}/{method}", json=kwargs, timeout=timeout)
    data = resp.json()
    if not data.get("ok"):
        raise RuntimeError(f"{method}: {data.get('description')}")
    return data["result"]


def setup_menu_button():
    """Кнопка мини-аппа возле поля ввода. Работает после того,
    как домен подтверждён в @BotFather (Bot Settings -> Domain)."""
    try:
        bot_api(
            "setChatMenuButton",
            menu_button={
                "type": "web_app",
                "text": "Профиль",
                "web_app": {"url": WEB_APP_URL},
            },
        )
        log.info("menu button set")
    except Exception as exc:
        log.warning("menu button not set: %s (убедись, что домен добавлен в BotFather)", exc)


def bot_loop():
    offset = 0
    while True:
        try:
            updates = bot_api(
                "getUpdates",
                timeout=35,
                offset=offset,
                allowed_updates=["message"],
            )
            for upd in updates:
                offset = upd["update_id"] + 1
                msg = upd.get("message") or {}
                chat_id = msg.get("chat", {}).get("id")
                if not chat_id:
                    continue
                text = (msg.get("text") or "").strip()
                if text.startswith("/start"):
                    handle_start(chat_id)
        except Exception as exc:
            log.error("bot loop error: %s", exc)
            time.sleep(3)


def handle_start(chat_id):
    text = "Привет! Жми кнопку, чтобы открыть свой профиль \U0001F680"
    markup = {
        "inline_keyboard": [
            [{"text": "\U0001F680 Открыть профиль", "web_app": {"url": WEB_APP_URL}}]
        ]
    }
    try:
        bot_api("sendMessage", chat_id=chat_id, text=text, reply_markup=markup)
    except Exception as exc:
        log.warning("web_app button failed: %s — отправляю текстовую ссылку", exc)
        bot_api(
            "sendMessage",
            chat_id=chat_id,
            text=f"{text}\n\n{WEB_APP_URL}",
        )


if __name__ == "__main__":
    if WEB_APP_URL:
        setup_menu_button()
        threading.Thread(target=bot_loop, daemon=True).start()
    else:
        log.warning("webAppUrl пуст в config.json — бот не запускается")

    flask_app.run(host="0.0.0.0", port=int(os.environ.get("PORT", CONFIG.get("port", 8080))))