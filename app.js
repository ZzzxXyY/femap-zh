(() => {
  const { missions, items: ITEMS, types: TYPES, spots } = window.FE_DATA;
  const MAP_SIZE = 3000; // 底图 3000x3000 px
  // 素材查找用的颜色（与任务颜色区分：冷色、带白描边）
  const PICK_PALETTE = ['#ffffff', '#00e5ff', '#c6ff00', '#ff80ab', '#b388ff', '#ffab40', '#69f0ae', '#82b1ff'];
  const PALETTE = [
    '#ff5a5a', '#ffd23f', '#ff8c1a', '#4dd2ff', '#b66dff', '#5dff7a', '#ff6fd0',
    '#3dffd8', '#ffa38a', '#9fb4ff', '#e6ff4d', '#ff4d8d', '#7cffb2', '#ffb84d',
  ];
  missions.forEach((m, i) => { m.color = PALETTE[i % PALETTE.length]; });
  const missionItems = new Set(missions.map(m => m.item));
  const CAT_ORDER = ['蔬菜', '鱼', '矿石', '道具', ''];

  // ---------- 名称（简中优先，找不到官方译名时显示日文原名并标注） ----------
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const itemZh = k => (ITEMS[k] && ITEMS[k].zh) || '';
  const itemJa = k => (ITEMS[k] && ITEMS[k].ja) || '';
  const itemLabel = ja => itemZh(ja) || ja;
  const spotLabel = s => s.zh || s.ja;
  const jaMark = '<span class="ja-mark" title="未找到官方简中译名，暂显示日文原名">日</span>';
  const nameHtml = (zh, ja) => zh ? esc(zh) : `${esc(ja)}${jaMark}`;
  const itemHtml = ja => nameHtml(itemZh(ja), ja);
  const spotHtml = s => nameHtml(s.zh, s.ja);
  const typeLabel = t => TYPES[t] || t;
  const isDungeon = s => s.type === '迷宫';
  const isGather = s => s.items.length > 0;

  // ---------- 本机保存的状态 ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('femap-zh.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('femap-zh.' + k, JSON.stringify(v)); } catch { /* ignore */ } },
  };
  const done = new Set(store.get('done', []));
  let chapter = store.get('chapter', 5);            // 章节号或 'all'
  let selected = new Set();                         // 地图上高亮的任务道具（日文 key）
  let picked = [];                                  // 素材查找中选中的素材（key）

  // ---------- 地图 ----------
  const map = L.map('map', {
    crs: L.CRS.Simple, minZoom: -3, maxZoom: 1.5, zoomSnap: 0.25, zoomDelta: 0.5,
    attributionControl: false, maxBoundsViscosity: 0.8,
  });
  const bounds = [[0, 0], [MAP_SIZE, MAP_SIZE]];
  L.imageOverlay('img/worldmap.webp', bounds).addTo(map);
  map.setMaxBounds([[-300, -300], [MAP_SIZE + 300, MAP_SIZE + 300]]);
  map.fitBounds(bounds);

  const toLatLng = s => [s.pos[0] * MAP_SIZE, s.pos[1] * MAP_SIZE];
  const gatherLayer = L.layerGroup();   // 所有采集点
  const otherLayer = L.layerGroup();    // 其他没有采集物的地点
  const hitLayer = L.layerGroup().addTo(map);
  const markerById = new Map();

  const pickColor = item => PICK_PALETTE[picked.indexOf(item) % PICK_PALETTE.length];
  const colorOf = item => (selected.has(item) && (missions.find(m => m.item === item) || {}).color) || pickColor(item) || (missions.find(m => m.item === item) || {}).color;
  const activeItems = () => [...new Set([...selected, ...picked])];

  function chipHtml(ja, active) {
    const tags = [];
    if (missionItems.has(ja)) tags.push('<span class="chip-tag" title="战备增强任务道具">任</span>');
    const cls = active.has(ja) ? 'chip hit' : 'chip';
    const style = active.has(ja) ? ` style="--c:${colorOf(ja)}"` : '';
    return `<button type="button" class="${cls}"${style} data-item="${esc(ja)}" title="${esc(itemJa(ja))}">${itemHtml(ja)}${tags.join('')}</button>`;
  }

  function popupHtml(spot) {
    const active = new Set(activeItems());
    let body;
    if (spot.items.length) {
      const groups = new Map();
      for (const ja of spot.items) {
        const cat = (ITEMS[ja] && ITEMS[ja].cat) || '';
        if (!groups.has(cat)) groups.set(cat, []);
        groups.get(cat).push(ja);
      }
      const cats = [...groups.keys()].sort((a, b) => CAT_ORDER.indexOf(a) - CAT_ORDER.indexOf(b));
      body = `<div class="pop-count">可采集素材 ${spot.items.length} 种</div>` + cats.map(cat => `
        ${cats.length > 1 || cat ? `<div class="pop-cat">${esc(cat || '其他')}</div>` : ''}
        <div class="pop-items">${groups.get(cat).map(ja => chipHtml(ja, active)).join('')}</div>`).join('');
    } else {
      body = `<div class="pop-note">${spot.note ? esc(spot.note) : '此地点没有采集素材资料'}</div>`;
    }
    if (spot.items.length && spot.note) body = `<div class="pop-note">${esc(spot.note)}</div>` + body;
    const ja = spot.zh && spot.ja ? `<div class="pop-ja">${esc(spot.ja)}</div>` : '';
    return `<div class="pop-name">${spotHtml(spot)}</div>${ja}<div class="pop-type">${esc(typeLabel(spot.type))}</div>${body}`;
  }

  function pinIcon(colors, dungeon) {
    const step = 100 / colors.length;
    const fill = colors.length === 1 ? colors[0]
      : `conic-gradient(${colors.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(',')})`;
    return L.divIcon({
      className: '', iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -10],
      html: `<div class="pin${dungeon ? ' dungeon' : ''}" style="--fill:${fill}"></div>`,
    });
  }

  const popupOpts = { maxWidth: 300, autoPanPadding: [20, 20] };

  function renderMarkers() {
    hitLayer.clearLayers();
    markerById.clear();
    const items = activeItems();
    const showLabels = document.getElementById('opt-labels').checked;
    for (const spot of spots) {
      const hits = items.filter(it => spot.items.includes(it));
      if (!hits.length) continue;
      const mk = L.marker(toLatLng(spot), {
        icon: pinIcon(hits.map(colorOf), isDungeon(spot)),
        riseOnHover: true, zIndexOffset: 1000,
      }).bindPopup(() => popupHtml(spot), popupOpts);
      mk.bindTooltip(esc(spotLabel(spot)), {
        permanent: showLabels, direction: 'right', offset: [12, 0], className: 'spot-label',
      });
      mk.addTo(hitLayer);
      markerById.set(spot.id, mk);
    }
    updateCrowded();
  }

  // 放大前地名太多时隐藏常驻地名
  function updateCrowded() {
    const crowded = markerById.size > 20 && map.getZoom() < -0.75;
    map.getContainer().classList.toggle('crowded', crowded);
  }
  map.on('zoomend', updateCrowded);

  // 全部地点的小圆点：采集点与其他地点分图层
  const dotById = new Map();
  for (const spot of spots) {
    const gather = isGather(spot);
    const cls = gather ? `dot gather${isDungeon(spot) ? ' dungeon' : ''}` : 'dot other';
    const size = gather ? 12 : 9;
    const mk = L.marker(toLatLng(spot), {
      icon: L.divIcon({ className: '', iconSize: [size, size], html: `<div class="${cls}"></div>` }),
    }).bindPopup(() => popupHtml(spot), popupOpts)
      .bindTooltip(esc(spotLabel(spot)), { direction: 'right', offset: [6, 0], className: 'spot-label' })
      .addTo(gather ? gatherLayer : otherLayer);
    dotById.set(spot.id, mk);
  }

  function focusSpot(spot) {
    const mk = markerById.get(spot.id) || dotById.get(spot.id);
    map.flyTo(toLatLng(spot), Math.max(map.getZoom(), 0), { duration: 0.6 });
    map.once('moveend', () => {
      if (!mk || !map.hasLayer(mk)) {
        L.popup(popupOpts).setLatLng(toLatLng(spot)).setContent(popupHtml(spot)).openOn(map);
        return;
      }
      mk.openPopup();
      const el = mk.getElement()?.querySelector('.pin');
      if (el) { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
    });
  }

  function fitToSelection() {
    const pts = [...markerById.values()].map(m => m.getLatLng());
    if (pts.length) map.flyToBounds(L.latLngBounds(pts).pad(0.15), { duration: 0.6, maxZoom: 0 });
  }

  // ---------- 左侧面板 ----------
  const chaptersEl = document.getElementById('chapters');
  const missionsEl = document.getElementById('missions');
  const chapterNums = [...new Set(missions.map(m => m.chapter))];

  function renderChapters() {
    const tabs = [...chapterNums.map(c => ({ key: c, label: `第${c}章` })), { key: 'all', label: '全部' }];
    chaptersEl.innerHTML = tabs.map(t => {
      const allDone = t.key !== 'all' && missions.filter(m => m.chapter === t.key).every(m => done.has(m.item));
      return `<button type="button" data-ch="${t.key}" class="${t.key === chapter ? 'active' : ''}">${t.label}${allDone ? '<span class="done-mark">✓</span>' : ''}</button>`;
    }).join('');
  }

  function spotListHtml(item) {
    const list = spots.filter(s => s.items.includes(item))
      .sort((a, b) => (isDungeon(a) === isDungeon(b) ? 0 : isDungeon(a) ? 1 : -1)
        || spotLabel(a).localeCompare(spotLabel(b), 'zh-CN'));
    return `<ul class="spot-list">${list.map(s => {
      const also = s.items.filter(it => it !== item && missionItems.has(it)).map(itemLabel);
      return `<li><button type="button" data-spot="${s.id}">
        <span class="s-type${isDungeon(s) ? ' dungeon' : ''}">${esc(typeLabel(s.type))}</span>
        <span class="s-name">${spotHtml(s)}</span>
        ${also.length ? `<span class="s-also" title="也可采集：${esc(also.join('、'))}">＋${esc(also.join('・'))}</span>` : ''}
      </button></li>`;
    }).join('')}</ul>`;
  }

  function missionCard(m) {
    const count = spots.filter(s => s.items.includes(m.item)).length;
    const cls = ['mission', selected.has(m.item) ? '' : 'off', done.has(m.item) ? 'done' : ''].join(' ');
    const ja = itemZh(m.item) && itemJa(m.item) ? `<span class="m-ja">${esc(itemJa(m.item))}</span>` : '';
    return `<article class="${cls}" style="--c:${m.color}" data-item="${esc(m.item)}">
      <div class="m-head" data-toggle>
        <span class="m-dot"></span>
        <div class="m-main">
          <div class="m-name">${itemHtml(m.item)}<span class="m-qty">×${m.qty}</span>${ja}</div>
          <div class="m-meta">第${m.chapter}章起 · 名声 +${m.fame} · ${count} 个地点</div>
        </div>
        <button type="button" class="m-done" data-done title="标记为已交付" aria-label="标记为已交付" aria-pressed="${done.has(m.item)}"></button>
      </div>
      ${spotListHtml(m.item)}
    </article>`;
  }

  function visibleMissions() {
    const hideDone = document.getElementById('opt-hide-done').checked;
    return missions.filter(m => (chapter === 'all' || m.chapter === chapter) && !(hideDone && done.has(m.item)));
  }

  function renderMissions() {
    const list = visibleMissions();
    if (!list.length) { missionsEl.innerHTML = '<p class="m-meta">本章任务已全部完成 🎉</p>'; return; }
    let html = '', last = null;
    for (const m of list) {
      if (chapter === 'all' && m.chapter !== last) { html += `<h2 class="chapter-title">第${m.chapter}章起可接取</h2>`; last = m.chapter; }
      html += missionCard(m);
    }
    missionsEl.innerHTML = html;
  }

  const spotCount = k => spots.filter(s => s.items.includes(k)).length;

  function renderSearch() {
    const el = document.getElementById('search-result');
    el.innerHTML = picked.map(k => {
      const ja = itemZh(k) && itemJa(k) ? `<span class="m-ja">${esc(itemJa(k))}</span>` : '';
      const cat = (ITEMS[k] && ITEMS[k].cat) || '其他';
      return `<article class="mission pick" style="--c:${pickColor(k)}" data-pick="${esc(k)}"><div class="m-head"><span class="m-dot"></span><div class="m-main">
          <div class="m-name">${itemHtml(k)}${ja}</div><div class="m-meta">${esc(cat)} · ${spotCount(k)} 个地点</div></div>
          <button type="button" class="m-remove" data-unpick title="取消标记" aria-label="取消标记">✕</button></div>${spotListHtml(k)}</article>`;
    }).join('');
    renderPicker();
  }

  function renderLegend() {
    document.getElementById('legend').innerHTML = `
      <span><i class="lg pin-lg"></i>任务道具采集点</span>
      <span><i class="lg pin-lg dungeon"></i>迷宫</span>
      <span><i class="lg dot-lg"></i>其他采集点</span>
      <span><i class="lg other-lg"></i>其他地点</span>`;
  }

  function renderAll({ fit = false } = {}) {
    renderChapters();
    renderMissions();
    renderSearch();
    renderMarkers();
    if (fit) fitToSelection();
  }

  function selectChapter(ch) {
    chapter = ch;
    store.set('chapter', ch);
    history.replaceState(null, '', `#ch=${ch}`);
    selected = new Set(visibleMissions().filter(m => !done.has(m.item)).map(m => m.item));
    if (!selected.size) selected = new Set(visibleMissions().map(m => m.item));
    renderAll({ fit: true });
  }

  chaptersEl.addEventListener('click', e => {
    const b = e.target.closest('button[data-ch]');
    if (b) selectChapter(b.dataset.ch === 'all' ? 'all' : Number(b.dataset.ch));
  });

  document.querySelector('.panel').addEventListener('click', e => {
    const spotBtn = e.target.closest('[data-spot]');
    if (spotBtn) { focusSpot(spots.find(s => s.id === spotBtn.dataset.spot)); return; }
    const card = e.target.closest('.mission[data-item]');
    if (!card) return;
    const item = card.dataset.item;
    if (e.target.closest('[data-done]')) {
      done.has(item) ? done.delete(item) : done.add(item);
      store.set('done', [...done]);
      renderAll();
    } else if (e.target.closest('[data-toggle]')) {
      selected.has(item) ? selected.delete(item) : selected.add(item);
      renderAll({ fit: selected.has(item) });
    }
  });

  // 点击弹窗里的素材 -> 搜索该素材
  map.getContainer().addEventListener('click', e => {
    const chip = e.target.closest('.leaflet-popup .chip[data-item]');
    if (!chip) return;
    if (!picked.includes(chip.dataset.item)) togglePick(chip.dataset.item);
    map.closePopup();
  });

  // ---------- 素材查找：按种类分组、可搜索的多选下拉 ----------
  const CATS = ['蔬菜', '鱼', '矿石', '道具', ''];
  const allItems = Object.keys(ITEMS).filter(k => spots.some(s => s.items.includes(k)))
    .sort((a, b) => itemLabel(a).localeCompare(itemLabel(b), 'zh-CN'));
  const pickerEl = document.getElementById('picker');
  const pickerBtn = document.getElementById('picker-btn');
  const pickerPop = document.getElementById('picker-pop');
  const pickerInput = document.getElementById('picker-input');
  const pickerList = document.getElementById('picker-list');
  let pickerCat = '';

  function renderPicker() {
    const q = pickerInput.value.trim().toLowerCase();
    const match = k => !q || itemLabel(k).toLowerCase().includes(q) || itemJa(k).toLowerCase().includes(q);
    document.getElementById('picker-tabs').innerHTML = [['', '全部'], ...CATS.filter(Boolean).map(c => [c, c])]
      .map(([c, l]) => `<button type="button" role="tab" data-cat="${c}" aria-selected="${c === pickerCat}">${l}</button>`).join('');
    let html = '';
    for (const cat of CATS) {
      if (pickerCat && cat !== pickerCat) continue;
      const list = allItems.filter(k => ((ITEMS[k] && ITEMS[k].cat) || '') === cat && match(k));
      if (!list.length) continue;
      html += `<div class="pk-group">${esc(cat || '其他')}<span>${list.length}</span></div>` + list.map(k => {
        const on = picked.includes(k);
        const ja = itemZh(k) && itemJa(k) ? `<span class="pk-ja">${esc(itemJa(k))}</span>` : '';
        const task = missionItems.has(k) ? '<span class="chip-tag" title="战备增强任务道具">任</span>' : '';
        return `<button type="button" class="pk-item${on ? ' on' : ''}" role="option" aria-selected="${on}" data-pk="${esc(k)}"${on ? ` style="--c:${pickColor(k)}"` : ''}>
          <span class="pk-check"></span><span class="pk-name">${itemHtml(k)}${task}</span>${ja}<span class="pk-n">${spotCount(k)}</span></button>`;
      }).join('');
    }
    pickerList.innerHTML = html || '<p class="pk-empty">找不到符合的素材</p>';
    pickerBtn.querySelector('.pk-label').textContent = picked.length ? `已选 ${picked.length} 种素材` : '选择素材…';
  }

  function togglePick(k, { fit = true } = {}) {
    const i = picked.indexOf(k);
    i >= 0 ? picked.splice(i, 1) : picked.push(k);
    renderSearch();
    renderMarkers();
    if (fit && picked.includes(k)) fitToSelection();
  }

  function openPicker(open) {
    pickerPop.hidden = !open;
    pickerBtn.setAttribute('aria-expanded', open);
    if (open) { renderPicker(); pickerInput.focus(); }
  }
  pickerBtn.addEventListener('click', () => openPicker(pickerPop.hidden));
  document.getElementById('picker-close').addEventListener('click', () => { openPicker(false); pickerBtn.focus(); });
  pickerInput.addEventListener('input', renderPicker);
  pickerInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') openPicker(false);
    if (e.key === 'Enter') { const first = pickerList.querySelector('[data-pk]'); if (first) togglePick(first.dataset.pk); }
  });
  pickerEl.addEventListener('click', e => {
    const tab = e.target.closest('[data-cat]');
    if (tab) { pickerCat = tab.dataset.cat; renderPicker(); return; }
    const it = e.target.closest('[data-pk]');
    if (it) togglePick(it.dataset.pk);
  });
  document.addEventListener('click', e => { if (!pickerPop.hidden && e.target.isConnected && !pickerEl.contains(e.target)) openPicker(false); });
  document.getElementById('picker-clear').addEventListener('click', () => { picked = []; renderSearch(); renderMarkers(); });
  document.getElementById('search-result').addEventListener('click', e => {
    const card = e.target.closest('[data-pick]');
    if (card && e.target.closest('[data-unpick]')) togglePick(card.dataset.pick);
  });

  // ---------- 选项 ----------
  const toggleLayer = (id, layer) => {
    const el = document.getElementById(id);
    const apply = () => { el.checked ? layer.addTo(map) : layer.remove(); store.set(id, el.checked); };
    el.checked = store.get(id, el.checked);
    el.addEventListener('change', apply);
    apply();
  };
  toggleLayer('opt-gather', gatherLayer);
  toggleLayer('opt-all', otherLayer);
  document.getElementById('opt-labels').addEventListener('change', renderMarkers);
  document.getElementById('opt-hide-done').addEventListener('change', () => renderAll());

  renderLegend();
  const hashCh = (location.hash.match(/ch=(\w+)/) || [])[1];
  if (hashCh) chapter = hashCh === 'all' ? 'all' : Number(hashCh);
  selectChapter(chapter === 'all' || chapterNums.includes(chapter) ? chapter : chapterNums[0]);
})();
