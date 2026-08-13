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
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    MenuButtonWebApp,
    Message,
    WebAppInfo,
)

from app import app as flask_app, fetch_telegram_photo

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

BUILD_COMMIT = ""
try:
    BUILD_COMMIT = (BASE_DIR / "VERSION").read_text(encoding="utf-8").strip()[:12]
except OSError:
    pass

log.info("BUILD COMMIT: %s", BUILD_COMMIT or "unknown")

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

WAITING_PHOTO = {}  # chat_id -> категория (fons | podfons)


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

    # подтягиваем "О себе" из профиля Telegram и создаём/обновляем запись
    try:
        chat = await bot.get_chat(message.chat.id)
        uid = str(message.chat.id)
        bio = (getattr(chat, "bio", None) or "").strip()[:200]

        users = load_users()
        if uid not in users:
            users[uid] = {
                "id": message.chat.id,
                "first_name": message.from_user.first_name or "",
                "last_name": message.from_user.last_name or "",
                "username": message.from_user.username or "",
                "photo_url": "",
                "language_code": message.from_user.language_code or "",
                "is_premium": bool(getattr(message.from_user, "is_premium", False)),
                "created_at": int(time.time() * 1000),
                "first_login": time.strftime("%Y-%m-%d"),
                "bio": bio,
                "birthday": "",
            }
            save_users(users)
            log.info("юзёр создан при /start: %s (bio=%r)", uid, bio)
        elif bio and users[uid].get("bio") != bio:
            users[uid]["bio"] = bio
            save_users(users)
            log.info("bio обновлён для %s: %r", uid, bio)
        else:
            log.info("bio %s: уже актуально (users=%s)", uid, uid in users)
    except Exception as exc:
        log.warning("get_chat bio: %s", exc)

    # сразу подтягиваем аватарку из профиля Telegram и сохраняем локально
    try:
        users = load_users()
        uid = str(message.chat.id)
        if uid in users and not (users[uid].get("photo_url") or "").startswith("/uploads/"):
            photo = fetch_telegram_photo(message.chat.id)
            if photo:
                users[uid]["photo_url"] = photo
                save_users(users)
                log.info("аватарка сохранена при /start: %s", uid)
    except Exception as exc:
        log.warning("photo on /start: %s", exc)


@dp.message(Command("getphoto"))
async def cmd_getphoto(message: Message):
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="\U0001F5BC\ufe0f Фон карточки", callback_data="ph_fons"),
                InlineKeyboardButton(text="\U0001F30C Фон приложения", callback_data="ph_podfons"),
            ]
        ]
    )
    await message.answer(
        "Куда добавить фото \U0001F4F8?",
        reply_markup=keyboard,
    )


@dp.callback_query(F.data.startswith("ph_"))
async def on_getphoto_kind(callback: CallbackQuery):
    kind = callback.data.replace("ph_", "")
    if kind not in ("fons", "podfons"):
        await callback.answer("Не знаю такую категорию \U0001F937")
        return
    WAITING_PHOTO[callback.message.chat.id] = kind
    await callback.answer()
    label = "«Фон карточки»" if kind == "fons" else "«Фон приложения»"
    await callback.message.answer(
        f"Пришли фото — добавлю его в {label} мини-аппа \U0001F4F8"
    )


@dp.message(Command("clear"))
async def cmd_clear(message: Message):
    """Удаляет все фотографии, добавленные через бота (линкуется с папкой uploads в галерее)."""
    removed = 0
    for kind in ("avatars", "fons", "podfons"):
        folder = UPLOADS_DIR / kind
        if not folder.is_dir():
            continue
        for f in folder.iterdir():
            try:
                if f.is_file():
                    f.unlink()
                    removed += 1
            except OSError as exc:
                log.warning("не удалось удалить %s: %s", f.name, exc)
    log.info("очистка uploads: удалено файлов = %s (chat %s)", removed, message.chat.id)
    if removed:
        await message.answer(f"Готово! Удалено файлов: {removed}. Открой профиль заново \u2705")
    else:
        await message.answer("Папка загрузок и так пустая \U0001F44D")


@dp.message(F.photo)
async def on_photo(message: Message):
    chat_id = message.chat.id
    kind = WAITING_PHOTO.pop(chat_id, None)
    if not kind:
        return

    photo = message.photo[-1]
    if photo.file_size > 10 * 1024 * 1024:
        await message.answer("Фото слишком тяжёлое (макс 10 МБ) \uD83D\uDE25")
        return

    name = f"user_{message.from_user.id}_{int(time.time())}.jpg"
    dest = UPLOADS_DIR / kind / name
    try:
        dest.parent.mkdir(parents=True, exist_ok=True)
        await bot.download(photo.file_id, destination=dest)
        log.info("фото сохранено: %s/%s", kind, name)
        label = "карточки" if kind == "fons" else "приложения"
        await message.answer(
            "Готово! \u2705 Фото добавлено в мини-апп.\n"
            f"Открой профиль \u2192 \u2764\ufe0f \u2192 галерея \u2192 вкладка «Фон {label}» и выбери его."
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
    log.info("flask on :%s (build %s)", PORT, BUILD_COMMIT or "unknown")
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