# Projektplattform

Multi-Tenant-WebApp für Bauprojekte der Bau Innovation GmbH.
Stack: Next.js 15 (App Router, TypeScript), Tailwind CSS, Supabase (Auth, Postgres mit RLS, Storage), Vercel.

Spezifikation: [SPEZIFIKATION.md](SPEZIFIKATION.md) · Konventionen: [CLAUDE.md](CLAUDE.md)

## Einrichtung

1. **Supabase-Projekt anlegen** (https://supabase.com) und die drei Migrationen
   aus `supabase/migrations/` der Reihe nach im SQL-Editor ausführen
   (oder mit der Supabase-CLI: `supabase db push`):
   - `0001_schema.sql` – Tabellen und Indizes
   - `0002_rls.sql` – Row-Level-Security-Policies
   - `0003_storage.sql` – Buckets `project-files` (privat) und `branding` (öffentlich)

2. **Umgebungsvariablen:** `.env.example` nach `.env.local` kopieren und die
   Supabase-Werte eintragen (Projekt-Einstellungen → API).

3. **Seed ausführen** (legt «McDonald's Wattwil» und ein Demo-Projekt an):

   ```
   npm install
   npm run seed
   ```

4. **Dev-Server starten:**

   ```
   npm run dev
   ```

## Tenants lokal aufrufen

- http://mcd-wattwil.localhost:3000 – McDonald's Neubau Wattwil (Grau/Grün)
- http://demo-buerohaus.localhost:3000 – Demo-Projekt (Blau)
- http://localhost:3000?tenant=mcd-wattwil – Alternative über Query-Parameter
- http://admin.localhost:3000 – Adminbereich (Platzhalter bis M3)

Unbekannte Domains zeigen eine neutrale Hinweisseite.

## Testbenutzer (nur lokale Entwicklung, aus `npm run seed`)

| E-Mail | Passwort | Projekt | Rolle |
|---|---|---|---|
| bauleitung.wattwil@example.com | BauleitungWattwil2026! | mcd-wattwil | Bauleitung (Projekt-Admin) |
| unternehmer.wattwil@example.com | UnternehmerWattwil2026! | mcd-wattwil | Unternehmer |
| bauherr.demo@example.com | BauherrDemo2026! | demo-buerohaus | Bauherr (Projekt-Admin) |
| admin.plattform@example.com | PlattformAdmin2026! | – | Plattform-Admin (http://admin.localhost:3000) |

## Tests

- `npm run test:rls` – RLS-Nachweis: Cross-Tenant-Isolation, Rollen-Matrix,
  serverseitiges Upload-Recht, Signed-URL-Berechtigungen,
  Konfigurationsrechte (Projekt-/Plattform-Admin, Domain-/Slug-Schutz)
  (23 Checks, braucht Seed-Daten).

## Passwort-Reset (Supabase-Konfiguration)

Der Reset-Flow unterstützt beide Supabase-Varianten:

1. **Standard-E-Mail-Vorlage** (PKCE): In den Supabase-Auth-Einstellungen die
   Redirect-URLs der Tenant-Domains freischalten, z.B.
   `http://*.localhost:3000/**` (lokal) und `https://<projekt-domain>/**`
   (Produktion). Der Link führt über `/auth/callback`.
2. **Empfohlen (SSR)**: E-Mail-Vorlage «Reset Password» auf token_hash umstellen:
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery` –
   funktioniert ohne Redirect-Allowlist pro Domain (Route `/auth/confirm`).

## Meilensteine

- **M0 – Fundament** ✅ Gerüst, Schema, RLS, Seed, Tenant-Middleware, Theming
- **M1 – Landingpage + Login** ✅ Landingpage (Logo, Hero, Info-Grid, Login-Karte),
  Auth-Flow (Login/Logout/Passwort-Reset), RLS-Test
- **M2 – Dokumenten-Hub** ✅ Kategorien gemäss Rollen-Matrix, Karten (big/list),
  Unterpositionen, Modal aus `field_schema`, Upload mit Fortschritt,
  Drag-Sortierung, signierte Downloads, Speicherstatus + Toasts
- **M3 – Adminbereich** ✅ Projektliste/-anlage mit Vorlagen-Duplikation,
  Projektdaten + Hero, Branding (Baumanagement, Farben, Fonts, Live-Vorschau),
  Kategorien- und Feld-Schema-Editor, Rollen-Matrix, Benutzereinladung
- **M4 – Migration Wattwil** ✅ Import-Skript `npm run import:wattwil`
  (liest `scripts/data/…projektuebersicht….html`, idempotent über Quell-IDs,
  Abgleichstabelle Quelle ↔ DB; bestehende Datei-URLs bleiben gültig)
- **M5 – Produktion** ✅ Datei-Migration `npm run migrate:wattwil`
  (Basic-Auth via `LEGACY_BASIC_AUTH`), JSON-Export pro Projekt im Admin,
  [docs/NEUES-PROJEKT.md](docs/NEUES-PROJEKT.md),
  [docs/GO-LIVE-WATTWIL.md](docs/GO-LIVE-WATTWIL.md) (Vercel, DNS, Rollback)
