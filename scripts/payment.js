(function () {
  const API = window.AppBootstrap;
  const cardsRoot = document.getElementById("payment-cards");
  const addCardForm = document.getElementById("add-card-form");
  const newCardTrigger = document.getElementById("new-card-trigger");
  const statusEl = document.getElementById("payment-status");
  const ordersRoot = document.getElementById("payment-orders");
  const cardNumberInput = addCardForm?.elements?.cardNumber;
  const expMonthInput = addCardForm?.elements?.expMonth;
  const expYearInput = addCardForm?.elements?.expYear;

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.style.color = isError ? "#dc2626" : "#16a34a";
  }

  function normalizeDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function formatCardNumber(value) {
    const digits = normalizeDigits(value).slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
  }

  function setupCardFormInputs() {
    if (cardNumberInput) {
      cardNumberInput.setAttribute("inputmode", "numeric");
      cardNumberInput.setAttribute("autocomplete", "cc-number");
      cardNumberInput.maxLength = 19;
      cardNumberInput.addEventListener("input", () => {
        cardNumberInput.value = formatCardNumber(cardNumberInput.value);
      });
    }
    if (expMonthInput) {
      expMonthInput.setAttribute("inputmode", "numeric");
      expMonthInput.maxLength = 2;
      expMonthInput.addEventListener("input", () => {
        expMonthInput.value = normalizeDigits(expMonthInput.value).slice(0, 2);
      });
    }
    if (expYearInput) {
      expYearInput.setAttribute("inputmode", "numeric");
      expYearInput.maxLength = 4;
      expYearInput.addEventListener("input", () => {
        expYearInput.value = normalizeDigits(expYearInput.value).slice(0, 4);
      });
    }
  }

  function validateCardPayload(raw) {
    const cardDigits = normalizeDigits(raw.cardNumber);
    const month = Number(raw.expMonth);
    const year = Number(raw.expYear);
    if (cardDigits.length !== 16) {
      return { ok: false, message: "Введите корректный номер карты (16 цифр)." };
    }
    if (!month || month < 1 || month > 12) {
      return { ok: false, message: "Месяц должен быть от 1 до 12." };
    }
    if (!Number.isInteger(year) || year < 2024 || year > 2099) {
      return { ok: false, message: "Введите корректный год карты (например 2028)." };
    }
    const now = new Date();
    if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) {
      return { ok: false, message: "Срок действия карты уже истек." };
    }
    return {
      ok: true,
      payload: {
        cardNumber: cardDigits,
        holderName: String(raw.holderName || "").trim(),
        expMonth: month,
        expYear: year,
      },
    };
  }

  async function loadCards() {
    const data = await API.request("/profile/payment-methods", { method: "GET" });
    const cards = data.paymentMethods || [];
    const addNode = cardsRoot.querySelector("#new-card-trigger");
    cardsRoot.querySelectorAll(".bank-card[data-card-id]").forEach((node) => node.remove());
    cards.forEach((card) => {
      const node = document.createElement("div");
      node.className = `bank-card ${card.isDefault ? "is-active" : ""}`;
      node.dataset.cardId = card.id;
      node.innerHTML = `
        <div class="brand">
          <span aria-hidden="true">💳</span>
          <span class="hint">${String(card.expMonth || "").padStart(2, "0")}/${String(card.expYear || "").slice(-2)}</span>
        </div>
        <div class="num">${card.cardMask}</div>
        <div class="hint">${card.holderName || "Карта клиента"}</div>
      `;
      node.addEventListener("click", async () => {
        await API.request(`/profile/payment-methods/${card.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isDefault: true }),
        });
        await loadCards();
      });
      cardsRoot.insertBefore(node, addNode);
    });
  }

  async function loadOrders() {
    const data = await API.request("/orders", { method: "GET" });
    const orders = (data.orders || []).filter((order) => order.status !== "Оплачен");
    if (orders.length === 0) {
      ordersRoot.innerHTML = '<div class="muted-small">Нет заказов, ожидающих оплаты.</div>';
      return;
    }
    ordersRoot.innerHTML = orders
      .map(
        (order) => `
        <div class="pay-item">
          <div class="pay-item-row">
            <div class="left">
              <div class="ico" aria-hidden="true"></div>
              <div class="meta">Заказ #${order.orderNumber || order.id.slice(0, 8)}<span class="sub">${order.serviceName}</span></div>
            </div>
            <div class="right">
              <div class="sum">${order.totalAmount} руб.</div>
              <span class="link">${order.status}</span>
            </div>
          </div>
        </div>`
      )
      .join("");
  }

  newCardTrigger?.addEventListener("click", () => {
    addCardForm.style.display = addCardForm.style.display === "none" ? "block" : "none";
  });

  addCardForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("Сохранение карты...", false);
    const validation = validateCardPayload({
      cardNumber: addCardForm.elements.cardNumber.value,
      holderName: addCardForm.elements.holderName.value,
      expMonth: addCardForm.elements.expMonth.value,
      expYear: addCardForm.elements.expYear.value,
    });
    if (!validation.ok) {
      setStatus(validation.message, true);
      return;
    }
    try {
      await API.request("/profile/payment-methods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...validation.payload,
          isDefault: true,
        }),
      });
      addCardForm.reset();
      setStatus("Карта сохранена.", false);
      await loadCards();
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  API.bootstrapUser()
    .then(() => {
      API.wireLogout();
      return Promise.all([loadCards(), loadOrders()]);
    })
    .catch((error) => {
      if (error.status === 401) window.location.replace("login.html");
    });

  setupCardFormInputs();
})();
