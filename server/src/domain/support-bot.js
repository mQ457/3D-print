const crypto = require("crypto");
const db = require("../db");

const AI_PROVIDER = String(process.env.AI_PROVIDER || "ollama").trim().toLowerCase();
const GROQ_API_KEY = String(process.env.GROQ_API_KEY || "").trim();
const GROQ_MODEL = String(process.env.GROQ_MODEL || "llama-3.1-8b-instant").trim();
const GROQ_BASE_URL = String(process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/+$/, "");
const OLLAMA_BASE_URL = String(process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
const OLLAMA_MODEL = String(process.env.OLLAMA_MODEL || "qwen2.5:3b").trim();
const OLLAMA_API_KEY = String(process.env.OLLAMA_API_KEY || "").trim();
const OLLAMA_TIMEOUT_MS = Math.max(3000, Number(process.env.OLLAMA_TIMEOUT_MS || 45000) || 45000);
const SUPPORT_BOT_ENABLED = String(process.env.SUPPORT_BOT_ENABLED || "1") !== "0";

const HUMAN_PATTERNS = [
  /вызов[иьяю]*\s+(консультант|оператор|человек)/i,
  /позов[иьяю]*\s+(консультант|оператор|человек)/i,
  /приглас[иьяю]*\s+(агент|оператор|человек|консультант)/i,
  /приголас[иьяю]*\s+(агент|оператор|человек|консультант)/i,
  /соедин[иьяю]*\s+с\s+(оператор|консультант|человек)/i,
  /(живой|реальный)\s+человек/i,
  /\bоператор\b/i,
  /\bконсультант\b/i,
  /\bагент\b/i,
];

function wantsHumanByMessage(text) {
  const normalized = String(text || "").toLowerCase();
  if (!normalized) return false;
  return HUMAN_PATTERNS.some((pattern) => pattern.test(normalized));
}

function buildPrompt({ subject, userMessage, history }) {
  const dialogue = history
    .slice(-12)
    .map((item) => `${item.senderType === "user" ? "Клиент" : "Поддержка"}: ${item.message}`)
    .join("\n");

  return `
Ты ИИ-ассистент техподдержки сервиса 3D-печати.
Отвечай кратко, дружелюбно и по делу.
Если данных недостаточно — задавай 1-2 уточняющих вопроса.
Если вопрос нельзя решить без человека или ты не уверен — предложи подключить консультанта.

Формат ответа строго JSON:
{"action":"answer|clarify|handoff","message":"текст для клиента"}

Где:
- "answer" — когда дал решение;
- "clarify" — когда нужны уточнения;
- "handoff" — когда нужен живой консультант.

Тема обращения: ${subject || "Без темы"}
История:
${dialogue || "История пуста"}

Последнее сообщение клиента:
${userMessage}
  `.trim();
}

function parseBotJson(rawText) {
  const text = String(rawText || "").trim();
  if (!text) return null;
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  try {
    const parsed = JSON.parse(text.slice(firstBrace, lastBrace + 1));
    if (!parsed || typeof parsed !== "object") return null;
    const action = String(parsed.action || "").trim().toLowerCase();
    const message = String(parsed.message || "").trim();
    if (!message) return null;
    if (!["answer", "clarify", "handoff"].includes(action)) return null;
    return { action, message };
  } catch (_error) {
    return null;
  }
}

async function insertBotMessage(threadId, message) {
  await db.query(
    `INSERT INTO support_messages (id, thread_id, sender_type, sender_id, message, created_at)
     VALUES ($1, $2, 'bot', NULL, $3, datetime('now'))`,
    [crypto.randomUUID(), threadId, message]
  );
}

async function updateThreadStatus(threadId, status) {
  await db.query(
    `UPDATE support_threads
     SET status = $1,
         updated_at = datetime('now'),
         last_message_at = datetime('now')
     WHERE id = $2`,
    [status, threadId]
  );
}

async function loadThreadContext(threadId) {
  const [threadRes, historyRes] = await Promise.all([
    db.query("SELECT id, subject, status FROM support_threads WHERE id = $1 LIMIT 1", [threadId]),
    db.query(
      `SELECT sender_type, message, created_at
       FROM support_messages
       WHERE thread_id = $1
       ORDER BY created_at ASC`,
      [threadId]
    ),
  ]);
  const thread = threadRes.rows[0];
  return {
    thread: thread || null,
    history: historyRes.rows.map((row) => ({
      senderType: row.sender_type,
      message: row.message || "",
      createdAt: row.created_at,
    })),
  };
}

async function callOllama(prompt) {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), OLLAMA_TIMEOUT_MS);
  const headers = { "Content-Type": "application/json" };
  if (OLLAMA_API_KEY) {
    headers.Authorization = `Bearer ${OLLAMA_API_KEY}`;
  }
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: "POST",
      headers,
      signal: abortController.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.2 },
      }),
    });
    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status}`);
    }
    const payload = await response.json();
    return String(payload?.response || "").trim();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callGroq(prompt) {
  if (!GROQ_API_KEY) {
    throw new Error("Groq API key is missing");
  }
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), OLLAMA_TIMEOUT_MS);
  try {
    const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      signal: abortController.signal,
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.2,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(`Groq request failed: ${response.status}`);
    }
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    return String(content || "").trim();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callModel(prompt) {
  if (AI_PROVIDER === "groq") {
    return callGroq(prompt);
  }
  return callOllama(prompt);
}

async function processSupportBotReply({ threadId, userMessage }) {
  const safeMessage = String(userMessage || "").trim();
  if (!safeMessage) return { handledByBot: false, escalated: false };

  const context = await loadThreadContext(threadId);
  if (!context.thread) return { handledByBot: false, escalated: false };

  if (!SUPPORT_BOT_ENABLED) {
    await updateThreadStatus(threadId, "open");
    await insertBotMessage(threadId, "Сейчас бот отключен. Подключаю консультанта.");
    return { handledByBot: false, escalated: true, reason: "bot_disabled" };
  }

  if (wantsHumanByMessage(safeMessage)) {
    await updateThreadStatus(threadId, "open");
    await insertBotMessage(threadId, "Подключаю консультанта. Пожалуйста, ожидайте ответа специалиста.");
    return { handledByBot: false, escalated: true, reason: "human_requested" };
  }

  try {
    const prompt = buildPrompt({
      subject: context.thread.subject,
      history: context.history,
      userMessage: safeMessage,
    });
    const raw = await callModel(prompt);
    const parsed = parseBotJson(raw);

    if (!parsed) {
      await updateThreadStatus(threadId, "open");
      await insertBotMessage(threadId, "Не удалось корректно обработать запрос. Подключаю консультанта.");
      return { handledByBot: false, escalated: true, reason: "invalid_model_response" };
    }

    if (parsed.action === "handoff") {
      await updateThreadStatus(threadId, "open");
      await insertBotMessage(threadId, parsed.message);
      return { handledByBot: false, escalated: true, reason: "handoff" };
    }

    await updateThreadStatus(threadId, "bot_active");
    await insertBotMessage(threadId, parsed.message);
    return { handledByBot: true, escalated: false, reason: parsed.action };
  } catch (_error) {
    await updateThreadStatus(threadId, "open");
    await insertBotMessage(
      threadId,
      "Не получилось обработать запрос автоматически. Передаю обращение консультанту."
    );
    return { handledByBot: false, escalated: true, reason: "model_error" };
  }
}

module.exports = {
  processSupportBotReply,
  wantsHumanByMessage,
};
