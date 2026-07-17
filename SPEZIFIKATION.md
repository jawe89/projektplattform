# Projektplattform – Programmierungsanweisungen für Claude Code & Claude Design

Dieses Dokument ist der Arbeitsauftrag. Vorgehen:

1. Neuen Ordner `projektplattform` anlegen, dieses Dokument als `SPEZIFIKATION.md` hineinlegen.
2. Claude Code im Ordner starten und mit dem **Start-Prompt** (Kapitel 1) beginnen.
3. Die Meilensteine M0–M5 (Kapitel 5) einzeln abarbeiten – pro Meilenstein ein Prompt, Ergebnis prüfen, dann weiter.
4. Claude Design für die visuellen Leitseiten nutzen (Kapitel 8), Ergebnis als Referenz an Claude Code übergeben.

---

## 1. Start-Prompt für Claude Code

```
Lies SPEZIFIKATION.md vollständig. Baue die darin beschriebene Multi-Tenant-WebApp
«Projektplattform» für Bauprojekte der Bau Innovation GmbH.

Stack: Next.js 15 (App Router, TypeScript), Tailwind CSS, Supabase
(Auth, Postgres mit Row Level Security, Storage), Deployment auf Vercel.

Beginne mit Meilenstein M0 (Projektgerüst und Datenbankschema) gemäss Kapitel 5.
Erstelle zuerst eine CLAUDE.md mit den Projektkonventionen aus Kapitel 2,
dann das Supabase-Schema als SQL-Migrationsdateien, dann das Next.js-Gerüst
mit Tenant-Middleware. Frage nach, bevor du Architekturentscheide triffst,
die von der Spezifikation abweichen.
```

---

## 2. Projektkonventionen (Inhalt für CLAUDE.md)

- **Sprache:** UI-Texte Deutsch (Schweiz): kein «ß», Guillemets «…» für Anführungen, Tausendertrennzeichen mit Apostroph (1'250'000), Datumsformat TT.MM.JJJJ, CHF-Beträge zweistellig.
- **Code:** TypeScript strikt, englische Bezeichner im Code, deutsche Texte ausschliesslich über ein zentrales Text-/Label-Modul.
- **Design-Standard (Default-Theme):** Antonio (Titel, Versalien, letter-spacing 0.02em), Montserrat (Text), Grau `#7c7c7c` / Dunkelgrau `#5a5a5a` / Grün `#70ad47` / Hintergrund `#f6f6f4` / Linien `#e5e5e5` / Ink `#2b2b2b`. Karten mit 1px-Linien, keine starken Schatten, sticky Toolbar mit Speicherstatus (● Ungespeicherte Änderungen / ✓ Gespeichert), Toast-Meldungen unten rechts. Referenz: die drei bestehenden HTML-Tools MCD_239.
- **Theming:** Sämtliche Farben und Schriften nur über CSS-Variablen (`--color-primary`, `--color-accent`, `--font-display`, `--font-body`, …), die pro Tenant serverseitig aus `project_branding` gesetzt werden. Keine hart codierten Farben in Komponenten.
- **Sicherheit:** Jede Datenabfrage läuft über Supabase RLS. Keine Service-Role-Keys im Client. Datei-Downloads über signierte URLs (Gültigkeit 1 h). Rollenprüfung zusätzlich serverseitig in Server Components / Route Handlers.
- **Struktur:** Feature-Ordner (`features/landing`, `features/hub`, `features/admin`), UI-Basiskomponenten in `components/ui`.

---

## 3. Datenmodell (SQL-Migrationen)

