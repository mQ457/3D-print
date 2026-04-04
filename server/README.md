# Auth API (Express + SQLite)

## 1) Setup

1. Copy `.env.example` to `.env`.
2. If needed, update `DATABASE_FILE` in `.env` (default: `./data/app.db`).
3. Install dependencies in the `server` folder:
   - `cd server && npm install`
4. The database file and folder are created automatically when the server starts.

## 2) Run locally

- Dev: `cd server && npm run dev`
- Prod: `cd server && npm start`

Server starts on `http://localhost:3000` by default.

## 3) Free hosting recommendation

### Recommended free host: Render

Render имеет бесплатный тариф, поддерживает Node.js и позволяет хранить файлы SQLite на диске сервисa.

1. Зарегистрируйтесь на `https://render.com`.
2. Создайте новый Web Service.
3. Подключите свой GitHub/GitLab репозиторий или выберите `Manual Deploy`.
4. Укажите корневую папку репозитория `server` (важно: именно папку `server`).
5. В поле Build Command используйте:
   - `npm install`
6. В поле Start Command используйте:
   - `npm start`
7. В настройках Environment Variables добавьте:
   - `PORT=3000`
   - `DATABASE_FILE=./data/app.db`
   - `SESSION_COOKIE_NAME=session_token`
   - `CORS_ORIGIN=https://<ваш-сервис>.onrender.com`
   - `NODE_ENV=production`

Статические файлы (HTML, CSS, JS) будут обслуживаться из корня проекта автоматически.

### Альтернативы

- Fly.io — бесплатный тариф с возможностью монтировать persistent volume для SQLite.
- Railway — бесплатный план хорош для теста, но с SQLite и хранением на диске могут быть ограничения.

## 4) API

- `POST /api/auth/register` `{ phone, password }`
- `POST /api/auth/login` `{ phone, password }`
- `POST /api/auth/logout`
- `GET /api/profile/me`
- `PATCH /api/profile/me` `{ fullName, email }`

All authenticated requests use `HTTP-only` cookie set by login/register.
