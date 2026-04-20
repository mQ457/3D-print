(function () {
  const loginBlock = document.getElementById("admin-login");
  const appBlock = document.getElementById("admin-app");
  const loginForm = document.getElementById("admin-login-form");
  const loginStatus = document.getElementById("admin-login-status");
  const phoneInput = loginForm?.elements?.phone;
  const statsRoot = document.getElementById("dashboard-stats");
  const ordersRoot = document.getElementById("dashboard-orders");
  const refreshBtn = document.getElementById("refresh-dashboard");
  const API = window.AdminCommon;

  function formatDate(value) {
    if (!value) return "—";
    return new Date(value).toLocaleString("ru-RU");
  }

  function normalizePhone(value) {
    return String(value || "")
      .replace(/[^\d+]/g, "")
      .replace(/(?!^)\+/g, "");
  }

  function setupPhoneValidation() {
    if (!phoneInput) return;
    phoneInput.setAttribute("inputmode", "numeric");
    phoneInput.setAttribute("pattern", "^[+]?[0-9]{10,15}$");
    phoneInput.maxLength = 16;
    phoneInput.addEventListener("input", () => {
      phoneInput.value = normalizePhone(phoneInput.value);
    });
  }

  async function renderDashboard() {
    const [dashboard, orders] = await Promise.all([API.request("/admin/dashboard"), API.request("/admin/orders")]);
    statsRoot.innerHTML = `
      <div class="stat"><div class="label">Пользователи</div><div class="value">${dashboard.totalUsers}</div></div>
      <div class="stat"><div class="label">Заказы</div><div class="value">${dashboard.totalOrders}</div></div>
      <div class="stat"><div class="label">Открытых чатов</div><div class="value">${dashboard.openThreads}</div></div>
      <div class="stat"><div class="label">Обновлено</div><div class="value">${new Date().toLocaleTimeString("ru-RU")}</div></div>
    `;
    ordersRoot.innerHTML = (orders.orders || [])
      .slice(0, 12)
      .map(
        (order) => `
      <tr>
        <td>${order.orderNumber || order.id.slice(0, 8)}</td>
        <td>${order.user?.fullName || order.user?.phone || "—"}</td>
        <td>${order.serviceName || "—"}</td>
        <td><span class="pill">${order.status}</span></td>
        <td>${order.totalAmount || 0} ₽</td>
        <td>${formatDate(order.createdAt)}</td>
      </tr>`
      )
      .join("");
  }

  async function tryOpenAdmin() {
    try {
      await API.ensureAdmin();
      loginBlock.style.display = "none";
      appBlock.style.display = "grid";
      API.wireLogout();
      await renderDashboard();
    } catch {
      loginBlock.style.display = "block";
      appBlock.style.display = "none";
    }
  }

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginStatus.textContent = "Вход...";
    loginStatus.style.color = "#99a2be";
    try {
      const fd = new FormData(loginForm);
      const phone = normalizePhone(fd.get("phone"));
      if (!/^[+]?\d{10,15}$/.test(phone)) {
        loginStatus.textContent = "Введите корректный номер телефона.";
        loginStatus.style.color = "#ff7676";
        return;
      }
      await API.request("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          password: String(fd.get("password") || ""),
        }),
      });
      await tryOpenAdmin();
    } catch (error) {
      loginStatus.textContent = error.message;
      loginStatus.style.color = "#ff7676";
    }
  });

  refreshBtn?.addEventListener("click", renderDashboard);
  setupPhoneValidation();
  tryOpenAdmin();
})();
