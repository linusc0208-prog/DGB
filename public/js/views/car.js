import { state, setState, subscribe, prefs } from '../store.js';
import { saveCar, removeCar, updateMe, nearestReport, loadProvider, startSession, extendSession, stopSession } from '../actions.js';
import { requestPosition } from '../geo.js';
import * as mapx from '../map.js';
import { icon, esc, $, $$, openSheet, toast, haptic, withLoading, confirmDialog, timeAgo, fmtDist, fmtClock, fmtDuration, distance } from '../ui.js';

const RADII = [150, 300, 500];

// ================= EasyPark öffnen =================
export function platform() {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  return 'desktop';
}

function openEasyPark(links, onDesktopClose) {
  const p = platform();
  if (p === 'android') { window.location.href = links.android; return; }
  if (p === 'ios') {
    const t = Date.now();
    window.location.href = links.ios;
    setTimeout(() => { if (document.visibilityState === 'visible' && Date.now() - t < 3000) window.location.href = links.iosStore; }, 1600);
    return;
  }
  openSheet({
    title: 'EasyPark öffnen',
    body: `<p class="muted" style="margin:0 0 14px">EasyPark ist eine Handy-App. Auf dem Smartphone springst du von hier mit einem Tipp direkt hinein.</p>
      <div class="stack">
        <a class="btn outline block" href="${esc(links.iosStore)}" target="_blank" rel="noopener">EasyPark für iPhone</a>
        <a class="btn outline block" href="${esc(links.androidStore)}" target="_blank" rel="noopener">EasyPark für Android</a>
      </div>`,
    onClose: onDesktopClose,
  });
}

/** Parkschein lösen: direkt in die EasyPark-App, danach fragen wir kurz nach der Dauer. */
export function startParking() {
  const links = state.provider?.links;
  if (!links) { loadProvider().then(startParking).catch((e) => toast(e.message, { type: 'err' })); return; }
  if (!state.car && state.pos) saveCar(state.pos).catch(() => {});
  prefs.set('handoff', Date.now());
  openEasyPark(links, () => promptHandoff(true));
}

/** Nach der Rückkehr: "Parkschein gelöst? Wie lange?" – für Countdown und Erinnerung */
export function promptHandoff(force = false) {
  const t = prefs.get('handoff', 0);
  if (!t || Date.now() - t > 2 * 3600_000) return;
  if (!force && Date.now() - t < 2500) return;
  prefs.set('handoff', 0);
  const options = [[30, '30 Min.'], [60, '1 Std.'], [120, '2 Std.'], [180, '3 Std.'], [240, '4 Std.']];
  openSheet({
    title: 'Parkschein gelöst?',
    body: `<p class="muted" style="margin:0 0 14px">Wie lange läuft er? Wir zeigen dir den Countdown und erinnern dich 10 Minuten vorher.</p>
      <div class="chips" style="margin-bottom:16px">${options.map(([m, l]) => `<button class="chip" data-min="${m}">${l}</button>`).join('')}</div>
      <button class="btn ghost block" data-no>Nein, nicht gelöst</button>`,
    onMount(el, sheet) {
      $$('[data-min]', el).forEach((b) => {
        b.onclick = () => withLoading(b, async () => {
          try {
            const session = await startSession(Number(b.dataset.min));
            haptic([20, 30, 20]);
            sheet.close();
            toast(`Parkschein läuft bis ${fmtClock(session.endsAt)} Uhr. Wir erinnern dich.`, { type: 'ok' });
          } catch (e) { toast(e.message, { type: 'err' }); }
        });
      });
      $('[data-no]', el).onclick = () => sheet.close();
    },
  });
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(() => promptHandoff(), 300); });

// ================= Auto-Sheet =================
let sheet = null;

function sessionHtml(s) {
  const left = s.endsAt - Date.now();
  return `<div class="session ${left < 10 * 60_000 ? 'warn' : ''}">
    <div class="row" style="margin-bottom:6px">${icon('ticket')}<b class="grow">Parkschein läuft</b><span class="small" style="opacity:.85">bis ${fmtClock(s.endsAt)} Uhr</span></div>
    <div class="big" data-left>${fmtDuration(left)}</div>
    <div class="row" style="gap:8px;margin-top:12px">
      <button class="btn sm grow" data-extend>+30 Min.</button>
      <button class="btn sm grow" data-stop>Beenden</button>
    </div>
    <button class="btn sm white block" data-open style="margin-top:8px">${icon('external', 'sm')} In EasyPark öffnen</button>
  </div>`;
}

