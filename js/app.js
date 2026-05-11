const API = '/api';
const STORAGE_SESSION = 'santes_session_user_id';
const STORAGE_GUEST = 'santes_guest_mode';

const state = {
  events: [],
  rewards: [],
  inventory: [],
  progress: [],
  user: null,
  guest: sessionStorage.getItem(STORAGE_GUEST) === '1',
  route: 'home',
  filters: { day: 'Tots', category: 'Tots', q: '' },
  map: null,
  detailMap: null,
  markers: [],
  selectedMapId: null,
  loading: true,
  error: ''
};

const $ = (sel) => document.querySelector(sel);
const app = $('#app');

function escapeHTML(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || 'No s’han pogut carregar les dades');
  return data;
}

function money(n = 0) {
  return new Intl.NumberFormat('ca-ES').format(Number(n) || 0);
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
}

function parseDate(value = '') {
  const m = value.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]).getTime() : 0;
}

function formatTime(value = '') {
  const m = value.match(/(\d{2})\.(\d{2})\.\d{4}\s+(\d{2}:\d{2})/);
  return m ? m[3] : '--:--';
}

function formatDay(value = '') {
  const m = value.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return m ? `${m[1]}/${m[2]}` : 'Sense data';
}

function mapCoordinate(value) {
  const number = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

function hasValidMapPoint(ev) {
  const lat = mapCoordinate(ev.lat);
  const lng = mapCoordinate(ev.lng);
  return lat !== null && lng !== null && lat >= 41 && lat <= 42 && lng >= 2 && lng <= 3;
}

function normalizeEvent(ev) {
  const lat = mapCoordinate(ev.lat);
  const lng = mapCoordinate(ev.lng);
  return {
    ...ev,
    lat,
    lng,
    title: ev.title || 'Sense títol',
    time: formatTime(ev.date_initial),
    day: formatDay(ev.date_initial),
    timestamp: parseDate(ev.date_initial),
    cat: ev.category || 'Altres',
    shortText: ev.description_short || (ev.description || '').slice(0, 220),
    longText: ev.description || ev.description_short || 'No hi ha descripció disponible.',
    hasPoint: hasValidMapPoint({ ...ev, lat, lng })
  };
}

function activeUserId() {
  return state.user?.id || Number(localStorage.getItem(STORAGE_SESSION) || 0);
}

function userCoins() {
  return state.user?.coins || 0;
}

function updateHeader() {
  $('#coinCounter').textContent = state.user ? money(state.user.coins) : (state.guest ? 'Convidat' : '0');
  $('#coinsBtn').classList.toggle('guest', state.guest && !state.user);
  $('#userButton').textContent = state.user ? '🧒' : (state.guest ? '👀' : '👤');
  const active = state.route.split('/')[0];
  document.querySelectorAll('.main-nav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.route === active || (active === 'acte' && a.dataset.route === 'programa'));
  });
}

async function loadProfile(userId = activeUserId()) {
  if (!userId) return;
  const data = await api(`/profile?user_id=${userId}`);
  state.user = data.user;
  state.inventory = data.inventory || [];
  state.progress = data.progress || [];
  localStorage.setItem(STORAGE_SESSION, String(data.user.id));
  sessionStorage.removeItem(STORAGE_GUEST);
  state.guest = false;
  updateHeader();
}

async function loadInitialData() {
  app.innerHTML = loadingState('Carregant Les Santes...');
  try {
    const [eventsData, rewardsData] = await Promise.all([api('/events'), api('/rewards')]);
    state.events = (eventsData.events || []).map(normalizeEvent).sort((a, b) => a.timestamp - b.timestamp);
    state.rewards = rewardsData.rewards || [];
    const saved = activeUserId();
    if (saved) await loadProfile(saved).catch(() => localStorage.removeItem(STORAGE_SESSION));
    state.loading = false;
    router();
  } catch (err) {
    state.loading = false;
    state.error = err.message;
    app.innerHTML = errorState('No s’han pogut carregar les dades', 'Executa el projecte amb python3 server.py i torna a carregar la pàgina.');
  }
}

function pageTitle(title, subtitle, actions = '') {
  return `<section class="page-title">
    <h2>${escapeHTML(title)}<span class="dot">.</span></h2>
    ${subtitle ? `<p class="lead">${escapeHTML(subtitle)}</p>` : ''}
    ${actions ? `<div class="cta-row">${actions}</div>` : ''}
  </section>`;
}

function loadingState(text) {
  return `<div class="state-box"><div class="loader" aria-hidden="true"></div><h3>${escapeHTML(text)}</h3></div>`;
}

function errorState(title, text) {
  return `<div class="state-box error"><h3>${escapeHTML(title)}</h3><p>${escapeHTML(text)}</p><a class="btn btn-yellow" href="#home">Tornar a l’inici</a></div>`;
}

function emptyState(text) {
  return `<div class="state-box"><h3>${escapeHTML(text)}</h3><p>Prova de canviar filtres o tornar al programa complet.</p><button class="btn btn-primary primary-highlight" id="resetFilters">Restablir filtres</button></div>`;
}

function categoryClass(cat = '') {
  if (cat === 'Música') return 'cat-music';
  if (cat === 'Familiar') return 'cat-family';
  if (cat === 'Tradicional' || cat === 'Cultura') return 'cat-trad';
  return 'cat-other';
}

function renderEventCard(ev) {
  const mapAction = ev.hasPoint ? `<a class="btn btn-map btn-small" href="#mapa" aria-label="Veure ${escapeHTML(ev.title)} al mapa">Veure al mapa</a>` : '';
  return `<article class="event-card">
    <div class="time-badge"><strong>${escapeHTML(ev.time)}</strong><small>${escapeHTML(ev.day)}</small></div>
    <div>
      <div class="event-cat ${categoryClass(ev.cat)}">${escapeHTML(ev.cat)}</div>
      <h3 class="event-title">${escapeHTML(ev.title)}</h3>
      <div class="event-meta"><span class="info-highlight">📍 ${escapeHTML(ev.location || 'Ubicació pendent')}</span><span class="reward-highlight">📅 ${escapeHTML(ev.date_detail || '')}</span></div>
    </div>
    <div class="event-actions">${mapAction}<a class="btn btn-primary btn-small primary-highlight" href="#acte/${ev.id}" aria-label="Veure detall de ${escapeHTML(ev.title)}">Veure detall</a></div>
  </article>`;
}

