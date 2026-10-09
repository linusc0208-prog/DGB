// Mitteilungen: Admins schreiben an alle Nutzer (Push + Liste in der App).
import { rpc } from '../sb.js';
import { state, prefs } from '../store.js';
import { icon, esc, $, openSheet, toast, fmtDate, confirmDialog, withLoading } from '../ui.js';

let sheet = null;

const itemHtml = (a, fresh) => `
  <div class="req ${fresh ? 'fresh' : ''}">
    <b>${esc(a.title)}</b>
    <div class="small muted">${fmtDate(Date.parse(a.created_at))} Uhr</div>
    <div class="news-body">${esc(a.body)}</div>
    ${state.user?.isAdmin ? `<div class="row"><button class="btn sm ghost" data-del="${a.id}">${icon('trash', 'sm')} Löschen</button></div>` : ''}
  </div>`;

const markSeen = (list) => { if (list[0]) prefs.set('newsSeen', Math.max(Number(prefs.get('newsSeen', 0)) || 0, list[0].id)); };

/** Alle Mitteilungen (neueste oben); neue sind markiert */
export async function openNews() {
  if (sheet) return;
  const seen = Number(prefs.get('newsSeen', 0)) || 0;
  sheet = openSheet({
    title: 'Mitteilungen',
    body: '<p class="muted">Lade …</p>',
    onMount(el) {
      el.addEventListener('click', async (e) => {
        const del = e.target.closest('[data-del]');
        if (!del) return;
        if (!(await confirmDialog({ title: 'Mitteilung löschen?', text: 'Sie verschwindet für alle aus der Liste. Bereits verschickte Push-Nachrichten bleiben auf den Handys.', confirm: 'Löschen', danger: true }))) return;
        try { await rpc('admin_delete_announcement', { p_id: Number(del.dataset.del) }); del.closest('.req').remove(); toast('Gelöscht.'); } catch (err) { toast(err.message, { type: 'err' }); }
      });
    },
    onClose: () => { sheet = null; },
  });
  try {
    const list = await rpc('announcements_list', { p_limit: 30 });
    sheet?.setBody(list.length ? list.map((a) => itemHtml(a, a.id > seen)).join('') : '<p class="muted" style="margin:4px 0 8px">Noch keine Mitteilungen.</p>');
    markSeen(list);
  } catch (e) {
    sheet?.setBody(`<p class="muted">${esc(e.message)}</p>`);
  }
}

/** Beim Start: verpasste Mitteilungen zeigen (auf einem neuen Gerät nur ab jetzt) */
export async function checkNews() {
  try {
    const list = await rpc('announcements_list', { p_limit: 5 });
    const seen = prefs.get('newsSeen', null);
    if (seen == null) { markSeen(list); if (!list.length) prefs.set('newsSeen', 0); return; }
    if (list.some((a) => a.id > Number(seen))) openNews();
  } catch { /* nicht wichtig */ }
}

/** Neue Mitteilung kommt live an (App offen) */
export function showAnnouncement() {
  openNews();
}

/** Admin: Mitteilung an alle schreiben */
export function openCompose() {
  if (!state.user?.isAdmin) return;
  const n = state.user.memberCount ? Math.max(0, state.user.memberCount - 1) : null;
  openSheet({
    title: 'Mitteilung senden',
    body: `<p class="muted" style="margin:0 0 14px">Geht als Push-Nachricht an alle freigeschalteten Nutzer${n != null ? ` (${n})` : ''} und erscheint in der App unter „Mitteilungen“. Bitte nur Infos zur App, keine Werbung.</p>
      <label class="field"><span>Titel</span><input name="title" maxlength="80" placeholder="z. B. Neue Funktion" /></label>
      <label class="field"><span>Text <small class="muted" data-count>0/1000</small></span><textarea name="body" rows="5" maxlength="1000" placeholder="Was möchtest du allen sagen?"></textarea></label>
      <button class="btn primary block" data-send>${icon('send')} An alle senden</button>`,
    onMount(el, sh) {
      const body = $('[name=body]', el);
      body.addEventListener('input', () => { $('[data-count]', el).textContent = `${body.value.length}/1000`; });
      $('[data-send]', el).onclick = (e) => withLoading(e.currentTarget, async () => {
        const title = $('[name=title]', el).value.trim();
        const text = body.value.trim();
        if (!title || !text) { toast('Bitte Titel und Text eingeben.', { type: 'err' }); return; }
        if (!(await confirmDialog({ title: 'Jetzt an alle senden?', text: `„${title}“ geht sofort an alle freigeschalteten Nutzer.`, confirm: 'Senden' }))) return;
        try {
          const res = await rpc('admin_send_announcement', { p_title: title, p_body: text });
          prefs.set('newsSeen', res.id);
          sh.close();
          toast(`Gesendet an ${res.recipients} ${res.recipients === 1 ? 'Nutzer' : 'Nutzer'}.`, { type: 'ok' });
        } catch (err) { toast(err.message, { type: 'err' }); }
      });
    },
  });
}
