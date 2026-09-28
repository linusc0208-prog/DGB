// ============ Hilfsfunktionen für die Oberfläche ============

const P = {
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  parking: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M9.5 17V7h3.5a3 3 0 0 1 0 6H9.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
  shield: '<path d="M12 3 4.5 6v6c0 4.8 3.3 8 7.5 9 4.2-1 7.5-4.2 7.5-9V6z"/><path d="M9 12l2 2 4-4"/>',
  siren: '<path d="M7 18v-6a5 5 0 0 1 10 0v6"/><path d="M5 21.5h14V18H5z"/><path d="M12 2v2M4.2 5.2l1.4 1.4M19.8 5.2l-1.4 1.4M2 12h2M20 12h2"/>',
  foot: '<circle cx="13" cy="4.5" r="2"/><path d="M10 21l2-6 2.5 2.5V21"/><path d="M7 12l2.8-3.8a2 2 0 0 1 2.9-.4L15 10l3 1"/><path d="M12 15l.8-5.8"/>',
  car: '<path d="M5 12l1.6-4.3A2 2 0 0 1 8.5 6.4h7a2 2 0 0 1 1.9 1.3L19 12"/><rect x="3" y="12" width="18" height="5.5" rx="2"/><path d="M6 17.5V20M18 17.5V20"/><path d="M7 14.8h.01M17 14.8h.01"/>',
  tow: '<rect x="2" y="8" width="11" height="8" rx="1.5"/><path d="M13 11h4l3 3v2h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/><path d="M5 8l3-4"/>',
  locate: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  flame: '<path d="M12 22c4 0 7-3 7-7 0-4.5-3.5-6.5-4.5-10-1.3 2.2-2.5 3.2-4 3.4C10.6 6.2 9.8 4.3 8.6 3 7.5 7.4 5 9.5 5 15c0 4 3 7 7 7z"/>',
  check: '<path d="M5 12.5l4.5 4.5L20 6.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  flag: '<path d="M5 21V4h11l-1.8 4L16 12H5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5M5 12h11"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14.5 8.5l2 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  arrow: '<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>',
  pin: '<path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  wheel: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M12 14v7M10 12H3M14 12h7"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2.2.6 3.5 2.4 3.5 5.2"/>',
  send: '<path d="M4 12l16-8-6 17-3-7z"/><path d="M11 14l9-10"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.8-4M4 4v4h4M4 13a8 8 0 0 0 14.8 4M20 20v-4h-4"/>',
  ticket: '<path d="M3 8a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2.2a1.8 1.8 0 0 0 0 3.6V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2.2a1.8 1.8 0 0 0 0-3.6z"/><path d="M15 7v10" stroke-dasharray="1.5 2.5"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
};

export function icon(name, cls = '') {
  return `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`;
}

export const KIND = {
  patrol: { label: 'Ordnungsamt', icon: 'siren' },
  foot: { label: 'Fußstreife', icon: 'foot' },
  car: { label: 'Fahrzeug', icon: 'car' },
  tow: { label: 'Abschlepp\u00ADwagen', icon: 'tow' },
};

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function html(str) {
  const t = document.createElement('template');
  t.innerHTML = str.trim();
  return t.content.firstElementChild;
}

