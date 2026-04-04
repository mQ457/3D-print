(function () {
  const API_BASE = "/api";
  const form = document.getElementById("auth-form");
  const registerBtn = document.getElementById("register-btn");
  const statusEl = document.getElementById("auth-status");

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.style.color = isError ? "#dc2626" : "#16a34a";
  }

  async function request(path, method, payload) {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || "Ошибка запроса");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  const ADMIN_LOGIN = {
    phone: "123456",
    password: "admin123",
  };

  function getPayload() {
    const formData = new FormData(form);
    return {
      phone: String(formData.get("phone") || "").trim(),
      password: String(formData.get("password") || ""),
    };
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("Выполняется вход...", false);
    try {
      const payload = getPayload();
      if (payload.phone === ADMIN_LOGIN.phone && payload.password === ADMIN_LOGIN.password) {
        setStatus("Админ вход выполнен. Переход в панель...", false);
        setTimeout(() => {
          window.location.href = "admin.html";
        }, 300);
        return;
      }

      await request("/auth/login", "POST", payload);
      setStatus("Успешный вход. Переходим в профиль...", false);
      setTimeout(() => {
        window.location.href = "profile.html";
      }, 300);
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  registerBtn?.addEventListener("click", async () => {
    setStatus("Создаём аккаунт...", false);
    try {
      const payload = getPayload();
      await request("/auth/register", "POST", payload);
      setStatus("Аккаунт создан. Переходим в профиль...", false);
      setTimeout(() => {
        window.location.href = "profile.html";
      }, 300);
    } catch (error) {
      setStatus(error.message, true);
    }
  });
})();
