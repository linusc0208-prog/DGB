import { prefs } from '../store.js';
import { requestPosition } from '../geo.js';
import { enablePush, pushSupported } from '../push.js';
import { icon, openSheet, $, toast } from '../ui.js';

export function maybeOnboard() {
  if (prefs.get('onboarded', false)) return;
  openSheet({
    title: 'So einfach geht’s',
    body: `
      <div class="onb-row"><span class="ico" style="background:var(--grad)">${icon('car')}</span>
        <div><b>Parkschein gecheckt?</b><span>Sobald du parkst, erinnern wir dich, deinen Parkschein zu prüfen und zu lösen.</span></div></div>
      <div class="onb-row"><span class="ico" style="background:var(--ep)">${icon('timer')}</span>
        <div><b>Nie wieder abgelaufen</b><span>Countdown und Erinnerung 10 Minuten vor Ablauf – verlängern mit einem Tipp in EasyPark.</span></div></div>
      <div class="onb-row"><span class="ico" style="background:var(--alarm)">${icon('slip')}</span>
        <div><b>Gemeinsam dran denken</b><span>Siehst du einen Strafzettel, tippe auf „Ticket melden“. Andere in der Nähe prüfen dann ihren Parkschein.</span></div></div>
      <p class="hint" style="margin:4px 0 16px">Bitte nie während der Fahrt bedienen – die App pausiert sich dann automatisch.</p>
      <button class="btn primary block" data-allow>${icon('check')} Standort & Hinweise erlauben</button>
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
