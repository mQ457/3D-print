(function () {
  const API_BASE = "/api";
  const form = document.getElementById("auth-form");
  const phoneInput = form?.elements?.phone;
  const registerBtn = document.getElementById("register-btn");
  const statusEl = document.getElementById("auth-status");
  const LOGOUT_FLAG_KEY = "app.loggedOut";
  const POST_LOGIN_REDIRECT_KEY = "app.postLoginRedirect";
  const consentEl = document.getElementById("policy-consent");
  const ALLOWED_REDIRECTS = new Set([
    "checkout.html",
    "profile.html",
    "orders.html",
    "delivery-address.html",
    "payment.html",
    "admin.html",
  ]);

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

  function getPayload() {
    const formData = new FormData(form);
    return {
      phone: normalizePhoneInput(formData.get("phone")),
      password: String(formData.get("password") || ""),
    };
  }

  function normalizePhoneInput(value) {
    return String(value || "")
      .replace(/[^\d+]/g, "")
      .replace(/(?!^)\+/g, "");
  }

  function setupPhoneInput() {
    if (!phoneInput) return;
    phoneInput.setAttribute("inputmode", "numeric");
    phoneInput.setAttribute("autocomplete", "tel");
    phoneInput.setAttribute("pattern", "^[+]?[0-9]{10,15}$");
    phoneInput.maxLength = 16;
    phoneInput.addEventListener("input", () => {
      phoneInput.value = normalizePhoneInput(phoneInput.value);
    });
  }

  function isValidPhone(value) {
    return /^[+]?\d{10,15}$/.test(String(value || ""));
  }

  function sanitizeRedirect(value) {
    const normalized = String(value || "").trim().toLowerCase().replace(/^\//, "");
    if (!ALLOWED_REDIRECTS.has(normalized)) return "";
    return normalized;
  }

  function consumePostAuthTarget(role) {
    let target = "";
    try {
      const queryTarget = new URLSearchParams(window.location.search).get("next");
      const storedTarget = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
      target = sanitizeRedirect(queryTarget) || sanitizeRedirect(storedTarget);
      sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
    } catch (_error) {
      target = "";
    }

    if (role === "admin") {
      return "admin.html";
    }
    return target || "profile.html";
  }

  function validateCredentials(payload) {
    if (!isValidPhone(payload.phone)) {
      setStatus("Введите номер телефона в формате +79991234567 или 79991234567.", true);
      return false;
    }
    if (String(payload.password || "").length < 6) {
      setStatus("Пароль должен содержать минимум 6 символов.", true);
      return false;
    }
    return true;
  }

  function hasConsent() {
    if (consentEl?.checked) return true;
    setStatus("Подтвердите согласие на обработку персональных данных.", true);
    return false;
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!hasConsent()) return;
    const payload = getPayload();
    if (!validateCredentials(payload)) return;
    setStatus("Выполняется вход...", false);
    try {
      const data = await request("/auth/login", "POST", payload);
      try {
        sessionStorage.removeItem(LOGOUT_FLAG_KEY);
      } catch (_error) {
        // noop
      }
      setStatus("Успешный вход. Переходим...", false);
      setTimeout(() => {
        window.location.href = consumePostAuthTarget(data?.user?.role);
      }, 300);
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  registerBtn?.addEventListener("click", async () => {
    if (!hasConsent()) return;
    const payload = getPayload();
    if (!validateCredentials(payload)) return;
    setStatus("Создаём аккаунт...", false);
    try {
      const data = await request("/auth/register", "POST", payload);
      try {
        sessionStorage.removeItem(LOGOUT_FLAG_KEY);
      } catch (_error) {
        // noop
      }
      setStatus("Аккаунт создан. Переходим дальше...", false);
      setTimeout(() => {
        window.location.href = consumePostAuthTarget(data?.user?.role);
      }, 300);
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  request("/auth/me", "GET")
    .then((data) => {
      window.location.href = consumePostAuthTarget(data?.user?.role);
    })
    .catch(() => {});

  setupPhoneInput();
})();
