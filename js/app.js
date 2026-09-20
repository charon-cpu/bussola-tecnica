const CATEGORY_LABELS = {
  edilizia: "Edilizia",
  energetica: "Energetica",
  fiscale: "Fiscale",
  normativa: "Normativa",
  altro: "Altro",
};

const state = {
  news: [],
  category: "tutte",
  query: "",
};

const newsGrid = document.getElementById("newsGrid");
const emptyState = document.getElementById("emptyState");
const resultsMeta = document.getElementById("resultsMeta");
const searchInput = document.getElementById("searchInput");
const categoryTabs = document.getElementById("categoryTabs");
const sourcesList = document.getElementById("sourcesList");
const updateTime = document.getElementById("updateTime");

const dateFormatter = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function render() {
  const query = state.query.trim().toLowerCase();
  const filtered = state.news.filter((item) => {
    const matchesCategory = state.category === "tutte" || item.categories.includes(state.category);
    if (!matchesCategory) return false;
    if (!query) return true;
    return (
      item.title.toLowerCase().includes(query) ||
      item.summary.toLowerCase().includes(query) ||
      item.source.toLowerCase().includes(query)
    );
  });

  resultsMeta.textContent = `${filtered.length} notizi${filtered.length === 1 ? "a" : "e"}`;
  newsGrid.innerHTML = "";
  emptyState.hidden = filtered.length > 0;

  const fragment = document.createDocumentFragment();
  for (const item of filtered) {
    const card = document.createElement("a");
    card.className = "news-card";
    card.href = item.link;
    card.target = "_blank";
    card.rel = "noopener noreferrer";

    const badges = item.categories
      .map((c) => `<span class="badge badge-${c}">${CATEGORY_LABELS[c] ?? c}</span>`)
      .join("");

    const publishedDate = new Date(item.published_at);
    const dateLabel = Number.isNaN(publishedDate.getTime()) ? "" : dateFormatter.format(publishedDate);

    card.innerHTML = `
      <div class="card-top">
        <span class="card-source">${escapeHtml(item.source)}</span>
        <span class="card-date">${dateLabel}</span>
      </div>
      <h2 class="card-title">${escapeHtml(item.title)}</h2>
      <p class="card-summary">${escapeHtml(item.summary)}</p>
      <div class="card-bottom">
        <div class="card-categories">${badges}</div>
        <span class="card-link">Leggi &rarr;</span>
      </div>
    `;
    fragment.appendChild(card);
  }
  newsGrid.appendChild(fragment);
}

function setCategory(category) {
  state.category = category;
  for (const tab of categoryTabs.querySelectorAll(".tab")) {
    const isActive = tab.dataset.category === category;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  }
  render();
}

categoryTabs.addEventListener("click", (event) => {
  const tab = event.target.closest(".tab");
  if (!tab) return;
  setCategory(tab.dataset.category);
});

let searchDebounce;
searchInput.addEventListener("input", (event) => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    state.query = event.target.value;
    render();
  }, 150);
});

async function init() {
  try {
    const res = await fetch("data/news.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.news = await res.json();
  } catch (err) {
    resultsMeta.textContent = "Impossibile caricare le notizie al momento.";
    console.error("Errore caricamento notizie:", err);
    return;
  }

  const sources = [...new Set(state.news.map((item) => item.source))].sort();
  sourcesList.textContent = `Fonti: ${sources.join(" · ")}`;

  if (state.news.length > 0) {
    const mostRecentFetch = state.news.reduce(
      (latest, item) => (item.fetched_at > latest ? item.fetched_at : latest),
      state.news[0].fetched_at
    );
    updateTime.textContent = `Ultimo aggiornamento: ${dateTimeFormatter.format(new Date(mostRecentFetch))}`;
  }

  render();
}

init();
