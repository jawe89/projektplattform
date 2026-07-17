# Projektplattform – Projektkonventionen

Multi-Tenant-WebApp für Bauprojekte der Bau Innovation GmbH.
Stack: Next.js 15 (App Router, TypeScript), Tailwind CSS, Supabase (Auth, Postgres mit RLS, Storage), Deployment auf Vercel.
Arbeitsauftrag und Meilensteine: siehe `SPEZIFIKATION.md`.

## Sprache

- UI-Texte in **Deutsch (Schweiz)**: kein «ß» (immer «ss»), Guillemets «…» für Anführungen.
- Tausendertrennzeichen mit Apostroph: `1'250'000`.
- Datumsformat `TT.MM.JJJJ` (z.B. `01.06.2026`).
- CHF-Beträge immer zweistellig: `CHF 1'250'000.00`.
- Formatierungs-Helfer in `lib/format.ts` verwenden, nie ad hoc formatieren.

## Code

- TypeScript **strikt** (`strict: true`), keine `any` ohne Begründung.
- **Englische Bezeichner** im Code (Variablen, Funktionen, Typen, Dateinamen).
- Deutsche UI-Texte **ausschliesslich** über das zentrale Text-/Label-Modul `lib/texts.ts` – keine deutschen Strings direkt in Komponenten.

## Design-Standard (Default-Theme)

- Schriften: **Antonio** (Titel, Versalien, `letter-spacing: 0.02em`), **Montserrat** (Text).
- Farben: Grau `#7c7c7c` · Dunkelgrau `#5a5a5a` · Grün `#70ad47` · Hintergrund `#f6f6f4` · Linien `#e5e5e5` · Ink `#2b2b2b`.
- Karten mit 1px-Linien, **keine starken Schatten**, viel Weissraum.
- Sticky Toolbar mit Speicherstatus (`● Ungespeicherte Änderungen` orange / `✓ Gespeichert` grün), Toast-Meldungen unten rechts.
- Referenz: die drei bestehenden HTML-Tools MCD_239 (ggf. `design-referenz/`).

## Theming

- Sämtliche Farben und Schriften **nur über CSS-Variablen** (`--color-primary`, `--color-primary-dark`, `--color-accent`, `--color-accent-dark`, `--color-bg`, `--color-line`, `--color-ink`, `--font-display`, `--font-body`).
- Die Variablen werden **pro Tenant serverseitig** aus `project_branding` gesetzt (siehe `features/theming/`).
- **Keine hart codierten Farben in Komponenten** – auch nicht in Tailwind-Klassen; Tailwind-Farbtokens referenzieren die CSS-Variablen.

## Sicherheit

- Jede Datenabfrage läuft über **Supabase RLS**. Policies in `supabase/migrations/` pflegen.
- **Keine Service-Role-Keys im Client.** `SUPABASE_SERVICE_ROLE_KEY` nur in Server-only-Code (Seeds, Invites); Modul `lib/supabase/admin.ts` ist mit `server-only` markiert.
- Datei-Downloads über **signierte URLs** (Gültigkeit 1 h). Bucket `project-files` ist privat; nur `branding` ist öffentlich.
- Rollenprüfung **zusätzlich serverseitig** in Server Components / Route Handlers – nie nur im UI.

## Struktur

```
app/                  App Router (Routen, Layouts)
  p/[projectId]/      Tenant-Bereich (Landing, Login, Hub)
  admin/              Adminbereich (nur platform_admins)
features/
  landing/            Landingpage-Feature
  hub/                Dokumenten-Hub-Feature
  admin/              Admin-Feature
  theming/            Branding → CSS-Variablen
components/ui/        UI-Basiskomponenten (Button, Card, Modal, Toast, …)
lib/                  Supabase-Clients, Tenant-Auflösung, Texte, Formate
supabase/migrations/  SQL-Migrationen (Schema, RLS, Storage)
scripts/              Seed- und Import-Skripte (tsx)
```

## Routing / Tenant-Erkennung

- `middleware.ts` liest den Host-Header (`www.` entfernen):
  - Host = `ADMIN_DOMAIN` → Rewrite auf `/admin/*`.
  - Sonst Projekt-Lookup über `projects.domain` (Edge-tauglich gecacht) → Header `x-project-id`, Rewrite auf `/p/[projectId]/*`.
  - Unbekannte Domain → neutrale Hinweisseite.
- Lokale Entwicklung: Tenant zusätzlich über `?tenant=slug` oder `slug.localhost:3000`.

## Befehle

