# Auth API (Express + Postgres)

## 1) Setup

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` in `.env` (for example Neon/Supabase/local Postgres).
3. Install dependencies in the `server` folder:
   - `cd server && npm install`
4. On first start the server creates tables automatically from `sql/init.sql`, seeds service options and ensures admin account.

Default admin credentials (if not overridden via env):
- phone: `+79990000000`
- password: `Admin12345!`

You can override them with:
- `ADMIN_PHONE`
- `ADMIN_PASSWORD`
- or `ADMIN_PASSWORD_HASH`

## 2) Run locally

- Dev: `cd server && npm run dev`
- Prod: `cd server && npm start`

Server starts on `http://localhost:3000` by default.

## 2.1) Local AI support bot (Ollama)

Support chat can auto-reply with a local LLM and escalate to human admin only when needed.

1. Install Ollama: `https://ollama.com/download`
2. Pull model (recommended starter): `ollama pull qwen2.5:3b`
3. Add env variables to `.env`:
   - `SUPPORT_BOT_ENABLED=1`
   - `OLLAMA_URL=http://127.0.0.1:11434`
   - `OLLAMA_MODEL=qwen2.5:3b`
   - optional: `OLLAMA_API_KEY=...` (if your Ollama endpoint is behind auth)
   - optional: `OLLAMA_TIMEOUT_MS=45000`

Escalation behavior:
- If user asks for a human (operator/consultant), thread is moved to human queue (`status=open`).
- If AI handles request, thread stays in bot mode (`status=closed`) and no admin notification is raised.

## 2.1.1) Groq API mode (no self-hosted Ollama)

Use Groq when you want AI in deploy without running your own model server.

Set env:
- `SUPPORT_BOT_ENABLED=1`
- `AI_PROVIDER=groq`
- `GROQ_API_KEY=...`
- `GROQ_MODEL=llama-3.1-8b-instant`
- optional: `GROQ_BASE_URL=https://api.groq.com/openai/v1`

## 2.2) Deploy with AI enabled

For production, run AI on a separate Linux server (VPS) and connect app backend to it.

On VPS:
1. Install Ollama and model:
   - `curl -fsSL https://ollama.com/install.sh | sh`
   - `ollama pull qwen2.5:3b`
2. Run as a service and expose endpoint via Nginx reverse proxy (HTTPS).
3. Protect endpoint with auth token (recommended) or IP allowlist.

In Render env:
- `SUPPORT_BOT_ENABLED=1`
- `AI_PROVIDER=ollama`
- `OLLAMA_URL=https://<your-ollama-domain>`
- `OLLAMA_MODEL=qwen2.5:3b`
- `OLLAMA_API_KEY=<token-if-enabled>`
- `AUTO_OPEN_BROWSER=0`

## 3) Render + Neon (free and persistent)

Render web service:
1. Register on `https://render.com`.
2. Create a new Web Service and connect your repository.
3. Set **Root Directory** to `server`.
4. Set **Build Command** to `npm install`.
5. Set **Start Command** to `npm start`.

Environment Variables in Render:
- `PORT=3000`
- `DATABASE_URL=postgresql://...` (your Neon connection string)
- `SESSION_COOKIE_NAME=session_token`
- `SESSION_TTL_DAYS=7`
- `CORS_ORIGIN=https://<your-service>.onrender.com`
- `NODE_ENV=production`
- optional: `ADMIN_PHONE=+79990000000`
- optional: `ADMIN_PASSWORD=Admin12345!`

Neon:
1. Create project on `https://neon.tech`.
2. Copy connection string and paste it into `DATABASE_URL` on Render.
3. Redeploy Render service.

## 4) API

- `POST /api/auth/register` `{ phone, password }`
- `POST /api/auth/login` `{ phone, password }`
- `POST /api/auth/logout`
- `GET /api/profile/me`
- `PATCH /api/profile/me` `{ fullName, email }`

All authenticated requests use `HTTP-only` cookie set by login/register.
