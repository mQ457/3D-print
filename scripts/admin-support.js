(function () {
  const API = window.AdminCommon;
  const listEl = document.getElementById("support-thread-list");
  const messagesEl = document.getElementById("support-messages");
  const headerEl = document.getElementById("support-thread-header");
  const formEl = document.getElementById("support-reply-form");
  const textEl = document.getElementById("support-reply-text");
  const closeBtn = document.getElementById("support-close-thread");
  const refreshBtn = document.getElementById("support-refresh");
  const filterText = document.getElementById("support-filter-text");
  const filterStatus = document.getElementById("support-filter-status");
  let selectedThreadId = "";
  let allThreads = [];

  function statusLabel(status) {
    const key = String(status || "").trim();
    if (key === "open") return "Оператор отвечает";
    if (key === "closed" || key === "bot_active") return "ИИ отвечает";
    return key || "—";
  }

  function formatDate(value) {
    if (!value) return "—";
    return new Date(value).toLocaleString("ru-RU");
  }

  function renderMessages(messages) {
    messagesEl.innerHTML = messages
      .map(
        (msg) => `
      <div class="msg ${msg.senderType === "admin" ? "admin" : ""}">
        <div style="font-size:12px;color:#99a2be;">${
          msg.senderType === "admin" ? "Админ" : msg.senderType === "bot" ? "ИИ-бот" : "Клиент"
        } · ${formatDate(msg.createdAt)}</div>
        <div>${msg.message}</div>
      </div>`
      )
      .join("");
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function loadMessages(threadId) {
    const data = await API.request(`/admin/support/threads/${threadId}/messages`);
    renderMessages(data.messages || []);
  }

  function renderThreads() {
    const text = String(filterText?.value || "").trim().toLowerCase();
    const status = String(filterStatus?.value || "").trim().toLowerCase();
    const items = allThreads.filter((thread) => {
      const byText =
        !text ||
        [thread.subject, thread.user?.fullName, thread.user?.phone].filter(Boolean).join(" ").toLowerCase().includes(text);
      const byStatus = !status || String(thread.status || "").toLowerCase().includes(status);
      return byText && byStatus;
    });
    if (items.length === 0) {
      listEl.innerHTML = '<div class="muted-small">Нет обращений.</div>';
      return;
    }
    listEl.innerHTML = items
      .map(
        (thread) => `
      <div class="chat-item ${thread.id === selectedThreadId ? "active" : ""}" data-thread-id="${thread.id}">
        <div class="chat-item__title-row">
          <b>${thread.subject}</b>
          ${thread.needsAdminReply ? '<span class="chat-unread-dot" aria-label="Нужно ответить клиенту"></span>' : ""}
        </div>
        <div style="font-size:12px;color:#99a2be;">${thread.user?.fullName || thread.user?.phone || "Клиент"} · ${statusLabel(thread.status)}</div>
        <div style="font-size:12px;color:#99a2be;">${formatDate(thread.lastMessageAt)}</div>
      </div>`
      )
      .join("");

    listEl.querySelectorAll("[data-thread-id]").forEach((item) => {
      item.addEventListener("click", async () => {
        selectedThreadId = item.getAttribute("data-thread-id");
        const thread = allThreads.find((entry) => entry.id === selectedThreadId);
        headerEl.textContent = `${thread.subject} (${statusLabel(thread.status)})`;
        renderThreads();
        await loadMessages(selectedThreadId);
      });
    });
  }

  async function loadThreads() {
    const data = await API.request("/admin/support/threads");
    allThreads = data.threads || [];
    if (!selectedThreadId && allThreads[0]) {
      selectedThreadId = allThreads[0].id;
      headerEl.textContent = `${allThreads[0].subject} (${statusLabel(allThreads[0].status)})`;
      await loadMessages(selectedThreadId);
    }
    renderThreads();
  }

  formEl?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selectedThreadId) return;
    const message = String(textEl.value || "").trim();
    if (!message) return;
    await API.request(`/admin/support/threads/${selectedThreadId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    textEl.value = "";
    await loadMessages(selectedThreadId);
    await loadThreads();
    if (typeof API.markNavSectionSeen === "function") {
      await API.markNavSectionSeen("support");
    } else if (typeof API.refreshNavUpdates === "function") {
      await API.refreshNavUpdates();
    }
  });

  closeBtn?.addEventListener("click", async () => {
    if (!selectedThreadId) return;
    await API.request(`/admin/support/threads/${selectedThreadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });
    await loadThreads();
    if (typeof API.markNavSectionSeen === "function") {
      await API.markNavSectionSeen("support");
    } else if (typeof API.refreshNavUpdates === "function") {
      await API.refreshNavUpdates();
    }
  });

  [filterText, filterStatus].forEach((el) => el?.addEventListener("input", renderThreads));
  refreshBtn?.addEventListener("click", loadThreads);

  async function init() {
    try {
      await API.ensureAdmin();
      API.wireLogout();
      await loadThreads();
      setInterval(loadThreads, 5000);
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        window.location.href = "admin.html";
      }
    }
  }

  init();
})();
