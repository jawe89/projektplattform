# Projektplattform – Konzept

**Bau Innovation GmbH · Multiplizierbare Projekt-WebApp für Bauprojekte**
Version 1.0 · 16.07.2026 · Basis: Bestehende Tools McDonald's Wattwil (MCD_239)

---

## 1. Ausgangslage

Für das Projekt McDonald's Wattwil bestehen heute drei eigenständige HTML-Tools (Projektübersicht, Baukostenkontrolle, Verkehr Leistungsverzeichnis), die auf einem Webserver publiziert sind. Die Daten liegen als JSON direkt in der HTML-Datei, gespeichert wird über `save.php` / `upload.php` mit einem gemeinsamen Token. Das funktioniert für ein einzelnes Projekt, ist aber nicht skalierbar: kein Login, keine Benutzerrollen, keine zentrale Verwaltung, und für jedes neue Projekt müsste alles von Hand kopiert und angepasst werden.

Die neue **Projektplattform** löst das: eine einzige WebApp, die beliebig viele Bauprojekte bedient – jedes unter einer eigenen Domain, mit eigenem Branding, eigenen Kategorien, eigenen Benutzern und Rollen. Alles wird zentral aus einem Adminbereich gesteuert (analog MyField).

## 2. Zielbild

Eine Codebasis, viele Projekte («Multi-Tenant»). Wer `bauinnovation-mcdonalds-wattwil.ch` aufruft, sieht die Landingpage des Projekts Wattwil. Wer eine künftige Projekt-Domain aufruft, sieht dessen Landingpage – gleiche App, andere Daten, anderes Branding.

**Die drei Ebenen der Plattform:**

| Ebene | Wer | Was |
|---|---|---|
| **Landingpage** (öffentlich) | Alle Besucher | Grundlegende Projektinfos (Bauherrschaft, Bauleitung, Adresse, Termine), Hero-Bild, Login-Feld |
| **Projektbereich** (eingeloggt) | Projektbeteiligte | Kategorien und Dokumente gemäss Benutzerrolle (z.B. Bauherr sieht alles, Unternehmer nur Pläne) |
| **Adminbereich** | Plattform-Admin (Jan) und Projekt-Admins | Projekte eröffnen, Domain zuweisen, Branding, Kategorien, Feldkonfiguration, Benutzer und Rollen verwalten |

## 3. Funktionsumfang

### 3.1 Landingpage

Pro Projekt eine öffentliche Startseite mit Projektname, Projekt-Nr., Hero-Bild, Info-Grid (Bauherrschaft, Bauleitung/Baumanagement, Standort, wichtige Termine – Felder frei konfigurierbar) und einem Login-Formular (E-Mail + Passwort). Kein öffentlicher Dokumentenzugriff. Design entspricht dem im Admin definierten Branding.

### 3.2 Projektbereich (Dokumenten-Hub)

Der eingeloggte Bereich entspricht funktional der heutigen Projektübersicht:

- Kategorien als Abschnitte (Standard: Übersichtsdokumente, Pläne, Ausschreibungen, Offerten, Werkverträge – pro Projekt frei erweiterbar, z.B. Protokolle, Fotos, Terminpläne).
- Pro Kategorie konfigurierbare Eingabefelder (heute: Typ/Kürzel, Titel, Untertitel – künftig pro Kategorie im Admin definierbar, inkl. Pflichtfeld-Flag und Platzhaltertext wie «BKP-Nr. (z.B. 250)»).
- Karten-Layout wie heute (grosse Karten für Übersichtsdokumente/Ausschreibungen, Listen-Karten für Pläne/Offerten/Werkverträge), inkl. Icon-Badge, Titel, Untertitel, Link/Download.
- Datei-Upload direkt aus der Oberfläche (PDF, Bilder, HTML, Excel usw.), Bearbeiten, Sortieren und Löschen von Einträgen – identisches Bedienkonzept wie in den bestehenden Tools (Modal mit Eingabefeldern, «Speichern»-Status in der Toolbar, Toast-Meldungen).
- Sichtbarkeit pro Kategorie nach Rolle: Ein Unternehmer sieht z.B. nur «Pläne» und «Ausschreibungen», der Bauherr alles.

