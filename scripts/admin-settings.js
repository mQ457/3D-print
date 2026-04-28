(function () {
  const API = window.AdminCommon;
  const techBody = document.getElementById("settings-tech-body");
  const materialBody = document.getElementById("settings-material-body");
  const colorBody = document.getElementById("settings-color-body");
  const refreshBtn = document.getElementById("settings-refresh");
  let options = [];

  function byType(type) {
    return options.filter((item) => item.type === type);
  }

  function render() {
    const technologies = byType("technology");
    if (!technologies.length) {
      techBody.innerHTML = '<tr><td colspan="4">Нет данных</td></tr>';
    } else {
      techBody.innerHTML = technologies
        .map(
          (item) => `
      <tr>
        <td>${item.shortId || item.id}</td>
        <td>${item.code}</td>
        <td>${item.name}</td>
        <td><input type="checkbox" data-option-active="${item.id}" ${item.active ? "checked" : ""}></td>
      </tr>`
        )
        .join("");
    }

    const materials = byType("material");
    if (!materials.length) {
      materialBody.innerHTML = '<tr><td colspan="4">Нет данных</td></tr>';
    } else {
      materialBody.innerHTML = materials
        .map(
          (item) => `
      <tr>
        <td>${item.shortId || item.id}</td>
        <td>${item.code}</td>
        <td>${item.name}</td>
        <td><input type="checkbox" data-option-active="${item.id}" ${item.active ? "checked" : ""}></td>
      </tr>`
        )
        .join("");
    }

    const colors = byType("color");
    if (!colors.length) {
      colorBody.innerHTML = '<tr><td colspan="4">Нет данных</td></tr>';
    } else {
      colorBody.innerHTML = colors
        .map(
          (item) => `
      <tr>
        <td>${item.shortId || item.id}</td>
        <td>${item.code}</td>
        <td>${item.name}</td>
        <td><input type="checkbox" data-option-active="${item.id}" ${item.active ? "checked" : ""}></td>
      </tr>`
        )
        .join("");
    }

    document.querySelectorAll("[data-option-active]").forEach((node) => {
      node.addEventListener("change", async () => {
        const id = node.getAttribute("data-option-active");
        await API.request(`/admin/options/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: node.checked }),
        });
        await load();
      });
    });
  }

  async function load() {
    const optionsData = await API.request("/admin/options");
    options = optionsData.options || [];
    render();
  }

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
  refreshBtn?.addEventListener("click", load);
  init();
})();
