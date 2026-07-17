# Supabase-Mailvorlagen (token_hash-Flow über /auth/confirm)

Einzutragen im Supabase-Dashboard → **Authentication → Emails → Templates**.
Diese Datei ist die Referenz – bei Änderungen im Dashboard bitte hier
nachführen, damit nichts verloren geht.

Voraussetzung: **Site URL** = `https://bauinnovation-mcdonalds-wattwil.ch`
(siehe GO-LIVE-WATTWIL.md, Schritt 3).

---

## Metadaten der Einladung

Die Benutzerverwaltung im Admin übergibt beim Invite
(`inviteUserByEmail` bzw. `generateLink`, siehe
`features/admin/actions.ts`) ein `data`-Objekt, das in den Vorlagen als
`{{ .Data.… }}` verfügbar ist und als `user_metadata` am Konto gespeichert
wird:

| Feld | Inhalt | Beispiel |
|---|---|---|
| `project_name` | Projektname | «McDonald's Neubau Wattwil» |
| `management_name` | Baumanagement-Firma aus dem Branding | «Bau Innovation GmbH» |
| `project_domain` | Projekt-Domain (leer, wenn keine hinterlegt) | `bauinnovation-mcdonalds-wattwil.ch` |

Alle Vorlagen haben Fallbacks für fehlende Felder (ältere Konten bzw.
Einladungen von vor dieser Änderung).

**Re-Invite-Verhalten** (per API-Test verifiziert):

- **Unbestätigtes Konto** (Einladung noch nicht angenommen): Supabase
  verschickt die Einladungsmail erneut – Meldung «Einladung erstellt.».
- **Bestätigtes Konto** (Benutzer hat bereits ein Passwort, z.B. Mitglied
  eines anderen Projekts): Supabase verschickt **keine** Mail
  (`email_exists`); der Benutzer wird nur dem Projekt hinzugefügt. Das
  Admin-UI meldet das explizit («Benutzer existierte bereits und wurde dem
  Projekt hinzugefügt – keine Einladungsmail versendet.»). Eine zusätzliche
  Hinweis-Mail (z.B. via Resend) wäre ein späterer Ausbau, sobald ein
  transaktionaler Mail-Provider eingerichtet ist.

---

## Vorlage «Invite user»

**Subject:**

```
{{ if .Data.project_name }}Einladung zum Projekt {{ .Data.project_name }}{{ else }}Einladung zur Projektplattform{{ end }}
```

**Message body (HTML):**

```html
<div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; color: #2b2b2b;">
  <h2 style="text-transform: uppercase; letter-spacing: 0.05em; font-size: 18px; border-bottom: 1px solid #e5e5e5; padding-bottom: 12px;">
    {{ if .Data.project_name }}Einladung · {{ .Data.project_name }}{{ else }}Einladung zur Projektplattform{{ end }}
  </h2>
  <p>Guten Tag</p>
  <p>
    {{ if .Data.project_name }}
      Sie wurden{{ if .Data.management_name }} von <strong>{{ .Data.management_name }}</strong>{{ end }}
      zum Bauprojekt <strong>{{ .Data.project_name }}</strong> eingeladen
      (Konto: {{ .Email }}).
    {{ else }}
      Sie wurden mit der Adresse <strong>{{ .Email }}</strong> zur
      Projektplattform eingeladen.
    {{ end }}
    Klicken Sie auf die Schaltfläche, um Ihr Passwort zu setzen und Zugang
    zu den Projektdokumenten zu erhalten:
  </p>
  <p style="margin: 24px 0;">
    <a href="{{ if .Data.project_domain }}https://{{ .Data.project_domain }}{{ else }}{{ .SiteURL }}{{ end }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/passwort-neu"
       style="background-color: #70ad47; color: #ffffff; padding: 10px 20px; text-decoration: none; font-weight: bold;">
      Einladung annehmen
    </a>
  </p>
  <p style="font-size: 13px; color: #7c7c7c;">
    Nach dem Setzen des Passworts gelangen Sie direkt in den
    Dokumentenbereich{{ if .Data.project_name }} des Projekts{{ end }}.
  </p>
  <p style="font-size: 12px; color: #7c7c7c; border-top: 1px solid #e5e5e5; padding-top: 12px;">
    {{ if .Data.management_name }}{{ .Data.management_name }} · {{ end }}Projektplattform
  </p>
</div>
```

Hinweise:

- Der Einladungslink zeigt auf die **Projekt-Domain** (falls hinterlegt) –
  der eingeladene Benutzer landet nach dem Passwort-Setzen direkt im Hub
  seines Projekts. Ohne Domain greift die Site URL als Fallback.
- Falls die Subject-Zeile im Dashboard keine Template-Syntax akzeptiert
  (ältere Supabase-Versionen), statisch «Einladung zur Projektplattform»
  eintragen.

---

## Vorlage «Reset Password»

**Grenzen des Passwort-Resets:** Der Reset ist **konto-**, nicht
projektbezogen – ein Benutzer kann Mitglied mehrerer Projekte sein, das
neue Passwort gilt überall. Die anstossende Projekt-Domain steht der
Vorlage nicht zuverlässig zur Verfügung: `resetPasswordForEmail` kennt kein
`data`-Objekt; verfügbar wäre nur `{{ .RedirectTo }}` (eine technische
Callback-URL, für den Mailtext ungeeignet) oder die beim Invite
gespeicherten Konto-Metadaten – die bei Mehrfach-Mitgliedschaft aber das
falsche Projekt nennen würden. Deshalb bleibt die Vorlage bewusst neutral
(«für Ihr Konto auf der Projektplattform»); nach dem Setzen des neuen
Passworts meldet sich der Benutzer wie gewohnt auf seiner Projekt-Domain an.

**Subject:**

```
Passwort zurücksetzen – Projektplattform
```

**Message body (HTML):**

```html
<div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; color: #2b2b2b;">
  <h2 style="text-transform: uppercase; letter-spacing: 0.05em; font-size: 18px; border-bottom: 1px solid #e5e5e5; padding-bottom: 12px;">
    Passwort zurücksetzen
  </h2>
  <p>Guten Tag</p>
  <p>
    Für Ihr Konto <strong>{{ .Email }}</strong> auf der Projektplattform
    wurde das Zurücksetzen des Passworts angefordert. Das Passwort gilt für
    alle Ihre Bauprojekte auf der Plattform. Klicken Sie auf die
    Schaltfläche, um ein neues Passwort zu setzen:
  </p>
  <p style="margin: 24px 0;">
    <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/passwort-neu"
       style="background-color: #70ad47; color: #ffffff; padding: 10px 20px; text-decoration: none; font-weight: bold;">
      Neues Passwort setzen
    </a>
  </p>
  <p style="font-size: 13px; color: #7c7c7c;">
    Der Link ist eine Stunde gültig. Falls Sie das Zurücksetzen nicht
    angefordert haben, können Sie diese Nachricht ignorieren – Ihr Passwort
    bleibt unverändert.
  </p>
  <p style="font-size: 12px; color: #7c7c7c; border-top: 1px solid #e5e5e5; padding-top: 12px;">
    Projektplattform
  </p>
</div>
```

---

## Technischer Ablauf (beide Vorlagen)

Link → `/auth/confirm` verifiziert den `token_hash` (Session entsteht) →
Weiterleitung auf `/passwort-neu` → nach dem Speichern direkt in den Hub.
Token-Lebensdauer steuert Supabase (Standard: Recovery 1 h, Invite 24 h) –
bei Änderungen den Hinweistext anpassen. Kein «ß» verwenden
(Deutsch Schweiz).
