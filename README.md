# 🅿️ ParkRadar

**Ordnungsamt gesehen? Ein Tipp, und alle in der Nähe sind gewarnt. Der Parkschein geht direkt über EasyPark.**

Technik: **Supabase** (Datenbank, Login, Live-Updates, Push-Funktion, Zeitsteuerung) · **Vercel** (liefert die App aus) · **GitHub** (Code, automatische Veröffentlichung).

> Die ausführliche Schritt-für-Schritt-Anleitung liegt als eigenes Dokument vor („ParkRadar online bringen“). Hier die Kurzfassung.

## Einrichtung in Kürze

1. **Supabase-Projekt anlegen** (Region Frankfurt), dann im **SQL Editor** den kompletten Inhalt von `supabase/schema.sql` ausführen.
2. **Authentication → Sign In / Providers → Email:** zum Testen „Confirm email“ ausschalten (sonst braucht es einen eigenen E-Mail-Dienst, siehe Anleitung). Unter **URL Configuration** die Vercel-Adresse als Site URL eintragen.
3. **Push-Schlüssel erzeugen:** `npm install` und dann `npm run vapid`. Die Ausgabe sagt, welcher Wert wohin gehört.
4. **Edge Function** `send-push` im Supabase-Dashboard anlegen, Code aus `supabase/functions/send-push/index.ts` einfügen, „Verify JWT“ aus, Secrets setzen.
5. **Code zu GitHub** hochladen (ohne `node_modules` und `.env`).
6. **Vercel:** Repository importieren, Umgebungsvariablen `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `VAPID_PUBLIC_KEY` setzen, **Deploy**.

Danach veröffentlicht jede Änderung auf GitHub die App automatisch neu.

## Befehle

| Befehl | Zweck |
|---|---|
| `npm install` | Abhängigkeiten installieren |
| `npm run vapid` | Push-Schlüssel und Geheimwert erzeugen |
| `npm run dev` | Lokal testen auf http://localhost:3000 (braucht `.env`, siehe `.env.example`) |
| `npm run build` | Baut `public/` (macht Vercel automatisch) |
| `npm test` | Testet `schema.sql` auf einer echten Postgres-Engine (PGlite) |

## Aufbau

```
supabase/schema.sql                   Tabellen, Zugriffsregeln (RLS), Funktionen, Taktgeber (pg_cron), Push-Auslöser (pg_net)
supabase/functions/send-push/index.ts Edge Function: verschickt Web-Push an die Geräte eines Nutzers
public/                               Die App (HTML, CSS, JavaScript ohne Build-Schritt, Karte mit Leaflet)
public/js/sb.js                       Verbindung zu Supabase, Umwandlung der Daten
scripts/build.mjs                     Kopiert Bibliotheken, schreibt public/config.js aus den Umgebungsvariablen
vercel.json                           Build-Einstellungen und Sicherheits-Header für Vercel
test/                                 Tests der Datenbank-Logik
```

**Wie eine Warnung ankommt:** Meldung → Funktion `create_report` findet Autos im Warnradius → Eintrag in `outbox` → (a) Realtime schickt ihn live an die offene App, (b) ein Datenbank-Auslöser ruft per `pg_net` die Edge Function `send-push` auf → Push aufs Handy.

**Taktgeber:** `pg_cron` ruft jede Minute `tick()` auf. Das lässt Meldungen ablaufen (nach 20 Min., jede Bestätigung +15 Min., höchstens 60 Min.), verschickt Parkschein-Erinnerungen 10 Minuten vor Ablauf und räumt abgemeldete Geräte auf.

**Datenschutz im Aufbau:** Meldungen (`reports`) enthalten keinen Nutzerbezug und sind öffentlich lesbar. Wer was gemeldet hat, steht getrennt in `report_authors`, und das darf nur die Person selbst lesen. Alle Schreibzugriffe laufen über geprüfte Funktionen, direkte Tabellenänderungen sind gesperrt.

## EasyPark

EasyPark hat keine öffentliche API zum Starten von Parkvorgängen. ParkRadar öffnet deshalb die EasyPark-App (Android: Paket `net.easypark.android`, iOS: URL-Schema mit App-Store-Fallback). Countdown und Erinnerung in ParkRadar sind eine Komfortfunktion; maßgeblich ist der Status in EasyPark.

## Vor dem Livegang

- [ ] Eigenen E-Mail-Dienst (SMTP, z. B. Resend) in Supabase eintragen und „Confirm email“ wieder einschalten
- [ ] Bezahlte Tarife: Supabase (kostenlose Projekte pausieren nach 7 Tagen wenig Aktivität), Vercel Pro (Hobby ist nur für nicht-kommerzielle Projekte)
- [ ] Datenschutzerklärung und Impressum ausfüllen (`public/js/views/legal.js`)
- [ ] Rechtliche Prüfung (StVO § 23 Abs. 1c, Nennung der Marke EasyPark)
- [ ] Kartenkacheln: Nutzungsbedingungen von CARTO prüfen oder auf einen Anbieter mit Vertrag wechseln
- [ ] Straßennamen: Nominatim erlaubt höchstens 1 Anfrage pro Sekunde über alle Nutzer. Bei vielen Nutzern eigenen Geodienst verwenden (`GEOCODER_URL` setzen und die Domain in `vercel.json` unter `connect-src` ergänzen)