Die Spezialtools **Baukostenkontrolle** und **Leistungsverzeichnis** bleiben in Phase 1 als verlinkte Live-HTML-Dokumente in der Kategorie «Übersichtsdokumente» eingebunden (wie heute) und werden in Phase 2 als native Module in die Plattform integriert.

### 3.3 Rollen und Rechte

- Rollen werden **pro Projekt im Admin konfiguriert** (z.B. Bauherr, Bauleitung, Architekt, Unternehmer, Behörde).
- Pro Rolle eine Matrix: welche Kategorien sichtbar, und optional ob die Rolle selber hochladen darf (Standard: nur ansehen/herunterladen; Hochladen nur Bauleitung/Admin).
- Benutzer werden per E-Mail eingeladen und einer Rolle zugewiesen. Ein Benutzer kann in mehreren Projekten unterschiedliche Rollen haben.

### 3.4 Adminbereich

Zentrale Verwaltung aller Projekte von einem Ort:

1. **Projekte:** Neues Projekt eröffnen (Name, Projekt-Nr., Domain eintragen), Status (aktiv/archiviert), Projekt duplizieren als Vorlage.
2. **Projektdaten:** Alle Landingpage-Inhalte pflegen (Info-Felder, Termine, Beschreibung), Hero-Bild und Logo hochladen.
3. **Branding:** Farbgestaltung (Primär-, Akzent-, Hintergrundfarben), Schriftarten (Google-Fonts-Auswahl, Standard: Antonio/Montserrat), Live-Vorschau.
4. **Kategorien:** Kategorien anlegen, benennen, sortieren, Layout wählen (grosse Karte / Listenkarte) und pro Kategorie die Eingabefelder definieren (Feldname, Platzhalter, Pflichtfeld) – exakt das, was heute hart codiert in `SECTION_META` steht.
5. **Benutzer und Rollen:** Rollen definieren, Kategorie-Sichtbarkeits-Matrix pflegen, Benutzer einladen/deaktivieren.
6. **Domains:** Pro Projekt die Domain hinterlegen; die App erkennt das Projekt automatisch anhand der aufgerufenen Domain.

## 4. Technische Architektur (Empfehlung)

**Stack: Next.js (App Router) + Supabase + Vercel.** Begründung: Supabase kennst du bereits vom Scouting-Webapp-Projekt; es liefert Login (Auth), Datenbank (Postgres mit Row Level Security für saubere Mandantentrennung) und Datei-Storage aus einer Hand. Vercel erlaubt, beliebig viele Custom Domains auf eine App zu legen – genau das Multi-Domain-Modell, das du brauchst.

```
Besucher ── bauinnovation-mcdonalds-wattwil.ch ─┐
Besucher ── projekt-b.ch ───────────────────────┼──► Vercel (eine Next.js-App)
Besucher ── admin.projektplattform.ch ──────────┘         │
                                                Middleware liest Domain
                                                → lädt passendes Projekt
                                                          │
                                              Supabase: Auth · Postgres · Storage
```

- **Tenant-Erkennung:** Middleware liest den Host-Header, schlägt die Domain in der Tabelle `projects` nach und lädt Branding + Inhalte des Projekts.
- **Neues Projekt aufschalten:** Im Admin Projekt anlegen + Domain eintragen, dann DNS der neuen Domain auf Vercel zeigen lassen (CNAME) und Domain im Vercel-Projekt hinzufügen (manuell oder später per Vercel-API automatisiert). Danach ist das Projekt live.
- **Dateien:** Supabase Storage, ein Bucket pro Projekt-Ordner, Zugriff über signierte URLs (Dokumente sind nicht öffentlich, ausser explizit freigegeben).
- **Rechte:** Row Level Security stellt sicher, dass Benutzer nur Daten «ihres» Projekts und nur Kategorien ihrer Rolle sehen – serverseitig, nicht nur im Frontend.

