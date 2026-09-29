// Beim Abstellen des Autos: Hinweis "Parkschein lösen?"
// Kommt (1) direkt nach "Hier geparkt", (2) wenn die App ein Fahrt-Ende erkennt,
// (3) über den Link /?parked=1 (z. B. aus einer Kurzbefehl-Automation) und
// (4) als Push 3 Minuten nach dem Abstellen, falls noch kein Parkschein läuft (macht der Server).
import { state, prefs } from '../store.js';
import { saveCar, dismissParkPrompt } from '../actions.js';
import { goodPosition } from '../geo.js';
import { icon, esc, $, openSheet, toast, haptic, withLoading, distance } from '../ui.js';
import { startParking, promptHandoff } from './car.js';
import { currentStreet } from './street.js';

let open = null;
let lastShown = 0;

/** "Parkschein gecheckt?" – optional mit Zahl der gemeldeten Tickets in der Straße */
export function showParkPrompt({ street = state.car?.street, count = null } = {}) {
  if (state.session) return; // Parkschein läuft schon
  if (open || Date.now() - lastShown < 60_000) return; // nicht doppelt (Realtime + Push)
  lastShown = Date.now();
  const cs = currentStreet();
  if (count == null && street && cs?.street?.toLowerCase() === street.toLowerCase()) count = cs.stats?.month ?? null;
  haptic([15, 40, 15]);
  const info = count > 0 && street
    ? `<div class="box alert" style="margin-bottom:14px"><span class="ico">${icon('slip')}</span><div class="grow small"><b>${count} ${count === 1 ? 'Ticket' : 'Tickets'} in 30 Tagen</b>in dieser Straße gemeldet</div></div>`
    : '';
  open = openSheet({
    title: 'Parkschein gecheckt?',
    body: `<p class="muted" style="margin:0 0 14px">Du hast gerade geparkt${street ? ` – <b>${esc(street)}</b>` : ''}. Prüfe kurz: <b>Brauchst du hier einen Parkschein, und hast du ihn schon gelöst?</b> Achte auf Schilder und Parkscheinautomaten.</p>
      ${info}
      <button class="btn ep block" data-park style="min-height:56px;font-size:16px">${icon('ticket')} Parkschein über EasyPark lösen</button>
      <div class="row" style="gap:8px;margin-top:8px">
        <button class="btn outline grow" data-have>${icon('check', 'sm')} Schon gelöst</button>
        <button class="btn ghost grow" data-skip>Hier nicht nötig</button>
      </div>`,
    onMount(el, sheet) {
      $('[data-park]', el).onclick = () => { sheet.close(); startParking(); };
      // Schon gelöst: keine Erinnerung mehr, auf Wunsch Countdown + Erinnerung vor Ablauf
      $('[data-have]', el).onclick = () => { dismissParkPrompt(); sheet.close(); prefs.set('handoff', Date.now()); setTimeout(() => promptHandoff(true), 250); };
      $('[data-skip]', el).onclick = () => { dismissParkPrompt(); sheet.close(); toast('Okay – für diesen Parkplatz keine Erinnerung mehr.', { duration: 2500 }); };
    },
    onClose: () => { open = null; },
  });
}

/** Auto an der aktuellen Position speichern und danach an den Parkschein erinnern */
export async function parkHere({ quiet = false } = {}) {
  try {
    if (!quiet) toast('Parkplatz wird gespeichert …', { duration: 2000 });
    const pos = await goodPosition();
    const car = await saveCar(pos);
    haptic(15);
    showParkPrompt({ street: car.street });
  } catch (e) {
    toast(e.message, { type: 'err', duration: 5000 });
  }
}

/** Fahrt-Ende erkannt, während die App offen ist: "Geparkt?" */
export function askParked() {
  if (state.session || open) return;
  const car = state.car;
  if (car && state.pos && distance(car, state.pos) < 100 && Date.now() - car.parkedAt < 30 * 60_000) return;
  open = openSheet({
    title: 'Geparkt?',
    body: `<p class="muted" style="margin:0 0 14px">Sieht so aus, als hättest du gerade angehalten. Soll ich dein Auto hier speichern?</p>
      <button class="btn primary block" data-here style="min-height:56px;font-size:16px">${icon('pin')} Ja, hier geparkt</button>
      <button class="btn ghost block" data-no style="margin-top:6px">Nein</button>`,
    onMount(el, sheet) {
      $('[data-here]', el).onclick = (e) => withLoading(e.currentTarget, async () => {
        sheet.close();
        open = null;
        await parkHere({ quiet: true });
      });
      $('[data-no]', el).onclick = () => sheet.close();
    },
    onClose: () => { open = null; },
  });
}

/** Anleitung: App automatisch öffnen, wenn sich das Handy vom Auto trennt */
export function openAutomationHelp() {
  const link = `${location.origin}/?parked=1`;
  openSheet({
    title: 'Automatisch beim Aussteigen',
    body: `<p class="muted" style="margin:0 0 12px">Dein Handy kann die App von selbst öffnen, sobald es sich vom Auto trennt (Bluetooth oder CarPlay). Dann wird dein Parkplatz gespeichert und du wirst an den Parkschein erinnert.</p>
      <div class="box" style="margin-bottom:14px"><div class="grow small" style="word-break:break-all"><b>Dein Link</b>${esc(link)}</div>
        <button class="btn sm outline" data-copy>${icon('copy', 'sm')} Kopieren</button></div>
      <h4 style="margin:0 0 6px">iPhone</h4>
      <ol style="margin:0 0 14px;padding-left:20px;line-height:1.5">
        <li>App <b>Kurzbefehle</b> öffnen → <b>Automation</b> → <b>Neue Automation</b>.</li>
        <li><b>CarPlay</b> (oder <b>Bluetooth</b> → dein Auto) wählen, dann <b>„Trennt“</b>.</li>
        <li><b>Sofort ausführen</b> wählen und einen neuen leeren Kurzbefehl anlegen.</li>
        <li>Aktion <b>„URL öffnen“</b> hinzufügen und den Link von oben einfügen.</li>
      </ol>
      <p class="small muted" style="margin:-6px 0 14px">Das öffnet die Seite in Safari. Melde dich dort einmal an und erlaube den Standort.</p>
      <h4 style="margin:0 0 6px">Android</h4>
      <p class="small" style="margin:0 0 4px">Mit einer Automatisierungs-App wie <b>MacroDroid</b>: Auslöser <b>„Bluetooth getrennt“</b> (dein Auto), Aktion <b>„Website öffnen“</b> mit dem Link von oben.</p>`,
    onMount(el) {
      $('[data-copy]', el).onclick = async () => {
        try { await navigator.clipboard.writeText(link); toast('Link kopiert.', { type: 'ok', duration: 2000 }); } catch { toast(link, { duration: 8000 }); }
      };
    },
  });
}
