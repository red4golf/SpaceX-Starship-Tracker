async function loadDashboard() {
  const response = await fetch('data/dashboard.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Unable to load dashboard data');
  }

  const data = await response.json();
  renderDashboard(data);
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

function renderDashboard(data) {
  document.getElementById('last-updated').textContent = `Last updated: ${formatPacificDate(
    data.generated_at,
    true
  )}`;

  const container = document.getElementById('fleet-overview');
  const template = document.getElementById('vehicle-card-template');
  container.innerHTML = '';

  for (const vehicle of data.vehicles) {
    const clone = template.content.cloneNode(true);
    clone.querySelector('.name').textContent = `${vehicle.booster} + ${vehicle.ship}`;
    clone.querySelector('.status').textContent = vehicle.status;
    clone.querySelector('.next-milestone').textContent = vehicle.next_milestone.name;
    clone.querySelector('.confidence').textContent = vehicle.next_milestone.confidence;
    clone.querySelector('.countdown').textContent = vehicle.countdown ?? 'TBD';
    container.appendChild(clone);
  }

  const timeline = document.getElementById('mission-timeline');
  timeline.innerHTML = '';
  for (const event of data.timeline) {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${event.mission}</strong> — ${event.milestone} (${event.confidence}) @ ${formatPacificDate(
      event.time
    )}`;
    timeline.appendChild(li);
  }

  const map = document.getElementById('map-context');
  map.innerHTML = data.map_context
    .map(
      (m) =>
        `<p><strong>${m.site}</strong>: ${m.description} · <a href="${m.source}" target="_blank" rel="noreferrer">source</a></p>`
    )
    .join('');
}

loadDashboard().catch((error) => {
  document.body.insertAdjacentHTML('beforeend', `<p>Failed to load dashboard: ${error.message}</p>`);
});
