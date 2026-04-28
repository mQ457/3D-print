(function () {
  const API = window.AdminCommon;
  const tbody = document.getElementById("settings-body");
  const refreshBtn = document.getElementById("settings-refresh");
  let rules = [];

  function render() {
    if (!rules.length) {
      tbody.innerHTML = '<tr><td colspan="10">Нет данных</td></tr>';
      return;
    }
    tbody.innerHTML = rules
      .map(
        (rule) => `
      <tr>
        <td>${rule.serviceType}</td>
        <td><input data-base="${rule.serviceType}" type="number" value="${rule.baseFee || 0}" /></td>
        <td><input data-min="${rule.serviceType}" type="number" value="${rule.minPrice || 0}" /></td>
        <td><input data-hour="${rule.serviceType}" type="number" value="${rule.hourRate || 0}" /></td>
        <td><input data-setup="${rule.serviceType}" type="number" value="${rule.setupFee || 0}" /></td>
        <td><input data-waste="${rule.serviceType}" type="number" step="0.1" value="${rule.wastePercent || 0}" /></td>
        <td><input data-support="${rule.serviceType}" type="number" step="0.1" value="${rule.supportPercent || 0}" /></td>
        <td><input data-machine="${rule.serviceType}" type="number" value="${rule.machineHourRate || 0}" /></td>
        <td><input data-volume="${rule.serviceType}" type="number" step="0.1" value="${rule.defaultModelVolumeCm3 || 0}" /></td>
        <td><button class="btn-secondary" data-save="${rule.serviceType}">Сохранить</button></td>
      </tr>`
      )
      .join("");

    tbody.querySelectorAll("[data-save]").forEach((button) => {
      button.addEventListener("click", async () => {
        const serviceType = button.getAttribute("data-save");
        await API.request(`/admin/pricing-rules/${serviceType}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            baseFee: Number(tbody.querySelector(`[data-base="${serviceType}"]`)?.value || 0),
            minPrice: Number(tbody.querySelector(`[data-min="${serviceType}"]`)?.value || 0),
            hourRate: Number(tbody.querySelector(`[data-hour="${serviceType}"]`)?.value || 0),
            setupFee: Number(tbody.querySelector(`[data-setup="${serviceType}"]`)?.value || 0),
            wastePercent: Number(tbody.querySelector(`[data-waste="${serviceType}"]`)?.value || 0),
            supportPercent: Number(tbody.querySelector(`[data-support="${serviceType}"]`)?.value || 0),
            machineHourRate: Number(tbody.querySelector(`[data-machine="${serviceType}"]`)?.value || 0),
            defaultModelVolumeCm3: Number(tbody.querySelector(`[data-volume="${serviceType}"]`)?.value || 0),
          }),
        });
        await load();
      });
    });
  }

  async function load() {
    const data = await API.request("/admin/pricing-rules");
    rules = data.rules || [];
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
