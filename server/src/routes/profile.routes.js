const express = require("express");
const crypto = require("crypto");
const db = require("../db");
const requireAuth = require("../middleware/requireAuth");
const {
  orderChatUpload,
  ensureOrderThread,
  listMessagesWithAttachments,
  appendThreadMessage,
} = require("../domain/order-chat");
const { notificationUpload } = require("../domain/notification-upload");
const { processSupportBotReply } = require("../domain/support-bot");

const router = express.Router();

function maskCard(number) {
  const digits = String(number || "").replace(/\D/g, "");
  if (digits.length < 12) return null;
  return `**** **** **** ${digits.slice(-4)}`;
}

function paymentPublicRow(row) {
  return {
    id: row.id,
    cardMask: row.card_mask,
    holderName: row.holder_name || "",
    expMonth: row.exp_month || null,
    expYear: row.exp_year || null,
    isDefault: Boolean(row.is_default),
  };
}

async function requireOwnedOrder(orderId, userId) {
  const orderRes = await db.query(
    `SELECT id, user_id, order_number, service_name, service_type, status, created_at
     FROM orders
     WHERE id = $1 AND user_id = $2
     LIMIT 1`,
    [orderId, userId]
  );
  return orderRes.rows[0] || null;
}

router.get("/bootstrap", requireAuth, async (req, res, next) => {
  try {
    const userRes = await db.query(
      `SELECT id, phone, full_name, email, role
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [req.auth.userId]
    );
    const addressRes = await db.query(
      `SELECT id, label, recipient_name, phone, address_line, city, lat, lng, is_default
       FROM user_addresses
       WHERE user_id = $1
       ORDER BY is_default DESC, created_at DESC`,
      [req.auth.userId]
    );
    const paymentRes = await db.query(
      `SELECT id, card_mask, holder_name, exp_month, exp_year, is_default
       FROM payment_methods
       WHERE user_id = $1
       ORDER BY is_default DESC, created_at DESC`,
      [req.auth.userId]
    );

    const user = userRes.rows[0];
    res.json({
      ok: true,
      user: {
        id: user.id,
        phone: user.phone,
        fullName: user.full_name || "",
        email: user.email || "",
        role: user.role || "user",
      },
      addresses: addressRes.rows.map((row) => ({
        id: row.id,
        label: row.label || "",
        recipientName: row.recipient_name || "",
        phone: row.phone || "",
        addressLine: row.address_line,
        city: row.city || "",
        lat: row.lat,
        lng: row.lng,
        isDefault: Boolean(row.is_default),
      })),
      paymentMethods: paymentRes.rows.map(paymentPublicRow),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const userRes = await db.query(
      `SELECT id, phone, full_name, email, role
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [req.auth.userId]
    );
    const user = userRes.rows[0];
    res.json({
      ok: true,
      profile: {
        id: user.id,
        phone: user.phone,
        fullName: user.full_name || "",
        email: user.email || "",
        role: user.role || "user",
      },
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/me", requireAuth, async (req, res, next) => {
  try {
    const { fullName, email } = req.body || {};
    const normalizedEmail = String(email || "").trim();

    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Введите корректный email.",
      });
    }

    await db.query(
      `UPDATE users
       SET full_name = $1,
           email = $2,
           updated_at = datetime('now')
       WHERE id = $3`,
      [String(fullName || "").trim() || null, normalizedEmail || null, req.auth.userId]
    );

    const updated = await db.query(
      `SELECT id, phone, full_name, email, role
       FROM users
       WHERE id = $1`,
      [req.auth.userId]
    );

    const user = updated.rows[0];
    res.json({
      ok: true,
      profile: {
        id: user.id,
        phone: user.phone,
        fullName: user.full_name || "",
        email: user.email || "",
        role: user.role || "user",
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/addresses", requireAuth, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, label, recipient_name, phone, address_line, city, lat, lng, is_default
       FROM user_addresses
       WHERE user_id = $1
       ORDER BY is_default DESC, created_at DESC`,
      [req.auth.userId]
    );
    res.json({
      ok: true,
      addresses: result.rows.map((row) => ({
        id: row.id,
        label: row.label || "",
        recipientName: row.recipient_name || "",
        phone: row.phone || "",
        addressLine: row.address_line,
        city: row.city || "",
        lat: row.lat,
        lng: row.lng,
        isDefault: Boolean(row.is_default),
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/addresses", requireAuth, async (req, res, next) => {
  try {
    const { label, recipientName, phone, addressLine, city, lat, lng, isDefault } = req.body || {};
    if (!String(addressLine || "").trim()) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Введите адрес." });
    }

    if (isDefault) {
      await db.query("UPDATE user_addresses SET is_default = 0 WHERE user_id = $1", [req.auth.userId]);
    }

    const id = crypto.randomUUID();
    await db.query(
      `INSERT INTO user_addresses (id, user_id, label, recipient_name, phone, address_line, city, lat, lng, is_default, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, datetime('now'), datetime('now'))`,
      [
        id,
        req.auth.userId,
        String(label || "").trim() || null,
        String(recipientName || "").trim() || null,
        String(phone || "").trim() || null,
        String(addressLine || "").trim(),
        String(city || "").trim() || null,
        lat ?? null,
        lng ?? null,
        isDefault ? 1 : 0,
      ]
    );

    res.status(201).json({ ok: true, id });
  } catch (error) {
    next(error);
  }
});

router.patch("/addresses/:id", requireAuth, async (req, res, next) => {
  try {
    const addressId = req.params.id;
    const existing = await db.query("SELECT id FROM user_addresses WHERE id = $1 AND user_id = $2 LIMIT 1", [
      addressId,
      req.auth.userId,
    ]);
    if (!existing.rows[0]) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Адрес не найден." });
    }

    const { label, recipientName, phone, addressLine, city, lat, lng, isDefault } = req.body || {};
    if (isDefault) {
      await db.query("UPDATE user_addresses SET is_default = 0 WHERE user_id = $1", [req.auth.userId]);
    }
    await db.query(
      `UPDATE user_addresses
       SET label = $1,
           recipient_name = $2,
           phone = $3,
           address_line = $4,
           city = $5,
           lat = $6,
           lng = $7,
           is_default = $8,
           updated_at = datetime('now')
       WHERE id = $9 AND user_id = $10`,
      [
        String(label || "").trim() || null,
        String(recipientName || "").trim() || null,
        String(phone || "").trim() || null,
        String(addressLine || "").trim() || "",
        String(city || "").trim() || null,
        lat ?? null,
        lng ?? null,
        isDefault ? 1 : 0,
        addressId,
        req.auth.userId,
      ]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.delete("/addresses/:id", requireAuth, async (req, res, next) => {
  try {
    await db.query("DELETE FROM user_addresses WHERE id = $1 AND user_id = $2", [req.params.id, req.auth.userId]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get("/payment-methods", requireAuth, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, card_mask, holder_name, exp_month, exp_year, is_default
       FROM payment_methods
       WHERE user_id = $1
       ORDER BY is_default DESC, created_at DESC`,
      [req.auth.userId]
    );
    res.json({ ok: true, paymentMethods: result.rows.map(paymentPublicRow) });
  } catch (error) {
    next(error);
  }
});

router.post("/payment-methods", requireAuth, async (req, res, next) => {
  try {
    const { cardNumber, holderName, expMonth, expYear, isDefault } = req.body || {};
    const digits = String(cardNumber || "").replace(/\D/g, "");
    if (digits.length < 12) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Введите корректный номер карты." });
    }
    const mask = maskCard(digits);
    const token = crypto.createHash("sha256").update(`${req.auth.userId}:${digits}`).digest("hex");
    if (isDefault) {
      await db.query("UPDATE payment_methods SET is_default = 0 WHERE user_id = $1", [req.auth.userId]);
    }
    const id = crypto.randomUUID();
    await db.query(
      `INSERT INTO payment_methods (id, user_id, card_token, card_mask, holder_name, exp_month, exp_year, is_default, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, datetime('now'), datetime('now'))`,
      [
        id,
        req.auth.userId,
        token,
        mask,
        String(holderName || "").trim() || null,
        Number(expMonth || 0) || null,
        Number(expYear || 0) || null,
        isDefault ? 1 : 0,
      ]
    );
    res.status(201).json({ ok: true, id });
  } catch (error) {
    next(error);
  }
});

router.patch("/payment-methods/:id", requireAuth, async (req, res, next) => {
  try {
    const { holderName, expMonth, expYear, isDefault } = req.body || {};
    if (isDefault) {
      await db.query("UPDATE payment_methods SET is_default = 0 WHERE user_id = $1", [req.auth.userId]);
    }
    await db.query(
      `UPDATE payment_methods
       SET holder_name = $1,
           exp_month = $2,
           exp_year = $3,
           is_default = $4,
           updated_at = datetime('now')
       WHERE id = $5 AND user_id = $6`,
      [
        String(holderName || "").trim() || null,
        Number(expMonth || 0) || null,
        Number(expYear || 0) || null,
        isDefault ? 1 : 0,
        req.params.id,
        req.auth.userId,
      ]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.delete("/payment-methods/:id", requireAuth, async (req, res, next) => {
  try {
    await db.query("DELETE FROM payment_methods WHERE id = $1 AND user_id = $2", [req.params.id, req.auth.userId]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get("/support/threads", requireAuth, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, subject, status, created_at, updated_at, last_message_at
       FROM support_threads
       WHERE user_id = $1
       ORDER BY last_message_at DESC`,
      [req.auth.userId]
    );
    res.json({
      ok: true,
      threads: result.rows.map((row) => ({
        id: row.id,
        subject: row.subject,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastMessageAt: row.last_message_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/support/threads", requireAuth, async (req, res, next) => {
  try {
    const { subject, message } = req.body || {};
    if (!String(subject || "").trim()) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Введите тему обращения." });
    }
    if (!String(message || "").trim()) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Введите сообщение." });
    }
    const threadId = crypto.randomUUID();
    const msgId = crypto.randomUUID();
    await db.query(
      `INSERT INTO support_threads (id, user_id, subject, status, created_at, updated_at, last_message_at)
       VALUES ($1, $2, $3, 'closed', datetime('now'), datetime('now'), datetime('now'))`,
      [threadId, req.auth.userId, String(subject).trim()]
    );
    await db.query(
      `INSERT INTO support_messages (id, thread_id, sender_type, sender_id, message, created_at)
       VALUES ($1, $2, 'user', $3, $4, datetime('now'))`,
      [msgId, threadId, req.auth.userId, String(message).trim()]
    );
    const botResult = await processSupportBotReply({
      threadId,
      userMessage: String(message).trim(),
    });
    res.status(201).json({
      ok: true,
      threadId,
      escalated: Boolean(botResult?.escalated),
      handledByBot: Boolean(botResult?.handledByBot),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/support/threads/:threadId/messages", requireAuth, async (req, res, next) => {
  try {
    const thread = await db.query("SELECT id FROM support_threads WHERE id = $1 AND user_id = $2 LIMIT 1", [
      req.params.threadId,
      req.auth.userId,
    ]);
    if (!thread.rows[0]) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Обращение не найдено." });
    }
    const messages = await db.query(
      `SELECT id, sender_type, sender_id, message, created_at
       FROM support_messages
       WHERE thread_id = $1
       ORDER BY created_at ASC`,
      [req.params.threadId]
    );
    res.json({
      ok: true,
      messages: messages.rows.map((row) => ({
        id: row.id,
        senderType: row.sender_type,
        senderId: row.sender_id,
        message: row.message,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/support/threads/:threadId/messages", requireAuth, async (req, res, next) => {
  try {
    const { message } = req.body || {};
    if (!String(message || "").trim()) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Введите сообщение." });
    }
    const thread = await db.query("SELECT id, status FROM support_threads WHERE id = $1 AND user_id = $2 LIMIT 1", [
      req.params.threadId,
      req.auth.userId,
    ]);
    const threadRow = thread.rows[0];
    if (!threadRow) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Обращение не найдено." });
    }
    await db.query(
      `INSERT INTO support_messages (id, thread_id, sender_type, sender_id, message, created_at)
       VALUES ($1, $2, 'user', $3, $4, datetime('now'))`,
      [crypto.randomUUID(), req.params.threadId, req.auth.userId, String(message).trim()]
    );
    await db.query(
      `UPDATE support_threads
       SET updated_at = datetime('now'),
           last_message_at = datetime('now')
       WHERE id = $1`,
      [req.params.threadId]
    );
    if (threadRow.status === "open") {
      return res.status(201).json({ ok: true, escalated: true, handledByBot: false });
    }
    const botResult = await processSupportBotReply({
      threadId: req.params.threadId,
      userMessage: String(message).trim(),
    });
    return res.status(201).json({
      ok: true,
      escalated: Boolean(botResult?.escalated),
      handledByBot: Boolean(botResult?.handledByBot),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/order-chats", requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(300, Math.max(1, Number(req.query.limit || 100)));
    const result = await db.query(
      `SELECT t.id, t.order_id, t.status, t.unread_user, t.unread_admin, t.last_message_at, t.updated_at,
              o.order_number, o.service_name, o.service_type, o.status AS order_status, o.created_at AS order_created_at
       FROM order_threads t
       JOIN orders o ON o.id = t.order_id
       WHERE t.user_id = $1
       ORDER BY t.last_message_at DESC
       LIMIT $2`,
      [req.auth.userId, limit]
    );
    res.json({
      ok: true,
      threads: result.rows.map((row) => ({
        id: row.id,
        orderId: row.order_id,
        status: row.status,
        unreadUser: Number(row.unread_user || 0),
        unreadAdmin: Number(row.unread_admin || 0),
        lastMessageAt: row.last_message_at,
        updatedAt: row.updated_at,
        order: {
          orderNumber: row.order_number || "",
          serviceName: row.service_name || "",
          serviceType: row.service_type || "",
          status: row.order_status || "",
          createdAt: row.order_created_at,
        },
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/order-chats/unread", requireAuth, async (req, res, next) => {
  try {
    const result = await db.query(
      "SELECT COALESCE(SUM(unread_user), 0) AS unread_count FROM order_threads WHERE user_id = $1",
      [req.auth.userId]
    );
    res.json({ ok: true, unreadCount: Number(result.rows[0]?.unread_count || 0) });
  } catch (error) {
    next(error);
  }
});

router.get("/order-chats/:orderId/messages", requireAuth, async (req, res, next) => {
  try {
    const order = await requireOwnedOrder(req.params.orderId, req.auth.userId);
    if (!order) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Заказ не найден." });
    }
    const threadId = await ensureOrderThread(order.id, req.auth.userId);
    const messages = await listMessagesWithAttachments(threadId);
    await db.query(
      `UPDATE order_threads
       SET unread_user = 0,
           updated_at = datetime('now')
       WHERE id = $1`,
      [threadId]
    );
    res.json({
      ok: true,
      thread: {
        id: threadId,
        orderId: order.id,
        status: order.status,
        serviceName: order.service_name || "",
        serviceType: order.service_type || "",
      },
      messages,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/order-chats/:orderId/messages", requireAuth, orderChatUpload.array("attachments", 10), async (req, res, next) => {
  try {
    const order = await requireOwnedOrder(req.params.orderId, req.auth.userId);
    if (!order) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Заказ не найден." });
    }
    const message = String(req.body?.message || "").trim();
    const files = req.files || [];
    if (!message && files.length === 0) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Введите сообщение или добавьте вложение." });
    }
    const threadId = await ensureOrderThread(order.id, req.auth.userId);
    await appendThreadMessage({
      threadId,
      senderType: "user",
      senderId: req.auth.userId,
      message,
      files,
      unreadTarget: "admin",
    });
    res.status(201).json({ ok: true, threadId });
  } catch (error) {
    next(error);
  }
});

router.patch("/order-chats/:orderId/read", requireAuth, async (req, res, next) => {
  try {
    const order = await requireOwnedOrder(req.params.orderId, req.auth.userId);
    if (!order) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Заказ не найден." });
    }
    const threadId = await ensureOrderThread(order.id, req.auth.userId);
    await db.query(
      `UPDATE order_threads
       SET unread_user = 0,
           updated_at = datetime('now')
       WHERE id = $1`,
      [threadId]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get("/notifications/unread", requireAuth, async (req, res, next) => {
  try {
    const result = await db.query(
      "SELECT COUNT(*) AS count FROM user_notifications WHERE user_id = $1 AND is_read = 0 AND sender_type = 'admin'",
      [req.auth.userId]
    );
    res.json({ ok: true, unreadCount: Number(result.rows[0]?.count || 0) });
  } catch (error) {
    next(error);
  }
});

router.get("/notifications", requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const result = await db.query(
      `SELECT id, message, file_name, file_path, file_mime, file_size, is_read, sender_type, created_at
       FROM user_notifications
       WHERE user_id = $1
       ORDER BY datetime(created_at) DESC
       LIMIT $2`,
      [req.auth.userId, limit]
    );
    res.json({
      ok: true,
      notifications: result.rows.map((row) => ({
        id: row.id,
        message: row.message || "",
        fileName: row.file_name || "",
        filePath: row.file_path || "",
        fileMime: row.file_mime || "",
        fileSize: Number(row.file_size || 0),
        isRead: Boolean(row.is_read),
        senderType: row.sender_type || "admin",
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/notifications/read", requireAuth, async (req, res, next) => {
  try {
    await db.query(
      `UPDATE user_notifications
       SET is_read = 1
       WHERE user_id = $1 AND sender_type = 'admin'`,
      [req.auth.userId]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post("/notifications/reply", requireAuth, notificationUpload.single("attachment"), async (req, res, next) => {
  try {
    const message = String(req.body?.message || "").trim();
    const file = req.file;
    if (!message && !file) {
      return res.status(400).json({ error: "VALIDATION_ERROR", message: "Введите сообщение или прикрепите файл." });
    }
    await db.query(
      `INSERT INTO user_notifications (
        id, user_id, admin_id, sender_type, message, file_name, file_path, file_mime, file_size, is_read, created_at
      )
      VALUES ($1, $2, NULL, 'user', $3, $4, $5, $6, $7, 0, datetime('now'))`,
      [
        crypto.randomUUID(),
        req.auth.userId,
        message || "",
        file?.originalname || null,
        file ? `/uploads/${file.filename}` : null,
        file?.mimetype || null,
        file?.size || null,
      ]
    );
    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