function featuredEvents() {
  const preferred = state.events.filter((e) => /música|concert|gegant|ruixada|castell|santes/i.test(`${e.cat} ${e.title}`));
  return (preferred.length ? preferred : state.events).slice(0, 8);
}

function uniqueDays() {
  return ['Tots', ...new Set(state.events.map((e) => e.day).filter(Boolean))].slice(0, 14);
}

function categories() {
  return ['Tots', 'Música', 'Familiar', 'Tradicional', 'Cultura', 'Esports', 'Altres'];
}

function filteredEvents() {
  const q = state.filters.q.trim().toLowerCase();
  let result = [...state.events];
  if (state.filters.day !== 'Tots') result = result.filter((e) => e.day === state.filters.day);
  if (state.filters.category !== 'Tots') {
    result = result.filter((e) => e.cat === state.filters.category || (state.filters.category === 'Altres' && !categories().includes(e.cat)));
  }
  if (q) result = result.filter((e) => `${e.title} ${e.pretitle} ${e.location} ${e.cat} ${e.shortText}`.toLowerCase().includes(q));
  return result.sort((a, b) => a.timestamp - b.timestamp);
}

function renderHome() {
  const hero = featuredEvents()[0] || state.events[0];
  const highlights = featuredEvents().slice(0, 4);
  const quickLinks = [
    { href: '#programa', icon: '📅', theme: 'red', title: 'Programa', text: 'Consulta tots els actes, filtra per dia i troba el teu pla.' },
    { href: '#mapa', icon: '🗺️', theme: 'blue', title: 'Mapa d’actes', text: 'Explora Mataró amb pins reals i ubicacions sincronitzades.' },
    { href: '#minisantes', icon: '🎮', theme: 'yellow', title: 'MiniSantes', text: 'Jocs, reptes i recompenses per a infants de 6 a 12 anys.' },
    ...(state.user ? [{ href: '#botiga', icon: '🎁', theme: 'gold', title: 'Recompenses', text: 'Canvia monedes per premis i col·leccionables digitals.' }] : [])
  ];
  app.innerHTML = `
    <div class="home-page festive-home">
      <section class="home-hero" aria-labelledby="homeHeroTitle">
        ${hero?.image ? `<img class="home-hero-img" src="${escapeHTML(hero.image)}" alt="${escapeHTML(hero.title)}">` : ''}
        <div class="home-confetti" aria-hidden="true"></div>
        <div class="home-hero-content">
          <span class="eyebrow home-eyebrow">Mataró 2026</span>
          <p class="home-kicker">La festa major de Mataró</p>
          <h1 id="homeHeroTitle">Les Santes<br>2026<span class="dot">.</span></h1>
          <div class="home-date-chip"><span>Del 25 al 29 de juliol</span><strong>Nit, foc, música i cultura popular</strong></div>
          <p class="lead">Viu el programa, situa cada acte al mapa i entra a MiniSantes per jugar amb la festa.</p>
          <div class="cta-row home-hero-actions">
            <a class="btn btn-primary primary-highlight" href="#programa">Què passa avui?</a>
            <a class="btn btn-yellow reward-highlight" href="#programa">Veure programa</a>
            <a class="btn btn-map" href="#mapa">Mapa d’actes</a>
          </div>
        </div>
      </section>

      <section class="section home-today">
        <div class="section-head home-section-head">
          <div>
            <span class="eyebrow yellow">Avui a Les Santes</span>
            <h2>Agenda viva</h2>
          </div>
          <a href="#programa">Veure tot el programa</a>
        </div>
        <div class="home-event-grid">${highlights.map((ev, index) => renderHomeEventCard(ev, index)).join('')}</div>
      </section>

      <section class="section home-quick-section">
        <div class="section-head home-section-head">
          <div>
            <span class="eyebrow">Explora</span>
            <h2>Accessos ràpids</h2>
          </div>
        </div>
        <div class="home-quick-grid">${quickLinks.map(homeQuickCard).join('')}</div>
      </section>

      <section class="section home-mini-band">
        <div class="home-mini-copy">
          <span class="home-mini-badge">★ Nou · MiniSantes</span>
          <h2>La festa també es <span>juga</span></h2>
          <p>Minijocs, reptes i premis perquè els infants visquin Les Santes d’una manera divertida.</p>
          <div class="home-mini-stats" aria-label="Resum MiniSantes">
            <article><span>🎮</span><strong>3</strong><small>Minijocs</small></article>
            <article><span>🎁</span><strong>${state.rewards.length}</strong><small>Premis</small></article>
            <article><span>⭐</span><strong>${state.user ? state.user.level : 4}</strong><small>Nivells</small></article>
          </div>
          <div class="home-mini-actions">
            <a class="btn btn-primary primary-highlight" href="#minisantes">▶ Jugar ara</a>
            <a class="home-mini-link" href="#minisantes">Veure minijocs</a>
          </div>
        </div>
        <div class="home-mini-art" aria-hidden="true">
          <div class="home-mini-blob"></div>
          <div class="home-mini-castle"><i></i><i></i><i></i><b></b></div>
          <div class="home-mini-coin big">🪙</div>
          <div class="home-mini-prize">🏆</div>
          <div class="home-mini-avatar">🧒</div>
          <div class="home-mini-token token-one">🎮</div>
          <div class="home-mini-token token-two">🎭</div>
          <div class="home-mini-star star-one">★</div>
          <div class="home-mini-star star-two">✦</div>
          <div class="home-mini-ribbon">Juga · Guanya · Celebra</div>
        </div>
      </section>
    </div>`;
}

function renderHomeEventCard(ev, index = 0) {
  return `<article class="home-event-card ${index === 0 ? 'featured' : ''}">
    <div class="home-event-time"><strong>${escapeHTML(ev.time)}</strong><span>${escapeHTML(ev.day)}</span></div>
    <div class="home-event-main">
      <div class="home-event-top">
        <span class="event-cat ${categoryClass(ev.cat)}">${escapeHTML(ev.cat)}</span>
        ${index === 0 ? '<span class="home-featured-badge">Destacat</span>' : ''}
      </div>
      <h3>${escapeHTML(ev.title)}</h3>
      <p class="location-chip">📍 ${escapeHTML(ev.location || 'Ubicació pendent')}</p>
    </div>
    <a class="btn btn-primary primary-highlight btn-small" href="#acte/${ev.id}" aria-label="Veure detall de ${escapeHTML(ev.title)}">Veure detall</a>
  </article>`;
}

