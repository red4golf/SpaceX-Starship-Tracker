let dashboardState = null;
const REFRESH_INTERVAL_MS = 60_000;

async function fetchDashboardData() {
  const response = await fetch(`data/dashboard.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Unable to load dashboard data');
  }
  return response.json();
}

async function loadDashboard() {
  dashboardState = await fetchDashboardData();
  renderDashboard(dashboardState);
  setupFilters(dashboardState);
  startAutoRefresh();
}

function startAutoRefresh() {
  setInterval(async () => {
    try {
      const next = await fetchDashboardData();
      if (next.generated_at !== dashboardState.generated_at) {
        const prevConfidence = document.getElementById('confidence-filter').value;
        const prevVehicle = document.getElementById('vehicle-filter').value;

        dashboardState = next;
        renderDashboard(dashboardState);
        setupFilters(dashboardState, { confidence: prevConfidence, vehicle: prevVehicle });
      }
    } catch (_error) {
      // Keep current UI; next interval can recover automatically.
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

  const filtered = data.timeline.filter((event) => {
    const confidenceMatch = confidenceFilter === 'all' || event.confidence === confidenceFilter;
    const vehicleMatch = vehicleFilter === 'all' || event.vehicle_ref === vehicleFilter;
    return confidenceMatch && vehicleMatch;
  });

  const groups = groupedTimeline(filtered);
  const timeline = document.getElementById('mission-timeline');
  timeline.innerHTML = '';

  for (const [day, events] of groups.entries()) {
    const section = document.createElement('section');
    section.className = 'timeline-day';

    const heading = document.createElement('h3');
    heading.textContent = day;
    section.appendChild(heading);

    const list = document.createElement('ol');
    for (const event of events) {
      const li = document.createElement('li');
      const newBadge =
        Date.now() - new Date(event.collected_at || event.time).getTime() < 86_400_000
          ? ' <span class="badge ok">NEW</span>'
          : '';
      li.innerHTML = `<strong>${event.mission}</strong> · ${event.vehicle_ref ?? 'n/a'} — ${event.milestone} (${event.confidence}) @ ${formatPacificDate(
        event.time
      )}${newBadge}<br/><small>Source: <a href="${event.source}" target="_blank" rel="noreferrer">link</a>${
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
}

function renderMap(mapContext) {
  const map = document.getElementById('map-context');
  map.innerHTML = mapContext
    .map((m) => {
      const coords = m.lat != null && m.lon != null ? ` (${m.lat.toFixed(3)}, ${m.lon.toFixed(3)})` : '';
      return `<p><strong>📍 ${m.site}</strong>${coords}: ${m.description} · <a href="${m.source}" target="_blank" rel="noreferrer">source</a></p>`;
    })
    .join('');

  const canvas = document.getElementById('map-canvas');
  const legend = document.getElementById('map-legend');
  const points = mapContext.filter((m) => m.lat != null && m.lon != null);
  if (!points.length) {
    canvas.innerHTML = '<p>No coordinate data available for map preview.</p>';
    legend.innerHTML = '';
    return;
  }

  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  const latRange = Math.max(maxLat - minLat, 0.2);
  const lonRange = Math.max(maxLon - minLon, 0.2);

  const positioned = points.map((p) => {
    const left = ((p.lon - minLon) / lonRange) * 100;
    const top = 100 - ((p.lat - minLat) / latRange) * 100;
    return { ...p, left, top };
  });

  const lines = positioned
    .slice(1)
    .map(
      (p, idx) =>
        `<line x1="${positioned[idx].left}%" y1="${positioned[idx].top}%" x2="${p.left}%" y2="${p.top}%" stroke="rgba(56,189,248,0.5)" stroke-width="2"/>`
    )
    .join('');

  canvas.innerHTML = `
    <svg class="map-lines" viewBox="0 0 100 100" preserveAspectRatio="none">${lines}</svg>
    ${positioned
      .map(
        (p) =>
          `<div class="map-point" style="left:${p.left}%; top:${p.top}%" title="${p.site} (${p.lat.toFixed(3)}, ${p.lon.toFixed(3)})"></div>
           <div class="map-label" style="left:${p.left}%; top:${p.top}%">${p.site}</div>`
      )
      .join('')}
  `;

  legend.innerHTML = `
    <p><strong>Map preview:</strong> ${positioned.length} coordinate points</p>
    <ul>
      ${positioned
        .map((p) => `<li>${p.site}: ${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}</li>`)
        .join('')}
    </ul>
  `;
}

function setupFilters(data, previousSelection = null) {
  const confidenceFilter = document.getElementById('confidence-filter');
  const vehicleFilter = document.getElementById('vehicle-filter');

  const selectedConfidence = previousSelection?.confidence ?? confidenceFilter.value;
  const selectedVehicle = previousSelection?.vehicle ?? vehicleFilter.value;

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

  confidenceFilter.onchange = () => renderTimeline(data);
  vehicleFilter.onchange = () => renderTimeline(data);

  renderTimeline(data);
}

function renderDashboard(data) {
  document.getElementById('last-updated').textContent = `Last updated: ${formatPacificDate(
    data.generated_at,
    true
  )}`;

  renderHealth(data);
  renderFleet(data.vehicles);
  renderMap(data.map_context);
}

loadDashboard().catch((error) => {
  document.body.insertAdjacentHTML(
    'beforeend',
    `<p>Failed to load dashboard: ${error.message}. If running locally, use a local server (http://localhost:8080), not file://.</p>`
  );
});
