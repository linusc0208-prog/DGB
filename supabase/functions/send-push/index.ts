// ParkCheck – Edge Function "send-push"
// Wird von der Datenbank aufgerufen, sobald eine Benachrichtigung entsteht (Tabelle outbox),
// und schickt sie per Web-Push an alle Geräte des Nutzers.
//
// Benötigte Secrets (Supabase → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (z. B. mailto:du@beispiel.de), PUSH_WEBHOOK_SECRET
// "Verify JWT" für diese Funktion ausschalten – sie prüft stattdessen PUSH_WEBHOOK_SECRET.

import webpush from "npm:web-push@3.6.7";

const PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";
const SECRET = Deno.env.get("PUSH_WEBHOOK_SECRET") ?? "";

if (PUBLIC_KEY && PRIVATE_KEY) webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);

type Sub = { endpoint: string; p256dh: string; auth: string };

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!SECRET || req.headers.get("x-webhook-secret") !== SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!PUBLIC_KEY || !PRIVATE_KEY) {
    return Response.json({ error: "VAPID-Schlüssel fehlen" }, { status: 500 });
  }

  let body: { subscriptions?: Sub[]; payload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Ungültiges JSON" }, { status: 400 });
  }
  const subs = (body.subscriptions ?? []).slice(0, 20);
  const message = JSON.stringify(body.payload ?? {});

  const gone: string[] = [];
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        message,
        { TTL: 600, urgency: "high" },
      );
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) gone.push(s.endpoint);
      else console.error("Push fehlgeschlagen", status ?? (err as Error).message);
    }
  }));

  // "gone" wird von der Datenbank ausgewertet und abgemeldete Geräte entfernt
  return Response.json({ sent, gone });
});
