const els = {
  keywords: document.querySelector('#keywords'),
  keywordCount: document.querySelector('#keywordCount'),
  locationInput: document.querySelector('#locationInput'),
  locationResource: document.querySelector('#locationResource'),
  locationStatus: document.querySelector('#locationStatus'),
  locationSuggestions: document.querySelector('#locationSuggestions'),
  language: document.querySelector('#language'),
  searchButton: document.querySelector('#searchButton'),
  connectionNote: document.querySelector('#connectionNote'),
  resultsSection: document.querySelector('#resultsSection'),
  resultsMeta: document.querySelector('#resultsMeta'),
  resultsStatus: document.querySelector('#resultsStatus'),
  resultsList: document.querySelector('#resultsList'),
  sortResults: document.querySelector('#sortResults'),
  exportCsv: document.querySelector('#exportCsv'),
  openSettings: document.querySelector('#openSettings'),
  settingsDialog: document.querySelector('#settingsDialog'),
  settingsForm: document.querySelector('#settingsForm'),
  backendUrl: document.querySelector('#backendUrl'),
  accessToken: document.querySelector('#accessToken'),
  testConnection: document.querySelector('#testConnection'),
  settingsStatus: document.querySelector('#settingsStatus')
};

const STORAGE_KEY = 'keyword-volume-tool-settings-v1';
const MONTHS = {
  JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6,
  JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12
};

let currentResults = [];
let currentKeywords = [];
let locationTimer = null;
let locationAbort = null;

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { backendUrl: '', accessToken: '' };
  } catch {
    return { backendUrl: '', accessToken: '' };
  }
}

function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function getSettings() {
  const stored = loadSettings();
  return {
    backendUrl: normalizeBaseUrl(stored.backendUrl),
    accessToken: String(stored.accessToken || '').trim()
  };
}

function parseKeywords() {
  const values = els.keywords.value
    .split(/[\n,、]+/)
    .map(v => v.trim())
    .filter(Boolean);
  return [...new Set(values)].slice(0, 100);
}

function updateKeywordCount() {
  const count = parseKeywords().length;
  els.keywordCount.textContent = `${count}件`;
}

function setConnectionNote(message, type = '') {
  els.connectionNote.textContent = message;
  els.connectionNote.className = `connection-note ${type}`.trim();
}

function setSettingsStatus(message, type = '') {
  els.settingsStatus.textContent = message;
  els.settingsStatus.className = `settings-status ${type}`.trim();
}

function setResultsStatus(message, type = '') {
  els.resultsStatus.textContent = message;
  els.resultsStatus.className = `status-block ${type}`.trim();
  els.resultsStatus.hidden = !message;
}

async function apiFetch(path, options = {}) {
  const settings = getSettings();
  if (!settings.backendUrl) {
    throw new Error('APIが未接続です。「接続設定」からAPI URLを設定してください。');
  }

  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (settings.accessToken) headers.set('x-app-token', settings.accessToken);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const response = await fetch(`${settings.backendUrl}${path}`, { ...options, headers });
  let payload = null;
  try { payload = await response.json(); } catch { /* no-op */ }

  if (!response.ok) {
    const message = payload?.error || payload?.message || `APIエラー (${response.status})`;
    throw new Error(message);
  }
  return payload;
}

async function testConnection(showInDialog = false) {
  const settings = getSettings();
  if (!settings.backendUrl) {
    const msg = 'API URLが未設定です。';
    if (showInDialog) setSettingsStatus(msg, 'error');
    else setConnectionNote('API未接続 — 右上の「接続設定」から設定してください。', 'error');
    return false;
  }

  try {
    const result = await apiFetch('/api/health');
    if (result.configured) {
      if (showInDialog) setSettingsStatus('接続できました。Google Ads API設定も有効です。', 'ok');
      else setConnectionNote('Google Ads API 接続済み', 'ok');
      return true;
    }
    const missing = Array.isArray(result.missing) ? result.missing.join(' / ') : '環境変数';
    const msg = `APIには接続済み。Google Ads設定が未完了: ${missing}`;
    if (showInDialog) setSettingsStatus(msg, 'error');
    else setConnectionNote(msg, 'error');
    return false;
  } catch (error) {
    if (showInDialog) setSettingsStatus(error.message, 'error');
    else setConnectionNote(error.message, 'error');
    return false;
  }
}

