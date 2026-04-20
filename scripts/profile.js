(function () {
  const API = window.AppBootstrap;
  const form = document.getElementById("profile-form");
  const statusEl = document.getElementById("profile-status");
  const supportForm = document.getElementById("support-form");
  const supportStatus = document.getElementById("support-status");
  const supportThreads = document.getElementById("support-threads");
  const supportChat = document.getElementById("support-chat");
  const supportChatTitle = document.getElementById("support-chat-title");
  const supportMessages = document.getElementById("support-messages");
  const supportReplyForm = document.getElementById("support-reply-form");
  let activeThreadId = "";
  const sidebarName = document.getElementById("sidebar-name");
  const emailInput = form?.elements?.email;

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.style.color = isError ? "#dc2626" : "#16a34a";
  }

  function fillProfile(profile) {
    if (!form) return;
    form.elements.fullName.value = profile.fullName || "";
    form.elements.phone.value = profile.phone || "";
    form.elements.email.value = profile.email || "";
    sidebarName.textContent = profile.fullName || "Пользователь";
  }

  function isValidEmail(value) {
    const email = String(value || "").trim();
    if (!email) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function setupProfileValidation() {
    if (!emailInput) return;
    emailInput.setAttribute("inputmode", "email");
    emailInput.setAttribute("autocomplete", "email");
    emailInput.addEventListener("blur", () => {
      const value = String(emailInput.value || "").trim();
      emailInput.value = value;
    });
  }

  async function loadProfile() {
    try {
      const data = await API.request("/profile/me", { method: "GET" });
      fillProfile(data.profile || {});
    } catch (error) {
      if (error.status === 401) {
        window.location.replace("login.html");
        return;
      }
      setStatus(error.message, true);
    }
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = String(form.elements.email.value || "").trim();
    if (!isValidEmail(email)) {
      setStatus("Введите корректный email.", true);
      return;
    }
    setStatus("Сохраняем данные...", false);
    try {
      const payload = {
        fullName: String(form.elements.fullName.value || "").trim(),
        email,
      };
      const data = await API.request("/profile/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      fillProfile(data.profile || {});
      setStatus("Данные сохранены.", false);
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  async function loadThreads() {
    if (!supportThreads) return;
    try {
      const data = await API.request("/profile/support/threads", { method: "GET" });
      const threads = data.threads || [];
      if (threads.length === 0) {
        supportThreads.innerHTML = '<div class="muted-small">Обращений пока нет.</div>';
        supportChat.style.display = "none";
        return;
      }
      supportThreads.innerHTML = threads
        .map(
          (thread) => `
          <div data-thread-id="${thread.id}" style="padding:10px 12px;border:1px solid #e8eaf2;border-radius:10px;margin-top:8px;cursor:pointer;">
            <div style="font-weight:700;">${thread.subject}</div>
            <div class="muted-small">Статус: ${thread.status} | ${new Date(thread.lastMessageAt).toLocaleString("ru-RU")}</div>
          </div>`
        )
        .join("");
      if (!activeThreadId) {
        activeThreadId = threads[0].id;
      }
      supportThreads.querySelectorAll("[data-thread-id]").forEach((node) => {
        node.addEventListener("click", async () => {
          activeThreadId = node.getAttribute("data-thread-id");
          await loadMessages();
        });
      });
      await loadMessages();
    } catch (_error) {
      supportThreads.innerHTML = "";
    }
  }

  async function loadMessages() {
    if (!activeThreadId) return;
    try {
      const data = await API.request(`/profile/support/threads/${activeThreadId}/messages`, { method: "GET" });
      const messages = data.messages || [];
      supportChat.style.display = "block";
      supportChatTitle.textContent = `Чат обращения #${activeThreadId.slice(0, 8)}`;
      supportMessages.innerHTML = messages
        .map(
          (msg) => `
          <div style="margin-bottom:6px;padding:8px;border-radius:8px;background:${msg.senderType === "admin" ? "#fff1ea" : "#f4f7ff"};">
            <div class="muted-small">${msg.senderType === "admin" ? "Поддержка" : "Вы"} • ${new Date(msg.createdAt).toLocaleString("ru-RU")}</div>
            <div>${msg.message}</div>
          </div>`
        )
        .join("");
      supportMessages.scrollTop = supportMessages.scrollHeight;
    } catch (_error) {}
  }

  supportForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    supportStatus.textContent = "Отправка...";
    supportStatus.style.color = "#16a34a";
    try {
      const payload = {
        subject: String(supportForm.elements.subject.value || "").trim(),
        message: String(supportForm.elements.message.value || "").trim(),
      };
      await API.request("/profile/support/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      supportStatus.textContent = "Сообщение отправлено.";
      supportForm.reset();
      activeThreadId = "";
      await loadThreads();
    } catch (error) {
      supportStatus.textContent = error.message;
      supportStatus.style.color = "#dc2626";
    }
  });

  supportReplyForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!activeThreadId) return;
    const message = String(supportReplyForm.elements.message.value || "").trim();
    if (!message) return;
    try {
      await API.request(`/profile/support/threads/${activeThreadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      supportReplyForm.reset();
      await loadMessages();
    } catch (_error) {}
  });

  API.bootstrapUser()
    .then(() => {
      API.wireLogout();
      loadProfile();
      loadThreads();
      setInterval(loadMessages, 5000);
    })
    .catch((error) => {
      if (error.status === 401) {
        window.location.replace("login.html");
      }
    });

  setupProfileValidation();
})();