// ---------- Formatierung ----------
export function timeAgo(ts, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return 'gerade eben';
  const m = Math.round(s / 60);
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.round(m / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  return d === 1 ? 'gestern' : `vor ${d} Tagen`;
}
export function fmtDist(m) {
  if (m == null || Number.isNaN(m)) return '–';
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)}\u00A0m`;
  return `${(m / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })}\u00A0km`;
}
export const fmtClock = (ts) => new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
export const fmtDate = (ts) => new Date(ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export function fmtDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
export function fmtMinutes(min) {
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
}
export function initials(name = '') {
  return name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';
}
export function distance(a, b) {
  if (!a || !b) return null;
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// ---------- Feedback ----------
export function haptic(pattern = 12) {
  try { navigator.vibrate?.(pattern); } catch { /* egal */ }
}

let audioCtx;
export function beep() {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime;
    [0, 0.18].forEach((d, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = i ? 1180 : 880;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.25, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.16);
      o.connect(g).connect(audioCtx.destination);
      o.start(t + d);
      o.stop(t + d + 0.18);
    });
  } catch { /* kein Audio */ }
}

export function toast(message, { type = 'ok', action, onAction, duration = 3800 } = {}) {
  const ico = { ok: 'check', err: 'x', warn: 'info', info: 'info' }[type] || 'info';
  const el = html(`<div class="toast ${type}">${icon(ico)}<span class="grow">${esc(message)}</span>${action ? `<button>${esc(action)}</button>` : ''}</div>`);
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 250); };
  el.querySelector('button')?.addEventListener('click', () => { onAction?.(); close(); });
  $('#toasts').append(el);
  setTimeout(close, duration);
  return close;
}

// ---------- Sheets (Bottom Sheet / Dialog) ----------
const openSheets = [];

export function openSheet({ title = '', body = '', onMount, onClose, dismissible = true, className = '' }) {
  const root = html(`
    <div class="sheet-root" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-backdrop"></div>
      <div class="sheet ${className}">
        <div class="grabber"></div>
        ${title ? `<div class="sheet-head"><h3>${esc(title)}</h3>${dismissible ? `<button class="close" aria-label="Schließen">${icon('x', 'sm')}</button>` : ''}</div>` : ''}
        <div class="sheet-body"></div>
      </div>
    </div>`);
  const bodyEl = $('.sheet-body', root);
  if (typeof body === 'string') bodyEl.innerHTML = body; else bodyEl.append(body);
  document.body.append(root);

  let closed = false;
  const api = {
    el: bodyEl,
    root,
    close(result) {
      if (closed) return;
      closed = true;
      root.classList.remove('show');
      $('.sheet', root).classList.remove('show');
      openSheets.splice(openSheets.indexOf(api), 1);
      setTimeout(() => root.remove(), 380);
      onClose?.(result);
    },
    setBody(h) { bodyEl.innerHTML = h; },
  };
  openSheets.push(api);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    root.classList.add('show');
    $('.sheet', root).classList.add('show');
  }));
  if (dismissible) {
    $('.sheet-backdrop', root).addEventListener('click', () => api.close());
    $('.close', root)?.addEventListener('click', () => api.close());
    enableDragClose($('.sheet', root), api);
  }
  onMount?.(bodyEl, api);
  return api;
}

function enableDragClose(sheet, api) {
  const handle = $('.grabber', sheet);
  const head = $('.sheet-head', sheet);
  let startY = null;
  let dy = 0;
  const down = (e) => { startY = e.clientY; dy = 0; sheet.style.transition = 'none'; e.target.setPointerCapture?.(e.pointerId); };
  const move = (e) => { if (startY == null) return; dy = Math.max(0, e.clientY - startY); sheet.style.transform = `translateY(${dy}px)`; };
  const up = () => {
    if (startY == null) return;
    startY = null;
    sheet.style.transition = '';
    sheet.style.transform = '';
    if (dy > 90) api.close();
  };
  if (window.matchMedia('(min-width: 700px)').matches) return;
  [handle, head].filter(Boolean).forEach((h) => {
    h.addEventListener('pointerdown', down);
    h.addEventListener('pointermove', move);
    h.addEventListener('pointerup', up);
    h.addEventListener('pointercancel', up);
  });
}

export function closeAllSheets() { [...openSheets].forEach((s) => s.close()); }

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && openSheets.length) openSheets[openSheets.length - 1].close();
});

/** Bestätigungsdialog. Resolves mit true/false. */
export function confirmDialog({ title, text, confirm = 'OK', cancel = 'Abbrechen', danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    openSheet({
      title,
      body: `<p class="muted" style="margin:0 0 18px">${esc(text)}</p>
             <div class="stack"><button class="btn block ${danger ? 'danger' : 'primary'}" data-ok>${esc(confirm)}</button>
             <button class="btn block ghost" data-cancel>${esc(cancel)}</button></div>`,
      onMount(el, s) {
        $('[data-ok]', el).onclick = () => { result = true; s.close(); };
        $('[data-cancel]', el).onclick = () => s.close();
      },
      onClose: () => resolve(result),
    });
  });
}

/** Button in Ladezustand versetzen, während fn läuft. */
export async function withLoading(btn, fn) {
  const old = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = old; }
}

/** Icons in [data-icon]-Platzhaltern rendern. */
export function hydrateIcons(root = document) {
  $$('[data-icon]', root).forEach((el) => { el.outerHTML = icon(el.dataset.icon); });
}
