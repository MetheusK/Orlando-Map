const ORLANDO_CENTER = [28.408, -81.485];
const ORLANDO_ZOOM = 12;

let map;
let streetLayer;
let satelliteLayer;
let isSatellite = false;

let currentFilter = 'all';
let currentMode = 'overview'; // 'overview' | 'park'
let activeParkId = null;
let myStayId = localStorage.getItem('orlando_my_stay') || 'rosen-lbv';

const overviewLayerGroup = L.layerGroup();
const parkLayerGroup = L.layerGroup();

function haversineKm([lat1, lon1], [lat2, lon2]) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateDriveText(targetCoords) {
  const stay = STAYS.find((s) => s.id === myStayId) || STAYS[0];
  const km = haversineKm(stay.coords, targetCoords);
  const mins = Math.max(5, Math.round(km * 1.9 + 5));
  return `내 숙소에서 약 ${km.toFixed(1)}km · 차량/우버 ~${mins}분`;
}

function getMyStay() {
  return STAYS.find((s) => s.id === myStayId) || STAYS[0];
}

function makePinIcon(label, className) {
  return L.divIcon({
    className: '',
    html: `<div class="custom-pin ${className}">${label}</div>`,
    iconSize: null,
    iconAnchor: [40, 16],
  });
}

function makeRideIcon(num) {
  return L.divIcon({
    className: '',
    html: `<div class="ride-pin">${num}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function initMap() {
  map = L.map('map', { zoomControl: true }).setView(ORLANDO_CENTER, ORLANDO_ZOOM);

  streetLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    {
      attribution: 'Tiles &copy; Esri',
      maxZoom: 19,
    }
  ).addTo(map);

  satelliteLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      attribution: 'Tiles &copy; Esri',
      maxZoom: 19,
    }
  );

  overviewLayerGroup.addTo(map);
  parkLayerGroup.addTo(map);
}

function updateMyStayBanner() {
  const stay = getMyStay();
  document.getElementById('my-stay-name').textContent = stay.name;
  document.getElementById('my-stay-meta').textContent = `${stay.enName} · ${stay.priceNote}`;
}

function renderOverview() {
  currentMode = 'overview';
  activeParkId = null;

  document.getElementById('overview-controls').classList.remove('hidden');
  document.getElementById('park-controls').classList.add('hidden');
  document.getElementById('overview-panel').classList.remove('hidden');
  document.getElementById('park-panel').classList.add('hidden');
  document.getElementById('floating-status-text').textContent =
    '놀이공원 핀이나 카드를 누르면 해당 파크 상세 지도와 추천 코스가 열립니다.';

  updateMyStayBanner();
  renderOverviewMarkers();
  renderOverviewLists();
}

function shouldShow(category) {
  return currentFilter === 'all' || currentFilter === category;
}

function renderOverviewMarkers() {
  overviewLayerGroup.clearLayers();
  parkLayerGroup.clearLayers();

  if (shouldShow('airport')) {
    AIRPORTS.forEach((a) => {
      const marker = L.marker(a.coords, {
        icon: makePinIcon('✈️ MCO 공항', 'pin-airport'),
      });
      marker.bindPopup(`
        <strong>${a.name}</strong><br/>
        <small>${a.enName}</small><br/>
        <p style="margin:6px 0 0;font-size:12px;">${a.summary}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#2563eb;">${estimateDriveText(a.coords)}</p>
      `);
      overviewLayerGroup.addLayer(marker);
    });
  }

  if (shouldShow('stay')) {
    STAYS.forEach((s) => {
      const isMine = s.id === myStayId;
      const pinClass = isMine ? 'pin-my-stay' : 'pin-stay';
      const prefix = isMine ? '⭐ 내 숙소: ' : '🏨 ';
      const shortName = s.name.replace("Disney's ", '').replace("Universal's ", '');
      const marker = L.marker(s.coords, {
        icon: makePinIcon(`${prefix}${shortName}`, pinClass),
      });
      marker.bindPopup(`
        <strong>${s.name}</strong><br/>
        <small>${s.enName} · ${s.priceNote}</small>
        <p style="margin:6px 0 0;font-size:12px;">${s.summary}</p>
        <button class="popup-btn" data-set-stay="${s.id}">
          ${isMine ? '⭐ 현재 내 숙소입니다' : '이곳을 내 숙소로 지정'}
        </button>
      `);
      marker.on('popupopen', (e) => {
        const btn = e.popup.getElement()?.querySelector('[data-set-stay]');
        if (btn) {
          btn.addEventListener('click', () => {
            setMyStay(s.id);
            map.closePopup();
          });
        }
      });
      overviewLayerGroup.addLayer(marker);
    });
  }

  PARKS.forEach((p) => {
    if (!shouldShow(p.category)) return;
    const pinClass = `pin-${p.category}`;
    const iconEmoji = p.category === 'disney' ? '🏰' : p.category === 'universal' ? '⚡' : '🐬';
    const marker = L.marker(p.coords, {
      icon: makePinIcon(`${iconEmoji} ${p.name}`, pinClass),
    });
    marker.bindPopup(`
      <strong>${p.name}</strong><br/>
      <small>${p.hours}</small><br/>
      <p style="margin:4px 0 0;font-size:12px;color:#2563eb;">${estimateDriveText(p.coords)}</p>
      <button class="popup-btn" data-open-park="${p.id}">파크 지도 &amp; 코스 열기 →</button>
    `);
    marker.on('popupopen', (e) => {
      const btn = e.popup.getElement()?.querySelector('[data-open-park]');
      if (btn) {
        btn.addEventListener('click', () => openPark(p.id));
      }
    });
    overviewLayerGroup.addLayer(marker);
  });
}

function renderOverviewLists() {
  const parkList = document.getElementById('park-list');
  const stayList = document.getElementById('stay-list');
  const airportList = document.getElementById('airport-list');

  parkList.innerHTML = '';
  stayList.innerHTML = '';
  airportList.innerHTML = '';

  const tagMap = {
    disney: { label: '디즈니', cls: 'tag-disney' },
    universal: { label: '유니버셜', cls: 'tag-universal' },
    marine: { label: '마린·코브', cls: 'tag-marine' },
  };

  PARKS.forEach((p) => {
    if (!shouldShow(p.category)) return;
    const t = tagMap[p.category];
    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML = `
      <div class="card-top">
        <div>
          <div class="card-title">${p.name}</div>
          <div class="card-sub">${p.hours}</div>
        </div>
        <span class="card-tag ${t.cls}">${t.label}</span>
      </div>
      <div class="card-actions">
        <span class="distance-text">${estimateDriveText(p.coords)}</span>
        <button class="btn-inline">파크 지도 보기 →</button>
      </div>
    `;
    card.addEventListener('click', () => openPark(p.id));
    parkList.appendChild(card);
  });

  if (shouldShow('stay')) {
    STAYS.forEach((s) => {
      const isMine = s.id === myStayId;
      const card = document.createElement('div');
      card.className = `item-card ${isMine ? 'is-my-stay' : ''}`;
      card.innerHTML = `
        <div class="card-top">
          <div>
            <div class="card-title">${isMine ? '⭐ ' : ''}${s.name}</div>
            <div class="card-sub">${s.enName} · ${s.priceNote}</div>
          </div>
          <span class="card-tag tag-stay">숙소</span>
        </div>
        <div class="card-actions">
          <span class="distance-text">${s.summary.slice(0, 34)}...</span>
          <button class="btn-inline ${isMine ? 'selected' : ''}">
            ${isMine ? '선택됨' : '내 숙소로 지정'}
          </button>
        </div>
      `;
      card.querySelector('button').addEventListener('click', (e) => {
        e.stopPropagation();
        setMyStay(s.id);
      });
      card.addEventListener('click', () => {
        map.flyTo(s.coords, 14, { duration: 0.7 });
      });
      stayList.appendChild(card);
    });
  }

  if (shouldShow('airport')) {
    AIRPORTS.forEach((a) => {
      const card = document.createElement('div');
      card.className = 'item-card';
      card.innerHTML = `
        <div class="card-top">
          <div>
            <div class="card-title">${a.name}</div>
            <div class="card-sub">${a.summary}</div>
          </div>
          <span class="card-tag tag-airport">공항</span>
        </div>
        <div class="card-actions">
          <span class="distance-text">${estimateDriveText(a.coords)}</span>
          <span class="distance-text">위치 보기 →</span>
        </div>
      `;
      card.addEventListener('click', () => {
        map.flyTo(a.coords, 13, { duration: 0.7 });
      });
      airportList.appendChild(card);
    });
  }
}

function setMyStay(stayId) {
  myStayId = stayId;
  localStorage.setItem('orlando_my_stay', stayId);
  if (currentMode === 'overview') {
    renderOverview();
  }
}

function openPark(parkId) {
  const park = PARKS.find((p) => p.id === parkId);
  if (!park) return;

  currentMode = 'park';
  activeParkId = parkId;

  document.getElementById('overview-controls').classList.add('hidden');
  document.getElementById('park-controls').classList.remove('hidden');
  document.getElementById('overview-panel').classList.add('hidden');
  document.getElementById('park-panel').classList.remove('hidden');
  document.getElementById('floating-status-text').textContent =
    `${park.name} 상세 지도: 번호(1→${park.rides.length}) 순서대로 코스를 확인해 보세요.`;

  document.getElementById('park-category-tag').textContent = park.category.toUpperCase();
  document.getElementById('park-distance-tag').textContent = estimateDriveText(park.coords);
  document.getElementById('park-title').textContent = park.name;
  document.getElementById('park-subtitle').textContent = park.enName;
  document.getElementById('park-hours').textContent = `⏰ 운영시간: ${park.hours}`;
  document.getElementById('park-course-desc').textContent = park.courseDesc;
  document.getElementById('park-tips').textContent = park.tips;

  overviewLayerGroup.clearLayers();
  parkLayerGroup.clearLayers();

  const routeCoords = park.rides.map((r) => r.coords);
  const polyline = L.polyline(routeCoords, {
    color: '#2563eb',
    weight: 4,
    opacity: 0.85,
    dashArray: '8, 8',
  });
  parkLayerGroup.addLayer(polyline);

  const rideMarkers = {};
  const rideList = document.getElementById('ride-list');
  rideList.innerHTML = '';

  park.rides.forEach((ride) => {
    const marker = L.marker(ride.coords, {
      icon: makeRideIcon(ride.num),
    });
    marker.bindPopup(`
      <strong>${ride.num}. ${ride.name}</strong><br/>
      <small>${ride.enName} · ${ride.land}</small><br/>
      <div style="margin:6px 0;font-size:12px;">
        <span>📏 키 제한: ${ride.height}</span><br/>
        <span>🎟️ 패스: ${ride.pass}</span>
      </div>
      <p style="margin:0;font-size:12px;">${ride.desc}</p>
    `);
    parkLayerGroup.addLayer(marker);
    rideMarkers[ride.num] = marker;

    const card = document.createElement('div');
    card.className = 'ride-card';
    card.innerHTML = `
      <div class="ride-num">${ride.num}</div>
      <div class="ride-body">
        <div class="ride-name">${ride.name}</div>
        <div class="ride-en">${ride.enName} · ${ride.land}</div>
        <div class="ride-meta">
          <span class="ride-badge">📏 ${ride.height}</span>
          <span class="ride-badge">🎟️ ${ride.pass}</span>
        </div>
        <div class="ride-desc">${ride.desc}</div>
      </div>
    `;
    card.addEventListener('click', () => {
      document.querySelectorAll('.ride-card').forEach((el) => el.classList.remove('active'));
      card.classList.add('active');
      map.flyTo(ride.coords, 18, { duration: 0.6 });
      marker.openPopup();
    });
    rideList.appendChild(card);
  });

  map.flyTo(park.coords, park.zoom || 16, { duration: 0.9 });
}

function toggleLayer() {
  isSatellite = !isSatellite;
  if (isSatellite) {
    map.removeLayer(streetLayer);
    satelliteLayer.addTo(map);
  } else {
    map.removeLayer(satelliteLayer);
    streetLayer.addTo(map);
  }
  const label = isSatellite ? '🗺️ 일반 지도' : '🛰️ 위성 지도';
  document.getElementById('btn-layer-toggle').textContent = label;
  document.getElementById('btn-layer-toggle-park').textContent = label;
}

function bindEvents() {
  document.querySelectorAll('.pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pill').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderOverview();
      map.flyTo(ORLANDO_CENTER, ORLANDO_ZOOM, { duration: 0.6 });
    });
  });

  document.getElementById('btn-back-overview').addEventListener('click', () => {
    renderOverview();
    map.flyTo(ORLANDO_CENTER, ORLANDO_ZOOM, { duration: 0.8 });
  });

  document.getElementById('btn-layer-toggle').addEventListener('click', toggleLayer);
  document.getElementById('btn-layer-toggle-park').addEventListener('click', toggleLayer);
}

initMap();
bindEvents();
renderOverview();

function renderDisneyboundModal() {
  const container = document.getElementById('disneybound-list');
  if (!container || typeof DISNEYBOUND_SETS === 'undefined') return;
  container.innerHTML = '';

  DISNEYBOUND_SETS.forEach((set) => {
    const section = document.createElement('div');
    section.className = 'outfit-set';
    const cardsHtml = set.items
      .map(
        (item) => `
      <div class="product-card">
        <div class="product-img-wrap">
          <img src="${item.img}" alt="${item.name}" referrerpolicy="no-referrer" loading="lazy" />
          <span class="product-role">${item.role}</span>
          <span class="product-store">${item.store}</span>
        </div>
        <div class="product-info">
          <div class="product-name">${item.name}</div>
          <div class="product-price">${item.price}</div>
          <a class="product-link" href="${item.url}" target="_blank" rel="noopener noreferrer">상품 보러가기 ↗</a>
        </div>
      </div>`
      )
      .join('');

    section.innerHTML = `
      <div class="outfit-set-header">
        <div class="outfit-set-title">${set.title}</div>
        <span class="outfit-set-park">${set.parkBadge}</span>
      </div>
      <div class="outfit-set-tip">💡 ${set.tip}</div>
      <div class="outfit-grid">${cardsHtml}</div>
    `;
    container.appendChild(section);
  });
}

(function bindModalEvents() {
  const modal = document.getElementById('disneybound-modal');
  const openBtn = document.getElementById('btn-disneybound');
  const closeBtn = document.getElementById('btn-close-modal');
  if (!modal || !openBtn || !closeBtn) return;

  openBtn.addEventListener('click', () => {
    renderDisneyboundModal();
    modal.classList.remove('hidden');
  });
  closeBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
    }
  });
})();
