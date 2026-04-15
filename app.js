let dashboardState = null;
const REFRESH_INTERVAL_MS = 60_000;
const STARBASE_CENTER = { lat: 25.9971, lon: -97.1566 };
let leafletMap = null;
let leafletLayerGroup = null;

function setStatus(message, level = 'info') {
  const banner = document.getElementById('status-banner');
  if (!banner) return;
  banner.className = `status ${level}`;
  banner.textContent = message;
}

function getStoredSeenEvents() {
  try {
    return new Set(JSON.parse(localStorage.getItem('seen_event_ids') || '[]'));
  } catch (_error) {
    return new Set();
  }
}

function storeSeenEvents(ids) {
  localStorage.setItem('seen_event_ids', JSON.stringify([...ids]));
}

function initTheme() {
  const root = document.documentElement;
  const saved = localStorage.getItem('theme_mode') || 'dark';
  root.dataset.theme = saved;

  const toggle = document.getElementById('theme-toggle');
  toggle.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme_mode', root.dataset.theme);
  });
}

async function fetchDashboardData() {
  const response = await fetch(`data/dashboard.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Unable to load dashboard data');
  }
  return response.json();
}

async function loadDashboard() {
  initTheme();
  dashboardState = await fetchDashboardData();
  renderDashboard(dashboardState);
  setupFilters(dashboardState);
  setStatus('Dashboard loaded successfully.', 'ok');
  startAutoRefresh();
}

function startAutoRefresh() {
  setInterval(async () => {
    try {
      const next = await fetchDashboardData();
      if (next.generated_at !== dashboardState.generated_at) {
        const prevConfidence = document.getElementById('confidence-filter').value;
        const prevVehicle = document.getElementById('vehicle-filter').value;
        const prevSearch = document.getElementById('timeline-search').value;
        const prevSort = document.getElementById('timeline-sort').value;

        dashboardState = next;
        renderDashboard(dashboardState);
        setupFilters(dashboardState, {
          confidence: prevConfidence,
          vehicle: prevVehicle,
          search: prevSearch,
          sort: prevSort
        });
        setStatus('New data received and rendered.', 'ok');
      }
    } catch (_error) {
      setStatus('Auto-refresh failed; retaining last known data.', 'warn');
    }
  }, REFRESH_INTERVAL_MS);
}

function formatPacificDate(input, includeZone = false) {
  const date = new Date(input);
  const options = {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  };

  if (includeZone) {
    options.timeZoneName = 'short';
  }

  try {
    return new Intl.DateTimeFormat('en-US', options).format(date);
  } catch (_error) {
    return date.toISOString();
  }
}

function formatPacificDay(input) {
  const date = new Date(input);
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: 'long',
      day: '2-digit'
    }).format(date);
  } catch (_error) {
    return date.toISOString().slice(0, 10);
  }
}

function getFreshnessBadge(health) {
  const generatedAt = new Date(health.generated_at);
  const ageHours = (Date.now() - generatedAt.getTime()) / 3_600_000;

  if (ageHours > health.stale_after_hours) {
    return { label: `STALE (${ageHours.toFixed(1)}h old)`, className: 'danger' };
  }
  if (ageHours > health.stale_after_hours / 2) {
    return { label: `Aging (${ageHours.toFixed(1)}h old)`, className: 'warn' };
  }
  return { label: `Fresh (${ageHours.toFixed(1)}h old)`, className: 'ok' };
}

function renderHealth(data) {
  const health = data.health;
  const freshness = getFreshnessBadge(health);

  const status = document.getElementById('health-status');
  status.innerHTML = `
    <p>
      <strong>Mode:</strong> ${data.mode.replace('_', ' ')} ·
      <strong>Cadence:</strong> ${data.cadence[data.mode]} ·
      <strong>Events:</strong> ${health.event_count} ·
      <strong>Sources:</strong> ${health.source_count} ·
      <strong>Auto-refresh:</strong> every ${REFRESH_INTERVAL_MS / 1000}s
      <span class="badge ${freshness.className}">${freshness.label}</span>
    </p>
  `;
}

function renderCommandStrip(data) {
  const strip = document.getElementById('command-strip');
  const confidenceCounts = data.timeline.reduce(
    (acc, item) => {
      acc[item.confidence] = (acc[item.confidence] || 0) + 1;
      return acc;
    },
    { confirmed: 0, high: 0, medium: 0, low: 0 }
  );

  strip.innerHTML = `
    <article class="summary-card"><h3>Mode</h3><p>${data.mode}</p></article>
    <article class="summary-card"><h3>Mission</h3><p>${data.mission}</p></article>
    <article class="summary-card"><h3>Launch Time</h3><p>${data.launch.official_time_utc ?? 'TBD'}</p></article>
    <article class="summary-card"><h3>Confidence Mix</h3><p>C:${confidenceCounts.confirmed} H:${confidenceCounts.high} M:${confidenceCounts.medium} L:${confidenceCounts.low}</p></article>
  `;
}

function renderSourceAudit(data) {
  const audit = document.getElementById('source-audit');
  const grouped = new Map();

  for (const event of data.timeline) {
    let host = 'unknown';
    try {
      host = new URL(event.source).hostname;
    } catch (_error) {
      host = event.source;
    }

    const row = grouped.get(host) || { count: 0, latest: null };
    row.count += 1;
    row.latest = !row.latest || new Date(event.time) > new Date(row.latest) ? event.time : row.latest;
    grouped.set(host, row);
  }

  audit.innerHTML = `
    <table class="audit-table">
      <thead><tr><th>Source</th><th>Events</th><th>Latest event time</th></tr></thead>
      <tbody>
        ${[...grouped.entries()]
          .map(
            ([host, row]) =>
              `<tr><td>${host}</td><td>${row.count}</td><td>${formatPacificDate(row.latest)}</td></tr>`
          )
          .join('')}
      </tbody>
    </table>
  `;
}

function renderFleet(vehicles) {
  const container = document.getElementById('fleet-overview');
  const template = document.getElementById('vehicle-card-template');
  container.innerHTML = '';

  for (const vehicle of vehicles) {
    const clone = template.content.cloneNode(true);
    clone.querySelector('.name').textContent = `${vehicle.booster} + ${vehicle.ship}`;
    clone.querySelector('.status').textContent = vehicle.status;
    clone.querySelector('.next-milestone').textContent = vehicle.next_milestone.name;
    clone.querySelector('.confidence').textContent = vehicle.next_milestone.confidence;
    clone.querySelector('.countdown').textContent = vehicle.countdown ?? 'TBD';
    container.appendChild(clone);
  }
}

function groupedTimeline(events) {
  const groups = new Map();
  for (const event of events) {
    const day = formatPacificDay(event.time);
    if (!groups.has(day)) {
      groups.set(day, []);
    }
    groups.get(day).push(event);
  }
  return groups;
}

function renderTimeline(data) {
  const confidenceFilter = document.getElementById('confidence-filter').value;
  const vehicleFilter = document.getElementById('vehicle-filter').value;
  const search = document.getElementById('timeline-search').value.trim().toLowerCase();
  const sortDir = document.getElementById('timeline-sort').value;

  let filtered = data.timeline.filter((event) => {
    const confidenceMatch = confidenceFilter === 'all' || event.confidence === confidenceFilter;
    const vehicleMatch = vehicleFilter === 'all' || event.vehicle_ref === vehicleFilter;
    const haystack = `${event.milestone} ${event.source} ${event.vehicle_ref ?? ''}`.toLowerCase();
    const searchMatch = !search || haystack.includes(search);
    return confidenceMatch && vehicleMatch && searchMatch;
  });

  filtered = filtered.sort((a, b) => {
    const diff = new Date(b.time) - new Date(a.time);
    return sortDir === 'newest' ? diff : -diff;
  });

  const groups = groupedTimeline(filtered);
  const timeline = document.getElementById('mission-timeline');
  timeline.innerHTML = '';

  const seen = getStoredSeenEvents();
  const visibleIds = new Set();

  for (const [day, events] of groups.entries()) {
    const section = document.createElement('section');
    section.className = 'timeline-day';

    const heading = document.createElement('h3');
    heading.textContent = day;
    section.appendChild(heading);

    const list = document.createElement('ol');
    for (const event of events) {
      const li = document.createElement('li');
      const isNewVisit = !seen.has(event.event_id);
      visibleIds.add(event.event_id);
      const newBadge =
        Date.now() - new Date(event.collected_at || event.time).getTime() < 86_400_000
          ? ' <span class="badge ok">NEW</span>'
          : '';
      const visitBadge = isNewVisit ? ' <span class="badge warn">NEW SINCE LAST VISIT</span>' : '';
      li.innerHTML = `<strong>${event.mission}</strong> · ${event.vehicle_ref ?? 'n/a'} — ${event.milestone} (${event.confidence}) @ ${formatPacificDate(
        event.time
      )}${newBadge}${visitBadge}<br/><small>Source: <a href="${event.source}" target="_blank" rel="noreferrer">link</a>${
        event.notes ? ` · ${event.notes}` : ''
      }</small>`;
      list.appendChild(li);
    }

    section.appendChild(list);
    timeline.appendChild(section);
  }

  if (!filtered.length) {
    timeline.innerHTML = '<p>No events match current filters.</p>';
  }

  storeSeenEvents(new Set([...seen, ...visibleIds]));
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

function ensureLeafletMap() {
  const mapEl = document.getElementById('live-map');
  if (!mapEl || typeof L === 'undefined') {
    return null;
  }
  if (!leafletMap) {
    leafletMap = L.map('live-map').setView([STARBASE_CENTER.lat, STARBASE_CENTER.lon], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(leafletMap);
    leafletLayerGroup = L.layerGroup().addTo(leafletMap);
  }
  return leafletMap;
}

function renderStarbaseMap(mapContext) {
  const mapEl = document.getElementById('live-map');
  const telemetryEl = document.getElementById('map-canvas');
  mapEl.style.display = 'block';
  telemetryEl.style.display = 'none';

  const mapInstance = ensureLeafletMap();
  if (!mapInstance) {
    setStatus('Interactive map unavailable; showing text context only.', 'warn');
    return 0;
  }

  leafletLayerGroup.clearLayers();

  const starbaseMarker = L.marker([STARBASE_CENTER.lat, STARBASE_CENTER.lon]).bindPopup('Starbase Center');
  leafletLayerGroup.addLayer(starbaseMarker);

  const compoundPoints = mapContext.filter((m) => {
    if (m.lat == null || m.lon == null) return false;
    return distanceKm(m.lat, m.lon, STARBASE_CENTER.lat, STARBASE_CENTER.lon) <= 2.0;
  });

  for (const point of compoundPoints) {
    const marker = L.marker([point.lat, point.lon]).bindPopup(`<strong>${point.site}</strong><br/>${point.description}`);
    leafletLayerGroup.addLayer(marker);
  }

  mapInstance.setView([STARBASE_CENTER.lat, STARBASE_CENTER.lon], 15);
  return compoundPoints.length;
}

function renderTelemetryCanvas() {
  const mapEl = document.getElementById('live-map');
  const telemetryEl = document.getElementById('map-canvas');
  mapEl.style.display = 'none';
  telemetryEl.style.display = 'block';
}

function projectPoints(points) {
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  const latRange = Math.max(maxLat - minLat, 0.2);
  const lonRange = Math.max(maxLon - minLon, 0.2);

  return points.map((p) => ({
    ...p,
    x: ((p.lon - minLon) / lonRange) * 100,
    y: 100 - ((p.lat - minLat) / latRange) * 100
  }));
}

function telemetryTimeToSeconds(value) {
  if (!value || !value.startsWith('T+')) return Number.POSITIVE_INFINITY;
  const parts = value.slice(2).split(':').map((p) => Number.parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return Number.POSITIVE_INFINITY;
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return Number.POSITIVE_INFINITY;
}

function renderMap(mapContext, launchTelemetry, mode) {
  const map = document.getElementById('map-context');
  map.innerHTML = mapContext
    .map((m) => {
      const coords = m.lat != null && m.lon != null ? ` (${m.lat.toFixed(3)}, ${m.lon.toFixed(3)})` : '';
      return `<p><strong>📍 ${m.site}</strong>${coords}: ${m.description} · <a href="${m.source}" target="_blank" rel="noreferrer">source</a></p>`;
    })
    .join('');

  const canvas = document.getElementById('map-canvas');
  const legend = document.getElementById('map-legend');

  const telemetryTrack = (launchTelemetry?.track || []).map((p) => ({
    label: p.t || 'Track',
    lat: p.lat,
    lon: p.lon,
    type: 'telemetry',
    altitude_km: p.altitude_km,
    speed_kmh: p.speed_kmh
  }));

  const isTelemetryView = (mode === 'launch_day' || mode === 'post_launch') && telemetryTrack.length > 1;

  if (!isTelemetryView) {
    const visibleCount = renderStarbaseMap(mapContext);
    legend.innerHTML = `
      <p><strong>Context map (non-launch day):</strong> centered on Starbase with zoom controls</p>
      <p>Showing ${visibleCount} in-compound markers (<=2 km from Starbase). External locations are hidden until telemetry mode.</p>
    `;
    return;
  }

  renderTelemetryCanvas();
  const points = telemetryTrack;

  const projected = projectPoints(points);

  const polyline = projected.map((p) => `${p.x},${p.y}`).join(' ');

  canvas.innerHTML = `
    <svg class="map-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
      ${isTelemetryView ? `<polyline points="${polyline}" class="telemetry-line"/>` : ''}
    </svg>
    ${projected
      .map(
        (p) =>
          `<div class="map-point ${p.type === 'telemetry' ? 'telemetry' : ''}" style="left:${p.x}%; top:${p.y}%" title="${p.label} (${p.lat.toFixed(3)}, ${p.lon.toFixed(3)})"></div>
           <div class="map-label" style="left:${p.x}%; top:${p.y}%">${p.label}</div>`
      )
      .join('')}
  `;

  const current = points[points.length - 1];
  const stageSepEvent = (launchTelemetry.events || []).find((e) => /stage\s*separation/i.test(e.label || ''));

  let stageSepBadge = '';
  if (stageSepEvent) {
    const stageSepSeconds = telemetryTimeToSeconds(stageSepEvent.t);
    const nearest = points.reduce(
      (best, p) => {
        const d = Math.abs(telemetryTimeToSeconds(p.label) - stageSepSeconds);
        return d < best.diff ? { point: p, diff: d } : best;
      },
      { point: null, diff: Number.POSITIVE_INFINITY }
    ).point;

    if (nearest) {
      const projectedStage = projectPoints([nearest, ...points])[0];
      canvas.innerHTML += `<div class="event-marker" style="left:${projectedStage.x}%; top:${projectedStage.y}%" title="${stageSepEvent.label}">SEP</div>`;
    }
    stageSepBadge = `<span class="telemetry-badge">${stageSepEvent.t} ${stageSepEvent.label}</span>`;
  }

  legend.innerHTML = `
    <p><strong>Telemetry map (launch-day style):</strong> ${projected.length} track points</p>
    <div class="telemetry-hud">
      <span class="telemetry-badge">Current: ${current.label}</span>
      <span class="telemetry-badge">Altitude: ${current.altitude_km != null ? `${current.altitude_km.toFixed(1)} km` : 'n/a'}</span>
      <span class="telemetry-badge">Speed: ${current.speed_kmh != null ? `${Math.round(current.speed_kmh)} km/h` : 'n/a'}</span>
      ${stageSepBadge}
    </div>
    <ul>
      ${(launchTelemetry.events || []).map((e) => `<li>${e.t}: ${e.label}</li>`).join('')}
    </ul>
  `;

  const currentProjected = projected[projected.length - 1];
  canvas.innerHTML += `<div class="map-pulse" style="left:${currentProjected.x}%; top:${currentProjected.y}%"></div>`;
}

function setupFilters(data, previousSelection = null) {
  const confidenceFilter = document.getElementById('confidence-filter');
  const vehicleFilter = document.getElementById('vehicle-filter');
  const searchInput = document.getElementById('timeline-search');
  const sortSelect = document.getElementById('timeline-sort');

  const selectedConfidence = previousSelection?.confidence ?? confidenceFilter.value;
  const selectedVehicle = previousSelection?.vehicle ?? vehicleFilter.value;
  const selectedSearch = previousSelection?.search ?? searchInput.value;
  const selectedSort = previousSelection?.sort ?? sortSelect.value;

  vehicleFilter.innerHTML = '<option value="all">All</option>';
  const refs = [...new Set(data.timeline.map((t) => t.vehicle_ref).filter(Boolean))];
  for (const ref of refs) {
    const option = document.createElement('option');
    option.value = ref;
    option.textContent = ref;
    vehicleFilter.appendChild(option);
  }

  confidenceFilter.value = ['all', 'confirmed', 'high', 'medium', 'low'].includes(selectedConfidence)
    ? selectedConfidence
    : 'all';
  vehicleFilter.value = refs.includes(selectedVehicle) ? selectedVehicle : 'all';
  searchInput.value = selectedSearch;
  sortSelect.value = ['newest', 'oldest'].includes(selectedSort) ? selectedSort : 'newest';

  confidenceFilter.onchange = () => renderTimeline(data);
  vehicleFilter.onchange = () => renderTimeline(data);
  searchInput.oninput = () => renderTimeline(data);
  sortSelect.onchange = () => renderTimeline(data);

  renderTimeline(data);
}

function renderDashboard(data) {
  document.getElementById('last-updated').textContent = `Last updated: ${formatPacificDate(data.generated_at, true)}`;

  renderHealth(data);
  renderCommandStrip(data);
  renderSourceAudit(data);
  renderFleet(data.vehicles);
  renderMap(data.map_context, data.launch_telemetry, data.mode);
}

loadDashboard().catch((error) => {
  setStatus(`Failed to load dashboard: ${error.message}. Use http://localhost:8080 (not file://).`, 'error');
});
