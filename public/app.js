/* ─── State ──────────────────────────────────────────────────────────────────*/
const state = {
  query: '',
  engine: 'all',
  results: [],        // flat array of all image results
  currentIndex: -1,   // lightbox index
  engineStatus: {},   // { google: bool, bing: bool, yandex: bool, unsplash: bool }
  page: 1,            // current page (for load more)
  loading: false,     // prevents double fetches
};

/* ─── DOM refs ───────────────────────────────────────────────────────────────*/
const $ = (id) => document.getElementById(id);
const searchInput  = $('searchInput');
const searchBtn    = $('searchBtn');
const engineFilter = $('engineFilter');
const imageGrid    = $('imageGrid');
const loadingGrid  = $('loadingGrid');
const emptyState   = $('emptyState');
const hero         = $('hero');
const resultsHeader= $('resultsHeader');
const resultsStats = $('resultsStats');
const statusBar    = $('statusBar');
const statusText   = $('statusText');
const notices      = $('notices');
const sortSelect   = $('sortSelect');
const loadMoreWrap = $('loadMoreWrap');
const loadMoreBtn  = $('loadMoreBtn');

// Lightbox
const lightbox         = $('lightbox');
const lightboxBackdrop = $('lightboxBackdrop');
const lightboxImg      = $('lightboxImg');
const lightboxLoading  = $('lightboxLoading');
const lightboxEngine   = $('lightboxEngine');
const lightboxTitle    = $('lightboxTitle');
const lightboxOpen     = $('lightboxOpen');
const lightboxSource   = $('lightboxSource');
const lightboxCopy     = $('lightboxCopy');
const lightboxMeta     = $('lightboxMeta');
const lightboxClose    = $('lightboxClose');
const lightboxPrev     = $('lightboxPrev');
const lightboxNext     = $('lightboxNext');

/* ─── Init ───────────────────────────────────────────────────────────────────*/
(async function init() {
  try {
    const res = await fetch('/api/status');
    state.engineStatus = await res.json();
    renderEngineNotices();
  } catch {
    // server not responding yet; ignore
  }
})();