function body() {
  const car = state.car;
  const radius = state.user?.alertRadius || 300;
  const s = state.session;
  const parkBtn = `<button class="btn ep block" data-park style="min-height:56px;font-size:16px">${icon('ticket')} Parkschein lösen</button><p class="hint" style="text-align:center;margin:6px 0 0">öffnet die EasyPark-App</p>`;
  const radiusSeg = `<div class="label">Warnen im Umkreis von</div>
    <div class="seg">${RADII.map((r) => `<button data-radius="${r}" class="${r === radius ? 'on' : ''}">${r} m</button>`).join('')}</div>`;

  if (!car) {
    return `
      <p class="muted" style="margin:0 0 16px">Speichere, wo du parkst – wir warnen dich, sobald eine Kontrolle in die Nähe kommt.</p>
      <button class="btn primary block" data-here style="min-height:56px;font-size:16px">${icon('pin')} Hier geparkt</button>
      ${s ? `<div style="margin-top:12px">${sessionHtml(s)}</div>` : `<div style="margin-top:10px">${parkBtn}</div>`}
      ${radiusSeg}`;
  }
  const near = nearestReport(car, radius);
  const d = state.pos ? distance(state.pos, car) : null;
  return `
    <div class="row" style="margin-bottom:14px">
      <div class="grow"><b style="font-size:19px;letter-spacing:-.02em">${esc(car.street || 'Dein Parkplatz')}</b>
        <div class="small muted">Geparkt ${timeAgo(car.parkedAt)}${d != null ? ` · ${fmtDist(d)} von dir` : ''}</div></div>
      <button class="btn sm outline" data-show>${icon('map', 'sm')}</button>
    </div>
    ${near
      ? `<div class="box alert"><span class="ico">${icon('siren')}</span><div class="grow"><b>${esc(near.kindLabel)} ${fmtDist(near.d)} entfernt</b><span class="small muted">${esc(near.street || '')}${near.street ? ' · ' : ''}${timeAgo(near.createdAt)}</span></div></div>`
      : `<div class="box ok"><span class="ico">${icon('check')}</span><div class="grow"><b>Alles ruhig</b><span class="small muted">Keine Meldung im Umkreis von ${radius} m</span></div></div>`}
    ${s ? sessionHtml(s) : parkBtn}
    ${radiusSeg}
    <p class="hint" style="margin:12px 2px 0">Standort nicht ganz richtig? Verschiebe das Auto-Symbol auf der Karte.</p>
    <button class="btn ghost block" data-remove style="margin-top:8px;color:var(--muted)">Weggefahren – Auto entfernen</button>`;
}

function bind(el) {
  $('[data-park]', el)?.addEventListener('click', () => { sheet?.close(); startParking(); });
  $('[data-here]', el)?.addEventListener('click', (e) => withLoading(e.currentTarget, async () => {
    try {
      const pos = state.pos || (await requestPosition());
      await saveCar(pos);
      haptic(15);
      toast('Gespeichert. Wir warnen dich, wenn es eng wird.', { type: 'ok' });
    } catch (err) { toast(err.message, { type: 'err' }); }
  }));
  $('[data-show]', el)?.addEventListener('click', () => { sheet?.close(); mapx.flyTo(state.car, 17); });
  $('[data-remove]', el)?.addEventListener('click', async () => {
    if (!(await confirmDialog({ title: 'Auto entfernen?', text: 'Du bekommst dann keine Warnungen mehr für diesen Parkplatz.', confirm: 'Entfernen' }))) return;
    await removeCar().catch((e) => toast(e.message, { type: 'err' }));
  });
  $$('[data-radius]', el).forEach((b) => {
    b.onclick = () => updateMe({ alertRadius: Number(b.dataset.radius) }).catch((e) => toast(e.message, { type: 'err' }));
  });
  $('[data-extend]', el)?.addEventListener('click', (e) => withLoading(e.currentTarget, async () => {
    try {
      await extendSession(30);
      toast('+30 Min. vermerkt – bitte auch in EasyPark verlängern.', { type: 'info', duration: 4500 });
      setTimeout(() => openEasyPark(state.provider.links), 600);
    } catch (err) { toast(err.message, { type: 'err' }); }
  }));
  $('[data-open]', el)?.addEventListener('click', () => openEasyPark(state.provider.links));
  $('[data-stop]', el)?.addEventListener('click', async () => {
    if (!(await confirmDialog({ title: 'Parken beenden?', text: 'Beende den Parkvorgang auch in EasyPark, damit dort nicht weiter abgerechnet wird. Wir öffnen die App gleich für dich.', confirm: 'Beenden & EasyPark öffnen' }))) return;
    try {
      await stopSession();
      openEasyPark(state.provider.links);
    } catch (err) { toast(err.message, { type: 'err' }); }
  });
}

export function openCarSheet({ park = false } = {}) {
  if (park && !state.session) { startParking(); return; }
  sheet?.close();
  sheet = openSheet({
    title: 'Mein Auto',
    body: body(),
    onMount: bind,
    onClose: () => { unsub(); sheet = null; },
  });
  const unsub = subscribe(() => { if (sheet) { sheet.setBody(body()); bind(sheet.el); } }, ['car', 'session', 'user', 'reports']);
}

// Countdown jede Sekunde
setInterval(() => {
  const s = state.session;
  if (!s) return;
  const left = s.endsAt - Date.now();
  if (left <= 0) { setState({ session: null }); return; }
  $$('[data-left]').forEach((el) => { el.textContent = fmtDuration(left); });
}, 1000);
