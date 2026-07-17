# Supabase-Mailvorlagen (token_hash-Flow über /auth/confirm)

Einzutragen im Supabase-Dashboard → **Authentication → Emails → Templates**.
Beide Vorlagen nutzen den robusten token_hash-Flow der Plattform-Route
`/auth/confirm` (kein Redirect-Allowlist-Eintrag pro Link nötig).

Voraussetzung (siehe GO-LIVE-WATTWIL.md, Schritt 3):
**Site URL** = `https://bauinnovation-mcdonalds-wattwil.ch`

---

## Vorlage «Reset Password»

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
    Für Ihr Konto <strong>{{ .Email }}</strong> wurde das Zurücksetzen des
    Passworts angefordert. Klicken Sie auf die Schaltfläche, um ein neues
    Passwort zu setzen:
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

## Vorlage «Invite user»

**Subject:**

```
Einladung zur Projektplattform
```

**Message body (HTML):**

```html
<div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; color: #2b2b2b;">
  <h2 style="text-transform: uppercase; letter-spacing: 0.05em; font-size: 18px; border-bottom: 1px solid #e5e5e5; padding-bottom: 12px;">
    Einladung zur Projektplattform
  </h2>
  <p>Guten Tag</p>
  <p>
    Sie wurden mit der Adresse <strong>{{ .Email }}</strong> zur
    Projektplattform eingeladen. Klicken Sie auf die Schaltfläche, um Ihr
    Passwort zu setzen und Zugang zu den Projektdokumenten zu erhalten:
  </p>
  <p style="margin: 24px 0;">
    <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/passwort-neu"
       style="background-color: #70ad47; color: #ffffff; padding: 10px 20px; text-decoration: none; font-weight: bold;">
      Einladung annehmen
    </a>
  </p>
  <p style="font-size: 13px; color: #7c7c7c;">
    Nach dem Setzen des Passworts gelangen Sie direkt in den
    Dokumentenbereich Ihres Projekts.
  </p>
  <p style="font-size: 12px; color: #7c7c7c; border-top: 1px solid #e5e5e5; padding-top: 12px;">
    Projektplattform
  </p>
</div>
```

---

## Hinweise

- **Ablauf**: Link → `/auth/confirm` verifiziert den `token_hash`
  (Session entsteht) → Weiterleitung auf `/passwort-neu` → nach dem Speichern
  direkt in den Hub.
- **Gültigkeit**: Die Token-Lebensdauer steuert Supabase
  (Authentication → Sessions; Standard: Recovery 1 h, Invite 24 h).
  Der Hinweistext in der Reset-Mail ggf. anpassen.
- **Mehrere Projekte**: `{{ .SiteURL }}` ist global – die Links zeigen immer
  auf die Wattwil-Domain. Die Verifikation funktioniert für Benutzer aller
  Projekte (der Token ist global gültig); wer keinem Wattwil-Projekt angehört,
  setzt das Passwort und meldet sich danach auf der eigenen Projekt-Domain an.
  Für Einladungen in andere Projekte zeigt der Adminbereich zusätzlich den
  projektspezifischen Einladungslink an (Fallback in der Benutzerverwaltung).
  Saubere projektspezifische Mail-Links für alle Tenants wären ein Punkt für
  Phase 2/3 (eigener Mailversand pro Projekt statt Supabase-Vorlagen).
- Kein «ß» verwenden (Deutsch Schweiz) – die Vorlagen sind entsprechend
  formuliert.
