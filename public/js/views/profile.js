import { state } from '../store.js';
import { loadMe, setParkReminder } from '../actions.js';
import { openAutomationHelp } from './parkprompt.js';
import { openAdmin } from './admin.js';
import { sb, rpc, friendly } from '../sb.js';
import { pushStatus, enablePush, disablePush } from '../push.js';
import { openLegal } from './legal.js';
import { icon, esc, $, $$, openSheet, toast, withLoading, initials } from '../ui.js';

export function openProfile({ onLogout }) {
  const u = state.user;
  openSheet({
    title: '',
    body: `
      <div class="row" style="margin-bottom:16px">
        <div class="avatar lg">${esc(initials(u.name))}</div>
        <div class="grow"><div style="font-size:19px;font-weight:750;letter-spacing:-.02em">${esc(u.name)}</div>
          <div class="small muted">${esc(u.email)}</div></div>
      </div>
      <div class="box ok"><span class="ico">${icon('shield')}</span><div class="grow small" data-stats>${statsHtml(u)}</div></div>
      ${u.isAdmin ? `<button class="list-row" data-admin><span class="ico">${icon('users')}</span><span class="grow"><b style="font-size:14.5px">Zugangsanfragen</b></span>${u.pendingCount ? `<span class="badge" data-pending>${u.pendingCount}</span>` : ''}${icon('chevron', 'sm')}</button>` : ''}

      <div class="list-row"><span class="ico">${icon('bell')}</span>
        <div class="grow"><b style="font-size:14.5px">Hinweise aufs Handy</b><div class="small muted" data-push-text>…</div></div>
        <label class="switch"><input type="checkbox" data-push /><span></span></label></div>
      <div class="list-row"><span class="ico">${icon('ticket')}</span>
        <div class="grow"><b style="font-size:14.5px">Parkschein-Erinnerung</b><div class="small muted">Nach dem Parken: „Parkschein lösen?“</div></div>
        <label class="switch"><input type="checkbox" data-parkrem ${u.parkReminder ? 'checked' : ''} /><span></span></label></div>
      <button class="list-row" data-auto><span class="ico">${icon('car')}</span><span class="grow">Automatisch beim Aussteigen</span>${icon('chevron', 'sm')}</button>
      <button class="list-row" data-legal="terms"><span class="ico">${icon('info')}</span><span class="grow">Nutzungsbedingungen</span>${icon('chevron', 'sm')}</button>
      <button class="list-row" data-legal="privacy"><span class="ico">${icon('shield')}</span><span class="grow">Datenschutz</span>${icon('chevron', 'sm')}</button>
      <button class="list-row" data-legal="imprint"><span class="ico">${icon('file')}</span><span class="grow">Impressum</span>${icon('chevron', 'sm')}</button>
      <button class="list-row" data-export><span class="ico">${icon('download')}</span><span class="grow">Meine Daten exportieren</span>${icon('chevron', 'sm')}</button>
      <button class="list-row" data-logout><span class="ico">${icon('logout')}</span><span class="grow">Abmelden</span>${icon('chevron', 'sm')}</button>
      <button class="list-row danger" data-delete><span class="ico">${icon('trash')}</span><span class="grow">Konto löschen</span>${icon('chevron', 'sm')}</button>`,
    onMount(el, sheet) {
      refreshPush(el);
      $('[data-parkrem]', el).onchange = async (e) => {
        const box = e.currentTarget;
        const on = box.checked;
        try { await setParkReminder(on); toast(on ? 'Parkschein-Erinnerung an.' : 'Parkschein-Erinnerung aus.', { type: 'ok', duration: 2000 }); } catch (err) { box.checked = !on; toast(err.message, { type: 'err' }); }
      };
      $('[data-auto]', el).onclick = () => openAutomationHelp();
      $('[data-admin]', el)?.addEventListener('click', () => openAdmin());
      // Zahlen frisch laden (Bestätigungen kommen laufend dazu)
      loadMe().then((fresh) => { const box = $('[data-stats]', el); if (box) box.innerHTML = statsHtml(fresh); }).catch(() => {});
      $$('[data-legal]', el).forEach((b) => { b.onclick = () => openLegal(b.dataset.legal); });
      $('[data-export]', el).onclick = async () => {
        try {
          const data = await rpc('export_my_data');
          const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
          const a = Object.assign(document.createElement('a'), { href: url, download: 'parkcheck-daten.json' });
          document.body.append(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        } catch (e) { toast(e.message, { type: 'err' }); }
      };
      $('[data-logout]', el).onclick = async () => {
        await disablePush().catch(() => {});
        await sb.auth.signOut().catch(() => {});
        sheet.close();
        onLogout();
      };
      $('[data-delete]', el).onclick = () => openSheet({
        title: 'Konto löschen',
        body: `<p class="muted" style="margin:0 0 14px">Konto, Auto-Standort und Parkschein-Daten werden endgültig gelöscht. Deine Meldungen bleiben ohne Bezug zu dir erhalten.</p>
          <label class="field"><span>Passwort zur Bestätigung</span><input type="password" name="pw" autocomplete="current-password" /></label>
          <button class="btn danger block" data-ok>Endgültig löschen</button>`,
        onMount(el2, s2) {
          $('[data-ok]', el2).onclick = (e) => withLoading(e.currentTarget, async () => {
            try {
              // Passwort zur Sicherheit noch einmal prüfen
              const { error } = await sb.auth.signInWithPassword({ email: state.user.email, password: $('[name=pw]', el2).value });
              if (error) throw new Error(/Invalid login/i.test(error.message) ? 'Passwort ist falsch.' : friendly(error));
              await disablePush().catch(() => {});
              await rpc('delete_my_account');
              await sb.auth.signOut().catch(() => {});
              s2.close(); sheet.close(); toast('Dein Konto wurde gelöscht.'); onLogout();
            } catch (err) { toast(err.message, { type: 'err' }); }
          });
        },
      });
    },
  });
}

function statsHtml(u) {
  return u.stats.confirmed
    ? `<b>Deine Meldungen wurden ${u.stats.confirmed}× bestätigt</b>Danke, dass du andere informierst!`
    : '<b>Danke fürs Mitmachen!</b>Jede Meldung hilft allen im Kiez.';
}

async function refreshPush(el) {
  const box = $('[data-push]', el);
  const text = $('[data-push-text]', el);
  const st = await pushStatus().catch(() => 'unsupported');
  text.textContent = {
    on: 'An – auch wenn die App geschlossen ist',
    off: 'Aus – nur bei geöffneter App',
    denied: 'Im Browser blockiert',
    unsupported: 'Von diesem Browser nicht unterstützt',
    'ios-install': 'iPhone: erst „Zum Home-Bildschirm“ hinzufügen',
  }[st];
  box.checked = st === 'on';
  box.disabled = st === 'denied' || st === 'unsupported' || st === 'ios-install';
  box.onchange = async () => {
    try {
      if (box.checked) { await enablePush(); toast('Hinweise aktiviert.', { type: 'ok' }); } else await disablePush();
    } catch (e) { toast(e.message, { type: 'err', duration: 6000 }); }
    refreshPush(el);
  };
}