function homeQuickCard(item) {
  return `<a class="home-quick-card ${item.theme}" href="${item.href}">
    <span>${item.icon}</span>
    <div><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.text)}</p></div>
  </a>`;
}

function renderPrograma() {
  const result = filteredEvents();
  const counts = {
    total: result.length,
    music: result.filter((e) => e.cat === 'Música').length,
    family: result.filter((e) => e.cat === 'Familiar').length
  };
  app.innerHTML = `
    ${pageTitle('Programa', 'Actes públics importats del JSON oficial. Filtra per dia, categoria o cerca lliure.', '<a class="btn btn-map" href="#mapa">Veure mapa d’actes</a>')}
    <div class="filters" id="dayFilters">${uniqueDays().map((d) => `<button class="chip ${state.filters.day === d ? 'active' : ''}" data-day="${escapeHTML(d)}">${escapeHTML(d)}</button>`).join('')}</div>
    <div class="filters" id="catFilters">${categories().map((c) => `<button class="chip ${state.filters.category === c ? 'active' : ''}" data-cat="${escapeHTML(c)}">${escapeHTML(c)}</button>`).join('')}</div>
    <label class="field"><span>Cercar actes</span><input id="programSearch" class="input" type="search" placeholder="Castellers, concert, gegants..." value="${escapeHTML(state.filters.q)}"></label>
    <section class="program-layout">
      <div class="event-list">${result.length ? result.slice(0, 60).map(renderEventCard).join('') : emptyState('No hi ha actes amb aquests filtres')}</div>
      <aside class="side-panel day-summary info-highlight">
        <span class="eyebrow yellow">Resum del dia</span>
        <div class="quick-stats"><div class="stat"><strong>${counts.total}</strong><span>actes</span></div><div class="stat"><strong>${counts.music}</strong><span>música</span></div><div class="stat"><strong>${counts.family}</strong><span>familiar</span></div></div>
        <h3>Properes activitats</h3>
        ${result.slice(0, 3).map((e) => `<a class="map-event-card" href="#acte/${e.id}"><strong>${escapeHTML(e.title)}</strong><p>${escapeHTML(e.time)} · ${escapeHTML(e.location || '')}</p></a>`).join('') || '<p>No hi ha resultats.</p>'}
      </aside>
    </section>`;
  $('#dayFilters')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-day]');
    if (!b) return;
    state.filters.day = b.dataset.day;
    renderPrograma();
  });
  $('#catFilters')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    state.filters.category = b.dataset.cat;
    renderPrograma();
  });
  $('#programSearch')?.addEventListener('input', (e) => {
    state.filters.q = e.target.value;
    renderPrograma();
    $('#programSearch')?.focus();
  });
  $('#resetFilters')?.addEventListener('click', () => {
    state.filters = { day: 'Tots', category: 'Tots', q: '' };
    renderPrograma();
  });
}

function renderMapa() {
  const events = filteredEvents().filter(hasValidMapPoint);
  if (!events.some((e) => e.id === state.selectedMapId)) state.selectedMapId = events[0]?.id ?? null;
  app.innerHTML = `
    ${pageTitle('Mapa d’actes', 'Explora Mataró amb els actes situats sobre el mapa. Filtra per categoria i obre el detall de cada activitat.', '<a class="btn btn-ghost" href="#programa">Tornar al Programa</a>')}
    <section class="map-shell map-layout map-layout-final">
      <div class="map-card map-card-final map-highlight">
        <div class="map-topbar">
          <div class="map-toolbar" id="mapCats">${['Tots', 'Música', 'Familiar', 'Tradicional', 'Cultura', 'Altres'].map((c) => `<button class="chip ${state.filters.category === c ? 'active' : ''}" data-cat="${escapeHTML(c)}">${escapeHTML(c)}</button>`).join('')}</div>
          <button class="map-reset info-highlight" id="resetMapView" type="button">Centrar Mataró</button>
        </div>
        <div id="mataroMap" class="mataro-map map-container" role="application" aria-label="Mapa interactiu dels actes de Mataró"></div>
        <div class="map-legend" aria-label="Llegenda del mapa">
          <span><i class="legend-dot marker-musica"></i>Música</span>
          <span><i class="legend-dot marker-familiar"></i>Familiar</span>
          <span><i class="legend-dot marker-tradicional"></i>Tradicional</span>
          <span><i class="legend-dot marker-altres"></i>Altres</span>
        </div>
        <div id="mapFallback" class="map-fallback" aria-live="polite"></div>
      </div>
      <aside class="map-side map-side-final" id="mapList" aria-label="Actes visibles al mapa">
        <div class="map-side-head">
          <span class="eyebrow yellow">${events.length} actes ubicats</span>
          <strong>Actes al mapa</strong>
        </div>
        ${events.length ? events.slice(0, 80).map(mapSideCard).join('') : '<div class="state-box"><h3>No hi ha actes amb coordenades</h3><p>Canvia els filtres o torna al programa.</p></div>'}
      </aside>
    </section>`;
  $('#mapCats')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    state.filters.category = b.dataset.cat;
    renderMapa();
  });
  $('#resetMapView')?.addEventListener('click', () => {
    if (state.map && state._mapBounds?.length) {
      state.map.fitBounds(state._mapBounds, { padding: [48, 48], maxZoom: 15 });
    } else {
      renderStaticMap(events, true);
    }
  });
  $('#mapList')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-focus-map]');
    const card = e.target.closest('[data-map-id]');
    if (b) {
      selectMapEvent(Number(b.dataset.focusMap), true);
      return;
    }
    if (card && !e.target.closest('a, button')) selectMapEvent(Number(card.dataset.mapId), true);
  });
  $('#mapList')?.addEventListener('keydown', (e) => {
    if (!['Enter', ' '].includes(e.key)) return;
    if (e.target.closest('a, button')) return;
    const card = e.target.closest('[data-map-id]');
    if (!card) return;
    e.preventDefault();
    selectMapEvent(Number(card.dataset.mapId), true);
  });
  setTimeout(() => initMap(events), 80);
}

function mapSideCard(ev) {
  return `<article class="map-event-card ${state.selectedMapId === ev.id ? 'active' : ''}" data-map-id="${ev.id}" tabindex="0">
    <div class="event-cat ${categoryClass(ev.cat)}">${escapeHTML(ev.cat)}</div>
    <strong>${escapeHTML(ev.title)}</strong>
    <p><span class="map-card-time">${escapeHTML(ev.time)}</span><span class="location-chip">📍 ${escapeHTML(ev.location || 'Ubicació pendent')}</span></p>
    <div class="cta-row compact"><button class="btn btn-map btn-small" data-focus-map="${ev.id}" type="button">Centrar</button><a class="btn btn-primary btn-small primary-highlight" href="#acte/${ev.id}">Detall</a></div>
  </article>`;
}