/* ─── Engine filter clicks ───────────────────────────────────────────────────*/
engineFilter.addEventListener('click', (e) => {
  const btn = e.target.closest('.engine-btn');
  if (!btn) return;

  document.querySelectorAll('.engine-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  state.engine = btn.dataset.engine;
});

/* ─── Search ─────────────────────────────────────────────────────────────────*/
searchBtn.addEventListener('click', doSearch);
searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

sortSelect.addEventListener('change', () => renderGrid(state.results));

loadMoreBtn.addEventListener('click', loadMore);

async function doSearch() {
  const query = searchInput.value.trim();
  if (!query || state.loading) return;

  state.query = query;
  state.page  = 1;
  state.results = [];
  showLoading(true);
  hero.style.display = 'none';
  notices.innerHTML = '';
  loadMoreWrap.style.display = 'none';

  await fetchAndRender(false);
}

async function loadMore() {
  if (state.loading) return;
  state.page += 1;
  setLoadMoreLoading(true);
  await fetchAndRender(true);
  setLoadMoreLoading(false);
}

async function fetchAndRender(append) {
  state.loading = true;
  try {
    const url = `/api/search?q=${encodeURIComponent(state.query)}&engine=${state.engine}&count=30&page=${state.page}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const data = await res.json();

    const newResults = [];
    const engineErrors = [];

    for (const [eng, payload] of Object.entries(data)) {
      if (payload.error && !payload.results?.length) {
        engineErrors.push({ engine: eng, error: payload.error });
      }
      if (payload.results) {
        newResults.push(...payload.results);
      }
    }

    if (!append) {
      state.results = newResults;
      renderEngineErrors(engineErrors);
      renderGrid(state.results);
    } else {
      const startIndex = state.results.length;
      state.results.push(...newResults);
      appendCards(newResults, startIndex);
      updateStats();
    }

    // Show Load More if we got a full batch
    loadMoreWrap.style.display = newResults.length >= 20 ? 'flex' : 'none';
  } catch (err) {
    showError(err.message);
  } finally {
    state.loading = false;
    if (!append) showLoading(false);
  }
}

/* ─── Render ─────────────────────────────────────────────────────────────────*/
function renderGrid(items) {
  imageGrid.innerHTML = '';
  emptyState.style.display = 'none';
  resultsHeader.style.display = 'none';

  const sorted = sortItems(items, sortSelect.value);

  if (!sorted.length) {
    emptyState.style.display = 'flex';
    return;
  }

  resultsHeader.style.display = 'flex';
  updateStats();

  sorted.forEach((item, i) => {
    const card = buildCard(item, i);
    imageGrid.appendChild(card);
  });
}

function appendCards(newItems, startIndex) {
  // Re-sort the full list to figure out the correct absolute indices,
  // then append only the new cards (with correct indices for lightbox nav)
  const sorted = sortItems(state.results, sortSelect.value);
  newItems.forEach((item) => {
    // find this item's position in the full sorted list
    const absIndex = sorted.findIndex(
      (r) => r.imageUrl === item.imageUrl && r.engine === item.engine
    );
    const card = buildCard(item, absIndex === -1 ? startIndex : absIndex);
    imageGrid.appendChild(card);
  });
}

function updateStats() {
  const sorted = sortItems(state.results, sortSelect.value);
  const counts = sorted.reduce((acc, r) => {
    acc[r.engine] = (acc[r.engine] || 0) + 1;
    return acc;
  }, {});
  const countParts = Object.entries(counts).map(
    ([eng, n]) => `<span style="color:var(--${eng})">${n} ${cap(eng)}</span>`
  );
  resultsStats.innerHTML = `<strong>${sorted.length}</strong> images &nbsp;·&nbsp; ${countParts.join(' &nbsp;·&nbsp; ')}`;
  resultsHeader.style.display = 'flex';
}

function sortItems(items, mode) {
  if (mode === 'mixed') return items;
  const priority = { google: 1, bing: 2, yandex: 3 };
  const enginePriority = priority[mode] ?? 99;
  return [...items].sort((a, b) => {
    const pa = a.engine === mode ? 0 : priority[a.engine] ?? 99;
    const pb = b.engine === mode ? 0 : priority[b.engine] ?? 99;
    return pa - pb;
  });
}

function buildCard(item, index) {
  const card = document.createElement('div');
  card.className = 'image-card';
  card.dataset.index = index;

  const img = document.createElement('img');
  img.src = item.thumbnail || item.imageUrl;
  img.alt = item.title || '';
  img.loading = 'lazy';
  img.className = 'loading';
  img.addEventListener('load', () => img.classList.remove('loading'));
  img.addEventListener('error', () => {
    img.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="160" viewBox="0 0 200 160"%3E%3Crect width="200" height="160" fill="%231f2433"/%3E%3Ctext x="50%25" y="50%25" font-family="sans-serif" font-size="12" fill="%238892a4" text-anchor="middle" dy=".3em"%3ENo preview%3C/text%3E%3C/svg%3E';
    img.classList.remove('loading');
  });

  const badge = document.createElement('div');
  badge.className = `card-engine-badge ${item.engine}`;
  badge.textContent = cap(item.engine);

  const overlay = document.createElement('div');
  overlay.className = 'card-overlay';

  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = item.title || '';
  overlay.appendChild(title);

  card.appendChild(img);
  card.appendChild(badge);
  card.appendChild(overlay);

  card.addEventListener('click', () => openLightbox(index));
  return card;
}

/* ─── Lightbox ───────────────────────────────────────────────────────────────*/
function openLightbox(index) {
  const sorted = sortItems(state.results, sortSelect.value);
  state.currentIndex = index;
  const item = sorted[index];
  if (!item) return;

  lightboxLoading.style.display = 'flex';
  lightboxImg.style.opacity = '0';
  lightboxImg.src = item.imageUrl || item.thumbnail;
  lightboxImg.alt = item.title || '';
  lightboxImg.onload = () => {
    lightboxLoading.style.display = 'none';
    lightboxImg.style.opacity = '1';
  };
  lightboxImg.onerror = () => {
    lightboxImg.src = item.thumbnail || item.imageUrl;
    lightboxLoading.style.display = 'none';
    lightboxImg.style.opacity = '1';
  };

  lightboxEngine.className = `lightbox-engine-badge ${item.engine}`;
  lightboxEngine.textContent = cap(item.engine);
  lightboxTitle.textContent = item.title || '';
  lightboxOpen.href = item.imageUrl || item.thumbnail || '#';
  lightboxSource.href = item.source || item.imageUrl || '#';

  if (!item.source) lightboxSource.style.display = 'none';
  else lightboxSource.style.display = 'inline-flex';

  const dims = item.width && item.height ? `${item.width} × ${item.height}px` : '';
  if ((item.engine === 'unsplash' || item.engine === 'pexels') && item.author) {
    const platform = item.engine === 'unsplash'
      ? `<a href="https://unsplash.com?utm_source=multisearch&utm_medium=referral" target="_blank" rel="noopener noreferrer" style="color:var(--accent);text-decoration:none">Unsplash</a>`
      : `<a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer" style="color:var(--pexels);text-decoration:none">Pexels</a>`;
    lightboxMeta.innerHTML = [
      dims,
      `Photo by <a href="${escHtml(item.authorUrl || '#')}" target="_blank" rel="noopener noreferrer" style="color:var(--accent);text-decoration:none">${escHtml(item.author)}</a> on ${platform}`,
    ].filter(Boolean).join(' · ');
  } else {
    lightboxMeta.textContent = dims;
  }

  lightboxCopy.classList.remove('copied');
  lightboxCopy.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
    </svg>
    Copy URL`;

  lightbox.style.display = 'flex';
  lightboxBackdrop.style.display = 'block';
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  lightbox.style.display = 'none';
  lightboxBackdrop.style.display = 'none';
  document.body.style.overflow = '';
}

function navigateLightbox(direction) {
  const sorted = sortItems(state.results, sortSelect.value);
  const newIndex = state.currentIndex + direction;
  if (newIndex >= 0 && newIndex < sorted.length) {
    openLightbox(newIndex);
  }
}

lightboxClose.addEventListener('click', closeLightbox);
lightboxBackdrop.addEventListener('click', closeLightbox);
lightboxPrev.addEventListener('click', () => navigateLightbox(-1));
lightboxNext.addEventListener('click', () => navigateLightbox(1));

lightboxCopy.addEventListener('click', async () => {
  const sorted = sortItems(state.results, sortSelect.value);
  const item = sorted[state.currentIndex];
  if (!item) return;
  try {
    await navigator.clipboard.writeText(item.imageUrl || item.thumbnail);
    lightboxCopy.classList.add('copied');
    lightboxCopy.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      Copied!`;
    setTimeout(() => {
      lightboxCopy.classList.remove('copied');
      lightboxCopy.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
        </svg>
        Copy URL`;
    }, 2000);
  } catch {
    // clipboard not available
  }
});

document.addEventListener('keydown', (e) => {
  if (lightbox.style.display === 'none') return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft')  navigateLightbox(-1);
  if (e.key === 'ArrowRight') navigateLightbox(1);
});

/* ─── UI helpers ─────────────────────────────────────────────────────────────*/
function showLoading(on) {
  loadingGrid.style.display = on ? 'block' : 'none';
  imageGrid.style.display   = on ? 'none'  : 'block';

  if (on) {
    loadingGrid.innerHTML = Array.from({ length: 20 })
      .map(() => `<div class="skeleton-card"><div class="skeleton-img"></div><div class="skeleton-text"></div></div>`)
      .join('');
    emptyState.style.display = 'none';
    resultsHeader.style.display = 'none';
    loadMoreWrap.style.display = 'none';
    statusBar.style.display = 'flex';
    statusText.textContent = `Searching for "${state.query}"…`;
  } else {
    statusBar.style.display = 'none';
  }
}

function setLoadMoreLoading(on) {
  loadMoreBtn.classList.toggle('loading', on);
  loadMoreBtn.innerHTML = on
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.32"/></svg> Loading…`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.32"/></svg> Load More`;
}

function showError(msg) {
  notices.innerHTML = `<div class="notice error">⚠ ${msg}</div>`;
  emptyState.style.display = 'none';
}

function renderEngineErrors(errors) {
  if (!errors.length) return;
  errors.forEach(({ engine, error }) => {
    const div = document.createElement('div');
    div.className = 'notice warning';
    div.innerHTML = `
      <span style="color:var(--${engine}); font-weight:600;">${cap(engine)}</span>
      — ${escHtml(error)}`;
    notices.appendChild(div);
  });
}

function renderEngineNotices() {
  const { google, bing, yandex, unsplash, pexels } = state.engineStatus;
  if (!google)   addNotice('warning', 'Google Images requires a Custom Search API key and CX. Set <code>GOOGLE_API_KEY</code> and <code>GOOGLE_CX</code> in <code>.env</code>.');
  if (!bing)     addNotice('warning', 'Bing Images requires an Azure API key. Set <code>BING_API_KEY</code> in <code>.env</code>.');
  if (!unsplash) addNotice('warning', 'Unsplash requires a free access key. Set <code>UNSPLASH_ACCESS_KEY</code> in <code>.env</code> — get one at <a href="https://unsplash.com/developers" target="_blank" style="color:inherit">unsplash.com/developers</a>.');
  if (!pexels)   addNotice('warning', 'Pexels requires a free API key. Set <code>PEXELS_API_KEY</code> in <code>.env</code> — get one at <a href="https://www.pexels.com/api/" target="_blank" style="color:inherit">pexels.com/api</a>.');
  if (yandex)    addNotice('info', 'Yandex Images is active (scraping mode — results may vary).');
}

function addNotice(type, html) {
  const div = document.createElement('div');
  div.className = `notice ${type}`;
  div.innerHTML = html;
  notices.appendChild(div);
}

function cap(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
