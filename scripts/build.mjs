// Baut die fertige App im Ordner public/:
//  - kopiert Leaflet (Karte) und supabase-js in public/vendor
//  - schreibt public/config.js mit den öffentlichen Zugangsdaten aus den Umgebungsvariablen
// Lokal werden die Werte aus der Datei .env gelesen, bei Vercel aus "Environment Variables".
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PUB = path.join(ROOT, 'public');
try { process.loadEnvFile?.(path.join(ROOT, '.env')); } catch { /* keine .env */ }
const env = process.env;

const url = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '');
const key = (env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY
  || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

// Sicherheitsnetz: der geheime Schlüssel darf niemals im Browser landen
function isSecret(k) {
  if (k.startsWith('sb_secret_')) return true;
  const parts = k.split('.');
  if (parts.length === 3) {
    try { return JSON.parse(Buffer.from(parts[1], 'base64url').toString()).role === 'service_role'; } catch { return false; }
  }
  return false;
}
if (key && isSecret(key)) {
  console.error('\n✖ Du hast den GEHEIMEN Supabase-Schlüssel eingetragen (secret / service_role).');
  console.error('  Nimm stattdessen den "Publishable key" (oder den "anon public" Key).\n');
  process.exit(1);
}

// Fremd-Bibliotheken bereitstellen
const copy = (from, to) => fs.cpSync(path.join(ROOT, from), path.join(PUB, to), { recursive: true });
fs.mkdirSync(path.join(PUB, 'vendor'), { recursive: true });
copy('node_modules/leaflet/dist', 'vendor/leaflet');
copy('node_modules/@supabase/supabase-js/dist/umd/supabase.js', 'vendor/supabase.js');

const config = {
  supabaseUrl: url,
  supabaseKey: key,
  vapidPublicKey: (env.VAPID_PUBLIC_KEY || '').trim(),
  geocoderUrl: env.GEOCODER_URL || 'https://nominatim.openstreetmap.org',
  easyparkAndroidPackage: env.EASYPARK_ANDROID_PACKAGE || undefined,
  easyparkIosScheme: env.EASYPARK_IOS_SCHEME || undefined,
  easyparkIosStore: env.EASYPARK_IOS_STORE || undefined,
};
fs.writeFileSync(path.join(PUB, 'config.js'),
  `// Automatisch erzeugt von scripts/build.mjs – nicht von Hand bearbeiten\nwindow.PARKRADAR_CONFIG = ${JSON.stringify(config, null, 2)};\n`);

const missing = [!url && 'SUPABASE_URL', !key && 'SUPABASE_PUBLISHABLE_KEY', !config.vapidPublicKey && 'VAPID_PUBLIC_KEY'].filter(Boolean);
console.log('✔ ParkRadar gebaut (public/)');
if (missing.length) console.warn(`⚠ Noch nicht gesetzt: ${missing.join(', ')} – siehe Anleitung.`);