```sql
-- Projekte (Tenants)
create table projects (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,              -- z.B. 'mcd-wattwil'
  name text not null,                     -- «McDonald's Neubau Wattwil»
  project_no text,                        -- «MCD_239»
  domain text unique,                     -- «bauinnovation-mcdonalds-wattwil.ch»
  status text not null default 'active',  -- active | archived
  landing jsonb not null default '{}',    -- Info-Felder der Landingpage, siehe unten
  created_at timestamptz default now()
);

-- Branding pro Projekt
create table project_branding (
  project_id uuid primary key references projects(id) on delete cascade,
  logo_path text,
  hero_path text,
  font_display text not null default 'Antonio',
  font_body text not null default 'Montserrat',
  colors jsonb not null default '{
    "primary":"#7c7c7c","primaryDark":"#5a5a5a","accent":"#70ad47",
    "accentDark":"#5a9036","bg":"#f6f6f4","line":"#e5e5e5","ink":"#2b2b2b"
  }'
);

-- Kategorien pro Projekt, inkl. Feld-Schema
create table categories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  key text not null,                      -- 'plaene', 'offerten', …
  label text not null,                    -- «Pläne»
  add_label text,                         -- «+ Neuer Plan»
  layout text not null default 'list',    -- 'big' | 'list'
  sort int not null default 0,
  field_schema jsonb not null,            -- siehe Beispiel unten
  unique (project_id, key)
);

-- Dokumente / Einträge
create table documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  parent_id uuid references documents(id) on delete cascade, -- Unterpositionen (Ausschreibungen)
  data jsonb not null,                    -- { "icon":"250", "title":"…", "sub":"…" }
  file_path text,                         -- Pfad im Storage-Bucket, ODER:
  external_url text,                      -- bestehende externe Links (Migration)
  sort int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Rollen pro Projekt
create table roles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,                     -- «Bauherr», «Unternehmer», …
  unique (project_id, name)
);

-- Sichtbarkeits-/Upload-Matrix Rolle × Kategorie
create table role_category_access (
  role_id uuid references roles(id) on delete cascade,
  category_id uuid references categories(id) on delete cascade,
  can_view boolean not null default true,
  can_upload boolean not null default false,
  primary key (role_id, category_id)
);

-- Projektmitglieder (Supabase-Auth-User ↔ Projekt ↔ Rolle)
create table project_members (
  user_id uuid references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  role_id uuid not null references roles(id),
  is_project_admin boolean not null default false,
  primary key (user_id, project_id)
);

-- Plattform-Admins (Vollzugriff, sehen Adminbereich über alle Projekte)
create table platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
```

**`landing`-JSON (Landingpage-Inhalte):**

```json
{
  "subtitle": "Neubau · MCD_239",
  "description": "Kurzbeschrieb des Projekts …",
  "infoCells": [
    { "label": "Bauherrschaft", "value": "McDonald's Suisse Restaurants Sàrl\nRue …" },
    { "label": "Baumanagement", "value": "Bau Innovation GmbH, Frauenfeld" },
    { "label": "Standort", "value": "…, 9630 Wattwil" },
    { "label": "Termine", "value": "Baustart 01.06.2026 · Bezug 16.10.2026" }
  ]
}
```

**`field_schema`-JSON (bildet die heutige SECTION_META ab):**

```json
{
  "fields": [
    { "key": "icon",  "label": "BKP-Nr.", "placeholder": "z.B. 250", "required": true, "badge": true },
    { "key": "title", "label": "Titel", "required": true },
    { "key": "sub",   "label": "Untertitel (optional)" }
  ],
  "allowChildren": false
}
```

**RLS-Grundsätze (als Policies umsetzen):**

- `projects`, `project_branding`, `categories` (nur `can_view`-Kategorien), `documents`: lesbar für `project_members` des Projekts und `platform_admins`; Landingpage-Basisdaten (`projects.name`, `landing`, Branding) zusätzlich öffentlich lesbar (anon) für die Landingpage.
- Schreiben auf `documents`: `platform_admins`, `is_project_admin`, sowie Rollen mit `can_upload` auf der Kategorie.
- Schreiben auf Konfigurationstabellen (`projects`, `categories`, `roles`, `role_category_access`, `project_members`, `project_branding`): nur `platform_admins` und `is_project_admin` (Letztere nur im eigenen Projekt, keine Domain-/Projektanlage).
- Storage: Bucket `project-files`, Pfadkonvention `{project_id}/{category_key}/{dateiname}`; Policies analog `documents`; Auslieferung ausschliesslich über signierte URLs. Logo/Hero in Bucket `branding` (öffentlich lesbar).

---

## 4. Routing und Tenant-Erkennung

```
middleware.ts:
  host = request.headers.host (www. entfernen)
  wenn host == ADMIN_DOMAIN  → Rewrite auf /admin/*
  sonst: Projekt-Lookup über projects.domain (Edge-tauglich cachen)
         → Header x-project-id setzen, Rewrite auf /p/[projectId]/*
  unbekannte Domain → neutrale Hinweisseite

Routen (App Router):
  /p/[projectId]/            → Landingpage (öffentlich, SSR mit Branding)
  /p/[projectId]/login       → Login (Supabase Auth, E-Mail + Passwort)
  /p/[projectId]/hub         → Dokumenten-Hub (geschützt, rollengefiltert)
  /admin                     → Projektliste (nur platform_admins)
  /admin/projects/new        → Neues Projekt (Name, Projekt-Nr., Domain, aus Vorlage duplizieren)
  /admin/projects/[id]/daten     → Landingpage-Inhalte, Hero, Termine
  /admin/projects/[id]/branding  → Logo, Farben, Schriften, Live-Vorschau
  /admin/projects/[id]/kategorien→ Kategorien + Feld-Schema-Editor
  /admin/projects/[id]/rollen    → Rollen + Sichtbarkeits-Matrix (Checkbox-Grid)
  /admin/projects/[id]/benutzer  → Einladungen, Rollenzuweisung, Deaktivieren
```

