// Anmeldung, Registrierung, Passwort vergessen – über Supabase Auth.
import { sb, friendly } from '../sb.js';
import { icon, esc, $, $$, openSheet, toast, withLoading } from '../ui.js';
import { openLegal } from './legal.js';

const redirectTo = () => `${location.origin}/`;
let resetMode = () => {};

export function initAuth(onLoggedIn) {
  const root = $('#auth');
  const form = $('#auth-form');
  const err = $('#auth-error');
  const info = $('#auth-info');
  const submit = $('#auth-submit');
  const pw = $('[name=password]', form);
  const toggle = $('#pw-toggle');
  let mode = 'login';

  toggle.innerHTML = icon('eye');
  toggle.onclick = () => {
    const show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    toggle.innerHTML = icon(show ? 'eyeOff' : 'eye');
  };

  const setMode = (m) => {
    mode = m;
    $$('[data-auth-mode]', root).forEach((b) => b.classList.toggle('on', b.dataset.authMode === m));
    $$('.register-only', root).forEach((el) => el.classList.toggle('hidden', m !== 'register'));
    $$('.login-only', root).forEach((el) => el.classList.toggle('hidden', m !== 'login'));
    submit.textContent = m === 'login' ? 'Anmelden' : 'Anfrage senden';
    pw.autocomplete = m === 'login' ? 'current-password' : 'new-password';
    err.textContent = '';
    info.classList.add('hidden');
  };
  $$('[data-auth-mode]', root).forEach((b) => { b.onclick = () => setMode(b.dataset.authMode); });
  resetMode = () => setMode('login');
  $$('[data-legal]', root).forEach((a) => { a.onclick = (e) => { e.preventDefault(); openLegal(a.dataset.legal); }; });
  $('#forgot-btn').onclick = () => openForgot($('[name=email]', form).value.trim());

  form.onsubmit = async (e) => {
    e.preventDefault();
    err.textContent = '';
    info.classList.add('hidden');
    const fd = new FormData(form);
    const email = String(fd.get('email') || '').trim();
    const password = String(fd.get('password') || '');
    const name = String(fd.get('name') || '').trim();
    if (!email || !password) { err.textContent = 'Bitte E-Mail und Passwort eingeben.'; return; }
    if (mode === 'register') {
      if (name.length < 2) { err.textContent = 'Bitte gib deinen Vornamen ein.'; return; }
      if (password.length < 8) { err.textContent = 'Das Passwort braucht mindestens 8 Zeichen.'; return; }
      if (fd.get('acceptTerms') !== 'on') { err.textContent = 'Bitte akzeptiere die Nutzungsbedingungen.'; return; }
    }

    submit.disabled = true;
    const label = submit.textContent;
    submit.innerHTML = '<span class="spinner"></span>';
    try {
      if (mode === 'login') {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        form.reset();
        onLoggedIn(data.session.user);
      } else {
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: { data: { name, accepted_terms_at: new Date().toISOString() }, emailRedirectTo: redirectTo() },
        });
        if (error) throw error;
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          throw new Error('User already registered');
        }
        form.reset();
        if (data.session) {
          onLoggedIn(data.session.user, true);
        } else {
          // E-Mail-Bestätigung ist in Supabase aktiv
          info.innerHTML = `${icon('check')}<div><b>Fast geschafft!</b> Wir haben dir eine E-Mail an <b>${esc(email)}</b> geschickt. Tippe auf den Link darin. Danach prüfen wir deine Anfrage und schalten dich frei.</div>`;
          info.classList.remove('hidden');
          setMode('login');
          info.classList.remove('hidden');
        }
      }
    } catch (ex) {
      err.textContent = friendly(ex);
    } finally {
      submit.disabled = false;
      submit.textContent = label;
    }
  };
}

function openForgot(prefill = '') {
  openSheet({
    title: 'Passwort vergessen?',
    body: `<p class="muted" style="margin:0 0 14px">Gib deine E-Mail-Adresse ein. Wir schicken dir einen Link, mit dem du ein neues Passwort festlegst.</p>
      <label class="field"><span>E-Mail</span><input name="email" type="email" inputmode="email" autocomplete="email" value="${esc(prefill)}" /></label>
      <button class="btn primary block" data-ok>Link senden</button>`,
    onMount(el, sheet) {
      $('[data-ok]', el).onclick = (e) => withLoading(e.currentTarget, async () => {
        const email = $('[name=email]', el).value.trim();
        if (!email) { toast('Bitte E-Mail eingeben.', { type: 'err' }); return; }
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() });
        if (error) { toast(friendly(error), { type: 'err' }); return; }
        sheet.close();
        toast('Falls es ein Konto gibt, ist die E-Mail unterwegs.', { type: 'ok', duration: 6000 });
      });
    },
  });
}

/** Nach Klick auf den Link aus der "Passwort vergessen"-E-Mail */
export function openNewPassword() {
  openSheet({
    title: 'Neues Passwort',
    dismissible: false,
    body: `<label class="field"><span>Neues Passwort</span><input name="pw" type="password" autocomplete="new-password" placeholder="Mindestens 8 Zeichen" /></label>
      <button class="btn primary block" data-ok>Speichern</button>`,
    onMount(el, sheet) {
      $('[data-ok]', el).onclick = (e) => withLoading(e.currentTarget, async () => {
        const password = $('[name=pw]', el).value;
        if (password.length < 8) { toast('Mindestens 8 Zeichen.', { type: 'err' }); return; }
        const { error } = await sb.auth.updateUser({ password });
        if (error) { toast(friendly(error), { type: 'err' }); return; }
        sheet.close();
        toast('Neues Passwort gespeichert.', { type: 'ok' });
      });
    },
  });
}

export function showAuth() {
  resetMode();
  $('#app').classList.add('hidden');
  $('#auth').classList.remove('hidden');
}
