# Neues Projekt aufschalten

Anleitung, um ein neues Bauprojekt auf der Projektplattform live zu schalten.
Dauer: ca. 15 Minuten plus DNS-Wartezeit.

## 1. Projekt im Admin anlegen

1. `https://admin.projektplattform.ch` öffnen und als Plattform-Admin anmelden.
2. **«+ Neues Projekt»**: Name, Projekt-Nr., Slug (Kleinbuchstaben/Ziffern/
   Bindestriche, z.B. `neubau-frauenfeld`) und die künftige **Domain**
   eintragen (z.B. `neubau-frauenfeld.ch`, ohne `www.`).
3. Empfohlen: **«Aus Vorlage duplizieren»** und ein bestehendes Projekt wählen –
   übernimmt Kategorien, Rollen, Sichtbarkeits-Matrix und Branding
   (keine Dokumente, keine Benutzer).
4. Danach im Projekt konfigurieren:
   - **Daten**: Untertitel, Beschrieb, Info-Felder, Hero-Bild.
   - **Branding**: Baumanagement-Firma (Name, Zusatz, Logo), Farben, Schriften –
     die Live-Vorschau zeigt das Ergebnis sofort.
   - **Kategorien**: Kategorien und Feld-Schema anpassen.
   - **Rollen**: Matrix (Sehen/Hochladen) prüfen.
   - **Benutzer**: Projektbeteiligte per E-Mail einladen und Rolle zuweisen.

Das Projekt ist ab jetzt unter `?tenant=<slug>` bzw. lokal unter
`<slug>.localhost:3000` erreichbar – auch ohne eigene Domain.

## 2. Domain beim Registrar auf Vercel zeigen

Beim Registrar der Projekt-Domain (z.B. Hostpoint, Infomaniak) im DNS:

| Typ | Name | Wert |
|---|---|---|
| CNAME | `www` | `cname.vercel-dns.com` |
| A | `@` (Apex) | `76.76.21.21` |

Hinweis: Für die Apex-Domain (`neubau-frauenfeld.ch` ohne `www`) den
A-Record verwenden; falls der Registrar ALIAS/ANAME unterstützt, alternativ
ALIAS auf `cname.vercel-dns.com`.

## 3. Domain im Vercel-Projekt hinzufügen

1. Vercel → Projekt `projektplattform` → **Settings → Domains**.
2. Domain hinzufügen: `neubau-frauenfeld.ch` **und** `www.neubau-frauenfeld.ch`
   (Vercel leitet `www` automatisch auf die Apex-Domain um; die Middleware
   entfernt `www.` zusätzlich selbst).
3. Vercel prüft die DNS-Einträge und stellt automatisch ein
   TLS-Zertifikat aus (wenige Minuten nach DNS-Propagation).

## 4. Kontrolle

- `https://neubau-frauenfeld.ch` zeigt die Landingpage mit dem Projekt-Branding.
- Login mit einem eingeladenen Testbenutzer führt in den Dokumenten-Hub.
- Unbekannte Domains zeigen weiterhin die neutrale Hinweisseite.

Kein Deployment und keine Codeänderung nötig – die Tenant-Middleware erkennt
die Domain über `projects.domain` zur Laufzeit.