```
npm run dev      # Dev-Server (http://localhost:3000, Tenants via slug.localhost:3000)
npm run build    # Produktions-Build (vorher Dev-Server stoppen – teilt .next!)
npm run lint     # ESLint
npm run seed     # Seed – Standard: Dev-Umgebung
npm run import:wattwil # M4: Import der bestehenden Projektübersicht (idempotent)
npm run migrate:wattwil # M5: Datei-Migration vom Alt-Server (LEGACY_BASIC_AUTH)
npm run create:admin   # Plattform-Admin anlegen
npm run cleanup:testusers # example.com-Testbenutzer löschen (mit Sicherung)
npm run test:rls # RLS-Nachweis – nur gegen Dev (braucht Seed-Testbenutzer)
npm run test:unit # Unit-Tests (node:test via tsx), z.B. BKK-Berechnungslogik
```

## Umgebungen Dev/Prod (seit P2-M0, siehe docs/DEV-UMGEBUNG.md)

- **`.env.local` = Dev-Supabase-Projekt** (Standard für dev-Server und alle
  Skripte). **`.env.prod.local` = Produktion** – Skripte laden sie nur mit
  expliziter Kennzeichnung `TARGET=prod` (PowerShell:
  `$env:TARGET='prod'; npm run …`).
- `scripts/env.ts` prüft die Projekt-Refs: Dev-Läufe gegen die Produktiv-DB
  und Prod-Läufe gegen fremde DBs brechen ab.
- Seed gegen Produktion nur doppelt bestätigt
  (`TARGET=prod` **und** `SEED_ALLOW_PROD=1`); `test:rls` läuft nie gegen
  Produktion.
- `npm run cleanup:testusers` verweigert die Ausführung, solange kein
  Plattform-Admin mit echter (Nicht-example.com-)Adresse existiert.
- Neue Migrationen: zuerst im Dev-Projekt ausführen, erst beim Release
  auf Produktion.

## Gelernte Stolperfallen

- **Kein `redirect()` in Server Actions**: Next rendert das Ziel im selben
  Request, die Tenant-Middleware läuft nicht → interner Pfad stimmt nicht.
  Stattdessen `redirectTo` zurückgeben.
- **Navigation nach Actions NUR im `useEffect` nach dem Commit** – niemals
  im Action-Wrapper (`window.location.assign` direkt nach `await action()`
  unterbricht die Verarbeitung der Action-Response → «Application error»-
  Blitzer, auf Vercel teils dauerhaft). Damit der Effekt sicher läuft, darf
  die Formular-Komponente beim Re-Render nicht unmounten: den Logged-in-
  Zustand IN der Komponente rendern (LoginForm zeigt eingeloggt den Link)
  statt sie zu ersetzen; Login-Seiten haben deshalb auch keinen
  serverseitigen Redirect für eingeloggte Benutzer (würde mit der
  Client-Navigation rennen). Logout läuft als nativer Form-POST auf
  `/auth/signout` (Route-Handler, 303) – ganz ohne Client-JS.
- **RLS + `maybeSingle()`**: Admin-Policies machen Fremdzeilen sichtbar –
  Abfragen auf «eigene» Zeilen immer explizit auf `user_id` filtern.
- **Storage-Cache**: Öffentliche Branding-Dateien werden vom CDN/Browser
  1 h gecacht (`max-age=3600`). Beim Logo-/Hero-Upload im Admin (M3) deshalb
  eindeutige Dateinamen vergeben (z.B. `logo-<timestamp>.svg`) statt
  gleichnamig zu überschreiben, sonst wirkt die Änderung nicht sofort.
- **`?tenant=` ist nur mit Sticky-Cookie brauchbar**: Interne Navigationen
  (Login-Redirect auf `/hub`, Logout, Links, Auth-Callbacks) tragen den
  Query-Parameter nicht weiter. Die Middleware setzt deshalb beim
  `?tenant=`-Treffer ein httpOnly-Cookie `tenant-slug` und fällt darauf
  zurück, wenn weder Domain noch Query greifen. Priorität strikt:
  **echte Domain > `?tenant=` > Cookie** – eine erkannte Projekt-Domain
  gewinnt immer (kein Übersteuern in Produktion); ein neuer `?tenant=`-Wert
  überschreibt das Cookie. Passwort-Reset-Links nehmen den Slug zusätzlich
  explizit in die Callback-URL auf (Mail wird u.U. ohne Cookie geöffnet).

## Umgebungsvariablen (`.env.local`, siehe `.env.example`)

```
NEXT_PUBLIC_SUPABASE_URL=…
NEXT_PUBLIC_SUPABASE_ANON_KEY=…
SUPABASE_SERVICE_ROLE_KEY=…      # nur Server (Seeds, Invites)
ADMIN_DOMAIN=admin.projektplattform.ch
```
