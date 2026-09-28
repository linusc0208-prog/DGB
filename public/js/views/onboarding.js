import { prefs } from '../store.js';
import { requestPosition } from '../geo.js';
import { enablePush, pushSupported } from '../push.js';
import { icon, openSheet, $, toast } from '../ui.js';

export function maybeOnboard() {
  if (prefs.get('onboarded', false)) return;
  openSheet({
    title: 'So einfach geht’s',
    body: `
      <div class="onb-row"><span class="ico" style="background:var(--alarm)">${icon('siren')}</span>
        <div><b>Kontrolle gesehen?</b><span>Ein Tipp auf „Melden“ – fertig. Alle in der Nähe sehen es sofort.</span></div></div>
      <div class="onb-row"><span class="ico" style="background:var(--grad)">${icon('car')}</span>
        <div><b>Auto speichern</b><span>Kommt eine Kontrolle in die Nähe deines Autos, bekommst du eine Warnung.</span></div></div>
      <div class="onb-row"><span class="ico" style="background:var(--ep)">${icon('ticket')}</span>
        <div><b>Parkschein in Sekunden</b><span>Direkt aus der Warnung in die EasyPark-App.</span></div></div>
      <p class="hint" style="margin:4px 0 16px">Bitte nie während der Fahrt bedienen – die App pausiert sich dann automatisch.</p>
      <button class="btn primary block" data-allow>${icon('check')} Standort & Warnungen erlauben</button>
      <button class="btn ghost block" data-later style="margin-top:6px">Später</button>`,
    onMount(el, sheet) {
      $('[data-allow]', el).onclick = async () => {
        try { await requestPosition(); } catch (e) { toast(e.message, { type: 'err', duration: 6000 }); }
        if (pushSupported()) { try { await enablePush(); } catch { /* optional */ } }
        sheet.close();
      };
      $('[data-later]', el).onclick = () => sheet.close();
    },
    onClose: () => prefs.set('onboarded', true),
  });
}
