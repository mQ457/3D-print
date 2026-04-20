(function () {
  const API = window.AppBootstrap;
  const POST_LOGIN_REDIRECT_KEY = "app.postLoginRedirect";
  const form = document.querySelector("form.card-form-grid");
  const cardInput = form?.elements?.card;
  const expInput = form?.elements?.exp;
  const cvcInput = form?.elements?.cvc;
  const statusEl = document.createElement("div");
  statusEl.style.color = "#f87171";
  statusEl.style.marginTop = "12px";
  form?.appendChild(statusEl);

  function setStatus(message, isError) {
    statusEl.textContent = message || "";
    statusEl.style.color = isError ? "#f87171" : "#34d399";
  }

  function getPayload() {
    try {
      return JSON.parse(sessionStorage.getItem("checkout_payload") || "{}");
    } catch {
      return {};
    }
  }

  function rememberPostLoginRedirect(target) {
    try {
      sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, String(target || "checkout.html"));
    } catch (_error) {
      // noop
    }
  }

  function redirectToLoginForCheckout() {
    rememberPostLoginRedirect("checkout.html");
    window.location.replace("login.html?next=checkout.html");
  }

  function normalizeDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function formatCardNumber(value) {
    const digits = normalizeDigits(value).slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
  }

  function formatExpValue(value) {
    const digits = normalizeDigits(value).slice(0, 4);
    if (digits.length < 3) return digits;
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  function setupCardInputs() {
    if (cardInput) {
      cardInput.setAttribute("inputmode", "numeric");
      cardInput.setAttribute("autocomplete", "cc-number");
      cardInput.maxLength = 19;
      cardInput.addEventListener("input", () => {
        cardInput.value = formatCardNumber(cardInput.value);
      });
    }
    if (expInput) {
      expInput.setAttribute("inputmode", "numeric");
      expInput.setAttribute("autocomplete", "cc-exp");
      expInput.maxLength = 5;
      expInput.addEventListener("input", () => {
        expInput.value = formatExpValue(expInput.value);
      });
    }
    if (cvcInput) {
      cvcInput.setAttribute("inputmode", "numeric");
      cvcInput.setAttribute("autocomplete", "cc-csc");
      cvcInput.maxLength = 3;
      cvcInput.addEventListener("input", () => {
        cvcInput.value = normalizeDigits(cvcInput.value).slice(0, 3);
      });
    }
  }

  function validateCardForm() {
    const cardNumber = normalizeDigits(cardInput?.value || "");
    const expDigits = normalizeDigits(expInput?.value || "");
    const cvc = normalizeDigits(cvcInput?.value || "");

    if (cardNumber.length !== 16) {
      return { ok: false, message: "Введите корректный номер карты (16 цифр)." };
    }
    if (expDigits.length !== 4) {
      return { ok: false, message: "Введите срок действия карты в формате ММ/ГГ." };
    }
    const month = Number(expDigits.slice(0, 2));
    const year = Number(expDigits.slice(2));
    if (month < 1 || month > 12) {
      return { ok: false, message: "Месяц срока действия должен быть от 01 до 12." };
    }
    const now = new Date();
    const currentYear = Number(String(now.getFullYear()).slice(-2));
    const currentMonth = now.getMonth() + 1;
    if (year < currentYear || (year === currentYear && month < currentMonth)) {
      return { ok: false, message: "Срок действия карты истек." };
    }
    if (cvc.length !== 3) {
      return { ok: false, message: "Введите корректный CVC (3 цифры)." };
    }
    return { ok: true, cardNumber, month, year };
  }

  function syncSummary() {
    const payload = getPayload();
    const total = Number(payload.totalAmount || 0);
    const sumEl = document.querySelector(".sum");
    const rows = document.querySelectorAll(".summary-row span:last-child");
    if (rows[0]) rows[0].textContent = `${Math.max(0, total - 500)} ₽`;
    if (rows[1]) rows[1].textContent = "500 ₽";
    if (sumEl && total) sumEl.textContent = `${total} ₽`;
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("Обрабатываем оплату...", false);
    const validation = validateCardForm();
    const payload = getPayload();

    if (!validation.ok) {
      setStatus(validation.message, true);
      return;
    }

    try {
      const bootstrap = await API.request("/profile/bootstrap", { method: "GET" });
      let defaultCard = (bootstrap.paymentMethods || []).find((item) => item.isDefault);
      if (!defaultCard) {
        const created = await API.request("/profile/payment-methods", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cardNumber: validation.cardNumber,
            holderName: "CARD HOLDER",
            expMonth: validation.month,
            expYear: 2000 + validation.year,
            isDefault: true,
          }),
        });
        defaultCard = { id: created.id };
      }
      const defaultAddress = (bootstrap.addresses || []).find((item) => item.isDefault) || bootstrap.addresses?.[0];
      await API.request("/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          paymentMethodId: defaultCard?.id || null,
          addressId: defaultAddress?.id || null,
        }),
      });
      sessionStorage.removeItem("checkout_payload");
      window.location.href = "orders.html";
    } catch (error) {
      if (error.status === 401) {
        redirectToLoginForCheckout();
        return;
      }
      setStatus(error.message, true);
    }
  });

  API.bootstrapUser()
    .then(() => {
      API.wireLogout();
      syncSummary();
    })
    .catch((error) => {
      if (error.status === 401) redirectToLoginForCheckout();
    });

  setupCardInputs();
})();
