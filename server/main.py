# -*- coding: utf-8 -*-
"""Главный файл для BotHost (Python 3.11, шаблон aiogram).

- Flask: мини-апп (сайт + /api/init, /api/user) — порт из $PORT
- aiogram 3: бот (long polling), /start с кнопкой мини-аппа,
  Menu Button (web_app) после подтверждения домена в BotFather
- данные: $DATA_DIR (BotHost хранит его отдельно от контейнера)
"""
import asyncio
import json
import logging
import os
import threading
from pathlib import Path

from aiogram import Bot, Dispatcher
from aiogram.filters import CommandStart
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    MenuButtonWebApp,
    Message,
    WebAppInfo,
)

from app import app as flask_app

BASE_DIR = Path(__file__).resolve().parent

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


def run_bot():
    asyncio.run(main_async())


async def main_async():
    try:
        await setup_menu_button()
    finally:
        log.info("bot polling started")
        await dp.start_polling(bot)


if __name__ == "__main__":
    if WEB_APP_URL:
        threading.Thread(target=run_bot, daemon=True).start()
    else:
        log.warning("WEB_APP_URL пуст — бот не запущен")

    log.info("flask on :%s", PORT)
    flask_app.run(host="0.0.0.0", port=PORT)