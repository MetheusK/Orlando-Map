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
  const mins = Math.max(5, Math.round(km * 1.6 + 5));
  const minUsd = Math.max(7, Math.round(6 + km * 1.15));
  const maxUsd = Math.max(minUsd + 3, Math.round(9 + km * 1.45));
  return `숙소에서 ~${km.toFixed(1)}km · 차량 ~${mins}분 (우버 편도 ~$${minUsd}~$${maxUsd})`;
}

function getMyStay() {
  return STAYS.find((s) => s.id === myStayId) || STAYS[0];
}

function getStayGoogleMapsUrl(stay) {
  const cleanName = stay.name
    .replace(/[가-힣·/0-9+~]+/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${cleanName} Orlando FL`)}`;
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
        <a class="popup-link-btn" href="${getStayGoogleMapsUrl(s)}" target="_blank" rel="noopener noreferrer">
          📍 구글 지도에서 보기 ↗
        </a>
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

  if (shouldShow('spot') && typeof SPOTS !== 'undefined') {
    SPOTS.forEach((sp) => {
      const iconEmoji = sp.subType.includes('맛집') ? '🍽️' : sp.subType.includes('야경') || sp.subType.includes('로컬') ? '🌃' : '🛍️';
      const shortName = sp.name.split('(')[0].trim();
      const marker = L.marker(sp.coords, {
        icon: makePinIcon(`${iconEmoji} ${shortName}`, 'pin-spot'),
      });
      marker.bindPopup(`
        <strong>${sp.name}</strong><br/>
        <small>${sp.subType} · ${sp.hours}</small>
        <p style="margin:6px 0 0;font-size:12px;">${sp.summary}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#2563eb;">${estimateDriveText(sp.coords)}</p>
        <a class="popup-link-btn" href="${getStayGoogleMapsUrl(sp)}" target="_blank" rel="noopener noreferrer">
          📍 구글 지도에서 보기 ↗
        </a>
      `);
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
  const spotList = document.getElementById('spot-list');
  const airportList = document.getElementById('airport-list');

  parkList.innerHTML = '';
  stayList.innerHTML = '';
  if (spotList) spotList.innerHTML = '';
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
          <span class="distance-text">${s.summary.slice(0, 28)}...</span>
          <div class="card-btn-group">
            <a class="btn-inline btn-inline-link" href="${getStayGoogleMapsUrl(s)}" target="_blank" rel="noopener noreferrer">
              📍 구글 지도 ↗
            </a>
            <button class="btn-inline ${isMine ? 'selected' : ''}">
              ${isMine ? '선택됨' : '내 숙소로 지정'}
            </button>
          </div>
        </div>
      `;
      card.querySelector('a.btn-inline-link').addEventListener('click', (e) => {
        e.stopPropagation();
      });
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

  if (shouldShow('spot') && spotList && typeof SPOTS !== 'undefined') {
    SPOTS.forEach((sp) => {
      const card = document.createElement('div');
      card.className = 'item-card';
      card.innerHTML = `
        <div class="card-top">
          <div>
            <div class="card-title">${sp.name}</div>
            <div class="card-sub">${sp.hours} · ${sp.enName}</div>
          </div>
          <span class="card-tag tag-spot">${sp.subType}</span>
        </div>
        <div class="card-actions">
          <span class="distance-text">${estimateDriveText(sp.coords)}</span>
          <a class="btn-inline btn-inline-link" href="${getStayGoogleMapsUrl(sp)}" target="_blank" rel="noopener noreferrer">
            📍 구글 지도 ↗
          </a>
        </div>
      `;
      card.querySelector('a.btn-inline-link').addEventListener('click', (e) => {
        e.stopPropagation();
      });
      card.addEventListener('click', () => {
        map.flyTo(sp.coords, 15, { duration: 0.7 });
      });
      spotList.appendChild(card);
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

let activeOutfitFilter = 'all';

function renderDisneyboundTabs() {
  const tabsEl = document.getElementById('disneybound-tabs');
  if (!tabsEl || typeof DISNEYBOUND_SETS === 'undefined') return;
  const tabs = [{ id: 'all', label: '전체 보기' }].concat(
    DISNEYBOUND_SETS.map((s) => ({ id: s.id, label: s.shortLabel }))
  );
  tabsEl.innerHTML = tabs
    .map(
      (t) =>
        `<button class="modal-tab ${activeOutfitFilter === t.id ? 'active' : ''}" data-outfit-tab="${t.id}">${t.label}</button>`
    )
    .join('');

  tabsEl.querySelectorAll('.modal-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeOutfitFilter = btn.dataset.outfitTab;
      renderDisneyboundTabs();
      renderDisneyboundModal();
    });
  });
}

function renderDisneyboundModal() {
  const container = document.getElementById('disneybound-list');
  if (!container || typeof DISNEYBOUND_SETS === 'undefined') return;
  container.innerHTML = '';

  const filtered =
    activeOutfitFilter === 'all'
      ? DISNEYBOUND_SETS
      : DISNEYBOUND_SETS.filter((s) => s.id === activeOutfitFilter);

  filtered.forEach((set) => {
    const section = document.createElement('div');
    section.className = 'outfit-set';

    const optionsHtml = set.options
      .map((opt) => {
        const cardsHtml = opt.items
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

        const noteHtml = opt.note
          ? `<div class="outfit-note-card"><strong>${opt.note.title}</strong><p>${opt.note.text}</p></div>`
          : '';

        return `
          <div class="option-label">${opt.label}</div>
          <div class="outfit-grid">${cardsHtml}${noteHtml}</div>
        `;
      })
      .join('');

    section.innerHTML = `
      <div class="outfit-set-header">
        <div class="outfit-set-title">${set.title}</div>
        <span class="outfit-set-park">${set.parkBadge}</span>
      </div>
      <div class="outfit-set-tip">💡 ${set.tip}</div>
      ${optionsHtml}
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
    renderDisneyboundTabs();
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

function renderStayCompareModal() {
  const body = document.getElementById('stay-compare-body');
  const sub = document.getElementById('stay-modal-sub');
  if (!body || typeof STAY_COMPARISON === 'undefined') return;
  if (sub) sub.textContent = STAY_COMPARISON.updatedAt;

  const notesHtml = STAY_COMPARISON.summaryNotes.map((n) => `<li>${n}</li>`).join('');
  const planRows = STAY_COMPARISON.plans
    .map(
      (p) => `
      <tr>
        <td><strong>${p.name}</strong><br><span class="compare-badge">${p.badge}</span></td>
        <td><strong>${p.lowest}</strong></td>
        <td>${p.freeCancel}</td>
        <td>${p.uberEst}</td>
        <td>${p.note}</td>
      </tr>`
    )
    .join('');

  const disneyRows = STAY_COMPARISON.disneyFiveNights
    .map((d) => {
      const cls = d.status === '매진' ? 'soldout' : d.status === '최저가' ? 'best' : '';
      return `
      <tr>
        <td><strong>${d.name}</strong></td>
        <td>${d.price}</td>
        <td><span class="compare-badge ${cls}">${d.status}</span></td>
      </tr>`;
    })
    .join('');

  body.innerHTML = `
    <div class="compare-note-box">
      <strong>📌 핵심 체크사항</strong>
      <ul>${notesHtml}</ul>
    </div>
    <h3 class="compare-section-title">1. 9박(12/4~13) 숙소 조합 종합 비교 (최저가 vs 무료취소)</h3>
    <div class="compare-table-wrap">
      <table class="compare-table">
        <thead>
          <tr>
            <th>숙소 조합</th>
            <th>최저가 조합 (환불불가 포함)</th>
            <th>전 구간 무료취소 조합</th>
            <th>예상 우버</th>
            <th>특징</th>
          </tr>
        </thead>
        <tbody>${planRows}</tbody>
      </table>
    </div>
    <h3 class="compare-section-title">2. 디즈니 공식 리조트 5박(12/8~13) 실시간 순위</h3>
    <div class="compare-table-wrap">
      <table class="compare-table">
        <thead>
          <tr>
            <th>리조트명</th>
            <th>5박 총액 (세금·수수료 포함)</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody>${disneyRows}</tbody>
      </table>
    </div>
  `;
}

(function bindStayCompareModalEvents() {
  const modal = document.getElementById('stay-compare-modal');
  const openBtn = document.getElementById('btn-stay-compare');
  const closeBtn = document.getElementById('btn-close-stay-modal');
  if (!modal || !openBtn || !closeBtn) return;

  openBtn.addEventListener('click', () => {
    renderStayCompareModal();
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
