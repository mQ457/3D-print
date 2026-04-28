(function () {
  const API = window.AdminCommon;
  const tbody = document.getElementById("warehouse-body");
  const typeEl = document.getElementById("warehouse-type");
  const searchEl = document.getElementById("warehouse-search");
  const refreshBtn = document.getElementById("warehouse-refresh");
  const addBtn = document.getElementById("warehouse-add");
  let items = [];

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function render() {
    const type = String(typeEl?.value || "");
    const text = String(searchEl?.value || "").trim().toLowerCase();
    const filtered = items.filter((item) => {
      const byType = !type || item.itemType === type;
      const byText =
        !text ||
        [item.code, item.name, item.materialCode, item.colorCode, item.technologyCode].join(" ").toLowerCase().includes(text);
      return byType && byText;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="19">Нет данных</td></tr>';
      return;
    }

    tbody.innerHTML = filtered
      .map(
        (item) => `
      <tr>
        <td>${esc(item.itemType)}</td>
        <td>${esc(item.code)}</td>
        <td><input value="${esc(item.name)}" data-name-id="${item.id}" /></td>
        <td><input value="${esc(item.technologyCode)}" data-tech-id="${item.id}" /></td>
        <td><input value="${esc(item.materialCode)}" data-material-id="${item.id}" ${item.itemType === "technology" ? "disabled" : ""} /></td>
        <td><input value="${esc(item.colorCode)}" data-color-id="${item.id}" ${item.itemType === "technology" ? "disabled" : ""} /></td>
        <td><input type="number" step="0.1" value="${item.thicknessMm != null ? item.thicknessMm : ""}" data-thickness-id="${item.id}" ${item.itemType === "technology" ? "disabled" : ""} /></td>
        <td><input type="number" step="0.01" value="${item.stockQty || 0}" data-stock-id="${item.id}" ${item.itemType === "technology" ? "disabled" : ""} /></td>
        <td>${item.itemType === "material_variant" ? esc(item.reservedQty || 0) : "—"}</td>
        <td>${item.itemType === "material_variant" ? esc(item.consumedQty || 0) : "—"}</td>
        <td>${item.itemType === "material_variant" ? esc(item.availableQty || 0) : "—"}</td>
        <td><input value="${esc(item.unit || "g")}" data-unit-id="${item.id}" ${item.itemType === "technology" ? "disabled" : ""} /></td>
        <td><input type="number" value="${item.pricePerCm3 || 0}" data-price-id="${item.id}" ${item.itemType === "technology" ? "disabled" : ""} /></td>
        <td><input type="number" value="${item.lowStockThreshold || 0}" data-low-id="${item.id}" ${item.itemType === "technology" ? "disabled" : ""} /></td>
        <td><input type="number" value="${item.stopStockThreshold || 0}" data-stop-id="${item.id}" ${item.itemType === "technology" ? "disabled" : ""} /></td>
        <td>${item.itemType === "material_variant" ? (item.stockStatus === "critical" ? "🔴 Критично" : item.stockStatus === "low" ? "🟠 Мало" : "🟢 Норма") : "—"}</td>
        <td><input type="checkbox" data-active-id="${item.id}" ${item.active ? "checked" : ""} /></td>
        <td><input type="number" value="${item.sortOrder || 0}" data-sort-id="${item.id}" /></td>
        <td>
          <button class="btn-secondary" data-save-id="${item.id}">Сохранить</button>
          <button class="btn-secondary" data-delete-id="${item.id}">Удалить</button>
        </td>
      </tr>`
      )
      .join("");

    tbody.querySelectorAll("[data-save-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.getAttribute("data-save-id");
        const current = items.find((row) => row.id === id);
        if (!current) return;
        await API.request(`/admin/warehouse/items/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: tbody.querySelector(`[data-name-id="${id}"]`)?.value || "",
            technologyCode: tbody.querySelector(`[data-tech-id="${id}"]`)?.value || "",
            materialCode: tbody.querySelector(`[data-material-id="${id}"]`)?.value || "",
            colorCode: tbody.querySelector(`[data-color-id="${id}"]`)?.value || "",
            thicknessMm: tbody.querySelector(`[data-thickness-id="${id}"]`)?.value || null,
            stockQty: current.itemType === "material_variant" ? Number(tbody.querySelector(`[data-stock-id="${id}"]`)?.value || 0) : 0,
            unit: current.itemType === "material_variant" ? String(tbody.querySelector(`[data-unit-id="${id}"]`)?.value || "g") : "service",
            pricePerCm3: current.itemType === "material_variant" ? Number(tbody.querySelector(`[data-price-id="${id}"]`)?.value || 0) : 0,
            lowStockThreshold: current.itemType === "material_variant" ? Number(tbody.querySelector(`[data-low-id="${id}"]`)?.value || 0) : 0,
            stopStockThreshold: current.itemType === "material_variant" ? Number(tbody.querySelector(`[data-stop-id="${id}"]`)?.value || 0) : 0,
            active: tbody.querySelector(`[data-active-id="${id}"]`)?.checked,
            sortOrder: Number(tbody.querySelector(`[data-sort-id="${id}"]`)?.value || 0),
          }),
        });
        await load();
      });
    });

    tbody.querySelectorAll("[data-delete-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.getAttribute("data-delete-id");
        await API.request(`/admin/warehouse/items/${id}`, { method: "DELETE" });
        await load();
      });
    });
  }

  async function load() {
    const data = await API.request("/admin/warehouse/items");
    items = data.items || [];
    render();
  }

  addBtn?.addEventListener("click", async () => {
    const itemType = String(prompt("Тип (technology/material_variant):", "material_variant") || "").trim();
    if (!itemType) return;
    const code = String(prompt("Код (уникальный):", "new-item-code") || "").trim().toLowerCase();
    const name = String(prompt("Название:", "Новый элемент") || "").trim();
    if (!code || !name) return;
    const technologyCode = String(
      prompt("Код технологии (пример: fdm/sla):", itemType === "technology" ? code.replace(/^tech-/, "") : "fdm") || ""
    )
      .trim()
      .toLowerCase();
    const payload = {
      itemType,
      code,
      name,
      technologyCode,
      active: true,
      sortOrder: 100,
    };
    if (itemType === "material_variant") {
      payload.materialCode = String(prompt("Код материала:", "pla") || "").trim().toLowerCase();
      payload.colorCode = String(prompt("Код цвета:", "green") || "").trim().toLowerCase();
      payload.thicknessMm = Number(prompt("Толщина слоя, мм:", "0.2") || 0.2);
      payload.stockQty = Number(prompt("Остаток на складе:", "1000") || 0);
      payload.unit = String(prompt("Единица измерения (g/ml):", "g") || "g").trim();
      payload.pricePerCm3 = Number(prompt("Цена за см3, ₽:", "40") || 0);
      payload.lowStockThreshold = Number(prompt("Порог low:", "1000") || 0);
      payload.stopStockThreshold = Number(prompt("Порог stop:", "300") || 0);
    }
    await API.request("/admin/warehouse/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await load();
  });

  [typeEl, searchEl].forEach((el) => el?.addEventListener("input", render));
  refreshBtn?.addEventListener("click", load);

  async function init() {
    try {
      await API.ensureAdmin();
      API.wireLogout();
      await load();
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        window.location.href = "admin.html";
      }
    }
  }
  init();
})();
