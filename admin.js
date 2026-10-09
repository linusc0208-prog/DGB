// Zugangsanfragen verwalten (nur für Admins): annehmen, ablehnen, wieder sperren.
import { rpc } from '../sb.js';
import { loadMe } from '../actions.js';
import { state } from '../store.js';
import { icon, esc, $, openSheet, toast, fmtDate } from '../ui.js';

const TABS = [['pending', 'Offen'], ['approved', 'Freigegeben'], ['rejected', 'Abgelehnt']];
let sheet = null;

export function openAdmin() {
  if (!state.user?.isAdmin) return;
  sheet?.close();
  let filter = 'pending';
  let list = null;

  const row = (u) => {
    const actions = u.is_admin ? '<span class="small muted">Admin</span>'
      : filter === 'pending'
        ? `<button class="btn sm primary grow" data-set="approved" data-id="${u.id}">${icon('check', 'sm')} Annehmen</button>
           <button class="btn sm outline grow" data-set="rejected" data-id="${u.id}">${icon('x', 'sm')} Ablehnen</button>`
        : filter === 'approved'
          ? `<button class="btn sm outline grow" data-set="rejected" data-id="${u.id}">Zugang entziehen</button>`
          : `<button class="btn sm primary grow" data-set="approved" data-id="${u.id}">Doch annehmen</button>`;
    return `<div class="req">
      <b>${esc(u.name || 'Ohne Namen')}</b>
      <div class="small muted">${esc(u.email || '')} · ${filter === 'pending' ? 'angefragt' : 'geändert'} ${fmtDate(Date.parse(u.changed_at || u.created_at))}</div>
      ${u.note ? `<div class="note">${esc(u.note)}</div>` : ''}
      <div class="row">${actions}</div>
    </div>`;
  };

  const body = () => `
    <div class="seg" style="margin-bottom:14px">${TABS.map(([k, l]) => `<button data-tab="${k}" class="${k === filter ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${list == null ? '<p class="muted">Lade …</p>'
      : list.length ? list.map(row).join('')
        : `<p class="muted" style="margin:4px 0 8px">${filter === 'pending' ? 'Keine offenen Anfragen.' : 'Niemand in dieser Liste.'}</p>`}`;

  const load = async () => {
    try { list = await rpc('admin_list_users', { p_filter: filter }); } catch (e) { list = []; toast(e.message, { type: 'err' }); }
    sheet?.setBody(body());
  };

  sheet = openSheet({
    title: 'Zugangsanfragen',
    body: body(),
    onMount(el) {
      el.addEventListener('click', async (e) => {
        const tab = e.target.closest('[data-tab]');
        if (tab) { filter = tab.dataset.tab; list = null; sheet.setBody(body()); load(); return; }
        const btn = e.target.closest('[data-set]');
        if (!btn) return;
        btn.disabled = true;
        try {
          await rpc('admin_set_access', { p_user: btn.dataset.id, p_access: btn.dataset.set });
          toast(btn.dataset.set === 'approved' ? 'Angenommen – die Person bekommt eine Nachricht.' : 'Erledigt.', { type: 'ok', duration: 2500 });
          loadMe().catch(() => {});
          load();
        } catch (err) { btn.disabled = false; toast(err.message, { type: 'err' }); }
      });
    },
    onClose: () => { sheet = null; },
  });
  load();
}
