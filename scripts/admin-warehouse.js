(function () {
  const API = window.AdminCommon;
  const tbody = document.getElementById("warehouse-body");
  const searchEl = document.getElementById("warehouse-search");
  const accountingSearchEl = document.getElementById("warehouse-accounting-search");
  const accountingBody = document.getElementById("warehouse-accounting-body");
  const refreshBtn = document.getElementById("warehouse-refresh");
  const addBtn = document.getElementById("warehouse-add");
  const modal = document.getElementById("warehouse-modal");
  const modalForm = document.getElementById("warehouse-modal-form");
  const modalSubmit = document.getElementById("warehouse-modal-submit");
  let items = [];

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function render() {
    const text = String(searchEl?.value || "").trim().toLowerCase();
    const filtered = items.filter((item) => {
      const byText =
        !text ||
        [item.shortId, item.id, item.code, item.name, item.materialCode, item.colorCode, item.technologyCode].join(" ").toLowerCase().includes(text);
      return item.itemType === "material_variant" && byText;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6">Нет данных</td></tr>';
      return;
    }

    const groups = new Map();
    filtered.forEach((item) => {
      const key = `${item.technologyCode}||${item.materialCode}`;
      if (!groups.has(key)) {
        groups.set(key, { key, technologyCode: item.technologyCode, materialCode: item.materialCode, items: [] });
      }
      groups.get(key).items.push(item);
    });

    const htmlParts = [];
    Array.from(groups.values()).forEach((group, groupIndex) => {
      const totalStock = group.items.reduce((sum, item) => sum + Number(item.stockQty || 0), 0);
      const totalAvailable = group.items.reduce((sum, item) => sum + Number(item.availableQty || 0), 0);
      const stockPercent = totalStock > 0 ? (totalAvailable / totalStock) * 100 : 0;
      const status = stockPercent >= 60 ? "ok" : stockPercent >= 20 ? "low" : "critical";
      const rowKey = `g-${groupIndex}`;
      htmlParts.push(`
      <tr class="warehouse-group-row">
        <td>${esc(rowKey)}</td>
        <td>${esc(group.technologyCode)}</td>
        <td>${esc(group.materialCode)}</td>
        <td>${group.items.length}</td>
        <td>${esc(totalStock)}</td>
        <td><span class="stock-dot stock-dot--${status}"></span></td>
        <td><button class="btn-secondary" data-group-toggle="${rowKey}">Показать</button></td>
      </tr>`);
      group.items.forEach((item) => {
        htmlParts.push(`
      <tr class="warehouse-child-row" data-parent="${rowKey}" style="display:none;">
        <td>${esc(item.shortId || item.id)}</td>
        <td colspan="2" style="min-width:260px;">
          <div class="warehouse-child-grid">
            <input value="${esc(item.colorCode)}" data-color-id="${item.id}" />
            <input type="number" step="0.1" value="${item.thicknessMm != null ? item.thicknessMm : ""}" data-thickness-id="${item.id}" />
            <input type="number" step="0.01" value="${item.stockQty || 0}" data-stock-id="${item.id}" />
            <input value="${esc(item.unit || "g")}" data-unit-id="${item.id}" />
            <input type="number" value="${item.pricePerCm3 || 0}" data-price-id="${item.id}" />
          </div>
        </td>
        <td>${esc(item.availableQty)}</td>
        <td>${esc(item.stockQty)}</td>
        <td><span class="stock-dot stock-dot--${item.stockStatus || "ok"}"></span></td>
        <td>
          <button class="btn-secondary" data-save-id="${item.id}">Сохранить</button>
          <button class="btn-secondary" data-delete-id="${item.id}">Удалить</button>
        </td>
      </tr>`);
      });
    });
    tbody.innerHTML = htmlParts.join("");

    tbody.querySelectorAll("[data-group-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.getAttribute("data-group-toggle");
        const rows = tbody.querySelectorAll(`.warehouse-child-row[data-parent="${key}"]`);
        if (!rows.length) return;
        const opened = Array.from(rows).some((row) => row.style.display !== "none");
        rows.forEach((row) => {
          row.style.display = opened ? "none" : "table-row";
        });
        button.textContent = opened ? "Показать" : "Скрыть";
      });
    });

    tbody.querySelectorAll("[data-save-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.getAttribute("data-save-id");
        const current = items.find((row) => row.id === id);
        if (!current) return;
        await API.request(`/admin/warehouse/items/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `${current.materialCode || ""} ${tbody.querySelector(`[data-color-id="${id}"]`)?.value || ""} ${tbody.querySelector(`[data-thickness-id="${id}"]`)?.value || ""}мм`,
            technologyCode: current.technologyCode || "",
            materialCode: current.materialCode || "",
            colorCode: tbody.querySelector(`[data-color-id="${id}"]`)?.value || "",
            thicknessMm: tbody.querySelector(`[data-thickness-id="${id}"]`)?.value || null,
            stockQty: Number(tbody.querySelector(`[data-stock-id="${id}"]`)?.value || 0),
            unit: String(tbody.querySelector(`[data-unit-id="${id}"]`)?.value || "g"),
            pricePerCm3: Number(tbody.querySelector(`[data-price-id="${id}"]`)?.value || 0),
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

    const accText = String(accountingSearchEl?.value || "").trim().toLowerCase();
    const accountingItems = items.filter((item) => {
      const byText =
        !accText ||
        [item.shortId, item.id, item.materialCode, item.colorCode, item.technologyCode, item.code].join(" ").toLowerCase().includes(accText);
      return item.itemType === "material_variant" && byText;
    });
    accountingBody.innerHTML =
      accountingItems.length === 0
        ? '<tr><td colspan="11">Нет данных</td></tr>'
        : accountingItems
            .map(
              (item) => `
      <tr>
        <td>${esc(item.shortId || item.id)}</td>
        <td>${esc(item.technologyCode)}</td>
        <td>${esc(item.materialCode)}</td>
        <td>${esc(item.colorCode)}</td>
        <td>${esc(item.thicknessMm)}</td>
        <td>${esc(item.stockQty)}</td>
        <td>${esc(item.reservedQty)}</td>
        <td>${esc(item.consumedQty)}</td>
        <td>${esc(item.availableQty)}</td>
        <td>${esc(item.unit)}</td>
        <td><span class="stock-dot stock-dot--${item.stockStatus || "ok"}"></span></td>
      </tr>`
            )
            .join("");
  }

  async function load() {
    const data = await API.request("/admin/warehouse/items");
    items = data.items || [];
    render();
  }

  addBtn?.addEventListener("click", async () => {
    modal.hidden = false;
  });

  document.querySelectorAll("[data-close-warehouse-modal]").forEach((node) => {
    node.addEventListener("click", () => {
      modal.hidden = true;
    });
  });

  modalSubmit?.addEventListener("click", async () => {
    if (!modalForm) return;
    const formData = new FormData(modalForm);
    const technologyCode = String(formData.get("technologyCode") || "").trim().toLowerCase();
    const materialCode = String(formData.get("materialCode") || "").trim().toLowerCase();
    const colorCode = String(formData.get("colorCode") || "").trim().toLowerCase();
    const thicknessMm = Number(formData.get("thicknessMm") || 0);
    const stockQty = Number(formData.get("stockQty") || 0);
    const unit = String(formData.get("unit") || "g").trim().toLowerCase();
    const pricePerCm3 = Number(formData.get("pricePerCm3") || 0);
    if (!technologyCode || !materialCode || !colorCode || !Number.isFinite(thicknessMm)) return;
    const code = `${technologyCode}-${materialCode}-${colorCode}-${thicknessMm}`;
    const name = `${materialCode.toUpperCase()} ${colorCode} ${thicknessMm}мм`;
    await API.request("/admin/warehouse/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemType: "material_variant",
        code,
        name,
        technologyCode,
        materialCode,
        colorCode,
        thicknessMm,
        stockQty,
        unit,
        pricePerCm3,
        active: true,
        sortOrder: 100,
      }),
    });
    modal.hidden = true;
    modalForm.reset();
    await load();
  });

  [searchEl, accountingSearchEl].forEach((el) => el?.addEventListener("input", render));
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
