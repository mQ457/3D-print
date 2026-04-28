(function () {
  const API = window.AppBootstrap;
  const cabinetLink = document.getElementById("cabinet-link");
  const track = document.getElementById("reviews-track");
  const slider = document.getElementById("reviews-slider");
  const prevBtn = document.getElementById("reviews-prev-btn");
  const nextBtn = document.getElementById("reviews-next-btn");
  const starsWrap = document.getElementById("review-stars");
  const reviewText = document.getElementById("review-text");
  const submitBtn = document.getElementById("review-submit-btn");
  const statusEl = document.getElementById("review-status");
  const ACTIVE_STAR_SRC = "image/Frame_1_157.png";
  const INACTIVE_STAR_SRC = "image/Frame_1_181.png";

  let currentUser = null;
  let rating = 3;
  let reviews = [];
  let currentIndex = 0;
  let cardsPerView = 3;

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.style.color = isError ? "#dc2626" : "#16a34a";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDate(value) {
    try {
      const normalized = String(value || "").trim();
      if (!normalized) return "";
      const parsed = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(normalized);
      const date = parsed
        ? new Date(
            Number(parsed[1]),
            Number(parsed[2]) - 1,
            Number(parsed[3]),
            Number(parsed[4]),
            Number(parsed[5]),
            Number(parsed[6] || 0)
          )
        : new Date(normalized);
      return new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
    } catch {
      return "";
    }
  }

  function createReviewHtml(item) {
    const stars = Array.from({ length: 5 }, (_, index) => {
      const isActive = index < Number(item.rating || 0);
      return `<img class="landing-review__star-icon" src="${isActive ? ACTIVE_STAR_SRC : INACTIVE_STAR_SRC}" alt="star" />`;
    }).join("");
    return `
      <article class="landing-review">
        <div class="landing-review__meta">
          <b>${escapeHtml(item.authorName || "Клиент")}</b>
          <span>${formatDate(item.createdAt)}</span>
        </div>
        <div class="landing-review__text">${escapeHtml(item.comment || "")}</div>
        <div class="landing-review__stars">${stars}</div>
      </article>
    `;
  }

  function getCardsPerView() {
    const width = window.innerWidth;
    if (width < 720) return 1;
    if (width < 1100) return 2;
    return 3;
  }

  function updateSliderTransform() {
    if (!track || !slider) return;
    cardsPerView = getCardsPerView();
    const step = slider.clientWidth / cardsPerView;
    track.style.transform = `translateX(-${currentIndex * step}px)`;
    const maxIndex = Math.max(0, reviews.length - cardsPerView);
    if (prevBtn) prevBtn.disabled = currentIndex <= 0;
    if (nextBtn) nextBtn.disabled = currentIndex >= maxIndex;
  }

  function renderReviews() {
    if (!track) return;
    if (!Array.isArray(reviews) || reviews.length === 0) {
      track.innerHTML = `
        <article class="landing-review">
          <div class="landing-review__meta"><b>3Д Печать</b><span></span></div>
          <div class="landing-review__text">Пока нет отзывов. Станьте первым, кто оценит сервис.</div>
          <div class="landing-review__stars">
            <img class="landing-review__star-icon" src="${ACTIVE_STAR_SRC}" alt="star" />
            <img class="landing-review__star-icon" src="${ACTIVE_STAR_SRC}" alt="star" />
            <img class="landing-review__star-icon" src="${ACTIVE_STAR_SRC}" alt="star" />
            <img class="landing-review__star-icon" src="${ACTIVE_STAR_SRC}" alt="star" />
            <img class="landing-review__star-icon" src="${ACTIVE_STAR_SRC}" alt="star" />
          </div>
        </article>
      `;
      currentIndex = 0;
      updateSliderTransform();
      return;
    }
    track.innerHTML = reviews.map(createReviewHtml).join("");
    const maxIndex = Math.max(0, reviews.length - getCardsPerView());
    currentIndex = Math.min(currentIndex, maxIndex);
    updateSliderTransform();
  }

  async function loadReviews() {
    const data = await API.request("/reviews", { method: "GET" });
    reviews = Array.isArray(data.reviews) ? data.reviews : [];
    renderReviews();
  }

  function updateStars(nextRating) {
    rating = Math.min(5, Math.max(1, Number(nextRating || 1)));
    starsWrap?.querySelectorAll(".landing-stars__btn").forEach((node) => {
      const value = Number(node.getAttribute("data-rating") || 0);
      const isActive = value <= rating;
      node.classList.toggle("is-active", isActive);
      const icon = node.querySelector("img");
      if (icon) {
        icon.src = isActive ? ACTIVE_STAR_SRC : INACTIVE_STAR_SRC;
      }
    });
  }

  function wireStars() {
    starsWrap?.querySelectorAll(".landing-stars__btn").forEach((node) => {
      node.addEventListener("click", () => {
        updateStars(node.getAttribute("data-rating"));
      });
    });
  }

  function wireSliderButtons() {
    prevBtn?.addEventListener("click", () => {
      if (currentIndex <= 0) return;
      currentIndex -= 1;
      updateSliderTransform();
    });
    nextBtn?.addEventListener("click", () => {
      const maxIndex = Math.max(0, reviews.length - getCardsPerView());
      if (currentIndex >= maxIndex) return;
      currentIndex += 1;
      updateSliderTransform();
    });
    window.addEventListener("resize", () => {
      updateSliderTransform();
    });
  }

  async function ensureAuthForReview() {
    if (currentUser) return currentUser;
    try {
      currentUser = await API.bootstrapUser();
      return currentUser;
    } catch (error) {
      if (error.status === 401) {
        window.location.href = "login.html";
        return null;
      }
      throw error;
    }
  }

  function wireCabinetLink() {
    cabinetLink?.addEventListener("click", async (event) => {
      event.preventDefault();
      try {
        const user = await ensureAuthForReview();
        if (!user) return;
        window.location.href = user.role === "admin" ? "admin.html" : "profile.html";
      } catch {
        window.location.href = "login.html";
      }
    });
  }

  function wireSubmit() {
    submitBtn?.addEventListener("click", async () => {
      const message = String(reviewText?.value || "").trim();
      if (message.length < 5) {
        setStatus("Напишите отзыв минимум из 5 символов.", true);
        return;
      }
      try {
        const user = await ensureAuthForReview();
        if (!user) return;
        setStatus("Публикуем отзыв...", false);
        await API.request("/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating, comment: message }),
        });
        if (reviewText) reviewText.value = "";
        updateStars(3);
        setStatus("Спасибо! Отзыв опубликован.", false);
        await loadReviews();
      } catch (error) {
        if (error.status === 401) {
          window.location.href = "login.html";
          return;
        }
        setStatus(error.message || "Не удалось сохранить отзыв.", true);
      }
    });
  }

  async function init() {
    wireCabinetLink();
    wireStars();
    wireSliderButtons();
    wireSubmit();
    try {
      await loadReviews();
    } catch {
      setStatus("Не удалось загрузить отзывы.", true);
    }
    API.bootstrapUser()
      .then((user) => {
        currentUser = user;
      })
      .catch(() => {
        currentUser = null;
      });
  }

  init();
})();