Lokale Entwicklung: Tenant-Auflösung zusätzlich über `?tenant=slug` bzw. `slug.localhost:3000` ermöglichen.

---

## 5. Meilensteine (je ein Claude-Code-Auftrag)

**M0 – Fundament:** Next.js-Gerüst, Supabase-Anbindung, SQL-Migrationen aus Kapitel 3, RLS-Policies, Seed-Skript (Projekt «McDonald's Wattwil» mit den 5 Standardkategorien und Rollen Bauherr/Bauleitung/Architekt/Unternehmer), Tenant-Middleware, Theming-Grundlage (CSS-Variablen aus `project_branding`).
*Abnahme:* `slug.localhost` zeigt pro Seed-Projekt unterschiedliches Branding.

**M1 – Landingpage + Login:** Öffentliche Landingpage (Header mit Logo, Titelblock, Hero-Bild, Info-Grid aus `landing.infoCells`, Login-Karte), Supabase-Auth-Flow inkl. Passwort-Reset, nach Login Redirect auf `/hub`.
*Abnahme:* Login funktioniert, falsche Domain-/Projektzuordnung unmöglich (RLS-Test).

**M2 – Dokumenten-Hub:** Kategorien-Abschnitte gemäss Rollen-Matrix, Kartendarstellung (`layout: big` = grosse Karten mit HTML/PDF-Badge, `layout: list` = Listenkarten mit Icon-Badge, Titel, Untertitel), Sprungnavigation, Zähler pro Kategorie («12 Pläne»). Für Berechtigte: Hinzufügen/Bearbeiten/Löschen über Modal, dessen Felder dynamisch aus `field_schema` generiert werden; Datei-Upload in Storage mit Fortschrittsanzeige oder alternativ externe URL; Drag-Sortierung; Unterpositionen wenn `allowChildren`; Toolbar mit Speicherstatus und Toasts wie in den bestehenden Tools.
*Abnahme:* Funktionsparität zur heutigen Projektübersicht; Unternehmer-Testuser sieht nur freigegebene Kategorien und keine Upload-Buttons.

**M3 – Adminbereich:** Alle Admin-Routen aus Kapitel 4. Kernstücke: Feld-Schema-Editor (Felder hinzufügen/umbenennen/sortieren, Pflichtfeld, Platzhalter, Badge-Feld wählen), Rollen-Matrix als Checkbox-Grid (Sehen/Hochladen), Branding-Seite mit Farbwählern, Google-Fonts-Auswahl und Live-Vorschau der Landingpage sowie den Baumanagement-Angaben (`management_name`, `management_suffix`, Upload des Baumanagement-Logos `management_logo_path` – siehe Migration 0004), Projekt-Duplizieren (Kategorien + Rollen + Branding übernehmen, ohne Dokumente), Benutzereinladung per Supabase-Invite-Mail.
*Abnahme:* Neues Testprojekt inkl. Domainfeld vollständig über die Oberfläche konfigurierbar, ohne Codeänderung.

**M4 – Migration Wattwil:** Import-Skript (`scripts/import-mcd-wattwil.ts`), das das JSON aus der bestehenden `projektuebersicht`-HTML einliest (Abschnitte `uebersichtsdokumente`, `plaene`, `ausschreibungen` inkl. Unterpositionen, `offerten`, `werkvertraege`) und als `documents` mit `external_url` anlegt. Bestehende Datei-URLs bleiben gültig.
*Abnahme:* Hub Wattwil zeigt 1:1 den heutigen Datenbestand.

**M5 – Produktion:** Vercel-Deployment, Umgebungsvariablen, Admin-Domain aufschalten, Projektdomain Wattwil per CNAME auf Vercel, Anleitung `docs/NEUES-PROJEKT.md` (Schritte: Projekt im Admin anlegen → Domain bei Registrar auf Vercel zeigen → Domain in Vercel hinzufügen), Backups/Export (JSON-Export pro Projekt im Admin).

**Phase 2 (separat beauftragen):** Baukostenkontrolle und Leistungsverzeichnis als native Module (`project_modules`-Tabelle, pro Projekt aktivierbar), Datenmodell aus den bestehenden HTML-Tools ableiten.

---

## 6. Umgebungsvariablen

```
NEXT_PUBLIC_SUPABASE_URL=…
NEXT_PUBLIC_SUPABASE_ANON_KEY=…
SUPABASE_SERVICE_ROLE_KEY=…      # nur Server (Seeds, Invites)
ADMIN_DOMAIN=admin.projektplattform.ch
```

## 7. Tests / Abnahmekriterien (durchgängig)

1. RLS-Test: User aus Projekt A kann via API keine Daten aus Projekt B lesen (automatisierter Test).
2. Rollen-Test: Kategorie-Sichtbarkeit und Upload-Recht greifen serverseitig, nicht nur im UI.
3. Theming-Test: Farb-/Schriftänderung im Admin wirkt ohne Deployment sofort auf Landingpage und Hub.
4. Schema-Test: Neues Feld im Feld-Schema erscheint sofort im Hinzufügen-Modal und auf der Karte.
5. Schweizer Formate: Datums-, Zahlen- und Anführungszeichenkonventionen in allen UI-Texten.

---

## 8. Claude-Design-Prompts (visuelle Leitseiten)

Claude Design für drei Leitscreens nutzen; die Ergebnisse (Screens/Code) Claude Code als Design-Referenz in einen Ordner `design-referenz/` geben.

**Prompt 1 – Landingpage:**

```
Gestalte eine Landingpage für eine Bauprojekt-Plattform (Desktop + Mobile).
Stil: Schweizer Baumanagement, präzis und zurückhaltend. Schriften: Antonio
(Titel, Versalien) und Montserrat (Text). Farben: Grau #7c7c7c, Dunkelgrau
#5a5a5a, Akzentgrün #70ad47, Hintergrund #f6f6f4, Linien #e5e5e5. Keine
Schatten-Effekte, feine 1px-Linien, viel Weissraum.
Aufbau: Header mit Firmenlogo rechts und Projekttitel links (Untertitel in
gesperrten Versalien), grosses Hero-Baustellenbild mit feinem Rahmen, darunter
ein 4-spaltiges Info-Grid (Bauherrschaft, Baumanagement, Standort, Termine),
rechts daneben eine kompakte Login-Karte (E-Mail, Passwort, grüner Button
«Anmelden», Link «Passwort vergessen»). Footer mit Projekt-Nr. und Firmenname.
```

**Prompt 2 – Dokumenten-Hub:**

```
Gestalte einen eingeloggten Dokumentenbereich derselben Plattform, gleiches
Designsystem (Antonio/Montserrat, Grau/Grün, 1px-Linien). Sticky Toolbar oben:
Brand links, Speicherstatus («✓ Gespeichert» grün / «● Ungespeicherte
Änderungen» orange), Buttons «Speichern» und «Abmelden». Darunter Sprung-
navigation zu den Kategorien. Abschnitte: «Übersichtsdokumente» als grosse
Karten mit HTML/PDF-Badge, Titel und Untertitel; «Pläne», «Offerten»,
«Werkverträge» als kompakte Listenkarten mit quadratischem Icon-Badge (Kürzel
wie «BE10» oder BKP-Nr.), Titel, Untertitel, Download-Pfeil; «Ausschreibungen»
mit aufklappbaren Unterpositionen. Pro Abschnitt Zähler («12 Pläne») und
gestrichelte «+ Hinzufügen»-Karte. Dazu ein Modal «Neuer Plan» mit Feldern
Nummer/Kürzel, Titel, Untertitel und einer Datei-Upload-Zone.
```

**Prompt 3 – Adminbereich:**

```
Gestalte den Adminbereich derselben Plattform: linke Seitenleiste (Projekte,
darunter pro Projekt: Daten, Branding, Kategorien, Rollen, Benutzer),
Hauptbereich mit drei Beispielscreens:
1. «Neues Projekt» – Formular mit Name, Projekt-Nr., Domain, Option «aus
   Vorlage duplizieren».
2. «Branding» – Farbwähler-Reihe, Schriftauswahl (Dropdown mit Vorschau),
   Logo- und Hero-Upload, rechts eine Live-Miniaturvorschau der Landingpage.
3. «Rollen» – Matrix-Tabelle Rollen × Kategorien mit Checkboxen für
   «Sehen» und «Hochladen», Button «+ Neue Rolle».
Gleiches Designsystem: Antonio/Montserrat, Grau #7c7c7c, Grün #70ad47,
Hintergrund #f6f6f4, feine Linien, keine Schatten.
```
