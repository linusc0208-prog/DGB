import { state, subscribe } from '../store.js';
import * as mapx from '../map.js';
import { createReport, setReportKind, undoReport, voteReport } from '../actions.js';
import { isDrivingBlocked, requestPosition } from '../geo.js';
import { icon, esc, html, $, $$, openSheet, toast, haptic, withLoading, KIND, timeAgo, fmtDist, distance } from '../ui.js';
import { openCarSheet } from './car.js';

let busy = false;
let afterTimer = null;

// ================= Melden mit einem Tipp =================
export async function quickReport() {
  if (busy) return;
  if (isDrivingBlocked()) { toast('Während der Fahrt ist Melden pausiert.', { type: 'warn' }); return; }
  const btn = $('#btn-report');
  busy = true;
  btn.classList.add('busy');
  try {
    const pos = state.pos || (await requestPosition());
    const res = await createReport(pos);
    haptic([20, 40, 20]);
    showAfter(res);
  } catch (e) {
    toast(e.message, { type: 'err', duration: 5000 });
  } finally {
    busy = false;
    btn.classList.remove('busy');
  }
}

function closeAfter() {
  clearTimeout(afterTimer);
  const el = $('#after-slot .after');
  if (el) { el.style.transition = 'opacity .2s, transform .2s'; el.style.opacity = '0'; el.style.transform = 'translateY(10px)'; setTimeout(() => el.remove(), 200); }
}

/** Kleine Karte nach dem Melden: Art des Tickets optional wählen oder rückgängig machen */
function showAfter(res) {
  closeAfter();
  const r = res.report;
  if (res.own) { toast('Du hast hier gerade schon gemeldet.', { type: 'info' }); return; }
  const merged = res.merged;
  const duration = merged ? 4000 : 8000;
  const el = html(`
    <div class="after" role="status">
      <div class="head">
        <span class="ok-ico">${icon('check')}</span>
        <div class="grow"><b>${merged ? 'Bestätigt – danke!' : 'Ticket gemeldet'}</b>
          <span class="small muted">${r.street ? `${esc(r.street)} · ` : ''}${merged ? 'war schon gemeldet' : 'Welche Art?'}</span></div>
        ${merged ? '' : '<button class="btn sm ghost undo" data-undo>Rückgängig</button>'}
      </div>
      ${merged ? '' : `<div class="opts">${['foot', 'car', 'tow'].map((k) => `<button class="opt" data-kind="${k}">${icon(KIND[k].icon)}${KIND[k].label}</button>`).join('')}</div>`}
      <div class="bar" style="animation-duration:${duration}ms"></div>
    </div>`);
  $('#after-slot').append(el);
  afterTimer = setTimeout(closeAfter, duration);

  $$('[data-kind]', el).forEach((b) => {
    b.onclick = async () => {
      clearTimeout(afterTimer);
      $$('[data-kind]', el).forEach((x) => x.classList.toggle('on', x === b));
      try {
        await setReportKind(r.id, b.dataset.kind);
        haptic(10);
        setTimeout(closeAfter, 700);
      } catch (e) { toast(e.message, { type: 'err' }); }
    };
  });
  $('[data-undo]', el)?.addEventListener('click', async () => {
    try { await undoReport(r.id); closeAfter(); toast('Meldung zurückgenommen.'); } catch (e) { toast(e.message, { type: 'err' }); }
  });
}

// ================= Details einer Meldung =================
let detail = null;

export function openReportDetail(id) {
  const r0 = state.reports.get(id);
  if (!r0) { toast('Diese Meldung ist nicht mehr aktiv.', { type: 'info' }); return; }
  detail?.close();
  mapx.flyTo(r0, Math.max(mapx.getMap().getZoom(), 16));

  const body = () => {
    const r = state.reports.get(id);
    if (!r) return '<p class="muted" style="margin:0 0 8px">Diese Meldung ist abgelaufen oder wurde als erledigt markiert.</p>';
    const k = KIND[r.kind] || KIND.patrol;
    const d = distance(state.pos, r);
    const meta = [r.street, timeAgo(r.createdAt), d != null ? `${fmtDist(d)} von dir` : null].filter(Boolean).map(esc).join(' · ');
    return `
      <div class="detail-head">
        <span class="kind-ico ${r.kind}">${icon(k.icon, 'lg')}</span>
        <div class="grow"><h4>${esc(r.kind === 'tow' ? 'Abschleppen gemeldet' : r.kind === 'patrol' ? 'Ticket gemeldet' : `Ticket: ${r.kindLabel || k.label}`)}</h4><div class="small muted">${meta}</div></div>
      </div>
      <p class="small" style="margin:-4px 0 12px">Hier wurde ${r.kind === 'tow' ? 'ein Auto abgeschleppt' : 'ein Ticket vergeben'}. <b>Bitte beachte die Parkregeln und prüfe deinen Parkschein.</b></p>
      <div class="box ${r.confirms ? 'ok' : ''}"><span class="ico">${icon(r.confirms ? 'check' : 'info')}</span>
        <div class="grow small">${r.confirms ? `<b>${r.confirms}× bestätigt</b>` : '<b>Noch unbestätigt</b>'}${r.isMine ? 'Deine Meldung' : 'Hast du hier auch einen Strafzettel gesehen?'}</div></div>
      ${r.isMine ? `
        ${r.canEdit ? `<div class="chips" style="margin-bottom:12px">${['patrol', 'foot', 'car', 'tow'].map((x) => `<button class="chip ${r.kind === x ? 'on' : ''}" data-kind="${x}">${KIND[x].label}</button>`).join('')}</div>` : ''}
        <button class="btn outline block" data-vote="gone">${icon('check')} Meldung beenden</button>`
      : `<div class="votes">
          <button class="btn ok ${r.myVote === 'confirm' ? 'voted' : ''}" data-vote="confirm">${icon('check')} Stimmt</button>
          <button class="btn ${r.myVote === 'gone' ? 'voted' : ''}" data-vote="gone">${icon('x')} Falschmeldung</button>
        </div>`}
      <button class="btn ep block" data-park style="margin-top:10px;min-height:54px">${icon('ticket')} Parkschein lösen</button>`;
  };

  const bind = (el) => {
    $$('[data-vote]', el).forEach((b) => {
      b.onclick = () => withLoading(b, async () => {
        try {
          const upd = await voteReport(id, b.dataset.vote);
          haptic(12);
          if (upd.status !== 'active') { toast('Danke! Die Meldung wurde entfernt.'); detail?.close(); } else toast('Danke!');
        } catch (e) { toast(e.message, { type: 'err' }); }
      });
    });
    $$('[data-kind]', el).forEach((b) => { b.onclick = () => setReportKind(id, b.dataset.kind).catch((e) => toast(e.message, { type: 'err' })); });
    $('[data-park]', el).onclick = () => { detail?.close(); openCarSheet({ park: true }); };
  };

  detail = openSheet({ title: '', body: body(), onMount: bind, onClose: () => { unsub(); detail = null; } });
  const unsub = subscribe(() => { if (detail) { detail.setBody(body()); bind(detail.el); } }, ['reports']);
}