function markerClass(cat) {
  if (cat === 'Música') return 'marker-musica';
  if (cat === 'Familiar') return 'marker-familiar';
  if (cat === 'Tradicional' || cat === 'Cultura') return 'marker-tradicional';
  return 'marker-altres';
}

function markerLabel(cat) {
  if (cat === 'Música') return '♪';
  if (cat === 'Familiar') return '★';
  if (cat === 'Tradicional' || cat === 'Cultura') return 'T';
  return '•';
}

function popupHTML(ev) {
  return `<div class="map-popup">
    <span class="event-cat ${categoryClass(ev.cat)}">${escapeHTML(ev.cat)}</span>
    <div class="popup-title">${escapeHTML(ev.title)}</div>
    <p>${escapeHTML(ev.time)} · ${escapeHTML(ev.location || '')}</p>
    <div class="popup-actions"><a class="btn btn-primary btn-small primary-highlight" href="#acte/${ev.id}">Veure detall</a></div>
  </div>`;
}

function initMap(events) {
  const mapEl = $('#mataroMap');
  if (!mapEl) return;
  if (state.map) {
    state.map.remove();
    state.map = null;
  }
  state.markers = [];
  state._mapBounds = [];
  if (!events.length) {
    mapEl.innerHTML = '<div class="state-box map-empty"><h3>No hi ha actes amb aquests filtres</h3><p>Canvia la categoria o torna al programa complet.</p></div>';
    return;
  }
  if (typeof L === 'undefined') {
    renderStaticMap(events, true, 'Leaflet no ha carregat', 'Mostrem una vista esquemàtica i mantenim la llista d’actes disponible.');
    return;
  }
  try {
    state.map = L.map('mataroMap', {
      scrollWheelZoom: true,
      zoomControl: false,
      preferCanvas: true
    }).setView([41.5398, 2.4449], 14);
    L.control.zoom({ position: 'bottomright' }).addTo(state.map);
    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
      crossOrigin: true
    });
    let tileErrors = 0;
    tiles.on('tileerror', () => {
      tileErrors += 1;
      if (tileErrors >= 4) renderStaticMap(events, true, 'OpenStreetMap no respon', 'Mostrem una vista esquemàtica amb els mateixos actes ubicats.');
    });
    tiles.addTo(state.map);
    const bounds = [];
    events.forEach((ev) => {
      const point = [mapCoordinate(ev.lat), mapCoordinate(ev.lng)];
      if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) return;
      bounds.push(point);
      const icon = L.divIcon({
        className: 'custom-marker-shell',
        html: `<div class="custom-marker ${markerClass(ev.cat)}" data-leaflet-marker-id="${ev.id}"><span>${markerLabel(ev.cat)}</span></div>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
        popupAnchor: [0, -20]
      });
      const marker = L.marker(point, { icon, title: ev.title }).addTo(state.map);
      marker.bindPopup(popupHTML(ev), { closeButton: true, maxWidth: 260 });
      marker.on('click', () => selectMapEvent(ev.id, true));
      state.markers.push({ id: ev.id, marker, point });
    });
    state._mapBounds = bounds;
    if (bounds.length) state.map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
    setTimeout(() => {
      state.map?.invalidateSize(true);
      if (state.selectedMapId !== null) selectMapEvent(state.selectedMapId, false);
    }, 180);
    setTimeout(() => state.map?.invalidateSize(true), 700);
  } catch (err) {
    console.warn('Leaflet no s’ha pogut inicialitzar:', err);
    renderStaticMap(events, true);
  }
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function showMapNotice(title, text) {
  const notice = $('#mapFallback');
  if (!notice) return;
  notice.innerHTML = `<h3>${escapeHTML(title)}</h3><p>${escapeHTML(text)}</p>`;
  notice.classList.add('show');
  clearTimeout(showMapNotice.timer);
  showMapNotice.timer = setTimeout(() => notice.classList.remove('show'), 3200);
}

function renderStaticMap(events, showNotice = false, noticeTitle = 'Mapa esquemàtic carregat', noticeText = 'Mostrem els punts sobre una vista simplificada de Mataró.') {
  const mapEl = $('#mataroMap');
  if (!mapEl) return;
  if (state.map) {
    state.map.remove();
    state.map = null;
  }
  const valid = events.filter(hasValidMapPoint);
  if (!valid.length) {
    mapEl.innerHTML = '<div class="state-box map-empty"><h3>No hi ha actes amb coordenades vàlides</h3><p>La llista lateral es manté disponible per continuar navegant.</p></div>';
    if (showNotice) showMapNotice('Sense punts vàlids', 'No s’han trobat coordenades disponibles per aquests filtres.');
    return;
  }
  const lats = valid.map((ev) => mapCoordinate(ev.lat));
  const lngs = valid.map((ev) => mapCoordinate(ev.lng));
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const latSpan = maxLat - minLat || 0.01;
  const lngSpan = maxLng - minLng || 0.01;
  mapEl.innerHTML = `<div class="schematic-map" aria-label="Mapa esquemàtic de Mataró">
    <div class="schematic-grid"></div>
    <div class="schematic-road road-a"></div>
    <div class="schematic-road road-b"></div>
    <div class="schematic-road road-c"></div>
    <div class="schematic-sea">MAR</div>
    <div class="schematic-label centre">CENTRE</div>
    <div class="schematic-label port">PORT</div>
    ${valid.map((ev) => {
      const left = clamp(8 + ((mapCoordinate(ev.lng) - minLng) / lngSpan) * 84, 6, 92);
      const top = clamp(12 + (1 - ((mapCoordinate(ev.lat) - minLat) / latSpan)) * 74, 8, 86);
      return `<button class="schematic-pin custom-marker ${markerClass(ev.cat)} ${state.selectedMapId === ev.id ? 'active' : ''}" style="left:${left}%;top:${top}%" data-static-pin="${ev.id}" aria-label="${escapeHTML(ev.title)}"><span>${markerLabel(ev.cat)}</span></button>`;
    }).join('')}
  </div>`;
  if (showNotice) showMapNotice(noticeTitle, noticeText);
  mapEl.querySelectorAll('[data-static-pin]').forEach((pin) => {
    pin.addEventListener('click', () => selectMapEvent(Number(pin.dataset.staticPin), true));
  });
  state.markers = valid.map((ev) => ({ id: ev.id, el: mapEl.querySelector(`[data-static-pin="${ev.id}"]`) }));
  if (state.selectedMapId !== null) selectMapEvent(state.selectedMapId, false);
}

function selectMapEvent(id, openPopup = false) {
  state.selectedMapId = id;
  const ev = state.events.find((item) => item.id === id);
  const found = state.markers.find((m) => m.id === id);
  document.querySelectorAll('[data-map-id]').forEach((el) => {
    const active = Number(el.dataset.mapId) === id;
    el.classList.toggle('active', active);
    if (active && openPopup) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  document.querySelectorAll('[data-static-pin], .custom-marker').forEach((el) => {
    const markerId = Number(el.dataset.staticPin || el.dataset.leafletMarkerId || -1);
    el.classList.toggle('active', markerId === id);
  });
  if (ev && found?.marker && state.map) {
    state.map.setView([ev.lat, ev.lng], 16, { animate: true });
    if (openPopup) found.marker.openPopup();
  }
  if (found?.el && openPopup) {
    showMapNotice(ev?.title || 'Acte seleccionat', `${ev?.time || ''} · ${ev?.location || ''}`);
  }
}

function renderDetail(id) {
  const ev = state.events.find((item) => String(item.id) === String(id));
  if (!ev) {
    app.innerHTML = errorState('Acte no trobat', 'Aquest acte no existeix o no s’ha pogut importar.');
    return;
  }
  app.innerHTML = `
    <section class="detail-hero">
      ${ev.image ? `<img src="${escapeHTML(ev.image)}" alt="${escapeHTML(ev.title)}">` : ''}
      <div class="detail-hero-content">
        <span class="eyebrow ${categoryClass(ev.cat)}">${escapeHTML(ev.cat)}</span>
        <h1 class="detail-title">${escapeHTML(ev.title)}<span class="dot">.</span></h1>
        <div class="info-strip"><span class="reward-highlight">🕒 ${escapeHTML(ev.date_detail || ev.time)}</span><span class="info-highlight">📍 ${escapeHTML(ev.location || 'Ubicació pendent')}</span></div>
      </div>
    </section>
    <section class="section detail-layout">
      <article class="content-card card">
        <h3>Sobre l’esdeveniment</h3>
        <p class="description">${escapeHTML(ev.longText)}</p>
        <div class="cta-row">
          <a class="btn btn-primary primary-highlight" href="#mapa" id="goMap">Com arribar</a>
          <a class="btn btn-ghost" href="#programa">Tornar al programa</a>
        </div>
      </article>
      <aside class="detail-side">
        <div class="card content-card info-highlight"><span class="eyebrow yellow">Resum</span><p><strong>Hora:</strong> ${escapeHTML(ev.time)}</p><p><strong>Lloc:</strong> ${escapeHTML(ev.location || 'Pendent')}</p><p><strong>Categoria:</strong> ${escapeHTML(ev.cat)}</p></div>
        <div class="side-map info-highlight" id="detailMap" aria-label="Mapa petit de l’acte"></div>
      </aside>
    </section>`;
  $('#goMap')?.addEventListener('click', () => {
    state.selectedMapId = ev.id;
    state.filters.category = 'Tots';
  });
  setTimeout(() => initDetailMap(ev), 100);
}

function initDetailMap(ev) {
  const detailEl = $('#detailMap');
  if (!detailEl) return;
  if (!hasValidMapPoint(ev)) {
    detailEl.innerHTML = '<div class="state-box map-empty"><h3>Ubicació pendent</h3></div>';
    return;
  }
  if (typeof L === 'undefined') {
    detailEl.innerHTML = '<div class="state-box map-empty"><h3>Mapa no disponible</h3><p>Obre el mapa general per consultar la llista d’actes.</p></div>';
    return;
  }
  if (state.detailMap) state.detailMap.remove();
  state.detailMap = L.map('detailMap', { zoomControl: false, dragging: true, scrollWheelZoom: false }).setView([ev.lat, ev.lng], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '' }).addTo(state.detailMap);
  L.marker([ev.lat, ev.lng]).addTo(state.detailMap);
  setTimeout(() => state.detailMap?.invalidateSize(), 250);
}

function renderMinisantes() {
  if (!state.user && !state.guest) return renderMinisantesAccess();
  const logged = Boolean(state.user);
  const guestNote = state.guest ? `<div class="guest-banner mini-guest-banner info-highlight">👀 <strong>Mode convidat:</strong> pots provar Minisantes, però el progrés, les monedes i les recompenses no es guardaran.</div>` : '';
  const rewardPanel = logged
    ? `<a class="mini-pill-link" href="#botiga">🏪 Botiga</a><a class="mini-pill-link" href="#inventari">🎒 Inventari</a><a class="mini-pill-link" href="#perfil">👤 Perfil</a>`
    : `<a class="mini-pill-link" href="#login">✨ Crear compte</a><button class="mini-pill-link as-button" id="exitGuest">Sortir de convidat</button>`;
  const coins = logged ? money(state.user.coins) : '—';
  const streak = logged ? '4' : '0';
  const unlocked = logged ? `${state.inventory.length || 0}/${state.rewards.length || 12}` : '0/12';
  const featuredRewards = state.rewards.slice(0, 3);

  app.innerHTML = `
    <div class="minisantes-world playful-mini super-mini">
      ${guestNote}
      <div class="mini-deco mini-deco-a" aria-hidden="true">★</div>
      <div class="mini-deco mini-deco-b" aria-hidden="true">✦</div>
      <div class="mini-deco mini-deco-c" aria-hidden="true">●</div>

      <section class="mini-hero-remake mini-hero-ultra mini-hero-reborn" aria-labelledby="miniTitle">
        <div class="mini-hero-copy mini-hero-panel">
          <span class="mini-super-badge">★ Nou · MiniSantes</span>
          <h1 id="miniTitle">La festa també<br>es <span>juga</span></h1>
          <p class="lead">Explora MiniSantes amb minijocs, monedes, reptes i premis pensats perquè els infants visquin Les Santes d’una manera divertida.</p>
          <div class="mini-hero-stats" aria-label="Resum de MiniSantes">
            <article><span>🎮</span><strong>3</strong><small>minijocs</small></article>
            <article><span>🎁</span><strong>${state.rewards.length || 8}</strong><small>premis</small></article>
            <article><span>⭐</span><strong>${logged ? escapeHTML(state.user.level) : '4'}</strong><small>nivells</small></article>
          </div>
          <div class="mini-actions mini-hero-actions">
            <button class="btn btn-primary primary-highlight mini-main-play" data-play="castell">▶ Jugar ara</button>
            <a class="mini-secondary-cta" href="${logged ? '#botiga' : '#login'}">Explorar premis</a>
          </div>
          <div class="mini-hero-links" aria-label="Accessos MiniSantes">${rewardPanel}</div>
        </div>
        <div class="mini-hero-scene" aria-hidden="true">
          <div class="mini-scene-glow glow-red"></div>
          <div class="mini-scene-glow glow-blue"></div>
          <div class="mini-scene-panel">
            <div class="mini-scene-sky">
              <span></span><span></span><span></span><span></span><span></span>
            </div>
            <div class="mini-scene-sun"></div>
            <div class="mini-scene-cloud cloud-left"></div>
            <div class="mini-scene-cloud cloud-right"></div>
            <div class="mini-scene-ground"></div>
            <div class="mini-scene-castle">
              <i></i><i></i><i></i>
              <b></b>
            </div>
            <div class="mini-mascot-card"><span>🧒</span><strong>Repte!</strong></div>
            <div class="mini-prize-orb">🏆</div>
            <div class="mini-game-token token-a">🎮</div>
            <div class="mini-game-token token-b">🎭</div>
            <div class="mini-coin-orb coin-a">★</div>
            <div class="mini-coin-orb coin-b">●</div>
            <div class="mini-coin-orb coin-c">✦</div>
          </div>
          <div class="mini-floating-card mini-card-score"><span>+50</span><strong>monedes</strong></div>
          <div class="mini-floating-card mini-card-level"><span>⭐</span><strong>Nivell 4</strong></div>
          <div class="mini-scene-ribbon">Juga · Guanya · Celebra</div>
        </div>
      </section>

      <section class="section mini-dashboard" aria-label="Estat de joc">
        <article class="mini-status-card red">
          <span>🧒</span><div><strong>${logged ? escapeHTML(state.user.display_name || state.user.username) : 'Convidat'}</strong><p>${logged ? 'Progrés guardat' : 'Prova sense guardar'}</p></div>
        </article>
        <article class="mini-status-card yellow reward-highlight">
          <span>🪙</span><div><strong>${coins}</strong><p>monedes</p></div>
        </article>
        <article class="mini-status-card blue info-highlight">
          <span>🔥</span><div><strong>${streak}</strong><p>dies de ratxa</p></div>
        </article>
        <article class="mini-status-card green">
          <span>🎁</span><div><strong>${unlocked}</strong><p>premis</p></div>
        </article>
      </section>

      <section class="section mini-mission-hero reward-highlight">
        <div>
          <span class="eyebrow green">Missió del dia</span>
          <h3>Completa 2 minijocs i aconsegueix 50 monedes extra</h3>
          <p>${state.guest ? 'En mode convidat pots provar la missió, però no quedarà guardada.' : 'El progrés queda sincronitzat amb el teu perfil i inventari.'}</p>
        </div>
        <div class="mini-mission-progress" aria-label="Progrés de la missió"><strong>1/2</strong><span><i></i></span></div>
      </section>

      <section class="section mini-progress-lane" aria-label="Progrés i recompenses">
        <article class="mini-progress-card reward-highlight">
          <span>🪙</span><div><strong>Progrés</strong><p>Juga, suma monedes i desbloqueja premis especials.</p></div>
        </article>
        <article class="mini-progress-card info-highlight">
          <span>🧭</span><div><strong>Explora Mataró</strong><p>Combina minijocs amb els actes del mapa.</p></div>
        </article>
        <article class="mini-progress-card primary-highlight">
          <span>🎯</span><div><strong>Repte ràpid</strong><p>Supera el teu millor resultat d’avui.</p></div>
        </article>
      </section>

      <section class="section mini-games-panel mini-games-ultra">
        <div class="section-head">
          <div><h3>Jocs destacats</h3><p>Escull una aventura i juga amb la cultura popular de Mataró.</p></div>
          <a href="${logged ? '#perfil' : '#login'}">${logged ? 'Veure progrés' : 'Crear compte'} →</a>
        </div>
        <div class="grid-3 game-grid mini-game-grid">
          ${gameCard('Construeix el castell', 'Apila castellers i intenta arribar al cel sense que caigui la torre.', '🏰', 'Nou', '+150', 'castell')}
          ${gameCard('Troba les parelles', 'Memory amb gegants, diables, capgrossos i símbols de la festa.', '🎴', 'Popular', '+100', 'parelles')}
          ${gameCard('Atrapa el confeti', 'Toca el confeti, esquiva els perills i fes pujar el combo.', '🎉', 'Fàcil', '+200', 'confeti')}
        </div>
      </section>

      <section class="section mini-rewards-showcase">
        <div class="section-head">
          <div><h3>Recompenses destacades</h3><p>Premis digitals que pots desbloquejar jugant.</p></div>
          <a href="${logged ? '#botiga' : '#login'}">${logged ? 'Anar a la botiga' : 'Crear compte'} →</a>
        </div>
        <div class="mini-reward-grid">
          ${(featuredRewards.length ? featuredRewards : [{ image: '🎁', name: 'Premi sorpresa', cost: 500, type: 'Premi' }, { image: '🪙', name: 'Bonus de monedes', cost: 750, type: 'Bonus' }, { image: '⭐', name: 'Insígnia especial', cost: 1000, type: 'Col·lecció' }]).map((r) => `<article class="mini-reward-card reward-highlight"><span class="eyebrow yellow">${escapeHTML(r.type || 'Premi')}</span><div>${r.image || '🎁'}</div><strong>${escapeHTML(r.name)}</strong><p>● ${money(r.cost || 0)} monedes</p></article>`).join('')}
        </div>
      </section>

      <section class="section mini-bottom-grid mini-final-grid">
        <article class="mini-info-card blue info-highlight"><span>🏆</span><div><strong>Rànquing setmanal</strong><p>Ets al top 10% dels jugadors!</p></div></article>
        <article class="mini-info-card yellow reward-highlight"><span>⚡</span><div><strong>Pròxim premi</strong><p>Falten 750 monedes</p></div></article>
        <article class="mini-info-card pink"><span>⭐</span><div><strong>Nivell 4</strong><p>Col·leccionista expert</p></div></article>
      </section>
    </div>`;

  $('#exitGuest')?.addEventListener('click', () => {
    state.guest = false;
    sessionStorage.removeItem(STORAGE_GUEST);
    toast('Has sortit del mode convidat');
    renderMinisantesAccess();
    updateHeader();
  });
  app.querySelectorAll('[data-play]').forEach((btn) => btn.addEventListener('click', () => toast('Minijoc en estat prototip. Properament!')));
}

function renderMinisantesAccess() {
  app.innerHTML = `
    <section class="login-screen">
      <div class="access-grid">
        <article class="card login-card">
          <span class="eyebrow yellow">Accés especial</span>
          <h2>Entra a Minisantes<span class="dot">.</span></h2>
          <p>Inicia sessió o registra’t per guardar monedes, inventari i progrés.</p>
          <div class="cta-row"><a class="btn btn-primary primary-highlight" href="#login">Iniciar sessió / registrar-se</a></div>
          <p class="hint">Usuari de prova: <strong>biel09</strong> · contrasenya: <strong>santes2026</strong></p>
        </article>
        <article class="card login-card guest-card">
          <span class="eyebrow green">Mode convidat</span>
          <h2>Prova els jocs</h2>
          <p>Podràs veure Minisantes i navegar pels minijocs, però el progrés no es guardarà.</p>
          <button class="btn btn-yellow reward-highlight" id="guestBtn">Entrar com a convidat</button>
        </article>
      </div>
    </section>`;
  $('#guestBtn')?.addEventListener('click', () => {
    state.guest = true;
    sessionStorage.setItem(STORAGE_GUEST, '1');
    updateHeader();
    toast('Mode convidat: el progrés no es guardarà');
    renderMinisantes();
  });
}

function gameCard(title, subtitle, icon, badge, prize, key) {
  const theme = { castell: 'castle', parelles: 'pairs', confeti: 'confetti' }[key] || 'castle';
  const accent = { castell: 'game-card-red', parelles: 'game-card-yellow', confeti: 'game-card-blue' }[key] || 'game-card-red';
  return `<article class="game-card mini-game-card ${theme} ${accent}">
    <div class="game-art" aria-hidden="true"><span>${icon}</span></div>
    <div class="game-content">
      <div class="game-badges"><span>${escapeHTML(badge)}</span><span>Guanya ${escapeHTML(prize)} ●</span></div>
      <h3>${escapeHTML(title)}</h3>
      <p>${escapeHTML(subtitle)}</p>
      <button class="btn btn-primary primary-highlight btn-small" data-play="${key}">Jugar ▸</button>
    </div>
  </article>`;
}

function requireRegistered() {
  if (!state.user) {
    toast(state.guest ? 'En mode convidat no es guarda el progrés' : 'Inicia sessió per continuar');
    location.hash = state.guest ? '#minisantes' : '#login';
    return false;
  }
  return true;
}

function renderBotiga() {
  if (!requireRegistered()) return;
  const owned = new Set(state.inventory.map((item) => item.id));
  app.innerHTML = `
    ${pageTitle('Botiga', 'Recompenses carregades des de la base de dades.', '<a class="btn btn-ghost" href="#inventari">El meu inventari</a>')}
    <section class="shop-grid">${state.rewards.map((r) => {
      const isOwned = owned.has(r.id);
      const canBuy = state.user.coins >= r.cost && !isOwned;
      return `<article class="shop-card ${canBuy || isOwned ? 'reward-highlight' : 'locked'}">
        <span class="eyebrow ${isOwned ? 'yellow' : ''}">${isOwned ? 'Obtingut' : escapeHTML(r.type)}</span>
        <div class="shop-img">${r.image || '🎁'}</div>
        <h3>${escapeHTML(r.name)}</h3><p>${escapeHTML(r.description || '')}</p>
        <div class="price">● ${money(r.cost)}</div>
        <button class="btn btn-primary primary-highlight btn-small" data-buy="${escapeHTML(r.id)}" ${canBuy ? '' : 'disabled'}>${isOwned ? 'Ja és teu' : canBuy ? 'Desbloquejar' : 'Falten monedes'}</button>
      </article>`;
    }).join('')}</section>`;
  app.querySelectorAll('[data-buy]').forEach((btn) => btn.addEventListener('click', () => buyReward(btn.dataset.buy)));
}

async function buyReward(rewardId) {
  try {
    const data = await api('/buy', { method: 'POST', body: JSON.stringify({ user_id: state.user.id, reward_id: rewardId }) });
    state.user = data.user;
    state.inventory = data.inventory || [];
    state.progress = data.progress || [];
    updateHeader();
    toast('Recompensa desbloquejada!');
    renderBotiga();
  } catch (err) {
    toast(err.message);
  }
}

function renderInventari() {
  if (!requireRegistered()) return;
  app.innerHTML = `
    ${pageTitle('Inventari', 'Premis desbloquejats del teu compte.', '<a class="btn btn-primary primary-highlight" href="#botiga">Anar a la botiga</a>')}
    <section class="inventory-grid">
      ${state.inventory.length ? state.inventory.map((r) => `<article class="inv-card reward-highlight ${r.equipped ? 'featured' : ''}"><span class="eyebrow ${r.equipped ? 'yellow' : ''}">${r.equipped ? 'Equipat' : 'Obtingut'}</span><div class="inv-art">${r.image || '🎁'}</div><h3>${escapeHTML(r.name)}</h3><p>${escapeHTML(r.description || '')}</p></article>`).join('') : '<div class="state-box"><h3>Encara no tens recompenses</h3><p>Visita la botiga per desbloquejar-ne.</p></div>'}
    </section>`;
}

function renderPerfil() {
  if (!requireRegistered()) return;
  const totalCoins = state.progress.reduce((sum, item) => sum + item.coins_earned, 0);
  app.innerHTML = `
    ${pageTitle('Perfil', 'Dades llegides des de la base de dades SQLite.', '<button class="btn btn-ghost" id="logoutBtn">Tancar sessió</button>')}
    <section class="profile-top">
      <article class="card profile-card"><div class="profile-row"><div class="big-avatar">🧒</div><div><h2>${escapeHTML(state.user.display_name)}</h2><span class="eyebrow yellow">Nivell ${state.user.level}</span><p class="coin-line reward-highlight">● ${money(state.user.coins)} <span>monedes</span></p></div></div></article>
      <article class="card profile-card"><h3>Resum Minisantes</h3><div class="quick-stats"><div class="stat"><strong>${state.inventory.length}</strong><span>premis</span></div><div class="stat"><strong>${state.progress.length}</strong><span>jocs</span></div><div class="stat"><strong>${money(totalCoins)}</strong><span>guanyades</span></div></div></article>
    </section>
    <section class="section settings-layout">
      <div><h3>Progrés de minijocs</h3><div class="card settings-list">${state.progress.map((p) => activityItem(gameName(p.game_key), `Millor puntuació: ${money(p.best_score)}`, `${money(p.coins_earned)} monedes`)).join('')}</div></div>
      <div><h3>Accés ràpid</h3><div class="quick-actions"><a class="quick-action" href="#botiga"><span>🏪</span><div><strong>Botiga</strong><p>Compra recompenses</p></div></a><a class="quick-action" href="#inventari"><span>🎒</span><div><strong>Inventari</strong><p>Consulta premis</p></div></a></div></div>
    </section>`;
  $('#logoutBtn')?.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_SESSION);
    state.user = null;
    state.inventory = [];
    state.progress = [];
    updateHeader();
    toast('Sessió tancada');
    location.hash = '#home';
  });
}

function gameName(key) {
  return { castell: 'Construeix el castell', parelles: 'Troba les parelles', confeti: 'Atrapa el confeti' }[key] || key;
}

function activityItem(title, desc, right) {
  return `<div class="settings-item"><div><strong>${escapeHTML(title)}</strong><p>${escapeHTML(desc)}</p></div><span>${escapeHTML(right)}</span></div>`;
}

function renderLogin() {
  app.innerHTML = `<section class="login-screen"><div class="card login-card"><span class="eyebrow yellow">Compte Minisantes</span><h2>Accedeix<span class="dot">.</span></h2><p>Entra o crea un compte. El perfil, inventari i botiga depenen de SQLite.</p><div class="auth-tabs"><button class="active" id="tabLogin" type="button">Login</button><button id="tabRegister" type="button">Registre</button></div><form id="authForm"><label class="field"><span>Usuari</span><input class="input" id="authUser" required placeholder="biel09" autocomplete="username"></label><label class="field"><span>Contrasenya</span><input class="input" id="authPass" type="password" required placeholder="santes2026" autocomplete="current-password"></label><button class="btn btn-primary primary-highlight full" type="submit">Entrar</button></form><p class="hint">Usuari de prova: <strong>biel09</strong> · contrasenya: <strong>santes2026</strong></p></div></section>`;
  let mode = 'login';
  $('#tabLogin').addEventListener('click', () => {
    mode = 'login';
    $('#tabLogin').classList.add('active');
    $('#tabRegister').classList.remove('active');
  });
  $('#tabRegister').addEventListener('click', () => {
    mode = 'register';
    $('#tabRegister').classList.add('active');
    $('#tabLogin').classList.remove('active');
  });
  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const payload = { username: $('#authUser').value.trim(), password: $('#authPass').value };
      const data = await api(mode === 'login' ? '/login' : '/register', { method: 'POST', body: JSON.stringify(payload) });
      state.user = data.user;
      state.inventory = data.inventory || [];
      state.progress = data.progress || [];
      localStorage.setItem(STORAGE_SESSION, String(state.user.id));
      state.guest = false;
      sessionStorage.removeItem(STORAGE_GUEST);
      updateHeader();
      toast(mode === 'login' ? 'Benvingut/da!' : 'Compte creat!');
      location.hash = '#perfil';
    } catch (err) {
      toast(err.message);
    }
  });
}

function setupChrome() {
  $('#globalSearchBtn').addEventListener('click', openSearch);
  $('#closeSearch').addEventListener('click', closeSearch);
  $('#searchOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'searchOverlay') closeSearch();
  });
  $('#globalSearchInput').addEventListener('input', renderSearchResults);
  $('#globalSearchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSearch();
  });
  $('#userButton').addEventListener('click', () => {
    location.hash = state.user ? '#perfil' : '#login';
  });
  $('#mobileMenuBtn').addEventListener('click', () => $('#mobileMenu').classList.toggle('open'));
  document.querySelectorAll('#mobileMenu a').forEach((a) => a.addEventListener('click', () => $('#mobileMenu').classList.remove('open')));
  window.toast = toast;
}

function openSearch() {
  $('#searchOverlay').classList.remove('hidden');
  $('#globalSearchInput').focus();
  renderSearchResults();
}

function closeSearch() {
  $('#searchOverlay').classList.add('hidden');
}

function renderSearchResults() {
  const q = $('#globalSearchInput').value.trim().toLowerCase();
  const results = state.events.filter((e) => !q || `${e.title} ${e.location} ${e.cat}`.toLowerCase().includes(q)).slice(0, 8);
  $('#globalSearchResults').innerHTML = results.length ? results.map((e) => `<a class="small-result" href="#acte/${e.id}" onclick="document.getElementById('searchOverlay').classList.add('hidden')"><div><strong>${escapeHTML(e.title)}</strong><p>${escapeHTML(e.time)} · ${escapeHTML(e.location || '')}</p></div><span class="event-cat ${categoryClass(e.cat)}">${escapeHTML(e.cat)}</span></a>`).join('') : '<div class="state-box"><h3>Sense resultats</h3></div>';
}

function router() {
  const hash = (location.hash || '#home').slice(1);
  const [route, id] = hash.split('/');
  state.route = route || 'home';
  if (state.map) {
    state.map.remove();
    state.map = null;
  }
  if (state.detailMap) {
    state.detailMap.remove();
    state.detailMap = null;
  }
  $('#mobileMenu')?.classList.remove('open');
  updateHeader();
  if (state.loading) {
    app.innerHTML = loadingState('Carregant dades...');
    return;
  }
  if (state.error) {
    app.innerHTML = errorState('No s’han pogut carregar les dades', state.error);
    return;
  }
  const routes = {
    home: renderHome,
    programa: renderPrograma,
    mapa: renderMapa,
    minisantes: renderMinisantes,
    botiga: renderBotiga,
    inventari: renderInventari,
    perfil: renderPerfil,
    login: renderLogin
  };
  if (route === 'acte') renderDetail(id);
  else (routes[route] || renderHome)();
  window.scrollTo(0, 0);
  app.focus({ preventScroll: true });
}

window.addEventListener('hashchange', router);
setupChrome();
updateHeader();
loadInitialData();