function closeSuggestions() {
  els.locationSuggestions.hidden = true;
  els.locationSuggestions.replaceChildren();
}

function chooseLocation(item) {
  els.locationInput.value = item.name || item.canonicalName || '';
  els.locationResource.value = item.resourceName || '';
  els.locationStatus.textContent = item.targetType || '';
  closeSuggestions();
}

function renderLocationSuggestions(items) {
  els.locationSuggestions.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'suggestion-item';
    empty.textContent = '候補なし';
    els.locationSuggestions.append(empty);
    els.locationSuggestions.hidden = false;
    return;
  }

  for (const item of items.slice(0, 8)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'suggestion-item';
    button.setAttribute('role', 'option');

    const name = document.createElement('span');
    name.className = 'suggestion-name';
    name.textContent = item.name || item.canonicalName;

    const meta = document.createElement('span');
    meta.className = 'suggestion-meta';
    const parts = [item.canonicalName, item.targetType].filter(Boolean);
    meta.textContent = parts.join(' · ');

    button.append(name, meta);
    button.addEventListener('click', () => chooseLocation(item));
    els.locationSuggestions.append(button);
  }
  els.locationSuggestions.hidden = false;
}

async function searchLocations(query) {
  if (query.length < 2) {
    closeSuggestions();
    return;
  }
  if (!getSettings().backendUrl) {
    els.locationStatus.textContent = 'API未接続';
    return;
  }

  locationAbort?.abort();
  locationAbort = new AbortController();
  els.locationStatus.textContent = '検索中';

  try {
    const data = await apiFetch(`/api/locations?q=${encodeURIComponent(query)}&locale=ja`, {
      signal: locationAbort.signal
    });
    els.locationStatus.textContent = '';
    renderLocationSuggestions(data.locations || []);
  } catch (error) {
    if (error.name === 'AbortError') return;
    els.locationStatus.textContent = '取得失敗';
    closeSuggestions();
  }
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '—';
  return new Intl.NumberFormat('ja-JP').format(number(value));
}

function formatYenMicros(value) {
  if (value === null || value === undefined || value === '') return '—';
  const yen = number(value) / 1_000_000;
  return `¥${new Intl.NumberFormat('ja-JP', { maximumFractionDigits: yen < 100 ? 1 : 0 }).format(yen)}`;
}

function monthNumber(month) {
  if (typeof month === 'number') return month;
  return MONTHS[String(month || '').toUpperCase()] || 0;
}

function sortedMonthlyVolumes(result) {
  return [...(result.monthlySearchVolumes || [])]
    .map(row => ({
      year: number(row.year),
      month: monthNumber(row.month),
      searches: number(row.monthlySearches)
    }))
    .filter(row => row.year && row.month)
    .sort((a, b) => (a.year * 100 + a.month) - (b.year * 100 + b.month));
}

function recentTrend(volumes) {
  if (volumes.length < 6) return null;
  const recent = volumes.slice(-3).reduce((sum, x) => sum + x.searches, 0) / 3;
  const previous = volumes.slice(-6, -3).reduce((sum, x) => sum + x.searches, 0) / 3;
  if (!previous) return recent ? 100 : 0;
  return ((recent - previous) / previous) * 100;
}

function trendText(value) {
  if (value === null || !Number.isFinite(value)) return '推移データ不足';
  const sign = value > 0 ? '+' : '';
  return `直近3か月 ${sign}${Math.round(value)}%`;
}

function competitionLabel(value) {
  const key = String(value || '').toUpperCase();
  if (key === 'HIGH') return { text: '高', cls: 'high' };
  if (key === 'MEDIUM') return { text: '中', cls: 'medium' };
  if (key === 'LOW') return { text: '低', cls: 'low' };
  return { text: '—', cls: '' };
}

