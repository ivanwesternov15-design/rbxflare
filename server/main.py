# -*- coding: utf-8 -*-
"""Главный файл для BotHost (Python 3.11, шаблон aiogram).

- Flask: мини-апп (сайт + /api/init, /api/user, /api/files)
- aiogram 3: бот (long polling)
    /start      — кнопка мини-аппа + подтягивает bio из профиля Telegram
    /getphoto   — бот просит фото, скачивает его и добавляет в галерею
                  аватарок мини-аппа (видно сразу, в реальном времени)
- данные: $DATA_DIR (BotHost хранит его отдельно от контейнера)
"""
import asyncio
import json
import logging
import os
import threading
import time
from pathlib import Path

from aiogram import Bot, Dispatcher, F
from aiogram.filters import Command, CommandStart
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    MenuButtonWebApp,
    Message,
    WebAppInfo,
)

from app import app as flask_app

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("DATA_DIR") or BASE_DIR / "data")
UPLOADS_DIR = DATA_DIR / "uploads"
USERS_FILE = DATA_DIR / "users.json"
USERS_BACKUP = DATA_DIR / "users.json.bak"

DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

with open(BASE_DIR / "config.json", encoding="utf-8") as fh:
    CONFIG = json.load(fh)

BOT_TOKEN = (
    os.environ.get("TELEGRAM_BOT_TOKEN")
    or os.environ.get("BOT_TOKEN")
    or os.environ.get("TOKEN")
    or os.environ.get("API_TOKEN")
    or os.environ.get("BOT_API_TOKEN")
    or CONFIG["botToken"]
)

domain = os.environ.get("DOMAIN") or ""
WEB_APP_URL = (os.environ.get("WEB_APP_URL") or f"https://{domain}/" if domain else "").rstrip("/")
if not WEB_APP_URL:
    WEB_APP_URL = CONFIG.get("webAppUrl", "").rstrip("/")

PORT = int(os.environ.get("PORT", CONFIG.get("port", 8080)))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("bot")

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

WAITING_PHOTO = set()  # chat_id, ждущие фото после /getphoto


# ---------- хранилище (общее с app.py) ----------
def load_users():
    try:
        return json.loads(USERS_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save_users(users):
    USERS_BACKUP.write_text(json.dumps(users, ensure_ascii=False, indent=2), encoding="utf-8")
    USERS_FILE.write_text(json.dumps(users, ensure_ascii=False, indent=2), encoding="utf-8")


# ---------- команды ----------
@dp.message(CommandStart())
async def cmd_start(message: Message):
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="\U0001F680 Открыть профиль",
                    web_app=WebAppInfo(url=WEB_APP_URL),
                )
            ]
        ]
    )
    await message.answer(
        "Привет! Жми кнопку, чтобы открыть свой профиль \U0001F680",
        reply_markup=keyboard,
    )

    # подтягиваем "О себе" из профиля Telegram
    try:
        chat = await bot.get_chat(message.chat.id)
        bio = (getattr(chat, "bio", None) or "").strip()[:200]
        users = load_users()
        uid = str(message.chat.id)
        if uid in users and bio and users[uid].get("bio") != bio:
            users[uid]["bio"] = bio
            save_users(users)
            log.info("bio подтянут для %s", uid)
    except Exception as exc:
        log.warning("get_chat bio: %s", exc)


@dp.message(Command("getphoto"))
async def cmd_getphoto(message: Message):
    WAITING_PHOTO.add(message.chat.id)
    await message.answer("Пришли мне фото — сразу добавлю его в галерею аватарок мини-аппа \U0001F4F8")


@dp.message(F.photo)
async def on_photo(message: Message):
    chat_id = message.chat.id
    if chat_id not in WAITING_PHOTO:
        return
    WAITING_PHOTO.discard(chat_id)

    photo = message.photo[-1]
    if photo.file_size > 10 * 1024 * 1024:
        await message.answer("Фото слишком тяжёлое (макс 10 МБ) \uD83D\uDE25")
        return

    name = f"user_{message.from_user.id}_{int(time.time())}.jpg"
    dest = UPLOADS_DIR / "avatars" / name
    try:
        dest.parent.mkdir(parents=True, exist_ok=True)
        await bot.download(photo.file_id, destination=dest)
        log.info("фото сохранено: %s", name)
        await message.answer(
            "Готово! \u2705 Фото добавлено в мини-апп.\n"
            "Открой профиль \u2192 \u2764\ufe0f \u2192 галерея \u2192 вкладка «Аватар» и выбери его."
        )
    except Exception as exc:
        log.error("download photo: %s", exc)
        await message.answer("Не получилось сохранить фото, попробуй ещё раз \uD83D\uDE14")


# ---------- menu button ----------
async def setup_menu_button():
    try:
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(
                text="Профиль",
                web_app=WebAppInfo(url=WEB_APP_URL),
            )
        )
        log.info("menu button set")
    except Exception as exc:
        log.warning(
            "menu button not set: %s (добавь домен %s в @BotFather -> Bot Settings -> Domain)",
            exc,
            domain,
        )


async def main_async():
    try:
        await setup_menu_button()
    finally:
        log.info("bot polling started")
        await dp.start_polling(bot)


def run_flask():
    log.info("flask on :%s", PORT)
    flask_app.run(host="0.0.0.0", port=PORT)


if __name__ == "__main__":
    if WEB_APP_URL:
        threading.Thread(target=run_flask, daemon=True).start()
        try:
            asyncio.run(main_async())
        except KeyboardInterrupt:
            pass
    else:
        log.warning("WEB_APP_URL пуст — бот не запущен")
        run_flask()