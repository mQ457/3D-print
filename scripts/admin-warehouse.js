(function () {
  const API = window.AdminCommon;
  const refreshBtn = document.getElementById("warehouse-refresh");
  const techSearchEl = document.getElementById("warehouse-tech-search");
  const materialSearchEl = document.getElementById("warehouse-material-search");
  const techBody = document.getElementById("warehouse-tech-body");
  const materialBody = document.getElementById("warehouse-material-body");
  const addTechBtn = document.getElementById("warehouse-tech-add");
  const addMaterialBtn = document.getElementById("warehouse-material-add");
  const addTechCodeEl = document.getElementById("warehouse-tech-code");
  const addTechNameEl = document.getElementById("warehouse-tech-name");
  const addMaterialCodeEl = document.getElementById("warehouse-material-code");
  const addMaterialNameEl = document.getElementById("warehouse-material-name");

  let options = [];
  let items = [];

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function byType(type) {
    return options.filter((row) => row.type === type);
  }

  function renderTechnologies() {
    const text = String(techSearchEl?.value || "").trim().toLowerCase();
    const technologies = byType("technology").filter((row) =>
      !text || [row.code, row.name].join(" ").toLowerCase().includes(text)
    );
    if (!technologies.length) {
      techBody.innerHTML = '<tr><td colspan="3">Нет данных</td></tr>';
      return;
    }
    techBody.innerHTML = technologies
      .map(
        (row) => `<tr>
          <td>${esc(row.code)}</td>
          <td><input data-tech-name="${row.id}" value="${esc(row.name)}"></td>
          <td><button class="btn-secondary" data-tech-save="${row.id}">Сохранить</button></td>
          <td><button class="btn-secondary" data-tech-delete="${row.id}">Удалить</button></td>
        </tr>`
      )
      .join("");
  }

  function stockIndicatorClass(status) {
    if (status === "critical") return "critical";
    if (status === "low") return "low";
    return "ok";
  }

  function renderMaterials() {
    const text = String(materialSearchEl?.value || "").trim().toLowerCase();
    const materials = byType("material").filter((row) =>
      !text || [row.code, row.name].join(" ").toLowerCase().includes(text)
    );
    if (!materials.length) {
      materialBody.innerHTML = '<tr><td colspan="8">Нет данных</td></tr>';
      return;
    }
    const materialStats = materials.map((material) => {
      const variants = items.filter((item) => item.itemType === "material_variant" && item.materialCode === material.code);
      const totalStock = variants.reduce((sum, item) => sum + Number(item.stockQty || 0), 0);
      const totalAvailable = variants.reduce((sum, item) => sum + Number(item.availableQty || 0), 0);
      const avgPrice = variants.length
        ? variants.reduce((sum, item) => sum + Number(item.pricePerCm3 || 0), 0) / variants.length
        : Number(material.priceDelta || 0);
      const unit = variants[0]?.unit || "g";
      const status = totalStock > 0 ? (totalAvailable / totalStock >= 0.6 ? "ok" : totalAvailable / totalStock >= 0.2 ? "low" : "critical") : "critical";
      return { material, variants, totalStock, avgPrice, unit, status };
    });
    materialBody.innerHTML = materials
      .map((row) => {
        const stat = materialStats.find((item) => item.material.id === row.id);
        return `<tr>
          <td>${esc(row.code)}</td>
          <td><input data-material-name="${row.id}" value="${esc(row.name)}"></td>
          <td><input type="number" step="0.1" data-material-price="${row.id}" value="${Number(stat?.avgPrice || 0).toFixed(2)}"></td>
          <td><input type="number" step="0.1" data-material-stock="${row.id}" value="${Number(stat?.totalStock || 0).toFixed(2)}"></td>
          <td>${esc(stat?.unit || "g")}</td>
          <td><span class="stock-dot stock-dot--${stockIndicatorClass(stat?.status)}"></span></td>
          <td><button class="btn-secondary" data-material-save="${row.id}">Сохранить</button></td>
          <td><button class="btn-secondary" data-material-delete="${row.id}">Удалить</button></td>
        </tr>`
      })
      .join("");

    techBody.querySelectorAll("[data-tech-save]").forEach((node) => {
      node.addEventListener("click", async () => {
        const id = node.getAttribute("data-tech-save");
        const name = String(techBody.querySelector(`[data-tech-name="${id}"]`)?.value || "").trim();
        if (!name) return;
        await API.request(`/admin/options/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        await load();
      });
    });

    techBody.querySelectorAll("[data-tech-delete]").forEach((node) => {
      node.addEventListener("click", async () => {
        const id = node.getAttribute("data-tech-delete");
        await API.request(`/admin/options/${id}`, { method: "DELETE" });
        await load();
      });
    });

    materialBody.querySelectorAll("[data-material-save]").forEach((node) => {
      node.addEventListener("click", async () => {
        const id = node.getAttribute("data-material-save");
        const material = materials.find((row) => row.id === id);
        if (!material) return;
        const name = String(materialBody.querySelector(`[data-material-name="${id}"]`)?.value || "").trim();
        const nextPrice = Number(materialBody.querySelector(`[data-material-price="${id}"]`)?.value || 0);
        const nextStock = Number(materialBody.querySelector(`[data-material-stock="${id}"]`)?.value || 0);
        await API.request(`/admin/options/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, priceDelta: nextPrice }),
        });
        const variants = items.filter((item) => item.itemType === "material_variant" && item.materialCode === material.code);
        const currentStock = variants.reduce((sum, item) => sum + Number(item.stockQty || 0), 0);
        const multiplier = currentStock > 0 ? nextStock / currentStock : 1;
        await Promise.all(
          variants.map((variant) =>
            API.request(`/admin/warehouse/items/${variant.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                stockQty: Math.max(0, Number((Number(variant.stockQty || 0) * multiplier).toFixed(2))),
                pricePerCm3: nextPrice,
              }),
            })
          )
        );
        await load();
      });
    });

    materialBody.querySelectorAll("[data-material-delete]").forEach((node) => {
      node.addEventListener("click", async () => {
        const id = node.getAttribute("data-material-delete");
        await API.request(`/admin/options/${id}`, { method: "DELETE" });
        await load();
      });
    });
  }

  function render() {
    renderTechnologies();
    renderMaterials();
  }

  async function load() {
    const [optionsData, itemsData] = await Promise.all([API.request("/admin/options"), API.request("/admin/warehouse/items")]);
    options = optionsData.options || [];
    items = itemsData.items || [];
    render();
  }

  addTechBtn?.addEventListener("click", async () => {
    const code = String(addTechCodeEl?.value || "").trim().toLowerCase();
    const name = String(addTechNameEl?.value || "").trim();
    if (!code || !name) return;
    await API.request("/admin/options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "technology", code, name, priceDelta: 0, active: true }),
    });
    addTechCodeEl.value = "";
    addTechNameEl.value = "";
    await load();
  });

  addMaterialBtn?.addEventListener("click", async () => {
    const code = String(addMaterialCodeEl?.value || "").trim().toLowerCase();
    const name = String(addMaterialNameEl?.value || "").trim();
    if (!code || !name) return;
    await API.request("/admin/options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "material", code, name, priceDelta: 0, active: true }),
    });
    addMaterialCodeEl.value = "";
    addMaterialNameEl.value = "";
    await load();
  });

  [techSearchEl, materialSearchEl].forEach((node) => node?.addEventListener("input", render));
  refreshBtn?.addEventListener("click", load);

  async function init() {
    try {
      await API.ensureAdmin();
      API.wireLogout();
      await load();
    } catch (error) {
      if (error.status === 401 || error.status === 403) window.location.href = "admin.html";
    }
  }

  init();
})();
