/* Profit & Charity Tracker — vanilla JS (no framework, localStorage only) */
'use strict';

/* ---------- storage ---------- */
const K = {
  profile: 'pct_profile', sources: 'pct_sources', locations: 'pct_locations',
  entries: 'pct_entries', transfers: 'pct_transfers',
  donations: 'pct_donations', withdrawals: 'pct_withdrawals'
};
function read(key, fb) {
  try {
    const r = localStorage.getItem(key);
    if (r == null || r === '') return fb;
    const v = JSON.parse(r);
    return (v === null || v === undefined) ? fb : v;
  } catch { return fb; }
}
function write(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { console.warn('Save failed (storage unavailable/full):', e); } }
function defaultProfile() { return { id: 'local', email: '', display_name: '', currency: 'INR', locale: 'en-IN', charity_percent: 10 }; }
function asArray(v) { return Array.isArray(v) ? v : []; }
function sanitizeProfile(p) {
  const d = defaultProfile();
  if (!p || typeof p !== 'object') return d;
  const pct = Number(p.charity_percent);
  return {
    id: 'local', email: String(p.email || ''),
    display_name: String(p.display_name || ''),
    currency: /^[A-Z]{3}$/.test(String(p.currency || '')) ? p.currency : 'INR',
    locale: String(p.locale || 'en-IN'),
    charity_percent: (Number.isFinite(pct) && pct >= 0 && pct <= 100) ? pct : 10
  };
}
function sanitizeRow(r, kind) {
  if (!r || typeof r !== 'object') return null;
  const amt = Number(r.amount);
  const out = { ...r, id: String(r.id || uid()), user_id: 'local' };
  if (kind === 'money') {
    if (!Number.isFinite(amt)) return null;
    out.amount = Math.round(amt * 100) / 100;
    out.date = typeof r.date === 'string' ? r.date : '';
    return out;
  }
  return out;
}
function loadStore() {
  const raw = {
    profile: sanitizeProfile(read(K.profile, defaultProfile())),
    sources: asArray(read(K.sources, [])).filter(x => x && typeof x.id !== 'undefined'),
    locations: asArray(read(K.locations, [])).filter(x => x && typeof x.id !== 'undefined'),
    entries: asArray(read(K.entries, [])).map(r => sanitizeRow(r, 'money')).filter(Boolean),
    transfers: asArray(read(K.transfers, [])).map(r => sanitizeRow(r, 'money')).filter(Boolean),
    donations: asArray(read(K.donations, [])).map(r => sanitizeRow(r, 'money')).filter(Boolean),
    withdrawals: asArray(read(K.withdrawals, [])).map(r => sanitizeRow(r, 'money')).filter(Boolean)
  };
  return raw;
}
function uid() { try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch {} return 'id-' + Date.now() + '-' + Math.floor(Math.random() * 1e9); }

