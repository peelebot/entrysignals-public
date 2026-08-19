// Standalone public feed viewer.
// Reads signals.json (generated externally) and renders Discovered + Signals tabs.
// No external services. No back-references. YouTube links only.

(function () {
  const state = {
    data: null,
    tab: 'discovered',
    window: '24h',
    channelFilter: '',
    tickerFilter: '',
    typeFilter: '',
  };

  const TYPE_ICON = {
    'entry-hard': '🎯',
    'entry-zone': '🎯',
    'sentiment': '🌡️',
    'news': '📰',
    'education': '📚',
  };
  const TYPE_LABEL = {
    'entry-hard': 'ENTRY',
    'entry-zone': 'ZONE',
    'sentiment': 'SENTIMENT',
    'news': 'NEWS',
    'education': 'LESSON',
  };
  const DIR_COLOR = { long: '#2ecc71', short: '#e74c3c', neutral: '#95a5a6' };

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function timeAgo(iso) {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diff = Math.max(0, now - then);
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    const d = Math.floor(h / 24);
    return d + 'd ago';
  }

  function fmtTimestamp(iso) {
    if (!iso) return 'unknown';
    const d = new Date(iso);
    const opts = { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
    return d.toLocaleString(undefined, opts);
  }

  function fmtSeconds(seconds) {
    if (!seconds || seconds < 0) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    return m + ':' + String(s).padStart(2, '0');
  }

  function fmtPrice(low, high) {
    if (low == null && high == null) return null;
    if (low != null && high != null && low !== high) {
      return '$' + Number(low).toLocaleString() + '–' + Number(high).toLocaleString();
    }
    const p = low != null ? low : high;
    return p != null ? '$' + Number(p).toLocaleString() : null;
  }

  function isWithin24h(iso) {
    if (!iso) return false;
    return (Date.now() - new Date(iso).getTime()) < 24 * 3600 * 1000;
  }

  function renderVideoCard(v) {
    const shortBadge = v.is_short ? '<span class="es-short-badge">SHORT</span>' : '';
    const desc = v.description ? '<div class="es-video-desc">' + escapeHtml(v.description) + '</div>' : '';
    return (
      '<div class="es-video-card">' +
        '<div class="es-video-channel">' + escapeHtml(v.channel_name) +
          '<span class="es-age">' + timeAgo(v.published_at) + '</span>' +
          shortBadge +
        '</div>' +
        '<div class="es-video-title">' + escapeHtml(v.title) + '</div>' +
        desc +
        '<div class="es-video-actions">' +
          '<span class="es-tooltip-wrapper">' +
            '<button class="es-analyze-btn disabled" disabled>🎯 Analyze</button>' +
            '<span class="es-tooltip">Not available on public feed</span>' +
          '</span>' +
          '<a class="es-watch-btn" href="' + escapeHtml(v.url) + '" target="_blank" rel="noopener noreferrer">▶ Watch</a>' +
        '</div>' +
      '</div>'
    );
  }

  function renderSignal(sig) {
    const dirColor = DIR_COLOR[sig.direction] || DIR_COLOR.neutral;
    const typeIcon = TYPE_ICON[sig.signal_type] || '•';
    const typeLabel = TYPE_LABEL[sig.signal_type] || (sig.signal_type || '').toUpperCase();
    const price = fmtPrice(sig.price_low, sig.price_high);
    const conf = Math.max(0, Math.min(5, sig.confidence || 0));
    const conf_on = '●'.repeat(conf);
    const conf_off = '<span style="opacity:0.3">' + '●'.repeat(5 - conf) + '</span>';
    const snippet = sig.snippet ? '<div class="es-signal-snippet">"' + escapeHtml(sig.snippet) + '"</div>' : '';
    const priceHtml = price ? '<span class="es-signal-price">' + escapeHtml(price) + '</span>' : '';

    return (
      '<a href="' + escapeHtml(sig.deep_link_url) + '" target="_blank" rel="noopener noreferrer" class="es-signal-card">' +
        '<div class="es-signal-head">' +
          '<span class="es-signal-ticker">' + escapeHtml(sig.ticker) + '</span>' +
          '<span class="es-signal-type">' + typeIcon + ' ' + escapeHtml(typeLabel) + '</span>' +
          '<span class="es-signal-dir" style="color:' + dirColor + ';border-color:' + dirColor + '">' +
            escapeHtml((sig.direction || '').toUpperCase()) +
          '</span>' +
          priceHtml +
          '<span class="es-signal-confidence" title="confidence ' + conf + '/5">' + conf_on + conf_off + '</span>' +
          '<span class="es-signal-time">▶ ' + fmtSeconds(sig.timestamp_seconds) + '</span>' +
        '</div>' +
        snippet +
      '</a>'
    );
  }

  function renderAnalyzedBlock(av) {
    const signalsHtml = (av.signals || []).map(renderSignal).join('');
    const signalCount = (av.signals || []).length;
    const noSignals = signalCount === 0
      ? '<div class="es-empty" style="padding:12px">No signals extracted from this video.</div>'
      : '';
    return (
      '<div class="es-analyzed-block">' +
        '<div class="es-analyzed-head">' +
          '<div class="es-analyzed-channel">' + escapeHtml(av.channel_name) +
            '<span class="es-age">analyzed ' + timeAgo(av.analyzed_at) + '</span>' +
          '</div>' +
          '<a class="es-analyzed-title" href="' + escapeHtml(av.url) + '" target="_blank" rel="noopener noreferrer">' +
            escapeHtml(av.title) +
          '</a>' +
          '<div class="es-analyzed-meta">' + signalCount + ' signal' + (signalCount === 1 ? '' : 's') + '</div>' +
        '</div>' +
        '<div class="es-signals-list">' + signalsHtml + noSignals + '</div>' +
      '</div>'
    );
  }

  function applyDiscoveredFilters(videos) {
    return videos.filter(function (v) {
      if (state.window === '24h' && !isWithin24h(v.published_at)) return false;
      if (state.channelFilter && v.channel_id !== state.channelFilter) return false;
      return true;
    });
  }

  function applySignalsFilters(analyzed) {
    return analyzed.map(function (av) {
      if (state.channelFilter && av.channel_id !== state.channelFilter) return null;
      let sigs = av.signals || [];
      if (state.tickerFilter) sigs = sigs.filter(s => (s.ticker || '').toUpperCase() === state.tickerFilter);
      if (state.typeFilter) sigs = sigs.filter(s => s.signal_type === state.typeFilter);
      if ((state.tickerFilter || state.typeFilter) && sigs.length === 0) return null;
      return Object.assign({}, av, { signals: sigs });
    }).filter(Boolean);
  }

  function render() {
    if (!state.data) return;
    const videos = state.data.discovered || [];
    const analyzed = state.data.analyzed || [];

    // Discovered filtered by window + channel
    const filteredDiscovered = applyDiscoveredFilters(videos);
    const filteredAnalyzed = applySignalsFilters(analyzed);

    // Tab counts (respect current filters minus window toggle)
    document.getElementById('tab-discovered').textContent =
      '🆕 Discovered (' + filteredDiscovered.length + ')';
    document.getElementById('tab-signals').textContent =
      '🎯 Signals (' + filteredAnalyzed.length + ')';

    // Window toggle counts
    const totalIn24h = videos.filter(v => isWithin24h(v.published_at) &&
      (!state.channelFilter || v.channel_id === state.channelFilter)).length;
    const totalIn7d = videos.filter(v =>
      (!state.channelFilter || v.channel_id === state.channelFilter)).length;
    document.getElementById('btn-24h').textContent = 'Last 24h (' + totalIn24h + ')';
    document.getElementById('btn-7d').textContent = 'Last 7d (' + totalIn7d + ')';

    if (state.tab === 'discovered') {
      document.getElementById('controls-discovered').style.display = '';
      document.getElementById('controls-signals').style.display = 'none';
      document.getElementById('content-discovered').style.display = '';
      document.getElementById('content-signals').style.display = 'none';
      const html = filteredDiscovered.map(renderVideoCard).join('');
      document.getElementById('content-discovered').innerHTML =
        html || '<div class="es-empty">No videos in this window.</div>';
    } else {
      document.getElementById('controls-discovered').style.display = 'none';
      document.getElementById('controls-signals').style.display = '';
      document.getElementById('content-discovered').style.display = 'none';
      document.getElementById('content-signals').style.display = '';
      const html = filteredAnalyzed.map(renderAnalyzedBlock).join('');
      document.getElementById('content-signals').innerHTML =
        html || '<div class="es-empty">No signals yet.</div>';
    }
  }

  function populateFilters() {
    const channels = state.data.channels || [];
    const opts = ['<option value="">All channels</option>'].concat(
      channels.map(c => '<option value="' + escapeHtml(c.channel_id) + '">' +
        escapeHtml(c.name) + '</option>')
    ).join('');
    document.getElementById('channel-filter').innerHTML = opts;
    document.getElementById('channel-filter-signals').innerHTML = opts;

    // Build ticker list from analyzed signals
    const tickerSet = new Set();
    (state.data.analyzed || []).forEach(av => {
      (av.signals || []).forEach(s => { if (s.ticker) tickerSet.add(s.ticker.toUpperCase()); });
    });
    const tickers = Array.from(tickerSet).sort();
    document.getElementById('ticker-filter').innerHTML =
      '<option value="">All tickers</option>' +
      tickers.map(t => '<option value="' + escapeHtml(t) + '">' + escapeHtml(t) + '</option>').join('');
  }

  function bindEvents() {
    document.querySelectorAll('.es-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        state.tab = btn.dataset.tab;
        document.querySelectorAll('.es-tab').forEach(b => b.classList.toggle('active', b === btn));
        render();
      });
    });

    document.getElementById('btn-24h').addEventListener('click', () => {
      state.window = '24h';
      document.getElementById('btn-24h').classList.add('active');
      document.getElementById('btn-7d').classList.remove('active');
      render();
    });
    document.getElementById('btn-7d').addEventListener('click', () => {
      state.window = '7d';
      document.getElementById('btn-7d').classList.add('active');
      document.getElementById('btn-24h').classList.remove('active');
      render();
    });

    document.getElementById('channel-filter').addEventListener('change', (e) => {
      state.channelFilter = e.target.value;
      document.getElementById('channel-filter-signals').value = e.target.value;
      render();
    });
    document.getElementById('channel-filter-signals').addEventListener('change', (e) => {
      state.channelFilter = e.target.value;
      document.getElementById('channel-filter').value = e.target.value;
      render();
    });
    document.getElementById('ticker-filter').addEventListener('change', (e) => {
      state.tickerFilter = e.target.value;
      render();
    });
    document.getElementById('type-filter').addEventListener('change', (e) => {
      state.typeFilter = e.target.value;
      render();
    });
  }

  async function load() {
    try {
      // Cache-bust so friends see fresh publishes without hard-refresh
      const res = await fetch('signals.json?t=' + Date.now());
      if (!res.ok) throw new Error('HTTP ' + res.status);
      state.data = await res.json();
      document.getElementById('last-updated').textContent =
        'Last updated: ' + fmtTimestamp(state.data.published_at);
      populateFilters();
      bindEvents();
      render();
    } catch (e) {
      document.getElementById('last-updated').textContent = 'Failed to load feed';
      document.getElementById('content-discovered').innerHTML =
        '<div class="es-empty">Feed unavailable. Try again later.</div>';
    }
  }

  load();
})();
