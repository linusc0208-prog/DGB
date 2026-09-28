// Erzeugt die Schlüssel für Push-Nachrichten und einen Geheimwert für die Edge Function.
import crypto from 'node:crypto';
import webpush from 'web-push';

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
const secret = crypto.randomBytes(24).toString('hex');

console.log(`
Deine Push-Schlüssel – kopiere sie jetzt, sie werden nicht gespeichert:

1) Bei VERCEL (Settings → Environment Variables):
   VAPID_PUBLIC_KEY = ${publicKey}

2) Bei SUPABASE (Edge Functions → Secrets):
   VAPID_PUBLIC_KEY    = ${publicKey}
   VAPID_PRIVATE_KEY   = ${privateKey}
   VAPID_SUBJECT       = mailto:deine@email.de
   PUSH_WEBHOOK_SECRET = ${secret}

3) Im SUPABASE SQL Editor (Projekt-ID in der ersten Zeile ersetzen):
   insert into public.app_config (key, value) values
     ('push_url', 'https://DEINE-PROJEKT-ID.supabase.co/functions/v1/send-push'),
     ('push_secret', '${secret}')
   on conflict (key) do update set value = excluded.value;
`);
