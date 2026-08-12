# Telegram Mini App — профиль-карточка (V5)

Мини-апп «жидкое стекло»: карточка профиля Telegram с галереей
аватарок/фонов и серверной частью для данных пользователей.

## Структура
```
index.html          — фронтенд (карточка + галерея)
style.css           — стили (тёмное стекло, анимации 2026)
script.js           — логика: Telegram SDK, авто-сканирование картинок
manifest.js         — фолбэк-список картинок (генерируется update-gallery.bat)
tgminiapprbx/       — картинки: avatars/ fons/ podfons/
server/             — бэкенд (Node.js + Express)
server/server.js    — API: /api/init, /api/user + раздача фронтенда
server/data/        — данные пользователей (users.json), в git НЕ идёт
server/config.json  — токен бота
```

## Что умеет
- Подтягивает реальные данные из Telegram: имя, username, id, аватар
- «О себе» и день рождения — редактируются по нажатию, хранятся на сервере
- Если день рождения не указан — показывается дата первого входа (пишется автоматически)
- Галерея картинок автоматически читает папки avatars/fons/podfons
- Выбор картинок кешируется в localStorage у каждого пользователя

## Проверка подписи initData
Сервер проверяет initData по стандартной схеме Telegram:
`hash = HMAC_SHA256(HMAC_SHA256("WebAppData", bot_token), check_string)`
Подделанные или просроченные (>48ч) запросы отклоняются (401).

## Запуск локально
```
cd server && npm install && node server.js
```
Открой http://localhost:8080

## Деплой на BotHost
1. Репозиторий подключён к BotHost (автодеплой с GitHub)
2. Start command: `node server/server.js`
3. В @BotFather: Menu Button → домен приложения от BotHost
4. Готово — данные юзеров копятся в server/data/users.json на сервере