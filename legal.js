import { openSheet } from '../ui.js';

const TEXTS = {
  terms: {
    title: 'Nutzungsbedingungen',
    body: `
      <h4>Wofür ParkCheck da ist</h4>
      <p>ParkCheck erinnert dich daran, deinen Parkschein <b>rechtzeitig zu lösen und zu verlängern</b>. Hinweise aus der Community und die Straßen-Info sollen dir helfen, die Parkregeln im Blick zu behalten. ParkCheck ist <b>nicht dafür gedacht, Kontrollen zu umgehen oder Parkgebühren zu vermeiden</b>.</p>
      <h4>Du hältst dich an die Parkregeln</h4>
      <ul>
        <li>Mit der Nutzung verpflichtest du dich, die geltenden <b>Park- und Verkehrsregeln einzuhalten</b> und Parkgebühren zu bezahlen – unabhängig davon, was die App anzeigt.</li>
        <li>Prüfe vor Ort die Beschilderung und den Parkscheinautomaten. Die App ersetzt diesen Blick nicht.</li>
        <li>Keine Meldung in der App heißt nicht, dass Parken ohne Parkschein erlaubt ist oder dass hier keine Tickets vergeben werden.</li>
        <li>Die App darf nicht genutzt werden, um Parkgebühren gezielt zu vermeiden.</li>
      </ul>
      <h4>Sicherheit geht vor</h4>
      <p>Bediene die App <b>niemals während der Fahrt</b>. Das Handy zu bedienen ist Fahrern während der Fahrt nach § 23 Abs. 1a StVO untersagt. Die App erkennt Fahrten und pausiert Melden und Hinweise automatisch.</p>
      <h4>Fair melden</h4>
      <ul>
        <li>Melde nur Tickets, die du selbst gesehen hast – zum Beispiel einen Strafzettel an einem Auto oder ein abgeschlepptes Fahrzeug.</li>
        <li>Keine Angaben zu Personen, Kennzeichen oder Fotos.</li>
        <li>Falschmeldungen werden von anderen markiert und senken deinen Vertrauenswert; wiederholter Missbrauch führt zur Sperre.</li>
      </ul>
      <h4>Ohne Gewähr</h4>
      <p>Meldungen stammen aus der Community und können unvollständig oder falsch sein. Erinnerungen und Countdown sind eine Komfortfunktion; für die Gültigkeit deines Parkscheins bist du selbst verantwortlich.</p>
      <h4>EasyPark</h4>
      <p>Parkvorgänge werden über die EasyPark-App abgewickelt und dort abgerechnet. Es gelten die Bedingungen von EasyPark. ParkCheck öffnet nur die EasyPark-App und zeigt Countdown und Erinnerung als Komfortfunktion – maßgeblich ist der Status in der EasyPark-App.</p>`,
  },
  privacy: {
    title: 'Datenschutz',
    body: `
      <h4>Verantwortlich</h4>
      <p>Linus C.<br>E-Mail: <a href="mailto:linus.c0208@gmail.com">linus.c0208@gmail.com</a></p>
      <h4>Was wir speichern</h4>
      <ul>
        <li><b>Konto:</b> Vorname, E-Mail, Passwort (nur als sicherer Hash), Hinweis-Radius.</li>
        <li><b>Zugangsanfrage:</b> Status der Freigabe und deine optionale Nachricht. Beides sehen nur die Betreiber, die über die Freigabe entscheiden.</li>
        <li><b>Meldungen:</b> Ort, Zeit, Art. Andere sehen nicht, wer gemeldet hat.</li>
        <li><b>Auto-Standort:</b> nur wenn du ihn speicherst, um dich informieren zu können. Nach 24 Stunden wird er für Hinweise nicht mehr genutzt.</li>
        <li><b>Parkschein:</b> nur Start- und Endzeit für Countdown und Erinnerung – kein Kennzeichen, keine Zahlungsdaten.</li>
        <li><b>Push:</b> ein technischer Empfangs-Endpunkt deines Browsers. Darüber bekommst du Hinweise, Erinnerungen und Mitteilungen der Betreiber zur App – keine Werbung. Abschalten jederzeit im Profil.</li>
      </ul>
      <h4>Was wir nicht speichern</h4>
      <p>Deinen laufenden Standort, deine Fahrstrecken und Geschwindigkeiten. Sie werden nur auf deinem Gerät verarbeitet, um die Karte zu zentrieren, Entfernungen zu berechnen und – falls eingeschaltet – das Parken zu erkennen.</p>
      <h4>Automatische Park-Erkennung (nur wenn du sie einschaltest)</h4>
      <p>Ist sie im Profil eingeschaltet, erkennt die App an der Geschwindigkeit auf deinem Gerät, wann du nach einer Fahrt angehalten hast. Nur dieser Haltepunkt wird als dein Parkplatz gespeichert und höchstens 24 Stunden für Hinweise genutzt. Es entsteht kein Bewegungsprofil. Ausschalten jederzeit im Profil; „Ich habe gar nicht geparkt“ löscht den Punkt sofort.</p>
      <h4>Wo die Daten liegen</h4>
      <p>Datenbank und Login laufen bei Supabase, die App selbst wird über Vercel ausgeliefert. Deine Daten werden nicht verkauft und nicht für Werbung genutzt.</p>
      <h4>Karte</h4>
      <p>Die Kartenbilder lädt dein Gerät direkt von OpenFreeMap (Kartendaten © OpenStreetMap-Mitwirkende). Dabei wird – technisch bedingt – die IP-Adresse deines Geräts übermittelt, aber kein Standort und kein Konto.</p>
      <h4>Straßennamen</h4>
      <p>Um den Straßennamen anzuzeigen, fragt dein Gerät beim Geodienst Nominatim der OpenStreetMap Foundation nach. Dabei werden die Koordinate und – technisch bedingt – die IP-Adresse deines Geräts übermittelt.</p>
      <h4>Deine Rechte</h4>
      <p>Im Profil kannst du jederzeit alle Daten exportieren (Art. 20 DSGVO) und dein Konto löschen (Art. 17 DSGVO). Deine Meldungen bleiben danach ohne Bezug zu dir erhalten.</p>`,
  },
  imprint: {
    title: 'Kontakt',
    body: `
      <p>ParkCheck ist ein privates, nicht-kommerzielles Projekt für einen geschlossenen Nutzerkreis. Zugang gibt es nur auf Anfrage und nach Freigabe.</p>
      <h4>Kontakt</h4>
      <p>Linus C.<br>E-Mail: <a href="mailto:linus.c0208@gmail.com">linus.c0208@gmail.com</a></p>
      <p>Fragen, Hinweise auf Fehler oder Wünsche zu deinen Daten gerne per E-Mail.</p>
      <p class="small muted">ParkCheck ist ein unabhängiges Angebot und steht in keiner Verbindung zu Ordnungsbehörden oder zur EasyPark Group. „EasyPark“ ist eine Marke der EasyPark Group.</p>`,
  },
};

export function openLegal(key) {
  const t = TEXTS[key];
  if (!t) return;
  openSheet({ title: t.title, body: `<div class="legal">${t.body}</div>` });
}
