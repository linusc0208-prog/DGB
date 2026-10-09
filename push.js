import { rpc, cfg } from './sb.js';

let registration = null;

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    return registration;
  } catch (e) {
    console.warn('Service Worker nicht registriert:', e);
    return null;
  }
}

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** 'unsupported' | 'ios-install' | 'denied' | 'on' | 'off' */
export async function pushStatus() {
  if (!pushSupported()) return isIOS() && !isStandalone() ? 'ios-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = registration || (await navigator.serviceWorker.getRegistration());
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

export async function enablePush() {
  if (!pushSupported()) throw new Error(isIOS() ? 'Auf dem iPhone: Teilen → „Zum Home-Bildschirm“, dann ParkCheck von dort öffnen.' : 'Dein Browser unterstützt keine Push-Benachrichtigungen.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Benachrichtigungen wurden nicht erlaubt.');
  const reg = registration || (await navigator.serviceWorker.ready);
  if (!cfg.vapidPublicKey) throw new Error('Mitteilungen sind noch nicht eingerichtet: Der Push-Schlüssel (VAPID_PUBLIC_KEY in Vercel) fehlt oder ist fehlerhaft.');
  const key = urlBase64ToUint8Array(cfg.vapidPublicKey);
  if (key.length !== 65 || key[0] !== 4) throw new Error('Der Push-Schlüssel (VAPID_PUBLIC_KEY in Vercel) ist unvollständig. Bitte dort prüfen.');
  let sub = await reg.pushManager.getSubscription();
  // Altes Abo mit anderem Schlüssel (z. B. nach Schlüsselwechsel) ersetzen
  const old = sub?.options?.applicationServerKey;
  if (sub && old && (old.byteLength !== key.length || new Uint8Array(old).some((b, i) => b !== key[i]))) { await sub.unsubscribe().catch(() => {}); sub = null; }
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    } catch (e) {
      if (/applicationServerKey|InvalidAccess/i.test(`${e.name} ${e.message}`)) throw new Error('Der Push-Schlüssel wurde vom Handy abgelehnt. Bitte VAPID_PUBLIC_KEY in Vercel prüfen.');
      throw new Error(`Mitteilungen konnten nicht eingeschaltet werden (${e.message || e.name}).`);
    }
  }
  const json = sub.toJSON();
  await rpc('save_push_subscription', { p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth });
  return true;
}

export async function disablePush() {
  const reg = registration || (await navigator.serviceWorker.getRegistration());
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await rpc('delete_push_subscription', { p_endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
  }
}

/** Lokale Benachrichtigung, wenn der Tab im Hintergrund ist (Fallback ohne Push) */
export async function localNotify(payload) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const reg = registration || (await navigator.serviceWorker?.getRegistration());
  const opts = { body: payload.body, tag: payload.tag, icon: '/icons/icon-192.png', badge: '/icons/badge-72.png', data: { url: payload.url || '/' }, vibrate: [200, 100, 200] };
  if (reg) reg.showNotification(payload.title, opts); else new Notification(payload.title, opts);
}