**Alternative** (falls alles auf dem bestehenden PHP-Hosting bleiben soll): Laravel + MySQL mit gleicher Datenstruktur. Funktioniert, aber Auth, Storage-Verwaltung und Multi-Domain-Handling müssten selber gebaut werden. Empfehlung: Supabase-Weg.

## 5. Datenmodell (Kern)

| Tabelle | Zweck |
|---|---|
| `projects` | Name, Projekt-Nr., Domain, Status, Landingpage-Inhalte (Info-Felder als JSON) |
| `project_branding` | Logo, Hero-Bild, Farben (JSON), Display- und Textschrift |
| `categories` | pro Projekt: Schlüssel, Bezeichnung, Reihenfolge, Layout (big/list), Feld-Schema (JSON) |
| `documents` | pro Kategorie: Feldwerte (JSON gemäss Schema), Datei-Referenz oder externe URL, Sortierung |
| `roles` | pro Projekt: Rollenname |
| `role_category_access` | Matrix Rolle × Kategorie: sichtbar ja/nein, Upload ja/nein |
| `project_members` | Benutzer ↔ Projekt ↔ Rolle |
| `platform_admins` | Plattform-Administratoren (Vollzugriff auf alle Projekte) |

Das Feld-Schema in `categories` bildet die heutige `SECTION_META`-Konfiguration ab, z.B.:

```json
{
  "layout": "list",
  "fields": [
    { "key": "icon",  "label": "BKP-Nr.", "placeholder": "z.B. 250", "required": true, "badge": true },
    { "key": "title", "label": "Titel", "required": true },
    { "key": "sub",   "label": "Untertitel (optional)" }
  ]
}
```

## 6. Migration McDonald's Wattwil

Das Projekt Wattwil wird als erstes Projekt («Tenant 1») migriert: Die JSON-Daten aus der bestehenden Projektübersicht (Übersichtsdokumente, Pläne, Ausschreibungen inkl. Unterpositionen, Offerten, Werkverträge) werden per Import-Skript in die Datenbank übernommen; bestehende Datei-URLs bleiben vorerst als externe Links erhalten und können schrittweise in den Storage gezügelt werden. Baukostenkontrolle und Leistungsverzeichnis laufen unverändert weiter und sind als Live-Dokumente verlinkt. Die registrierte Domain wird auf die neue App umgezogen, sobald der Projektbereich produktiv ist.

## 7. Etappen

| Phase | Inhalt | Ergebnis |
|---|---|---|
| **1a – Fundament** | Multi-Tenant-Setup, Datenmodell, Auth, Landingpage, Login | Projekt-Landingpage live pro Domain |
| **1b – Dokumenten-Hub** | Kategorien, Karten, Upload, Bearbeiten – Funktionsparität zur heutigen Projektübersicht | Eingeloggter Projektbereich mit Rollen-Sichtbarkeit |
| **1c – Adminbereich** | Projekte, Branding, Kategorien-/Feld-Konfiguration, Rollen-Matrix, Benutzerverwaltung | Neues Projekt in Minuten aufschaltbar |
| **1d – Migration** | Import Wattwil, Domain-Umzug, Abnahme | Wattwil läuft produktiv auf der Plattform |
| **2 – Module** | Baukostenkontrolle und Leistungsverzeichnis als native Plattform-Module (mehrmandantenfähig) | Spezialtools pro Projekt aktivierbar |
| **3 – Ausbau** | Vercel-Domain-API-Automatisierung, Benachrichtigungen bei neuen Dokumenten, Zugriffprotokoll, PDF-Vorschau | Komfort und Vertrieb (Produkt für Dritte) |

## 8. Design

Die Plattform übernimmt das bewährte Bauinnovation-Designsystem als **Standard-Theme** (Antonio für Titel in Versalien, Montserrat für Text, Grau `#7c7c7c` / Grün `#70ad47`, feine Linien, Karten mit Icon-Badges, sticky Toolbar mit Speicherstatus). Über das Branding im Admin kann jedes Projekt davon abweichen – die gesamte Oberfläche ist über CSS-Variablen thematisiert, die zur Laufzeit aus der Datenbank gesetzt werden.