/* ---------- money ---------- */
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function formatMoney(amount, currency = 'INR', locale = 'en-IN') {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  } catch { return currency + ' ' + n.toFixed(2); }
}
function todayLocal() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function todayISO() { return todayLocal(); }
function isFutureDate(iso) { if (!iso) return false; return String(iso) > todayLocal(); }
function safeDate(r) { return (r && typeof r.date === 'string') ? r.date : ''; }
function monthKeyOf(dateStr) { return String(dateStr || '').slice(0, 7); }
function parseAmount(v) {
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  let s = String(v ?? '').trim();
  if (!s) return NaN;
  // strip common currency codes/symbols, spaces, commas
  s = s.replace(/(INR|USD|EUR|GBP|AED|SAR|Rs\.?|₹|$|€|£)/gi, '').replace(/[\s,]/g, '');
  if (/[eExX]/.test(s)) return NaN; // reject 1e6 / hex typos
  if (!/^-?(\d+)(\.\d+)?$/.test(s)) return NaN;
  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100) / 100;
}
function validateAmount(v) {
  const n = parseAmount(v);
  if (!Number.isFinite(n)) return 'Enter a valid amount';
  if (n <= 0) return 'Amount must be greater than 0';
  if (n > 999999999999) return 'Amount too large';
  return null;
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- calc ---------- */
function netProfit(es) { return asArray(es).reduce((s, e) => s + (e.type === 'profit' ? num(e.amount) : -num(e.amount)), 0); }
function charityDue(net, pct) { net = num(net); if (!(net > 0)) return 0; const p = num(pct); return Math.round(((net * p) / 100) * 100) / 100; }
function donatedTotal(ds) { return asArray(ds).reduce((s, d) => s + num(d.amount), 0); }
function withdrawnTotal(ws) { return asArray(ws).reduce((s, w) => s + num(w.amount), 0); }
function locationBalance(loc, entries, transfers, withdrawals) {
  if (!loc || typeof loc.id === 'undefined') return 0;
  entries = asArray(entries); transfers = asArray(transfers); withdrawals = asArray(withdrawals);
  let bal = num(loc.opening_balance);
  for (const e of entries) { if (!e || e.location_id !== loc.id) continue; bal += e.type === 'profit' ? num(e.amount) : -num(e.amount); }
  for (const t of transfers) { if (!t) continue; if (t.from_location_id === loc.id) bal -= num(t.amount); if (t.to_location_id === loc.id) bal += num(t.amount); }
  for (const w of withdrawals) { if (!w || w.location_id !== loc.id) continue; bal -= num(w.amount); }
  return Math.round(bal * 100) / 100;
}
/* Money sitting in deleted / missing locations — must not vanish from totals */
function unassignedBalance(entries, withdrawals, locations) {
  const ids = new Set(asArray(locations).map(l => l.id));
  let bal = 0, count = 0;
  for (const e of asArray(entries)) {
    if (!e) continue;
    if (e.location_id == null || !ids.has(e.location_id)) { bal += e.type === 'profit' ? num(e.amount) : -num(e.amount); count++; }
  }
  for (const w of asArray(withdrawals)) {
    if (!w) continue;
    if (w.location_id == null || !ids.has(w.location_id)) { bal -= num(w.amount); count++; }
  }
  return { balance: Math.round(bal * 100) / 100, count };
}
function filterByDateRange(rows, from, to) { return asArray(rows).filter(r => { const d = safeDate(r); if (from && d < from) return false; if (to && d > to) return false; return true; }); }
function periodRange(period, cf, ct) {
  const now = new Date(); const y = now.getFullYear(); const m = String(now.getMonth() + 1).padStart(2, '0');
  const today = todayLocal();
  if (period === 'this_month') return { from: y + '-' + m + '-01', to: today };
  if (period === 'last_month') { const d = new Date(y, now.getMonth() - 1, 1); const ly = d.getFullYear(); const lm = String(d.getMonth() + 1).padStart(2, '0'); const last = new Date(ly, d.getMonth() + 1, 0).getDate(); return { from: ly + '-' + lm + '-01', to: ly + '-' + lm + '-' + String(last).padStart(2, '0') }; }
  if (period === 'this_year') return { from: y + '-01-01', to: y + '-12-31' };
  if (period === 'custom') return { from: cf, to: ct };
  return {};
}
function toCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const q = v => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [headers.join(','), ...rows.map(r => headers.map(h => q(r[h])).join(','))].join('\n');
}
function downloadCSV(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function downloadJSON(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function buildBackup() {
  S = loadStore();
  return {
    app: 'profit-charity-tracker',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      profile: sanitizeProfile(S.profile),
      sources: asArray(S.sources),
      locations: asArray(S.locations),
      entries: asArray(S.entries),
      transfers: asArray(S.transfers),
      donations: asArray(S.donations),
      withdrawals: asArray(S.withdrawals)
    }
  };
}
function validateBackup(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const d = (parsed.data && typeof parsed.data === 'object') ? parsed.data : parsed;
  if (!d || typeof d !== 'object') return null;
  const out = {
    profile: sanitizeProfile(d.profile),
    sources: asArray(d.sources).filter(x => x && typeof x.id !== 'undefined'),
    locations: asArray(d.locations).filter(x => x && typeof x.id !== 'undefined'),
    entries: asArray(d.entries).map(r => sanitizeRow(r, 'money')).filter(Boolean),
    transfers: asArray(d.transfers).map(r => sanitizeRow(r, 'money')).filter(Boolean),
    donations: asArray(d.donations).map(r => sanitizeRow(r, 'money')).filter(Boolean),
    withdrawals: asArray(d.withdrawals).map(r => sanitizeRow(r, 'money')).filter(Boolean)
  };
  return out;
}

/* ---------- state ---------- */
let S = loadStore();
function saveAll() {
  if (!S || !S.profile) S = loadStore();
  S.profile = sanitizeProfile(S.profile);
  S.sources = asArray(S.sources); S.locations = asArray(S.locations);
  S.entries = asArray(S.entries); S.transfers = asArray(S.transfers);
  S.donations = asArray(S.donations); S.withdrawals = asArray(S.withdrawals);
  write(K.profile, S.profile); write(K.sources, S.sources); write(K.locations, S.locations);
  write(K.entries, S.entries); write(K.donations, S.donations);
  write(K.withdrawals, S.withdrawals); write(K.transfers, S.transfers);
}
function sorted(arr) {
  return asArray(arr).sort((a, b) => {
    const da = safeDate(a), db = safeDate(b);
    if (da === db) return 0;
    return da < db ? 1 : -1;
  });
}
/* Accessible + non-blocking confirm modal (replaces native confirm/prompt) */
function showConfirm(opts) {
  const { title, message, confirmLabel, danger } = opts || {};
  return new Promise(resolve => {
    let ov = document.getElementById('modal-ov');
    if (ov) ov.remove();
    ov = document.createElement('div');
    ov.id = 'modal-ov';
    ov.setAttribute('role', 'presentation');
    ov.innerHTML = '<div class="modal-backdrop"></div>' +
      '<div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="modal-t" aria-describedby="modal-d">' +
      '<h2 id="modal-t">' + esc(title || 'Are you sure?') + '</h2>' +
      '<p id="modal-d" class="modal-msg">' + esc(message || '') + '</p>' +
      '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-m="cancel">Cancel</button>' +
      '<button type="button" class="btn ' + (danger === false ? 'btn-primary' : 'btn-danger') + '" data-m="ok">' + esc(confirmLabel || 'Confirm') + '</button></div></div>';
    document.body.appendChild(ov);
    const prevFocus = document.activeElement;
    const okBtn = ov.querySelector('[data-m="ok"]');
    const cancelBtn = ov.querySelector('[data-m="cancel"]');
    const done = val => { ov.remove(); document.removeEventListener('keydown', onKey, true); if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch {} } resolve(val); };
    const onKey = e => {
      if (e.key === 'Escape') { e.stopPropagation(); done(false); }
      if (e.key === 'Tab') {
        const f = [cancelBtn, okBtn];
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    ov.querySelector('.modal-backdrop').onclick = () => done(false);
    cancelBtn.onclick = () => done(false);
    okBtn.onclick = () => done(true);
    setTimeout(() => { (danger === false ? okBtn : cancelBtn).focus(); }, 30);
  });
}
/* Polite toast + live region for success feedback */
function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2600);
}
function debounce(fn, ms) {
  let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms || 180); };
}
function reducedMotion() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } }
function smoothTop() { try { window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' }); } catch { window.scrollTo(0, 0); } }
function focusHeading() {
  const h = document.querySelector('#main h1, #main h2');
  if (h) { if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1'); try { h.focus({ preventScroll: true }); } catch { try { h.focus(); } catch {} } }
}

let ui = {
  dashPeriod: 'this_month', dashFrom: '', dashTo: '',
  eSearch: '', eMonth: '', eSource: '', eLoc: '', eType: '', editingEntry: null,
  wMonth: '', repYear: String(new Date().getFullYear()),
  editingLoc: null, renamingSource: null, moneyTab: 'locations',
  eDraft: null, wDraft: null, dDraft: null,
  lastFocus: null, toastMsg: null
};
function resetUIState() {
  ui.editingEntry = null; ui.editingLoc = null; ui.renamingSource = null; ui.moneyTab = 'locations';
  ui.eDraft = null; ui.wDraft = null; ui.dDraft = null;
  ui.eSearch = ''; ui.eMonth = ''; ui.eSource = ''; ui.eLoc = ''; ui.eType = ''; ui.wMonth = '';
  ui.repYear = String(new Date().getFullYear());
}
function captureDrafts() {
  try {
    if (document.getElementById('eForm')) {
      let t = 'profit';
      try { t = (typeof entryType !== 'undefined' && entryType) ? entryType : (ui.eDraft && ui.eDraft.type) || 'profit'; }
      catch { t = (ui.eDraft && ui.eDraft.type) || 'profit'; }
      ui.eDraft = {
        date: document.getElementById('e-date').value, amount: document.getElementById('e-amt').value,
        type: t,
        sourceId: document.getElementById('e-src').value, locationId: document.getElementById('e-loc').value,
        note: document.getElementById('e-note').value
      };
    }
    if (document.getElementById('wForm')) {
      ui.wDraft = {
        date: document.getElementById('w-date').value, amount: document.getElementById('w-amt').value,
        locationId: document.getElementById('w-loc').value, note: document.getElementById('w-note').value
      };
    }
    if (document.getElementById('dForm')) {
      ui.dDraft = {
        date: document.getElementById('d-date').value, amount: document.getElementById('d-amt').value,
        recipient: document.getElementById('d-rec').value, note: document.getElementById('d-note').value
      };
    }
  } catch {}
}

/* ---------- theme ---------- */
function initTheme() {
  try {
    const t = localStorage.getItem('pct-theme');
    if (t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches)) document.documentElement.classList.add('dark');
  } catch {}
}
function toggleTheme() {
  const dark = !document.documentElement.classList.contains('dark');
  document.documentElement.classList.toggle('dark', dark);
  try { localStorage.setItem('pct-theme', dark ? 'dark' : 'light'); } catch {}
  syncThemeBtns();
}
function themeLabel() { return document.documentElement.classList.contains('dark') ? '☾ Dark · tap for Light' : '☀ Light · tap for Dark'; }
function syncThemeBtns() {
  const dark = document.documentElement.classList.contains('dark');
  document.querySelectorAll('[data-theme-btn]').forEach(b => {
    b.textContent = themeLabel();
    b.removeAttribute('aria-pressed');
    b.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  });
}

/* ---------- nav ---------- */
const LINKS = [
  { h: '#/', l: 'Home', i: '◈' }, { h: '#/entries', l: 'Entries', i: '＋' },
  { h: '#/locations', l: 'Money', i: '◍' }, { h: '#/withdrawals', l: 'Withdraw', i: '⤓' },
  { h: '#/charity', l: 'Charity', i: '♥' }, { h: '#/reports', l: 'Reports', i: '▤' },
  { h: '#/sources', l: 'Sources', i: '⬣' }, { h: '#/settings', l: 'Settings', i: '⚙' }
];
const MOBILE = LINKS.slice(0, 6);
const TITLES = {
  '#/': 'Dashboard · Profit & Charity Tracker', '#/entries': 'Entries · Profit & Charity Tracker',
  '#/locations': 'Money & Sources · Profit & Charity Tracker', '#/withdrawals': 'Withdrawals · Profit & Charity Tracker',
  '#/charity': 'Charity ledger · Profit & Charity Tracker', '#/reports': 'Reports · Profit & Charity Tracker',
  '#/sources': 'Money & Sources · Profit & Charity Tracker', '#/settings': 'Settings · Profit & Charity Tracker'
};
function route() {
  const h = location.hash || '#/';
  return TITLES[h] ? h : '#/';
}
function setActiveNav() {
  const r = route();
  document.querySelectorAll('[data-nav]').forEach(a => {
    const on = a.getAttribute('href') === r;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  try { document.title = TITLES[r] || TITLES['#/']; } catch {}
}

/* ---------- charts (html strings) ---------- */
function chartSummary(data, fmt) {
  try {
    return data.slice(0, 6).map(d => d.label + ' ' + fmt(d.value)).join(', ') + (data.length > 6 ? ', …' : '');
  } catch { return ''; }
}
function barsHTML(data) {
  if (!data.length) return '<p class="muted small">No data yet.</p>';
  const max = Math.max(1, ...data.map(d => Math.abs(num(d.value))));
  const summary = chartSummary(data, v => Number(v).toFixed(2));
  let h = '<div class="bars" role="img" aria-label="Bar chart. ' + esc(summary) + '">';
  for (const d of data) {
    const v = num(d.value);
    h += '<div class="bar-row"><span class="truncate">' + esc(d.label) + '</span>' +
      '<div class="bar-track"><div class="bar-fill' + (v < 0 ? ' neg-fill' : '') + '" style="width:' + ((Math.abs(v) / max) * 100).toFixed(1) + '%"></div></div>' +
      '<span class="num">' + v.toFixed(2) + '</span></div>';
  }
  h += '</div><ul class="sr-only">' + data.map(d => '<li>' + esc(d.label) + ': ' + num(d.value).toFixed(2) + '</li>').join('') + '</ul>';
  return h;
}
function donutHTML(parts) {
  const COLORS = ['#0f766e', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ef4444'];
  const total = parts.reduce((s, p) => s + Math.max(0, num(p.value)), 0) || 1;
  let acc = 0;
  const segs = parts.map((p, i) => { const f = Math.max(0, num(p.value)) / total; const s = { label: p.label, value: num(p.value), from: acc, to: acc + f, color: COLORS[i % 5] }; acc += f; return s; });
  const arc = f => { const a = f * Math.PI * 2 - Math.PI / 2; return [50 + 38 * Math.cos(a), 50 + 38 * Math.sin(a)]; };
  let paths = '';
  for (const s of segs) {
    if (s.to - s.from <= 0.001) continue;
    const [x1, y1] = arc(s.from), [x2, y2] = arc(s.to);
    const large = s.to - s.from > 0.5 ? 1 : 0;
    paths += '<path d="M ' + x1.toFixed(2) + ' ' + y1.toFixed(2) + ' A 38 38 0 ' + large + ' 1 ' + x2.toFixed(2) + ' ' + y2.toFixed(2) + '" fill="none" stroke="' + s.color + '" stroke-width="16"/>';
  }
  const summary = chartSummary(segs, v => Number(v).toFixed(2));
  return '<div class="donut-wrap"><svg viewBox="0 0 100 100" width="112" height="112" role="img" aria-label="Money by location chart. ' + esc(summary) + '">' +
    '<circle cx="50" cy="50" r="38" fill="none" stroke-width="16" stroke="var(--border)"/>' + paths +
    '</svg><ul>' + segs.map(s => '<li><span class="dot" style="background:' + s.color + '"></span>' + esc(s.label) + ' — ' + s.value.toFixed(2) + '</li>').join('') + '</ul></div>';
}
function trendHTML(points) {
  if (!points.length) return '<p class="muted small">No data yet.</p>';
  const vals = points.map(p => num(p.value));
  const max = Math.max(...vals, 1), min = Math.min(...vals, 0);
  const span = (max - min) || 1, W = 320, H = 110;
  const coords = points.map((p, i) => {
    const x = points.length === 1 ? W / 2 : (i / (points.length - 1)) * (W - 10) + 5;
    const y = H - 10 - ((num(p.value) - min) / span) * (H - 30);
    return { x, y, label: p.label, value: num(p.value) };
  });
  const d = coords.map((c, i) => (i === 0 ? 'M' : 'L') + c.x.toFixed(1) + ',' + c.y.toFixed(1)).join(' ');
  const summary = chartSummary(coords, v => Number(v).toFixed(2));
  return '<div><svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;color:var(--brand)" role="img" aria-label="Monthly trend chart. ' + esc(summary) + '">' +
    '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" style="filter:drop-shadow(0 3px 8px rgba(13,148,136,.35))"/>' +
    coords.map(c => '<circle cx="' + c.x + '" cy="' + c.y + '" r="4" fill="currentColor"><title>' + esc(c.label + ': ' + c.value.toFixed(2)) + '</title></circle>').join('') +
    '</svg><div class="row-between tiny" style="color:var(--muted)"><span>' + esc(points[0].label) + '</span><span>' + esc(points[points.length - 1].label) + '</span></div></div>';
}

/* ---------- pages ---------- */
function pageDashboard() {
  const profile = sanitizeProfile(S.profile);
  const range = periodRange(ui.dashPeriod, ui.dashFrom || undefined, ui.dashTo || undefined);
  const fE = filterByDateRange(sorted(S.entries), range.from, range.to);
  const fD = filterByDateRange(sorted(S.donations), range.from, range.to);
  const fW = filterByDateRange(sorted(S.withdrawals), range.from, range.to);
  const net = netProfit(fE), pct = num(profile.charity_percent || 10);
  const due = charityDue(net, pct), donated = donatedTotal(fD);
  const pending = Math.max(0, due - donated), share = net - due, withdrawn = withdrawnTotal(fW);
  const cur = profile.currency || 'INR', loc = profile.locale || 'en-IN';

  const bySourceMap = new Map();
  for (const e of fE) { const n = (S.sources.find(s => s.id === e.source_id) || {}).name || 'Unassigned'; bySourceMap.set(n, (bySourceMap.get(n) || 0) + (e.type === 'profit' ? num(e.amount) : -num(e.amount))); }
  const bySource = [...bySourceMap.entries()].map(([label, value]) => ({ label, value }));
  const byLocAll = S.locations.map(l => ({ label: l.name, value: locationBalance(l, S.entries, S.transfers, S.withdrawals) }));
  const un = unassignedBalance(S.entries, S.withdrawals, S.locations);
  const byLoc = un.count > 0 ? [...byLocAll, { label: 'Unassigned', value: un.balance }] : byLocAll;
  const tmap = new Map();
  for (const e of S.entries) { const k = monthKeyOf(safeDate(e)); if (!k) continue; tmap.set(k, (tmap.get(k) || 0) + (e.type === 'profit' ? num(e.amount) : -num(e.amount))); }
  const trend = [...tmap.entries()].sort().slice(-8).map(([label, value]) => ({ label, value }));

  const TONES = {
    net: 'linear-gradient(90deg,#14b8a6,#047857)', due: 'linear-gradient(90deg,#f59e0b,#d97706)',
    donated: 'linear-gradient(90deg,#38bdf8,#0284c7)', pending: 'linear-gradient(90deg,#fb7185,#e11d48)',
    share: 'linear-gradient(90deg,#a78bfa,#7c3aed)', withdrawn: 'linear-gradient(90deg,#94a3b8,#475569)'
  };
  const TONE_BG = {
    net: 'var(--brand-soft)', due: 'var(--amber-soft)', donated: 'var(--sky-soft)',
    pending: 'var(--rose-soft)', share: 'var(--violet-soft)', withdrawn: 'var(--slate-soft)'
  };
  const stat = (tone, icon, l, v, s) => '<div class="card stat-card" style="--accent:' + TONES[tone] + ';--tone:' + TONE_BG[tone] + '">' +
    '<div class="stat-top"><span class="stat-ic">' + icon + '</span><span class="stat-delta">' + esc(s || '● live') + '</span></div>' +
    '<p class="stat-label">' + l + '</p><p class="stat-value">' + v + '</p></div>';
  const periodName = { this_month: 'This month', last_month: 'Last month', this_year: 'This year', all: 'All time', custom: 'Custom range' }[ui.dashPeriod] || '';
  const heroMood = net < 0 ? 'Recovery mode — protect capital' : (pending > 0 ? 'Giving due — clear your charity' : 'All clear — wealth compounding');
  let h = '<div class="stack">';
  h += '<section class="hero"><div class="hero-grid"><div>' +
    '<div class="hero-kicker">◈ Net profit · ' + esc(periodName) + '</div>' +
    '<div class="hero-net">' + esc(formatMoney(net, cur, loc)) + '</div>' +
    '<p class="hero-sub">' + esc(heroMood) + ' · ' + fE.length + ' entries in view</p>' +
    '<div class="hero-chips"><span class="chip">♥ Charity due <b>' + esc(formatMoney(due, cur, loc)) + '</b></span>' +
    '<span class="chip">◍ Pending <b>' + esc(formatMoney(pending, cur, loc)) + '</b></span>' +
    '<span class="chip">⬣ My share <b>' + esc(formatMoney(share, cur, loc)) + '</b></span></div>' +
    '</div><div class="hero-cta"><a href="#/entries" class="btn btn-light">+ Add entry</a><a href="#/charity" class="btn btn-outline-light">Donate ♥</a></div>' +
    '</div></section>';
  const firstName = String((profile && profile.display_name) || '').trim().split(/\s+/)[0] || '';
  h += '<div class="page-head"><div><span class="eyebrow"><span class="pulse"></span>Dashboard · ' + esc(periodName) + '</span><h1>Good ' + (new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening') + (firstName ? ', ' + esc(firstName) : '') + '</h1><p class="page-sub">Your money, your giving, your share — at a glance.</p></div>' +
    '<div class="controls-pill"><label class="sr-only" for="period">Period</label><span style="color:var(--muted);font-size:12px">Period</span><select id="period" class="input input-auto" style="min-height:36px;border:0;background:transparent;font-weight:700">' +
    [['this_month', 'This month'], ['last_month', 'Last month'], ['this_year', 'This year'], ['all', 'All time'], ['custom', 'Custom']].map(o => '<option value="' + o[0] + '"' + (ui.dashPeriod === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>' +
    (ui.dashPeriod === 'custom' ? '<input aria-label="From date" type="date" id="dFrom" class="input input-auto" value="' + esc(ui.dashFrom) + '"><input aria-label="To date" type="date" id="dTo" class="input input-auto" value="' + esc(ui.dashTo) + '">' : '') +
    '</div></div>';
  if (ui.dashPeriod === 'custom' && ui.dashFrom && ui.dashTo && ui.dashFrom > ui.dashTo)
    h += '<p class="alert" role="alert">From date is after To date — swap them to see results.</p>';
  if (net < 0) h += '<div class="warn" role="status">Loss period — no charity due. Focus on recovery; charity resumes when net profit is positive.</div>';
  h += '<div class="grid-stats">' +
    stat('net', '◈', 'Total profit · net', esc(formatMoney(net, cur, loc)), fE.length + ' entries') +
    stat('due', '♥', 'Charity due · ' + pct + '%', esc(formatMoney(due, cur, loc)), pct + '% of net') +
    stat('donated', '✓', 'Charity donated', esc(formatMoney(donated, cur, loc)), 'given with love') +
    stat('pending', '◍', 'Charity pending', esc(formatMoney(pending, cur, loc)), pending > 0 ? 'due now' : 'all clear') +
    stat('share', '⬣', 'My share', esc(formatMoney(share, cur, loc)), 'net − charity') +
    stat('withdrawn', '⤓', 'Withdrawn', esc(formatMoney(withdrawn, cur, loc)), 'personal use') + '</div>';
  h += '<div class="grid-2"><section class="card"><h2>Profit by source</h2><p class="page-sub" style="margin:0 0 12px">Where your edge comes from.</p>' +
    (bySource.length ? barsHTML(bySource) : '<div class="muted-box">No entries yet — add your first profit entry.</div>') + '</section>' +
    '<section class="card"><h2>Money by location</h2><p class="page-sub" style="margin:0 0 12px">Where your cash actually sits (all-time balances).</p>' +
    (byLoc.length ? donutHTML(byLoc) : '<div class="muted-box">No locations yet — add a Bank, Cash or Broker location.</div>') + '</section></div>';
  h += '<section class="card"><h2>Monthly trend</h2><p class="page-sub" style="margin:0 0 12px">Compounding, visualised.</p>' + trendHTML(trend) + '</section>';
  h += '<div class="flex-gap"><a href="#/entries" class="btn btn-primary">＋ Add entry</a><a href="#/withdrawals" class="btn btn-ghost">⤓ Withdraw</a><a href="#/charity" class="btn btn-ghost">♥ Donate</a></div>';
  return h + '</div>';
}
function bindDashboard() {
  const p = document.getElementById('period');
  if (p) p.onchange = e => { ui.dashPeriod = e.target.value; render(); };
  const f = document.getElementById('dFrom'), t = document.getElementById('dTo');
  if (f) f.onchange = e => { ui.dashFrom = e.target.value; render(); };
  if (t) t.onchange = e => { ui.dashTo = e.target.value; render(); };
}

function pageEntries() {
  const prof = sanitizeProfile(S.profile);
  const cur = prof.currency || 'INR', loc = prof.locale || 'en-IN';
  const activeSources = S.sources.filter(s => !s.archived);
  const hasLoc = S.locations.length > 0;
  if (ui.editingEntry && !S.entries.some(x => x.id === ui.editingEntry)) ui.editingEntry = null; // stale id (other tab / wipe)
  const months = [...new Set(S.entries.map(e => monthKeyOf(safeDate(e))).filter(Boolean))].sort().reverse();
  const filtered = sorted(S.entries).filter(e => {
    const d = safeDate(e);
    if (ui.eMonth && !d.startsWith(ui.eMonth)) return false;
    if (ui.eSource && e.source_id !== ui.eSource) return false;
    if (ui.eLoc && e.location_id !== ui.eLoc) return false;
    if (ui.eType && e.type !== ui.eType) return false;
    if (ui.eSearch && !((e.note || '') + ' ' + e.amount + ' ' + d).toLowerCase().includes(ui.eSearch.toLowerCase())) return false;
    return true;
  });
  const LIST_CAP = 400;
  const capped = filtered.length > LIST_CAP;
  const shown = capped ? filtered.slice(0, LIST_CAP) : filtered;
  const gmap = new Map();
  for (const e of shown) { const k = monthKeyOf(safeDate(e)) || 'Undated'; if (!gmap.has(k)) gmap.set(k, []); gmap.get(k).push(e); }
  const grouped = [...gmap.entries()].sort().reverse().map(([m, list]) => ({ m, list, net: list.reduce((s, e) => s + (e.type === 'profit' ? num(e.amount) : -num(e.amount)), 0) }));

  const ed = ui.editingEntry ? S.entries.find(x => x.id === ui.editingEntry) : null;
  const dr = (!ed && ui.eDraft) ? ui.eDraft : null;
  const dDate = ed ? ed.date : (dr && dr.date ? dr.date : todayLocal());
  const dType = ed ? ed.type : (dr ? (dr.type || 'profit') : 'profit');
  const dAmt = ed ? String(ed.amount) : (dr ? dr.amount : '');
  const dSrc = ed ? ed.source_id : (dr ? dr.sourceId : '');
  const dLocSel = ed ? ed.location_id : (dr ? dr.locationId : '');
  const dNote = ed ? (ed.note || '') : (dr ? dr.note : '');
  // Keep the entry's current source/location selectable even if archived/deleted
  const srcOpts = [...activeSources];
  if (ed && ed.source_id && !srcOpts.some(s => s.id === ed.source_id)) {
    const oldS = S.sources.find(s => s.id === ed.source_id);
    srcOpts.unshift({ id: ed.source_id, name: (oldS ? oldS.name : 'Archived source') + ' (archived — pick a new one)' });
  }
  const locOpts = [...S.locations];
  if (ed && ed.location_id && !locOpts.some(l => l.id === ed.location_id)) {
    locOpts.unshift({ id: ed.location_id, name: 'Deleted location (pick a new one)', type: '' });
  }
  const hasActiveFilters = ui.eSearch || ui.eMonth || ui.eSource || ui.eLoc || ui.eType;
  let h = '<div class="stack"><div class="page-head"><div><span class="eyebrow"><span class="pulse"></span>Log · profit & loss</span><h1>Entries</h1><p class="page-sub">Every rupee in and out — searchable, filterable.</p></div></div>';
  h += '<form id="eForm" class="card" style="display:flex;flex-direction:column;gap:12px" novalidate><h2 id="eFormH">' + (ed ? 'Edit entry' : 'Quick add (under 10 seconds)') + '</h2><div id="eErr"></div>';
  if (!hasLoc) h += '<p class="warn" role="status">No money location yet — <a class="link" href="#/locations">add a Bank / Cash / Broker first</a>, then log entries here.</p>';
  if (hasLoc && !activeSources.length && !ed) h += '<p class="muted-box" role="status">No income source yet — optional, but <a class="link" href="#/sources">add one (Trading, Freelance…)</a> to track where profit comes from.</p>';
  h += '<div class="form-grid-2"><div><label class="label" for="e-date">Date</label><input id="e-date" type="date" required class="input" value="' + esc(dDate) + '" max="' + todayISO() + '"></div>' +
    '<div><label class="label" for="e-amt">Amount</label><input id="e-amt" inputmode="decimal" required class="input" placeholder="e.g. 10,000" value="' + esc(dAmt) + '"></div></div>';
  h += '<div class="type-toggle" role="radiogroup" aria-label="Entry type">' +
    ['profit', 'loss'].map(t => '<button type="button" id="eType-' + t + '" role="radio" aria-checked="' + (dType === t) + '" class="btn ' + (dType === t ? 'btn-primary' : 'btn-ghost') + '" style="text-transform:capitalize">' + t + '</button>').join('') + '</div>';
  h += '<div class="form-2"><div><label class="label" for="e-src">Source *</label><select id="e-src" class="input" required>' +
    (srcOpts.length === 0 ? '<option value="">No sources — add one on Sources page</option>' : '<option value="">— Select source —</option>' + srcOpts.map(s => '<option value="' + s.id + '"' + (dSrc === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('')) + '</select></div>' +
    '<div><label class="label" for="e-loc">Money location *</label><select id="e-loc" class="input" required><option value="">— Select location —</option>' +
    locOpts.map(l => '<option value="' + l.id + '"' + (dLocSel === l.id ? ' selected' : '') + '>' + esc(l.name) + (l.type ? ' (' + esc(l.type) + ')' : '') + '</option>').join('') + '</select></div></div>';
  h += '<div><label class="label" for="e-note">Note</label><input id="e-note" class="input" maxlength="200" placeholder="Optional" value="' + esc(dNote) + '"></div>';
  h += '<div class="flex-gap"><button class="btn btn-primary" ' + (!hasLoc ? 'disabled' : '') + '>' + (ed ? 'Save changes' : '+ Add entry') + '</button>' + (ed ? '<button type="button" id="eCancel" class="btn btn-ghost">Cancel</button>' : '') + '</div></form>';

  h += '<div class="card"><div class="filters five">' +
    '<div><label class="label" for="fQ">Search</label><input id="fQ" class="input" placeholder="Search note/amount/date" value="' + esc(ui.eSearch) + '"></div>' +
    '<div><label class="label" for="fM">Month</label><select id="fM" class="input"><option value="">All months</option>' + months.map(m => '<option value="' + m + '"' + (ui.eMonth === m ? ' selected' : '') + '>' + m + '</option>').join('') + '</select></div>' +
    '<div><label class="label" for="fS">Source</label><select id="fS" class="input"><option value="">All sources</option>' + S.sources.map(s => '<option value="' + s.id + '"' + (ui.eSource === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') + '</select></div>' +
    '<div><label class="label" for="fL">Location</label><select id="fL" class="input"><option value="">All locations</option>' + S.locations.map(l => '<option value="' + l.id + '"' + (ui.eLoc === l.id ? ' selected' : '') + '>' + esc(l.name) + '</option>').join('') + '</select></div>' +
    '<div><label class="label" for="fT">Type</label><select id="fT" class="input"><option value="">Profit + Loss</option><option value="profit"' + (ui.eType === 'profit' ? ' selected' : '') + '>Profit</option><option value="loss"' + (ui.eType === 'loss' ? ' selected' : '') + '>Loss</option></select></div>' +
    '</div>' + (hasActiveFilters ? '<div style="margin-top:10px"><button type="button" id="clearFilters" class="btn btn-ghost btn-sm">Clear filters</button></div>' : '') + '</div>';

  if (!filtered.length) h += '<div class="card" style="text-align:center"><p><strong>' + (hasActiveFilters ? 'No entries match these filters' : 'No entries yet') + '</strong></p><p class="muted small">Everything is saved on this device.</p>' + (hasActiveFilters ? '<p><button type="button" id="clearFilters2" class="btn btn-ghost btn-sm">Clear filters</button></p>' : '') + '</div>';
  else {
    if (capped) h += '<p class="muted-box small" role="status">Showing latest ' + LIST_CAP + ' of ' + filtered.length + ' entries — refine filters to see more.</p>';
    for (const g of grouped) {
    h += '<section aria-label="Entries ' + esc(g.m) + '"><div class="month-head"><h2>' + esc(g.m) + '</h2><span class="net-pill num ' + (g.net < 0 ? 'neg' : 'pos') + '">Net ' + esc(formatMoney(g.net, cur, loc)) + '</span></div><ul class="list">';
    for (const e of g.list) {
      const sn = (S.sources.find(s => s.id === e.source_id) || {}).name || 'Unassigned';
      const ln = (S.locations.find(l => l.id === e.location_id) || {}).name || 'Unassigned';
      const safeNote = String(e.note || '').slice(0, 120);
      h += '<li class="card item" style="--strip:' + (e.type === 'loss' ? '#e11d48' : '#0d9488') + '"><div><p style="margin:0" class="amt num ' + (e.type === 'loss' ? 'neg' : 'pos') + '">' + (e.type === 'loss' ? '−' : '+') + esc(formatMoney(num(e.amount), cur, loc)) + ' <span class="badge">' + e.type + '</span></p>' +
        '<p class="small item-meta">' + esc(safeDate(e)) + ' · ' + esc(sn) + ' · ' + esc(ln) + (safeNote ? ' · ' + esc(safeNote) : '') + '</p></div>' +
        '<div class="item-actions"><button class="btn btn-ghost btn-sm" data-edit="' + e.id + '">Edit</button><button class="btn btn-ghost btn-sm" data-del="' + e.id + '" aria-label="Delete entry ' + esc(safeDate(e)) + '">Delete</button></div></li>';
    }
    h += '</ul></section>';
    }
  }
  return h + '</div>';
}
let entryType = 'profit';
function bindEntries() {
  let ed = ui.editingEntry ? S.entries.find(x => x.id === ui.editingEntry) : null;
  if (ui.editingEntry && !ed) ui.editingEntry = null;
  entryType = ed ? ed.type : ((ui.eDraft && ui.eDraft.type) || 'profit');
  const setT = t => {
    entryType = t;
    if (!ed) { captureDrafts(); if (ui.eDraft) ui.eDraft.type = t; }
    const p = document.getElementById('eType-profit'), l = document.getElementById('eType-loss');
    if (p) { p.className = 'btn ' + (t === 'profit' ? 'btn-primary' : 'btn-ghost'); p.setAttribute('aria-checked', t === 'profit'); }
    if (l) { l.className = 'btn ' + (t === 'loss' ? 'btn-primary' : 'btn-ghost'); l.setAttribute('aria-checked', t === 'loss'); }
  };
  const bp = document.getElementById('eType-profit'), bl = document.getElementById('eType-loss');
  if (bp) bp.onclick = () => setT('profit');
  if (bl) bl.onclick = () => setT('loss');
  document.querySelector('.type-toggle').onkeydown = e => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setT(entryType === 'profit' ? 'loss' : 'profit'); }
  };
  const err = msg => { document.getElementById('eErr').innerHTML = msg ? '<p class="alert" role="alert">' + esc(msg) + '</p>' : ''; };
  document.getElementById('eForm').onsubmit = e => {
    e.preventDefault(); err('');
    const date = document.getElementById('e-date').value, amount = document.getElementById('e-amt').value;
    const sourceId = document.getElementById('e-src').value, locationId = document.getElementById('e-loc').value;
    const note = document.getElementById('e-note').value;
    const ae = validateAmount(amount); if (ae) return err(ae);
    if (!date) return err('Date is required');
    if (isFutureDate(date)) return err('Date cannot be in the future');
    if (!locationId) return err('Choose a money location — pick where this money sits.');
    if (!sourceId) return err('Choose a source — add one on the Sources page first.');
    const wasEdit = !!ui.editingEntry;
    const payload = { id: ui.editingEntry || uid(), user_id: 'local', date, amount: parseAmount(amount), type: entryType, source_id: sourceId || null, location_id: locationId, note: note.trim().slice(0, 200) };
    if (wasEdit) S.entries = S.entries.map(x => x.id === ui.editingEntry ? payload : x);
    else S.entries = [...S.entries, payload];
    saveAll(); ui.editingEntry = null; ui.eDraft = null;
    ui.toastMsg = wasEdit ? 'Entry updated.' : 'Entry added.';
    render();
  };
  const c = document.getElementById('eCancel'); if (c) c.onclick = () => { ui.editingEntry = null; ui.eDraft = null; render(); };
  // keep draft in sync so filter changes don't wipe the form
  ['e-date', 'e-amt', 'e-src', 'e-loc', 'e-note'].forEach(id => {
    const n = document.getElementById(id); if (n) { n.oninput = () => captureDrafts(); n.onchange = () => captureDrafts(); }
  });
  const refocus = id => { ui.lastFocus = id; };
  const debSearch = debounce(() => {
    const n = document.getElementById('fQ'); if (!n) return;
    const pos = n.selectionStart;
    captureDrafts(); ui.eSearch = n.value; ui.lastFocus = 'fQ';
    render();
    const m = document.getElementById('fQ'); if (m) { m.focus(); try { m.setSelectionRange(pos, pos); } catch {} }
  }, 220);
  document.getElementById('fQ').oninput = () => debSearch();
  document.getElementById('fM').onchange = e => { captureDrafts(); ui.eMonth = e.target.value; refocus('fM'); render(); };
  document.getElementById('fS').onchange = e => { captureDrafts(); ui.eSource = e.target.value; refocus('fS'); render(); };
  document.getElementById('fL').onchange = e => { captureDrafts(); ui.eLoc = e.target.value; refocus('fL'); render(); };
  document.getElementById('fT').onchange = e => { captureDrafts(); ui.eType = e.target.value; refocus('fT'); render(); };
  const clearF = () => { captureDrafts(); ui.eSearch = ''; ui.eMonth = ''; ui.eSource = ''; ui.eLoc = ''; ui.eType = ''; render(); };
  const cf1 = document.getElementById('clearFilters'); if (cf1) cf1.onclick = clearF;
  const cf2 = document.getElementById('clearFilters2'); if (cf2) cf2.onclick = clearF;
  document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { captureDrafts(); ui.editingEntry = b.getAttribute('data-edit'); ui.eDraft = null; render(); smoothTop(); setTimeout(focusHeading, 60); });
  document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const id = b.getAttribute('data-del');
    const en = S.entries.find(x => x.id === id);
    const prof = sanitizeProfile(S.profile);
    const ok = await showConfirm({
      title: 'Delete entry?',
      message: en ? ('Delete this ' + en.type + ' of ' + formatMoney(num(en.amount), prof.currency, prof.locale) + ' on ' + (safeDate(en) || 'undated') + '? This cannot be undone.') : 'Delete this entry? This cannot be undone.',
      confirmLabel: 'Delete'
    });
    if (!ok) return;
    S.entries = S.entries.filter(x => x.id !== id); saveAll();
    ui.toastMsg = 'Entry deleted.'; render();
  });
}
function refreshListOnly() {
  const n = document.getElementById('fQ'); if (!n) { render(); return; }
  const pos = n.selectionStart;
  captureDrafts(); ui.eSearch = n.value; ui.lastFocus = 'fQ';
  render();
  const m = document.getElementById('fQ'); if (m) { m.focus(); try { m.setSelectionRange(pos, pos); } catch {} }
}

function locationsSection() {
  const prof = sanitizeProfile(S.profile);
  const cur = prof.currency || 'INR', loc = prof.locale || 'en-IN';
  if (ui.editingLoc && !S.locations.some(x => x.id === ui.editingLoc)) ui.editingLoc = null;
  const un = unassignedBalance(S.entries, S.withdrawals, S.locations);
  const ed = ui.editingLoc ? S.locations.find(x => x.id === ui.editingLoc) : null;
  let h = '';
  h += '<form id="lForm" class="card" style="display:grid;gap:10px" novalidate><h2 id="lFormH">' + (ed ? 'Edit location' : 'Add a location') + '</h2><div id="lErr"></div>' +
    '<div><label class="label" for="loc-name">Location name *</label>' +
    '<input id="loc-name" class="input" placeholder="e.g. HDFC Bank, Cash in hand" maxlength="60" value="' + esc(ed ? ed.name : '') + '"></div>' +
    '<div class="form-2"><div><label class="label" for="loc-type">Type</label><select id="loc-type" class="input">' + ['bank', 'cash', 'broker', 'wallet'].map(t => '<option value="' + t + '"' + ((ed ? ed.type : 'bank') === t ? ' selected' : '') + '>' + t[0].toUpperCase() + t.slice(1) + '</option>').join('') + '</select></div>' +
    '<div><label class="label" for="loc-open">Opening balance</label><input id="loc-open" class="input" inputmode="decimal" placeholder="e.g. 5,000" value="' + esc(ed ? String(ed.opening_balance) : '') + '"></div></div>' +
    '<div class="flex-gap"><button class="btn btn-primary">' + (ed ? 'Save changes' : 'Add location') + '</button>' + (ed ? '<button type="button" id="lCancel" class="btn btn-ghost">Cancel</button>' : '') + '</div></form>';
  if (!S.locations.length && un.count === 0) h += '<div class="card" style="text-align:center"><p><strong>No locations yet</strong></p><p class="muted small">Add your bank, cash and broker accounts.</p></div>';
  else {
    h += '<ul class="list loc-grid">';
    for (const l of S.locations) {
      const linked = S.entries.filter(e => e.location_id === l.id).length + S.withdrawals.filter(w => w.location_id === l.id).length;
      h += '<li class="card"><div class="row-between"><p style="margin:0;font-weight:700">' + esc(l.name) + '</p><span class="badge">' + esc(l.type) + '</span></div>' +
        '<p class="stat-value">' + esc(formatMoney(locationBalance(l, S.entries, S.transfers, S.withdrawals), cur, loc)) + '</p>' +
        '<p class="small">Opening: ' + esc(formatMoney(num(l.opening_balance), cur, loc)) + ' · ' + linked + ' linked</p>' +
        '<div class="flex-gap" style="margin-top:8px;max-width:240px"><button class="btn btn-ghost btn-sm" data-ledit="' + l.id + '">Edit</button><button class="btn btn-ghost btn-sm" data-ldel="' + l.id + '">Delete</button></div></li>';
    }
    if (un.count > 0) {
      h += '<li class="card"><div class="row-between"><p style="margin:0;font-weight:700">Unassigned</p><span class="badge">deleted locations</span></div>' +
        '<p class="stat-value">' + esc(formatMoney(un.balance, cur, loc)) + '</p>' +
        '<p class="small">' + un.count + ' entries/withdrawals from deleted locations — kept in profit, parked here.</p></li>';
    }
    h += '</ul>';
  }
  return h;
}
function bindLocations() {
  if (ui.editingLoc && !S.locations.some(x => x.id === ui.editingLoc)) ui.editingLoc = null;
  const err = m => { document.getElementById('lErr').innerHTML = m ? '<p class="alert" role="alert">' + esc(m) + '</p>' : ''; };
  document.getElementById('lForm').onsubmit = e => {
    e.preventDefault(); err('');
    const v = document.getElementById('loc-name').value.trim().slice(0, 60);
    const type = document.getElementById('loc-type').value;
    const opening = document.getElementById('loc-open').value;
    if (!v) return err('Name is required — e.g. HDFC Bank.');
    if (S.locations.some(x => x.id !== ui.editingLoc && x.name.toLowerCase() === v.toLowerCase())) return err('"' + v + '" already exists — pick a different name.');
    if (!['bank', 'cash', 'broker', 'wallet'].includes(type)) return err('Pick a valid type.');
    if (opening.trim()) { const n = parseAmount(opening); if (!Number.isFinite(n) || n < 0) return err('Opening balance must be 0 or more.'); if (n > 999999999999) return err('Opening balance is too large.'); }
    const ob = opening.trim() ? parseAmount(opening) : 0;
    const wasEdit = !!ui.editingLoc;
    if (wasEdit) S.locations = S.locations.map(x => x.id === ui.editingLoc ? { ...x, name: v, type, opening_balance: ob } : x);
    else S.locations = [...S.locations, { id: uid(), user_id: 'local', name: v, type, opening_balance: ob }];
    ui.editingLoc = null; saveAll();
    ui.toastMsg = wasEdit ? 'Location updated.' : 'Location added.'; render();
  };
  const c = document.getElementById('lCancel'); if (c) c.onclick = () => { ui.editingLoc = null; render(); };
  document.querySelectorAll('[data-ledit]').forEach(b => b.onclick = () => { ui.editingLoc = b.getAttribute('data-ledit'); render(); smoothTop(); setTimeout(focusHeading, 60); });
  document.querySelectorAll('[data-ldel]').forEach(b => b.onclick = async () => {
    const id = b.getAttribute('data-ldel');
    const l = S.locations.find(x => x.id === id);
    const prof = sanitizeProfile(S.profile);
    const bal = l ? locationBalance(l, S.entries, S.transfers, S.withdrawals) : 0;
    const linked = S.entries.filter(e => e.location_id === id).length + S.withdrawals.filter(w => w.location_id === id).length;
    const ok = await showConfirm({
      title: 'Delete location?',
      message: l ? ('Delete "' + l.name + '"? Balance ' + formatMoney(bal, prof.currency, prof.locale) + '. ' + linked + ' linked entries/withdrawals will be kept under Unassigned. This cannot be undone.') : 'Delete this location? This cannot be undone.',
      confirmLabel: 'Delete'
    });
    if (!ok) return;
    S.entries = S.entries.map(x => x.location_id === id ? { ...x, location_id: null } : x);
    S.withdrawals = S.withdrawals.map(x => x.location_id === id ? { ...x, location_id: null } : x);
    S.locations = S.locations.filter(x => x.id !== id);
    if (ui.editingLoc === id) ui.editingLoc = null;
    saveAll(); ui.toastMsg = 'Location deleted.'; render();
  });
}

function pageWithdrawals() {
  const prof = sanitizeProfile(S.profile);
  const cur = prof.currency || 'INR', loc = prof.locale || 'en-IN';
  const hasLoc = S.locations.length > 0;
  const months = [...new Set(S.withdrawals.map(w => monthKeyOf(safeDate(w))).filter(Boolean))].sort().reverse();
  if (ui.wMonth && !months.includes(ui.wMonth)) ui.wMonth = '';
  const visible = sorted(S.withdrawals).filter(w => !ui.wMonth || safeDate(w).startsWith(ui.wMonth));
  const gmap = new Map();
  for (const w of visible) { const k = monthKeyOf(safeDate(w)) || 'Undated'; if (!gmap.has(k)) gmap.set(k, []); gmap.get(k).push(w); }
  const grouped = [...gmap.entries()].sort().reverse();
  const monthTotal = withdrawnTotal(visible);
  const wd = ui.wDraft || {};
  const wDate = wd.date || todayLocal(), wAmt = wd.amount || '', wLocSel = wd.locationId || '', wNote = wd.note || '';
  let h = '<div class="stack"><div class="page-head"><div><span class="eyebrow"><span class="pulse"></span>Personal · guilt-free spending</span><h1>Withdrawals</h1><p class="page-sub">Personal use — reduces balance, never touches profit or charity math.</p></div></div>';
  h += '<div class="card stat-card" style="--accent:linear-gradient(90deg,#94a3b8,#475569);--tone:var(--slate-soft)"><div class="stat-top"><span class="stat-ic">⤓</span></div><p class="stat-label">' + (ui.wMonth ? 'Withdrawn · ' + esc(ui.wMonth) : 'Withdrawn · all time') + '</p><p class="stat-value">' + esc(formatMoney(monthTotal, cur, loc)) + '</p><p class="stat-sub">' + visible.length + ' withdrawals</p></div>';
  if (!hasLoc) h += '<p class="warn" role="status">No money location yet — <a class="link" href="#/locations">add one first</a>.</p>';
  h += '<form id="wForm" class="card form-2" novalidate><div id="wErr" style="grid-column:1/-1"></div>' +
    '<div><label class="label" for="w-date">Date</label><input id="w-date" type="date" required class="input" value="' + esc(wDate) + '" max="' + todayLocal() + '"></div>' +
    '<div><label class="label" for="w-amt">Amount</label><input id="w-amt" required inputmode="decimal" class="input" placeholder="e.g. 2,500" value="' + esc(wAmt) + '"></div>' +
    '<div style="grid-column:1/-1"><label class="label" for="w-loc">From location *</label><select id="w-loc" class="input" required ' + (!hasLoc ? 'disabled' : '') + '>' +
    (hasLoc ? '<option value="">— Select location —</option>' + S.locations.map(l => '<option value="' + l.id + '"' + (wLocSel === l.id ? ' selected' : '') + '>' + esc(l.name) + ' (' + esc(l.type) + ')</option>').join('') : '<option value="">No locations — add one first</option>') + '</select></div>' +
    '<div style="grid-column:1/-1"><label class="label" for="w-note">Purpose</label><input id="w-note" class="input" maxlength="200" placeholder="e.g. Rent, Shopping (optional)" value="' + esc(wNote) + '"></div>' +
    '<button class="btn btn-primary" style="grid-column:1/-1"' + (!hasLoc ? ' disabled' : '') + '>Record withdrawal</button></form>';
  h += '<div class="card" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><label class="label" style="margin:0" for="w-month">Month</label><select id="w-month" class="input input-auto"><option value="">All months</option>' +
    months.map(m => '<option value="' + m + '"' + (ui.wMonth === m ? ' selected' : '') + '>' + m + '</option>').join('') + '</select>' +
    (ui.wMonth ? '<span class="small">Total: <strong class="num">' + esc(formatMoney(monthTotal, cur, loc)) + '</strong></span>' : '') + (ui.wMonth ? '<button type="button" id="wClear" class="btn btn-ghost btn-sm">Clear</button>' : '') + '</div>';
  if (!visible.length) h += '<div class="card" style="text-align:center"><p><strong>' + (ui.wMonth ? 'No withdrawals in ' + esc(ui.wMonth) : 'No withdrawals yet') + '</strong></p><p class="muted small">Record money you take out for personal use.</p></div>';
  else for (const [m, list] of grouped) {
    h += '<section aria-label="Withdrawals ' + esc(m) + '"><div class="month-head"><h2>' + esc(m) + '</h2><span class="net-pill num muted">' + esc(formatMoney(withdrawnTotal(list), cur, loc)) + '</span></div><ul class="list">';
    for (const w of list) {
      const nm = (S.locations.find(l => l.id === w.location_id) || {}).name || 'Unassigned';
      h += '<li class="card item" style="--strip:#7c3aed"><div><p style="margin:0;font-weight:800" class="amt num">' + esc(formatMoney(Number(w.amount), cur, loc)) + '</p><p class="small" style="margin:4px 0 0">' + esc(w.date) + ' · from ' + esc(nm) + (w.note ? ' · ' + esc(w.note) : '') + '</p></div><button class="btn btn-ghost btn-sm" data-wdel="' + w.id + '">Delete</button></li>';
    }
    h += '</ul></section>';
  }
  return h + '</div>';
}
function bindWithdrawals() {
  ['w-date', 'w-amt', 'w-loc', 'w-note'].forEach(id => { const n = document.getElementById(id); if (n) { n.oninput = () => captureDrafts(); n.onchange = () => captureDrafts(); } });
  const err = m => { document.getElementById('wErr').innerHTML = m ? '<p class="alert" role="alert">' + esc(m) + '</p>' : ''; };
  document.getElementById('wForm').onsubmit = async e => {
    e.preventDefault(); err('');
    const date = document.getElementById('w-date').value, amount = document.getElementById('w-amt').value;
    const locationId = document.getElementById('w-loc').value, note = document.getElementById('w-note').value;
    const a = validateAmount(amount); if (a) return err(a);
    if (!date) return err('Date is required.');
    if (isFutureDate(date)) return err('Date cannot be in the future.');
    if (!locationId) return err('Choose a money location — add one on the Money page first.');
    const val = parseAmount(amount), prof = sanitizeProfile(S.profile);
    const from = S.locations.find(l => l.id === locationId);
    if (from) {
      const bal = locationBalance(from, S.entries, S.transfers, S.withdrawals);
      if (val > bal) {
        const ok = await showConfirm({
          title: 'Withdraw more than balance?',
          message: '"' + from.name + '" holds only ' + formatMoney(bal, prof.currency, prof.locale) + '. Withdraw ' + formatMoney(val, prof.currency, prof.locale) + ' anyway? Balance will go negative.',
          confirmLabel: 'Withdraw anyway'
        });
        if (!ok) return;
      }
    }
    S.withdrawals = [...S.withdrawals, { id: uid(), user_id: 'local', date, amount: parseAmount(amount), location_id: locationId, note: note.trim().slice(0, 200) }];
    saveAll(); ui.wDraft = null; ui.toastMsg = 'Withdrawal recorded.'; render();
  };
  document.getElementById('w-month').onchange = e => { captureDrafts(); ui.wMonth = e.target.value; ui.lastFocus = 'w-month'; render(); };
  const wc = document.getElementById('wClear'); if (wc) wc.onclick = () => { captureDrafts(); ui.wMonth = ''; render(); };
  document.querySelectorAll('[data-wdel]').forEach(b => b.onclick = async () => {
    const ok = await showConfirm({ title: 'Delete withdrawal?', message: 'Delete this withdrawal? The money returns to the location balance.', confirmLabel: 'Delete' });
    if (!ok) return;
    S.withdrawals = S.withdrawals.filter(x => x.id !== b.getAttribute('data-wdel')); saveAll();
    ui.toastMsg = 'Withdrawal deleted.'; render();
  });
}

function pageCharity() {
  const prof = sanitizeProfile(S.profile);
  const pct = num(prof.charity_percent || 0), cur = prof.currency || 'INR', loc = prof.locale || 'en-IN';
  const net = netProfit(S.entries), due = charityDue(net, pct), donated = donatedTotal(S.donations);
  const pending = Math.max(0, due - donated);
  const nets = new Map();
  for (const e of S.entries) { const k = monthKeyOf(safeDate(e)); if (!k) continue; nets.set(k, (nets.get(k) || 0) + (e.type === 'profit' ? num(e.amount) : -num(e.amount))); }
  const monthly = [...nets.entries()].sort().reverse().slice(0, 12).map(([m, n]) => ({ m, n, due: charityDue(n, pct) }));
  let h = '<div class="stack"><div class="page-head"><div><span class="eyebrow"><span class="pulse"></span>Giving · ' + esc(String(pct)) + '% promise</span><h1>Charity ledger</h1><p class="page-sub">Due, donated, pending — give beautifully, on time.</p></div></div><div class="grid-stats">';
  h += '<div class="card stat-card" style="--accent:linear-gradient(90deg,#f59e0b,#d97706);--tone:var(--amber-soft)"><div class="stat-top"><span class="stat-ic">♥</span></div><p class="stat-label">Due · ' + esc(String(pct)) + '%</p><p class="stat-value">' + esc(formatMoney(due, cur, loc)) + '</p></div>';
  h += '<div class="card stat-card" style="--accent:linear-gradient(90deg,#38bdf8,#0284c7);--tone:var(--sky-soft)"><div class="stat-top"><span class="stat-ic">✓</span></div><p class="stat-label">Donated</p><p class="stat-value">' + esc(formatMoney(donated, cur, loc)) + '</p></div>';
  h += '<div class="card stat-card" style="--accent:linear-gradient(90deg,#fb7185,#e11d48);--tone:var(--rose-soft)"><div class="stat-top"><span class="stat-ic">◍</span></div><p class="stat-label">Pending</p><p class="stat-value">' + esc(formatMoney(pending, cur, loc)) + '</p></div></div>';
  if (net < 0) h += '<p class="card small" role="status">Loss period — no charity due on negative net profit.</p>';
  const dd = ui.dDraft || {};
  h += '<form id="dForm" class="card form-2" novalidate><div id="dErr" style="grid-column:1/-1"></div>' +
    '<div><label class="label" for="d-date">Date</label><input id="d-date" type="date" required class="input" value="' + esc(dd.date || todayLocal()) + '" max="' + todayLocal() + '"></div>' +
    '<div><label class="label" for="d-amt">Amount</label><input id="d-amt" required inputmode="decimal" class="input" placeholder="e.g. 1,000" value="' + esc(dd.amount || '') + '"></div>' +
    '<div style="grid-column:1/-1"><label class="label" for="d-rec">Recipient / cause *</label><input id="d-rec" required class="input" maxlength="120" placeholder="e.g. Local food bank" value="' + esc(dd.recipient || '') + '"></div>' +
    '<div style="grid-column:1/-1"><label class="label" for="d-note">Note</label><input id="d-note" class="input" maxlength="200" placeholder="Optional" value="' + esc(dd.note || '') + '"></div>' +
    '<button class="btn btn-primary" style="grid-column:1/-1">Record donation</button></form>';
  h += '<section class="card"><h2>Monthly charity</h2>' + (monthly.length === 0 ? '<p class="muted small">No data.</p>' :
    '<ul class="monthly-list">' + monthly.map(m => '<li><span>' + esc(m.m) + (m.n < 0 ? ' (loss — no charity)' : '') + '</span><span class="num">' + esc(formatMoney(m.due, cur, loc)) + '</span></li>').join('') + '</ul>') + '</section>';
  if (!S.donations.length) h += '<div class="card" style="text-align:center"><p><strong>No donations yet</strong></p></div>';
  else {
    h += '<ul class="list">';
    for (const d of sorted(S.donations)) h += '<li class="card item" style="--strip:#0284c7"><div><p style="margin:0;font-weight:800" class="amt num">' + esc(formatMoney(Number(d.amount), cur, loc)) + ' · ' + esc(d.recipient) + '</p><p class="small" style="margin:4px 0 0">' + esc(d.date) + (d.note ? ' · ' + esc(d.note) : '') + '</p></div><button class="btn btn-ghost btn-sm" data-ddel="' + d.id + '">Delete</button></li>';
    h += '</ul>';
  }
  return h + '</div>';
}
function bindCharity() {
  const prof = sanitizeProfile(S.profile);
  const pct = num(prof.charity_percent || 0), cur = prof.currency || 'INR', loc = prof.locale || 'en-IN';
  const err = m => { document.getElementById('dErr').innerHTML = m ? '<p class="alert" role="alert">' + esc(m) + '</p>' : ''; };
  ['d-date', 'd-amt', 'd-rec', 'd-note'].forEach(id => { const n = document.getElementById(id); if (n) { n.oninput = () => captureDrafts(); n.onchange = () => captureDrafts(); } });
  document.getElementById('dForm').onsubmit = async e => {
    e.preventDefault(); err('');
    const date = document.getElementById('d-date').value, amount = document.getElementById('d-amt').value;
    const rec = document.getElementById('d-rec').value, note = document.getElementById('d-note').value;
    const a = validateAmount(amount); if (a) return err(a);
    if (!rec.trim()) return err('Recipient / cause is required.');
    if (!date) return err('Date is required.');
    if (isFutureDate(date)) return err('Date cannot be in the future.');
    const net = netProfit(S.entries), due = charityDue(net, pct), donated = donatedTotal(S.donations);
    const pending = Math.max(0, due - donated), val = parseAmount(amount);
    if (net <= 0) {
      const ok = await showConfirm({ title: 'Donate during a loss period?', message: 'Net profit is ' + formatMoney(net, cur, loc) + ' — no charity is due. Record this donation of ' + formatMoney(val, cur, loc) + ' anyway?', confirmLabel: 'Donate anyway', danger: false });
      if (!ok) return;
    } else if (pending > 0 && val > pending) {
      const ok = await showConfirm({ title: 'Larger than pending charity?', message: 'This donation (' + formatMoney(val, cur, loc) + ') is more than pending charity (' + formatMoney(pending, cur, loc) + '). Save anyway?', confirmLabel: 'Save anyway', danger: false });
      if (!ok) return;
    }
    S.donations = [...S.donations, { id: uid(), user_id: 'local', date, amount: parseAmount(amount), recipient: rec.trim().slice(0, 120), note: note.trim().slice(0, 200) }];
    saveAll(); ui.dDraft = null; ui.toastMsg = 'Donation recorded. Thank you ♥'; render();
  };
  document.querySelectorAll('[data-ddel]').forEach(b => b.onclick = async () => {
    const ok = await showConfirm({ title: 'Delete donation?', message: 'Delete this donation? This cannot be undone.', confirmLabel: 'Delete' });
    if (!ok) return;
    S.donations = S.donations.filter(x => x.id !== b.getAttribute('data-ddel')); saveAll();
    ui.toastMsg = 'Donation deleted.'; render();
  });
}

function pageReports() {
  const prof = sanitizeProfile(S.profile);
  const cur = prof.currency || 'INR', loc = prof.locale || 'en-IN', pct = num(prof.charity_percent || 0);
  const years = [...new Set(S.entries.map(e => String(safeDate(e)).slice(0, 4)).filter(y => /^\d{4}$/.test(y)))];
  years.push(String(new Date().getFullYear()));
  const uniq = [...new Set(years)].sort().reverse();
  if (!uniq.includes(ui.repYear)) ui.repYear = uniq[0];
  const yE = S.entries.filter(e => safeDate(e).startsWith(ui.repYear));
  const yD = S.donations.filter(d => safeDate(d).startsWith(ui.repYear));
  const yW = S.withdrawals.filter(w => safeDate(w).startsWith(ui.repYear));
  const gmap = new Map();
  for (const e of yE) { const k = monthKeyOf(safeDate(e)); if (!k) continue; if (!gmap.has(k)) gmap.set(k, []); gmap.get(k).push(e); }
  const months = [...gmap.entries()].sort().map(([m, list]) => {
    const net = netProfit(list), due = charityDue(net, pct);
    const don = donatedTotal(yD.filter(d => monthKeyOf(safeDate(d)) === m));
    const wd = withdrawnTotal(yW.filter(w => monthKeyOf(safeDate(w)) === m));
    return { m, net, due, donated: don, withdrawn: wd, share: net - due, count: list.length };
  });
  const yNet = netProfit(yE), yDue = charityDue(yNet, pct), yDon = donatedTotal(yD), yWd = withdrawnTotal(yW);
  const cell = (l, v) => '<div><p class="muted small" style="margin:0">' + l + '</p><p class="stat-value" style="font-size:18px;overflow-wrap:anywhere">' + esc(formatMoney(v, cur, loc)) + '</p></div>';
  let h = '<div class="stack"><div class="page-head"><div><span class="eyebrow"><span class="pulse"></span>Insight · months & years</span><h1>Reports</h1><p class="page-sub">Monthly breakdowns plus one-click CSV exports.</p></div><select id="repY" class="input input-auto" aria-label="Year" style="border-radius:999px;font-weight:700">' +
    uniq.map(y => '<option value="' + y + '"' + (ui.repYear === y ? ' selected' : '') + '>' + y + '</option>').join('') + '</select></div>';
  h += '<div class="card" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' + cell('Net profit', yNet) + cell('Charity due', yDue) + cell('Donated', yDon) + cell('Withdrawn', yWd) + cell('My share', yNet - yDue) + '</div>';
  h += '<div class="flex-gap"><button id="expE" class="btn btn-ghost" ' + (!yE.length ? 'disabled' : '') + '>Export entries CSV</button><button id="expM" class="btn btn-ghost" ' + (!months.length ? 'disabled' : '') + '>Export monthly CSV</button><button id="expW" class="btn btn-ghost" ' + (!yW.length ? 'disabled' : '') + '>Export withdrawals CSV</button></div>';
  if (!months.length) h += '<div class="card" style="text-align:center"><p><strong>No data for ' + esc(ui.repYear) + '</strong></p></div>';
  else {
    h += '<p class="muted small" style="margin:0 0 4px">Yearly charity is computed on the year\'s net profit. Monthly rows floor loss months at zero — so monthly dues may sum higher than the yearly due. That\'s intentional.</p>';
  h += '<div class="card scrollx"><table class="tbl"><caption class="sr-only">Monthly summary ' + esc(ui.repYear) + '</caption><thead><tr><th scope="col">Month</th><th scope="col">Net</th><th scope="col">Charity due</th><th scope="col">Donated</th><th scope="col">Withdrawn</th><th scope="col">My share</th></tr></thead><tbody>';
    for (const m of months) h += '<tr><td style="font-weight:600">' + esc(m.m) + (m.net < 0 ? ' (loss)' : '') + '</td><td class="num">' + esc(formatMoney(m.net, cur, loc)) + '</td><td class="num">' + esc(formatMoney(m.due, cur, loc)) + '</td><td class="num">' + esc(formatMoney(m.donated, cur, loc)) + '</td><td class="num">' + esc(formatMoney(m.withdrawn, cur, loc)) + '</td><td class="num">' + esc(formatMoney(m.share, cur, loc)) + '</td></tr>';
    h += '</tbody></table></div>';
  }
  return h + '</div>';
}
function bindReports() {
  document.getElementById('repY').onchange = e => { ui.repYear = e.target.value; ui.lastFocus = 'repY'; render(); };
  const y = ui.repYear;
  const yE = S.entries.filter(e => safeDate(e).startsWith(y));
  const yW = S.withdrawals.filter(w => safeDate(w).startsWith(y));
  const e1 = document.getElementById('expE'); if (e1) e1.onclick = () => {
    downloadCSV('entries-' + y + '.csv', toCSV(yE.map(e => ({ date: safeDate(e), type: e.type, amount: e.amount, source: (S.sources.find(s => s.id === e.source_id) || {}).name || 'Unassigned', location: (S.locations.find(l => l.id === e.location_id) || {}).name || 'Unassigned', note: e.note }))));
    toast('Entries CSV downloaded.');
  };
  const e2 = document.getElementById('expM'); if (e2) e2.onclick = () => {
    const gmap = new Map();
    for (const e of yE) { const k = monthKeyOf(safeDate(e)); if (!k) continue; if (!gmap.has(k)) gmap.set(k, []); gmap.get(k).push(e); }
    const pct = num(sanitizeProfile(S.profile).charity_percent || 0);
    const yD = S.donations.filter(d => safeDate(d).startsWith(y));
    const rows = [...gmap.entries()].sort().map(([m, list]) => {
      const net = netProfit(list);
      return { m, net, due: charityDue(net, pct), donated: donatedTotal(yD.filter(d => monthKeyOf(safeDate(d)) === m)), count: list.length };
    });
    downloadCSV('monthly-summary-' + y + '.csv', toCSV(rows));
    toast('Monthly CSV downloaded.');
  };
  const e3 = document.getElementById('expW'); if (e3) e3.onclick = () => {
    downloadCSV('withdrawals-' + y + '.csv', toCSV(yW.map(w => ({ date: safeDate(w), amount: w.amount, location: (S.locations.find(l => l.id === w.location_id) || {}).name || 'Unassigned', note: w.note }))));
    toast('Withdrawals CSV downloaded.');
  };
}

function sourcesSection() {
  let h = '';
  h += '<form id="sForm" class="card" style="display:flex;gap:8px;flex-wrap:wrap" novalidate><div style="flex:1;min-width:200px"><label class="label" for="src-name">New source name</label><input id="src-name" class="input" placeholder="e.g. Trading, Freelance" maxlength="60"></div><div style="display:flex;align-items:flex-end"><button class="btn btn-primary" style="white-space:nowrap">Add source</button></div></form><div id="sErr"></div>';
  if (!S.sources.length) h += '<div class="card" style="text-align:center"><p><strong>No sources yet</strong></p><p class="muted small">Add Trading, Freelance, Side Hustle…</p></div>';
  else {
    h += '<ul class="list">';
    for (const s of S.sources) {
      if (ui.renamingSource === s.id) {
        h += '<li class="card item"><div style="flex:1;min-width:0"><label class="label" for="rename-' + s.id + '">Rename source</label><input id="rename-' + s.id + '" class="input" maxlength="60" value="' + esc(s.name) + '"><div id="renameErr"></div></div><div class="item-actions"><button class="btn btn-primary btn-sm" data-save-rename="' + s.id + '">Save</button><button class="btn btn-ghost btn-sm" data-cancel-rename>Cancel</button></div></li>';
      } else {
        h += '<li class="card item"><span class="truncate" style="' + (s.archived ? 'color:var(--muted);text-decoration:line-through' : 'font-weight:600') + '">' + esc(s.name) + (s.archived ? ' <span class="badge">archived</span>' : '') + '</span><div class="item-actions"><button class="btn btn-ghost btn-sm" data-rename="' + s.id + '">Rename</button><button class="btn btn-ghost btn-sm" data-arch="' + s.id + '">' + (s.archived ? 'Unarchive' : 'Archive') + '</button></div></li>';
      }
    }
    h += '</ul>';
  }
  return h;
}
function bindSources() {
  const err = (m, ok) => { document.getElementById('sErr').innerHTML = m ? '<p class="' + (ok ? 'muted-box small' : 'alert') + '" role="' + (ok ? 'status' : 'alert') + '">' + esc(m) + '</p>' : ''; };
  document.getElementById('sForm').onsubmit = e => {
    e.preventDefault(); err('');
    const v = document.getElementById('src-name').value.trim().slice(0, 60);
    if (!v) return err('Name is required — e.g. Trading.');
    if (S.sources.some(x => x.name.toLowerCase() === v.toLowerCase())) return err('"' + v + '" already exists — pick a different name.');
    S.sources = [...S.sources, { id: uid(), user_id: 'local', name: v, archived: false }];
    saveAll(); ui.toastMsg = 'Source added.'; render();
  };
  document.querySelectorAll('[data-arch]').forEach(b => b.onclick = () => {
    const id = b.getAttribute('data-arch');
    const cur = S.sources.find(x => x.id === id);
    if (!cur) { render(); return; }
    S.sources = S.sources.map(x => x.id === id ? { ...x, archived: !cur.archived } : x);
    saveAll(); ui.toastMsg = cur.archived ? 'Source unarchived.' : 'Source archived.'; render();
  });
  document.querySelectorAll('[data-rename]').forEach(b => b.onclick = () => { ui.renamingSource = b.getAttribute('data-rename'); render(); setTimeout(() => { const n = document.querySelector('[id^="rename-"]'); if (n) n.focus(); }, 50); });
  const cancelB = document.querySelector('[data-cancel-rename]'); if (cancelB) cancelB.onclick = () => { ui.renamingSource = null; render(); };
  document.querySelectorAll('[data-save-rename]').forEach(b => b.onclick = () => {
    const id = b.getAttribute('data-save-rename');
    const input = document.getElementById('rename-' + id);
    const v = (input ? input.value : '').trim().slice(0, 60);
    const box = document.getElementById('renameErr');
    if (!v) { if (box) box.innerHTML = '<p class="alert" role="alert">Name cannot be empty.</p>'; return; }
    if (S.sources.some(x => x.id !== id && x.name.toLowerCase() === v.toLowerCase())) { if (box) box.innerHTML = '<p class="alert" role="alert">"' + esc(v) + '" already exists — pick a different name.</p>'; return; }
    S.sources = S.sources.map(x => x.id === id ? { ...x, name: v } : x);
    saveAll(); ui.renamingSource = null; ui.toastMsg = 'Source renamed.'; render();
  });
}

/* ---------- Money & Sources (one section, two tabs) ---------- */
function moneyTotal() {
  const t = S.locations.reduce((s, l) => s + locationBalance(l, S.entries, S.transfers, S.withdrawals), 0);
  return t + unassignedBalance(S.entries, S.withdrawals, S.locations).balance;
}
function pageMoney() {
  const prof = sanitizeProfile(S.profile);
  const cur = prof.currency || 'INR', loc = prof.locale || 'en-IN';
  const tab = ui.moneyTab === 'sources' ? 'sources' : 'locations';
  let h = '<div class="stack"><div class="page-head"><div>' +
    '<span class="eyebrow"><span class="pulse"></span>Wallets + origins</span><h1>Money &amp; Sources</h1>' +
    '<p class="page-sub">Where your money lives, and where it comes from — one section.</p></div>' +
    '<div class="controls-pill">Total <b class="num">' + esc(formatMoney(moneyTotal(), cur, loc)) + '</b></div></div>';
  h += '<div class="type-toggle" role="tablist" aria-label="Money and sources">' +
    '<button type="button" id="tab-locations" role="tab" aria-selected="' + (tab === 'locations') + '" class="btn ' + (tab === 'locations' ? 'btn-primary' : 'btn-ghost') + '">◍ Locations</button>' +
    '<button type="button" id="tab-sources" role="tab" aria-selected="' + (tab === 'sources') + '" class="btn ' + (tab === 'sources' ? 'btn-primary' : 'btn-ghost') + '">⬣ Sources</button></div>';
  h += '<div role="tabpanel" aria-label="' + (tab === 'sources' ? 'Income sources' : 'Money locations') + '">';
  h += tab === 'sources' ? sourcesSection() : locationsSection();
  return h + '</div></div>';
}
function bindMoney() {
  const tab = ui.moneyTab === 'sources' ? 'sources' : 'locations';
  const setTab = t => {
    ui.moneyTab = t; ui.editingLoc = null; ui.renamingSource = null;
    const a = document.getElementById('tab-locations'), b = document.getElementById('tab-sources');
    if (a) { a.className = 'btn ' + (t === 'locations' ? 'btn-primary' : 'btn-ghost'); a.setAttribute('aria-selected', t === 'locations'); }
    if (b) { b.className = 'btn ' + (t === 'sources' ? 'btn-primary' : 'btn-ghost'); b.setAttribute('aria-selected', t === 'sources'); }
    render();
  };
  const a = document.getElementById('tab-locations'), b = document.getElementById('tab-sources');
  if (a) a.onclick = () => setTab('locations');
  if (b) b.onclick = () => setTab('sources');
  const tg = document.querySelector('[role="tablist"]');
  if (tg) tg.onkeydown = e => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setTab(tab === 'locations' ? 'sources' : 'locations'); }
  };
  if (tab === 'sources') bindSources(); else bindLocations();
}

function pageSettings() {
  const C = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SAR'];
  const prof = sanitizeProfile(S.profile);
  return '<div class="center stack"><div class="page-head"><div><span class="eyebrow"><span class="pulse"></span>Personalise</span><h1>Settings</h1><p class="page-sub">Single-user mode — everything stays on this device.</p></div></div>' +
    '<form id="setForm" class="card" style="display:flex;flex-direction:column;gap:12px" novalidate><div id="setMsg"></div>' +
    '<div><label class="label" for="s-name">Display name</label><input id="s-name" class="input" maxlength="80" autocomplete="name" placeholder="e.g. Aarav" value="' + esc(prof.display_name || '') + '"></div>' +
    '<div><label class="label" for="s-cur">Currency</label><select id="s-cur" class="input">' + C.map(c => '<option value="' + c + '"' + (prof.currency === c ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></div>' +
    '<div><label class="label" for="s-pct">Charity % (0–100, default 10)</label><input id="s-pct" class="input" type="number" min="0" max="100" step="1" inputmode="numeric" value="' + esc(String(prof.charity_percent)) + '"></div>' +
    '<button class="btn btn-primary">Save settings</button></form>' +
    '<div class="card"><h2>Backup & restore</h2><p class="small">Save everything to one JSON file — profile, sources, locations, entries, donations, withdrawals. Keep it in Drive / email. Restore on any device or browser.</p><div class="flex-gap"><button id="backupExport" type="button" class="btn btn-primary">Download backup</button><button id="backupImportBtn" type="button" class="btn btn-ghost">Restore backup</button></div><input type="file" id="backupFile" accept=".json,application/json" style="display:none" aria-label="Choose backup JSON file"><p id="backupMsg" class="small" role="status" style="margin:8px 0 0"></p></div>' +
    '<div class="card"><h2>Danger zone</h2><p class="small">Erase every entry, location, withdrawal, donation and source stored in this browser.</p><button id="wipe" class="btn btn-danger">Erase all device data</button></div></div>';
}
function bindSettings() {
  const msg = (m, ok) => { document.getElementById('setMsg').innerHTML = m ? '<p class="' + (ok ? 'muted-box small' : 'alert') + '" role="' + (ok ? 'status' : 'alert') + '">' + esc(m) + '</p>' : ''; };
  document.getElementById('setForm').onsubmit = e => {
    e.preventDefault(); msg('');
    const raw = document.getElementById('s-pct').value.trim();
    if (raw === '') return msg('Charity % is required — enter 0 to 100.');
    const pct = Number(raw);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return msg('Charity % must be between 0 and 100.');
    const curSel = document.getElementById('s-cur').value;
    if (!['INR', 'USD', 'EUR', 'GBP', 'AED', 'SAR'].includes(curSel)) return msg('Pick a valid currency.');
    S.profile = sanitizeProfile({ ...S.profile, display_name: document.getElementById('s-name').value.trim().slice(0, 80), currency: curSel, charity_percent: Math.round(pct * 100) / 100 });
    saveAll();
    ui.toastMsg = 'Settings saved.';
    msg('Saved on this device.', true);
    setActiveNav();
  };
  document.getElementById('wipe').onclick = async () => {
    const ok = await showConfirm({ title: 'Erase everything?', message: 'Delete ALL saved data on this device — entries, locations, withdrawals, donations, sources and settings? This cannot be undone.', confirmLabel: 'Erase everything' });
    if (!ok) return;
    try {
      Object.values(K).forEach(k => localStorage.removeItem(k));
    } catch {}
    resetUIState();
    S = loadStore();
    ui.toastMsg = 'All device data erased.';
    render();
  };
  const expBtn = document.getElementById('backupExport');
  if (expBtn) expBtn.onclick = () => {
    try {
      const backup = buildBackup();
      const n = backup.data.entries.length + backup.data.donations.length + backup.data.withdrawals.length;
      downloadJSON('profit-charity-backup-' + todayLocal() + '.json', backup);
      const m = document.getElementById('backupMsg');
      if (m) m.textContent = 'Backup downloaded (' + n + ' records). Keep it safe in Drive / email.';
      toast('Backup downloaded.');
    } catch (e) {
      const m = document.getElementById('backupMsg');
      if (m) m.textContent = 'Backup failed: ' + ((e && e.message) || e);
    }
  };
  const impBtn = document.getElementById('backupImportBtn');
  const fileIn = document.getElementById('backupFile');
  if (impBtn && fileIn) {
    impBtn.onclick = () => fileIn.click();
    fileIn.onchange = () => {
      const f = fileIn.files && fileIn.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = async () => {
        const m = document.getElementById('backupMsg');
        try {
          const parsed = JSON.parse(String(rd.result || ''));
          const clean = validateBackup(parsed);
          if (!clean) {
            if (m) m.textContent = 'Invalid backup file — not a profit-charity backup JSON.';
            fileIn.value = '';
            return;
          }
          const count = clean.entries.length + clean.donations.length + clean.withdrawals.length;
          const ok = await showConfirm({ title: 'Restore backup?', message: 'Replace ALL current data on this device with backup from ' + (parsed.exportedAt || 'file') + '? ' + count + ' records will be restored. This cannot be undone.', confirmLabel: 'Restore', danger: false });
          if (!ok) { fileIn.value = ''; return; }
          S = clean;
          saveAll();
          resetUIState();
          ui.toastMsg = 'Backup restored (' + count + ' records).';
          render();
        } catch (e) {
          if (m) m.textContent = 'Restore failed — invalid JSON file.';
        }
        fileIn.value = '';
      };
      try { rd.readAsText(f); } catch {}
    };
  }
}

/* ---------- render ---------- */
const PAGES = {
  '#/': [pageDashboard, bindDashboard], '#/entries': [pageEntries, bindEntries],
  '#/locations': [pageMoney, bindMoney], '#/withdrawals': [pageWithdrawals, bindWithdrawals],
  '#/charity': [pageCharity, bindCharity], '#/reports': [pageReports, bindReports],
  '#/sources': [pageMoney, bindMoney], '#/settings': [pageSettings, bindSettings]
};
let lastRoute = null;
function render(opts) {
  opts = opts || {};
  try { S = loadStore(); } catch { S = { profile: defaultProfile(), sources: [], locations: [], entries: [], transfers: [], donations: [], withdrawals: [] }; }
  const r = route();
  const [fn, bind] = PAGES[r] || PAGES['#/'];
  const main = document.getElementById('main');
  try {
    main.innerHTML = fn();
  } catch (e) {
    console.error('Render failed:', e);
    main.innerHTML = '<div class="stack"><div class="page-head"><div><span class="eyebrow">Something broke</span><h1>Could not load this page</h1><p class="page-sub">Your saved data is untouched. Try reloading, or reset filters.</p></div></div>' +
      '<div class="card"><p class="alert" role="alert">Render error: ' + esc((e && e.message) || e) + '</p>' +
      '<div class="flex-gap"><button class="btn btn-primary" onclick="location.reload()">Reload app</button><button class="btn btn-ghost" id="resetFilters">Reset filters</button></div></div></div>';
    const rb = document.getElementById('resetFilters');
    if (rb) rb.onclick = () => { resetUIState(); render(); };
  }
  setActiveNav(); syncThemeBtns();
  try { if (bind) bind(); } catch (e) { console.error('Bind failed:', e); }
  // restore focus to the control that triggered a filter re-render
  if (ui.lastFocus) {
    const f = document.getElementById(ui.lastFocus);
    if (f && document.activeElement !== f && /^(fM|fS|fL|fT|w-month|repY|period)$/.test(ui.lastFocus)) {
      try { f.focus({ preventScroll: true }); } catch { try { f.focus(); } catch {} }
    }
    ui.lastFocus = null;
  }
  // route change: move screen-reader focus to heading (not on every keystroke render)
  if (opts.routeChange || lastRoute !== r) {
    lastRoute = r;
    if (!ui.lastFocus) setTimeout(focusHeading, 40);
  }
  if (ui.toastMsg) { const m = ui.toastMsg; ui.toastMsg = null; setTimeout(() => toast(m), 30); }
}
let hashTimer = null;
window.addEventListener('hashchange', () => {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const hh = location.hash || '#/';
    if (hh === '#/sources') ui.moneyTab = 'sources';
    else if (hh === '#/locations') ui.moneyTab = 'locations';
    ui.editingEntry = null; ui.editingLoc = null; ui.renamingSource = null; ui.lastFocus = null;
    render({ routeChange: true });
  }, 30);
});

/* ---------- boot ---------- */
initTheme();
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-theme-btn]').forEach(b => b.addEventListener('click', toggleTheme));
  if (!location.hash) location.hash = '#/';
  render();
});
