// Warten auf Freigabe: Wer sich registriert hat, kommt erst nach Annahme durch einen Admin in die App.
import { rpc, sb } from '../sb.js';
import { loadMe } from '../actions.js';
import { pushSupported, pushStatus, enablePush } from '../push.js';
import { icon, esc, $, toast, withLoading, confirmDialog } from '../ui.js';

let active = null; // { stop }

export function hidePending() {
  active?.stop();
  active = null;
}

/** Bildschirm "Anfrage gesendet" bzw. "Leider kein Zugang" zeigen, bis freigeschaltet */
export function showPending(user, { onApproved, onLogout }) {
  hidePending();
  $('#auth').classList.add('hidden');
  $('#app').classList.add('hidden');
  const root = $('#pending');
  root.classList.remove('hidden');
  let current = user;

  const check = async (manual = false) => {
    try {
      const u = await loadMe();
      if (u.access === 'approved') {
        hidePending();
        toast('Du bist freigeschaltet – willkommen!', { type: 'ok' });
        onApproved();
        return;
      }
      if (u.access !== current.access) { current = u; render(); }
      else if (manual) toast('Noch nicht freigeschaltet – wir sagen dir Bescheid.', { duration: 3000 });
    } catch (e) {
      if (manual) toast(e.message, { type: 'err' });
    }
  };
  const onVisible = () => { if (document.visibilityState === 'visible') check(); };
  const onPush = () => check();
  const timer = setInterval(check, 15_000);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pc:access', onPush);
  active = {
    stop() {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pc:access', onPush);
      root.classList.add('hidden');
    },
  };

  const logout = async () => {
    hidePending();
    await sb.auth.signOut().catch(() => {});
    onLogout();
  };

  async function render() {
    const body = $('#pending-body');
    const u = current;
    if (u.access === 'rejected') {
      body.innerHTML = `
        <h1>Leider <em>kein Zugang.</em></h1>
        <p class="lead">Deine Anfrage wurde nicht angenommen. Wenn du Fragen hast, melde dich beim Betreiber.</p>
        <div class="auth-box">
          <button class="btn outline block" data-logout>Abmelden</button>
          <button class="btn ghost block" data-delete style="margin-top:8px;color:var(--muted)">Konto löschen</button>
        </div>`;
    } else {
      const canPush = pushSupported() && (await pushStatus().catch(() => 'unsupported')) === 'off';
      body.innerHTML = `
        <h1>Anfrage <em>gesendet.</em></h1>
        <p class="lead">Danke${u.name ? `, ${esc(u.name)}` : ''}! ParkCheck ist gerade nur mit Freigabe nutzbar. Sobald deine Anfrage angenommen ist, kannst du loslegen.</p>
        <div class="auth-box">
          <label class="field"><span>Nachricht an uns (optional)</span>
            <textarea name="note" rows="3" maxlength="300" placeholder="Zum Beispiel, wer du bist oder woher du die App kennst">${esc(u.accessNote)}</textarea></label>
          <button class="btn outline block" data-note>Nachricht speichern</button>
          ${canPush ? `<button class="btn primary block" data-push style="margin-top:10px">${icon('bell')} Benachrichtigen, wenn freigeschaltet</button>` : ''}
          <button class="btn ghost block" data-check style="margin-top:8px">${icon('refresh', 'sm')} Status prüfen</button>
          <button class="btn ghost block" data-logout style="margin-top:2px;color:var(--muted)">Abmelden</button>
        </div>`;
    }
    $('[data-logout]', body).onclick = logout;
    $('[data-check]', body)?.addEventListener('click', (e) => withLoading(e.currentTarget, () => check(true)));
    $('[data-note]', body)?.addEventListener('click', (e) => withLoading(e.currentTarget, async () => {
      try {
        await rpc('set_access_note', { p_note: $('[name=note]', body).value });
        toast('Nachricht gespeichert.', { type: 'ok', duration: 2000 });
      } catch (err) { toast(err.message, { type: 'err' }); }
    }));
    $('[data-push]', body)?.addEventListener('click', (e) => withLoading(e.currentTarget, async () => {
      try {
        await enablePush();
        toast('Alles klar – du bekommst eine Nachricht, sobald du freigeschaltet bist.', { type: 'ok' });
        render();
      } catch (err) { toast(err.message, { type: 'err', duration: 6000 }); }
    }));
    $('[data-delete]', body)?.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: 'Konto löschen?', text: 'Dein Konto und deine Anfrage werden endgültig gelöscht.', confirm: 'Löschen', danger: true }))) return;
      try { await rpc('delete_my_account'); toast('Dein Konto wurde gelöscht.'); await logout(); } catch (err) { toast(err.message, { type: 'err' }); }
    });
  }
  render();
}