function sparklineSvg(volumes) {
  const values = volumes.map(v => v.searches);
  if (values.length < 2) return '<span class="metric-sub">データ不足</span>';
  const width = 160;
  const height = 36;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - 3 - ((v - min) / range) * (height - 6);
    return [x, y];
  });
  const d = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><path class="spark-base" d="M0,${height - 1} L${width},${height - 1}"></path><path d="${d}"></path></svg>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function inputIndexFor(result) {
  const candidates = [result.text, ...(result.closeVariants || [])].map(v => String(v || '').toLowerCase());
  let best = Number.MAX_SAFE_INTEGER;
  currentKeywords.forEach((keyword, index) => {
    if (candidates.includes(keyword.toLowerCase())) best = Math.min(best, index);
  });
  return best;
}

function sortedResults() {
  const data = [...currentResults];
  const sort = els.sortResults.value;
  if (sort === 'volume-desc') return data.sort((a, b) => number(b.avgMonthlySearches) - number(a.avgMonthlySearches));
  if (sort === 'volume-asc') return data.sort((a, b) => number(a.avgMonthlySearches) - number(b.avgMonthlySearches));
  return data.sort((a, b) => inputIndexFor(a) - inputIndexFor(b));
}

function renderResults() {
  const results = sortedResults();
  if (!results.length) {
    els.resultsList.replaceChildren();
    setResultsStatus('検索データがありませんでした。別のキーワードや地域を試してください。');
    return;
  }
  setResultsStatus('');

  const desktop = document.createElement('div');
  desktop.className = 'results-table-wrap desktop-results';
  const table = document.createElement('table');
  table.className = 'results-table';
  table.innerHTML = `
    <thead><tr>
      <th class="keyword-col">キーワード</th>
      <th class="metric-col">月平均</th>
      <th class="metric-col">直近月</th>
      <th class="metric-col">競合</th>
      <th class="trend-col">12か月推移</th>
    </tr></thead>
    <tbody></tbody>`;
  const tbody = table.querySelector('tbody');

  const mobile = document.createElement('div');
  mobile.className = 'mobile-results';

  for (const result of results) {
    const volumes = sortedMonthlyVolumes(result);
    const latest = volumes.at(-1);
    const trend = recentTrend(volumes);
    const competition = competitionLabel(result.competition);
    const variants = (result.closeVariants || []).filter(Boolean);
    const bidText = `${formatYenMicros(result.lowTopOfPageBidMicros)}–${formatYenMicros(result.highTopOfPageBidMicros)}`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="keyword-main">${escapeHtml(result.text)}</div>
        ${variants.length ? `<div class="keyword-variants">類似語: ${escapeHtml(variants.join(' / '))}</div>` : ''}
      </td>
      <td><div class="metric-number">${formatNumber(result.avgMonthlySearches)}</div><div class="metric-sub">検索/月</div></td>
      <td><div class="metric-number">${latest ? formatNumber(latest.searches) : '—'}</div><div class="metric-sub">${latest ? `${latest.year}/${latest.month}` : ''}</div></td>
      <td><div class="competition ${competition.cls}">${competition.text}</div><div class="metric-sub">指数 ${result.competitionIndex ?? '—'}</div></td>
      <td>${sparklineSvg(volumes)}<div class="trend-label">${escapeHtml(trendText(trend))} · 入札目安 ${escapeHtml(bidText)}</div></td>`;
    tbody.append(tr);

    const card = document.createElement('article');
    card.className = 'result-card';
    card.innerHTML = `
      <div class="mobile-keyword">${escapeHtml(result.text)}</div>
      ${variants.length ? `<div class="keyword-variants">類似語: ${escapeHtml(variants.join(' / '))}</div>` : ''}
      <div class="mobile-main-metric">
        <div><span class="mobile-volume">${formatNumber(result.avgMonthlySearches)}</span> <span class="mobile-volume-label">/ 月</span></div>
        <span class="competition ${competition.cls}">競合 ${competition.text}</span>
      </div>
      <div class="mobile-trend">${sparklineSvg(volumes)}<div class="trend-label">${escapeHtml(trendText(trend))}</div></div>
      <div class="mobile-metrics">
        <div><span class="mobile-metric-label">直近月</span><span class="mobile-metric-value">${latest ? `${formatNumber(latest.searches)}（${latest.year}/${latest.month}）` : '—'}</span></div>
        <div><span class="mobile-metric-label">入札目安</span><span class="mobile-metric-value">${escapeHtml(bidText)}</span></div>
      </div>`;
    mobile.append(card);
  }

  desktop.append(table);
  els.resultsList.replaceChildren(desktop, mobile);
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function exportCsv() {
  const rows = [['キーワード', '月平均検索数', '直近月検索数', '直近年月', '競合', '競合指数', '入札下限目安(円)', '入札上限目安(円)', '類似語']];
  for (const result of sortedResults()) {
    const volumes = sortedMonthlyVolumes(result);
    const latest = volumes.at(-1);
    rows.push([
      result.text,
      result.avgMonthlySearches ?? '',
      latest?.searches ?? '',
      latest ? `${latest.year}/${latest.month}` : '',
      competitionLabel(result.competition).text,
      result.competitionIndex ?? '',
      result.lowTopOfPageBidMicros ? number(result.lowTopOfPageBidMicros) / 1_000_000 : '',
      result.highTopOfPageBidMicros ? number(result.highTopOfPageBidMicros) / 1_000_000 : '',
      (result.closeVariants || []).join(' / ')
    ]);
  }
  const csv = '\ufeff' + rows.map(row => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `keyword-volume-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

async function runSearch() {
  const keywords = parseKeywords();
  if (!keywords.length) {
    setConnectionNote('キーワードを入力してください。', 'error');
    els.keywords.focus();
    return;
  }
  if (!els.locationResource.value) {
    setConnectionNote('地域候補から地域を選択してください。', 'error');
    els.locationInput.focus();
    return;
  }

  currentKeywords = keywords;
  els.searchButton.disabled = true;
  els.searchButton.textContent = '検索中…';
  els.resultsSection.hidden = false;
  els.resultsList.replaceChildren();
  setResultsStatus('Google検索データを取得しています…');
  setConnectionNote('');

  try {
    const payload = await apiFetch('/api/search', {
      method: 'POST',
      body: JSON.stringify({
        keywords,
        geoTargetConstants: [els.locationResource.value],
        language: els.language.value || null
      })
    });
    currentResults = payload.results || [];
    els.resultsMeta.textContent = `${els.locationInput.value} · ${els.language.options[els.language.selectedIndex].text} · ${currentResults.length}件`;
    renderResults();
  } catch (error) {
    currentResults = [];
    setResultsStatus(error.message, 'error');
  } finally {
    els.searchButton.disabled = false;
    els.searchButton.textContent = '検索する';
  }
}

els.keywords.addEventListener('input', updateKeywordCount);
els.locationInput.addEventListener('input', () => {
  els.locationResource.value = '';
  els.locationStatus.textContent = '';
  clearTimeout(locationTimer);
  locationTimer = setTimeout(() => searchLocations(els.locationInput.value.trim()), 280);
});
els.locationInput.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeSuggestions();
});
document.addEventListener('click', event => {
  if (!event.target.closest('.location-group')) closeSuggestions();
});
els.searchButton.addEventListener('click', runSearch);
els.sortResults.addEventListener('change', renderResults);
els.exportCsv.addEventListener('click', exportCsv);

els.openSettings.addEventListener('click', () => {
  const settings = getSettings();
  els.backendUrl.value = settings.backendUrl;
  els.accessToken.value = settings.accessToken;
  setSettingsStatus('');
  els.settingsDialog.showModal();
});

els.settingsForm.addEventListener('submit', event => {
  event.preventDefault();
  saveSettings({
    backendUrl: normalizeBaseUrl(els.backendUrl.value),
    accessToken: els.accessToken.value.trim()
  });
  els.settingsDialog.close();
  testConnection(false);
});

els.testConnection.addEventListener('click', async () => {
  saveSettings({
    backendUrl: normalizeBaseUrl(els.backendUrl.value),
    accessToken: els.accessToken.value.trim()
  });
  setSettingsStatus('確認中…');
  await testConnection(true);
});

updateKeywordCount();
testConnection(false);
