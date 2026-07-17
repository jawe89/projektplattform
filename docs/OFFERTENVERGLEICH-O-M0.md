# Modul «Offertenvergleich» – O-M0: Analyse & Architektur

Grundlage: `docs/KONZEPT-OFFERTENVERGLEICH.pdf` (V 1.1, Juli 2026) und die
Beispiel-PDFs in `scripts/data/offertenvergleich/`. Abweichend vom
Konzept-Stack (pdfplumber/WeasyPrint/Python) läuft alles auf dem
Plattform-Stack: Next.js/TypeScript, Supabase, Vercel; KI-Analyse über die
Anthropic-API (liest PDFs nativ, auch Scans). Branding/Titel/Baumanagement
in UI und PDF-Report kommen aus `project_branding`/`projects.landing` des
jeweiligen Projekts; fix bleiben nur die Vergleichs-Bedeutungsfarben
(Grün = günstigster, Orange = teuerster) und Warn-Orange (#e67e22).

**Dieses Dokument ist der Prüfstand vor jedem Code: (a) Struktur-Bericht,
(b) PDF-Rendering-Entscheid, (c) Job-Muster, (d) Schema-Entwurf. Migriert
wird erst nach Freigabe.**

---

## (a) Struktur-Bericht der Beispiel-PDFs

### Inventar

| Datei | Seiten | Typ |
|---|---|---|
| MCD_239 … BKP 211 Positionenvergleich.pdf | 22 | BauPlus-Export, digitaler Textlayer |
| MCD_239 … BKP 211.4 Positionenvergleich.pdf | 26 | BauPlus-Export, digitaler Textlayer |
| MCD_239_Positionenvergleich_BKP_211_…_1.pdf | 5 | manueller Referenzbericht (WeasyPrint) |
| MCD_239_Positionenvergleich_BKP_211_4_…_1.pdf | 5 | manueller Referenzbericht (WeasyPrint) |
| BKP 211/411 Offerte Oberhänsli AG.pdf | 143/102 | **digital** (sauberer Textlayer) |
| BKP 211/411 Offerte Vetter AG.pdf | 97/87 | **Scan mit OCR-Layer** (fehlerbehaftet: «Uberprofile», «Grabenlängew ird») |
| BKP 211/411 Offerte E. Weber AG.pdf | 134/75 | **reiner Scan** (kein Textlayer, 18 MB) |

### BauPlus-Positionenvergleich (Kernquelle des MVP)

Struktur pro Seite: Kopfblock (Bauvorhaben, Projekt-Nr., «BKP – Titel»,
LV-Nummer, Datum, Seite), Spaltenkopf mit Bietern (Name, PLZ/Ort, Telefon),
dann hierarchische NPK-Positionen:

- Kapitel (`111 Regiearbeiten`) → Gruppe (`112 Stundenansätze …`) →
  Unterposition (`.001 Aufsichtsperson.`), Beschreibungstext mehrzeilig.
- **Preiszeile** je Unterposition:
  `211 - A 10.000 h A 1’360.00 A 1’080.00 A 1’150.50 A`
  (LV-Präfix, Preisart-Marker, Menge, Einheit, dann je Bieter Preis + Marker
  `A` = Angebot bzw. `I` = «inkl.»).

Format-Eigenheiten, die der Parser abdecken muss:

1. Apostroph ist U+2019 (`’`), Dezimalpunkt `.`; negative Preise mit `-`.
2. `inkl.` statt Betrag (Marker `I`) – zählt 0 in der Summe, wird geflaggt.
3. Mengen mit **2 oder 3** Nachkommastellen (`34’000.00 kg` vs `10.000 h`).
4. Zeilenpräfix = LV-Kurzform (`211 -` bzw. `211.4 -`) – variabel je Vergabe.
5. **Bieter-Spaltenreihenfolge variiert zwischen Exporten** (211: Vetter,
   Weber, Oberhänsli; 211.4: Vetter, Oberhänsli, Weber) – die Zuordnung MUSS
   aus dem Spaltenkopf gelesen werden, nie fest verdrahtet.
6. **Keine Totalzeilen** im Vergleich – Endbeträge stehen nur in den
   Original-Offerten.

**Machbarkeitsprobe (deterministischer Parser, Prototyp):**

| Kennzahl | BKP 211 | BKP 211.4 |
|---|---|---|
| Preiszeilen erkannt | **191/191** | **162/162** |
| Summe Vetter | **1'494'470.15** | 895'577.30 |
| Summe E. Weber | 1'948'790.30 | 1'186'439.95 |
| Summe Oberhänsli | **2'323'354.85** | 1'183'002.20 |
| «inkl.»-Zellen | 4 (alle Vetter) | 3 |
| Negative Preise | −20'500.00 / −13'104.00 | – |

Validierung: Die Vetter-Summe entspricht **rappengenau** dem «Total brutto
CHF 1'494'470.15» der Vetter-Offerte (S. 35), die Oberhänsli-Summe dem
«Zwischentotal Fr. 2'323'354.85» der Oberhänsli-Offerte (S. 2). Die beiden
negativen Preise sind exakt die im manuellen Bericht beanstandeten
Weber-Positionen 211.512.102 und 211.751.111. Für Weber (reiner Scan) gibt
es keinen digital extrahierbaren Kontrollwert; für 211.4 liegen keine
Original-Offerten im Beispielsatz.

**Fazit Extrahierbarkeit:** Der BauPlus-Export ist vollständig und
zuverlässig **deterministisch** parsebar (Textlayer, festes Zeilenmuster,
NPK-Hierarchie als Kontextzustand). Der produktive Parser läuft in
TypeScript auf `pdfjs-dist` (Textitems mit X/Y-Koordinaten; Spaltengrenzen
aus dem Kopf, Preiszuordnung über X-Position statt Reihenfolge – robuster
als das Regex des Prototyps). Bewusst **kein LLM für die Zahlenextraktion**:
Die Matrix muss reproduzierbar, testbar und rappengenau sein; die
Anthropic-API kommt dort zum Einsatz, wo sie unersetzlich ist (unten).

### Manuelle Referenzberichte (Ziel-Layout des PDF-Reports)

Aufbau (beide identisch): Kopf mit Titel/BKP/Projekt · Info-Block
(Bauvorhaben, Arbeitsgattung, LV-Nummer, Baumanagement) · Bieter-Karten ·
«Grosse Unterschiede» als Tabelle, **nach Kostenblöcken gruppiert**
(Regiearbeiten, Baustelleneinrichtung, Pfahlarbeiten, Aushub, Entsorgung,
Schalungen, Beton, Bewehrung …), Grün/Orange je Zeile · «Erkenntnisse der
Vergleiche» (7 Boxen mit Tag: KRITISCH, HOT SPOT, PLAUSIBILITÄT PRÜFEN,
STÄRKE, …) · «Fazit und Zusammenfassung» (Ranking-Tabelle 1–N mit
Charakterisierung + Tendenz-Tag, Bereinigungsgespräche pro Anbieter,
Vergabeempfehlung) · Footer-Metazeile. Wichtig: Der Bericht zeigt bewusst
**nicht alle** Positionen, sondern die auffälligsten («wichtige Positionen»
interaktiv verfeinerbar, Konzept Schritt 4/5).

### Original-Offerten (relevant ab Summen-Abgleich und O-M2)

Drei Qualitätsstufen im echten Bestand: digital (Oberhänsli), Scan mit
schlechtem OCR (Vetter), reiner Scan (Weber, 134 S./18 MB). Konsequenz:

- Deterministisches Text-Parsing ist nur bei digitalen Offerten
  verlässlich; OCR-Layer sind für Zahlen unbrauchbar (Verschiebungsfehler).
- **Ausschreibungs-/Offerten-Parsing (O-M2) läuft über die Anthropic-API**
  (native PDF-Verarbeitung inkl. Vision auf Scans). Limits: 32 MB pro
  Request, bis 600 Seiten auf 1M-Kontext-Modellen – die 18-MB/134-Seiten-
  Weber-Offerte passt in einen Request; zur Kosten-/Robustheitssteuerung
  wird trotzdem kapitelweise gechunkt (Seitenbereiche via `pdf-lib`) und
  pro Dokument ein Parse-Status persistiert (Wiederaufnahme).
- Offerten enthalten verwertbare Kontrollanker: Kapiteltotale
  («Total 800 Nebenarbeiten», «Gesamttotal»), Zusammenzug mit
  Rabatt/Skonto/MwSt, bei Vetter zusätzlich Abgebote (
  «Total Netto exkl. MWST. CHF 1'438'000.00» – deckungsgleich mit dem
  BKK-Vertrag 211).

### Rolle der Anthropic-API (Abgrenzung)

| Aufgabe | Werkzeug |
|---|---|
| Positionsmatrix aus BauPlus-Export | deterministischer Parser (pdfjs-dist) |
| Statistik: Median-Deltas, Ranking, Ausreisser, Kostenblock-Summen | eigener Code (`lib/ov-calc.ts`, unit-getestet wie `bkk-calc`) |
| Kostenblock-Zuordnung | NPK-Systematik regelbasiert; API nur als Vorschlag für unbekannte Kapitel |
| **Erkenntnisse + Fazit** (Texte, Muster wie Umverteilung Entsorgung) | Anthropic-API: berechnete Matrix + Flags als strukturierter Input, `output_config.format` (JSON-Schema) als Output – **die API erfindet keine Zahlen, sie formuliert über gelieferten Zahlen** |
| Ausschreibungs-/Offerten-Parsing, Produktwechsel (O-M2) | Anthropic-API (PDF nativ), Ergebnis gegen Selbstprüfungen |

Modell: `claude-opus-4-8` (Empfehlung; stark auf Dokument-/Vision-Aufgaben),
Aufrufe serverseitig mit Streaming (lange Antworten, keine HTTP-Timeouts);
`ANTHROPIC_API_KEY` ausschliesslich als Server-Umgebungsvariable (nie im
Client, analog `SUPABASE_SERVICE_ROLE_KEY`).

### Selbstprüfungen (automatisch bei jeder Analyse)

1. **Parser-Vollständigkeit (hart):** Jede Zeile mit LV-Präfix (`… -`) muss
   dem Preiszeilenmuster entsprechen; Anzahl unparsebarer Zeilen > 0 →
   Analyse-Abbruch mit Zeilenliste. Zusätzlich Positionszähler je Kapitel
   im Analyseprotokoll.
2. **Summen-Abgleich gegen Offerten-Endbeträge (Ampel, nicht blockierend):**
   Positionssumme je Bieter vs. Brutto-/Zwischentotal der Offerte (vor
   Rabatt/Skonto/Abgebot/MwSt – nachweislich die Vergleichsbasis, s.o.).
   Quelle des Kontrollwerts: automatisch extrahiert bei digitalen Offerten,
   sonst per Anthropic-Vision oder manuell erfassbares Kontrollfeld je
   Bieter im UI. Abweichung wird mit Differenz im UI und im Report
   ausgewiesen.
3. **Plausibilitäts-Flags:** negative EP, Preis 1.00/`inkl.`,
   Extremausreisser (> 3× über/unter Median, gemäss Konzept),
   zusammenhängende NPK-Gruppen (711.xxx + 751.xxx) für Summenbetrachtung.
4. **KI-Zahlendisziplin:** Jede CHF-Zahl im generierten Erkenntnis-/Fazit-
   Text wird gegen die berechnete Matrix geprüft (inkl. gerundeter
   Summenformen); Fremdzahlen → Warnung und interaktive Nachbearbeitung.

---

## (b) Architektur-Entscheid PDF-Rendering (WeasyPrint-Ersatz)

Geprüfte Optionen für Vercel/Node:

| Option | Beurteilung |
|---|---|
| **`@react-pdf/renderer`** (React-Komponenten → PDF, pures JS) | **Empfehlung.** Kein Binary, serverless-freundlich (keine Chromium-Grösse/Cold-Starts), deterministische A4-Paginierung mit Seitenzahlen, TTF-Einbettung (Antonio/Montserrat), Styling als Flexbox – die Referenzberichte (Tabellen, Boxen, Tags, Karten) sind damit vollständig abbildbar. Report-Layout ist ohnehin ein eigenes Druck-Layout, kein geteiltes Web-CSS. |
| Playwright/Puppeteer + `@sparticuz/chromium` (HTML→PDF) | Volle CSS-Treue, aber ~50-MB-Binary in der Function, Cold-Starts, fragilere Wartung auf Vercel. **Dokumentierter Fallback**, falls `react-pdf` an eine Layoutgrenze stösst. |
| `pdf-lib`/`pdfkit` (Low-Level) | Zu tief für ein mehrseitiges Berichtslayout; `pdf-lib` bleibt aber als Werkzeug für PDF-Splitting (O-M2-Chunking) gesetzt. |
| Externe Render-Dienste (DocRaptor u.ä.) | Projektdaten verlassen die Plattform, laufende Kosten, Abhängigkeit – ausgeschlossen. |

Umsetzung: `features/offertenvergleich/report/` mit Report-Komponenten;
Fonts als eingebettete TTF; **Projekt-CI zur Renderzeit** aus
`project_branding` (Farben, Schriften soweit als TTF verfügbar – sonst
dokumentierter Fallback Antonio/Montserrat) und `projects`/`landing`
(Titelzeilen, Baumanagement-Block); fixe Bedeutungsfarben Grün `#70ad47`
(bzw. Projekt-Akzent? → **fix**, siehe Vorgabe: Grün günstigster, Orange
teuerster, Warn-Orange `#e67e22`). Erzeugtes PDF wird im Storage unter der
Vergabe archiviert (`ov_auswertungen.report_file_path`) und über die
bestehende Signed-URL-Mechanik ausgeliefert.

---

## (c) Job-Muster für lange Analysen

Analysen dauern Sekunden (Parser/Statistik) bis Minuten (KI-Erkenntnisse;
O-M2-Scanparsing deutlich länger) – zu lang für Request/Response, zu kurz
für eine eigene Queue-Infrastruktur. Muster:

1. **Status-Tabelle `ov_jobs`** (Entwurf in (d)): `status`
   (`queued`/`running`/`done`/`error`), `stufe` (Freitext-Schlüssel:
   `parsing` → `statistik` → `ki` → `fertig`, analog Konzept-Screen 2
   «Parsing… Analyse… Auswertung…»), `heartbeat_at`, `fehler`,
   `resultat`-Verweis.
2. **Start:** Route Handler legt den Job an (`queued`) und stösst die
   Verarbeitung im selben Invoke über `waitUntil()` (`@vercel/functions`)
   an – Antwort an den Client sofort, Verarbeitung läuft bis
   `maxDuration` weiter. Für die Analyse-Route wird `maxDuration`
   explizit gesetzt (Vercel-Pro-Rahmen, 300 s als Planungsgrösse); jede
   Stufe aktualisiert `stufe` + `heartbeat_at`.
3. **Polling:** Client fragt `GET /module/offertenvergleich/api/jobs/[id]`
   alle 2–3 s (kein Realtime-Kanal nötig); UI zeigt die Stufe live.
4. **Timeout-Strategie:** (1) Anthropic-Aufrufe mit Streaming und
   SDK-Timeout; (2) Watchdog beim Polling: `running` ohne Heartbeat
   > 2 min → Job wird als `error` («Zeitüberschreitung») markiert, mit
   Retry-Button; (3) Analysen sind **idempotent** (lesen Dokumente,
   überschreiben die Auswertung deterministisch) – Retry ist immer
   gefahrlos; (4) O-M2-Langläufer werden in Teilschritte zerlegt
   (Parse-Status **pro Dokument/Kapitel** persistiert), sodass jeder
   Einzel-Invoke klar unter dem Limit bleibt und ein Retry beim letzten
   fertigen Teilschritt aufsetzt. Erst wenn das nachweislich nicht
   reicht, wird ein externer Scheduler (Cron/QStash) ergänzt – nicht im
   MVP.

---

## (d) Schema-Entwurf (Migration 0010, Entwurf – noch nicht anlegen)

Konventionen wie BKK/LV: Präfix `ov_`, `project_id` auf **jeder** Tabelle
denormalisiert (einfache RLS ohne Joins), Beträge als `bigint` in Rappen,
Mengen als `numeric(14,3)`, RLS über `can_view_module`/`can_edit_module`
mit Modul-Key `offertenvergleich`.

```sql
-- 1) Modul-Key-Constraint erweitern (project_modules + role_module_access)
alter table project_modules drop constraint project_modules_key_check;
alter table project_modules add constraint project_modules_key_check
  check (module_key in ('baukostenkontrolle', 'leistungsverzeichnis', 'offertenvergleich'));
alter table role_module_access drop constraint role_module_access_key_check;
alter table role_module_access add constraint role_module_access_key_check
  check (module_key in ('baukostenkontrolle', 'leistungsverzeichnis', 'offertenvergleich'));

-- 2) Vergabe-Prozesse
create table ov_vergaben (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  bkp text not null,                      -- '211', '211.4'
  titel text not null,                    -- 'Baumeisterarbeiten + Baugrube'
  lv_nummer text,                         -- '21100'
  stand date,                             -- Datum des Vergleichs
  status text not null default 'offen'
    check (status in ('offen', 'in_pruefung', 'abgeschlossen')),
  notiz text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, bkp)
);

-- 3) Bieter pro Vergabe (aus dem Spaltenkopf extrahiert, editierbar)
create table ov_bieter (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  vergabe_id uuid not null references ov_vergaben(id) on delete cascade,
  name text not null,
  ort text,
  telefon text,
  kontrollsumme_rp bigint,               -- Offerten-Endbetrag (Summen-Abgleich)
  sort integer not null default 0
);

-- 4) Hochgeladene PDFs (Metadaten; Dateien im Storage)
create table ov_dokumente (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  vergabe_id uuid not null references ov_vergaben(id) on delete cascade,
  art text not null
    check (art in ('positionenvergleich', 'ausschreibung', 'offerte', 'beilage')),
  bieter_id uuid references ov_bieter(id) on delete set null,  -- bei Offerten
  file_path text not null,               -- {project_id}/offertenvergleich/{vergabe_id}/…
  original_name text not null,
  seiten integer,
  parse_status text not null default 'neu'
    check (parse_status in ('neu', 'geparst', 'fehler')),
  parse_fehler text,
  created_at timestamptz not null default now()
);

-- 5) NPK-Positionen (MVP: aus dem Positionenvergleich; O-M2: aus der Ausschreibung)
create table ov_positionen (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  vergabe_id uuid not null references ov_vergaben(id) on delete cascade,
  npk text not null,                     -- '211.711.222' (Kapitel.Gruppe.Pos)
  bezeichnung text not null,
  menge numeric(14,3),
  einheit text,
  kostenblock text,                      -- 'Entsorgung', 'Baustelleneinrichtung', …
  wichtig boolean not null default false, -- Auswahl für den Bericht (interaktiv)
  sort integer not null default 0,
  unique (vergabe_id, npk)
);

-- 6) Preise pro Position und Bieter
create table ov_angebote (
  project_id uuid not null references projects(id) on delete cascade,
  position_id uuid not null references ov_positionen(id) on delete cascade,
  bieter_id uuid not null references ov_bieter(id) on delete cascade,
  betrag_rp bigint,                      -- null bei «inkl.»
  is_inkl boolean not null default false,
  flags jsonb not null default '[]',     -- ['negativ','einheitspreis_1','ausreisser',…]
  primary key (position_id, bieter_id)
);

-- 7) Auswertungen (Analyse-Resultat + archivierte Reports)
create table ov_auswertungen (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  vergabe_id uuid not null references ov_vergaben(id) on delete cascade,
  inhalt jsonb not null,                 -- Statistik, Hot Spots, Erkenntnisse,
                                         -- Fazit, Bewertungen, Selbstprüfungen
  report_file_path text,                 -- generiertes PDF im Storage
  created_at timestamptz not null default now()
);

-- 8) Job-Status (siehe (c))
create table ov_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  vergabe_id uuid not null references ov_vergaben(id) on delete cascade,
  typ text not null check (typ in ('analyse', 'report', 'vollstaendigkeit')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'error')),
  stufe text,
  fehler text,
  auswertung_id uuid references ov_auswertungen(id) on delete set null,
  heartbeat_at timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
```

**RLS** (Muster identisch für alle acht Tabellen, analog 0007):

```sql
alter table ov_vergaben enable row level security;
create policy ov_vergaben_select on ov_vergaben for select using (
  public.is_platform_admin() or public.is_project_admin(project_id)
  or public.can_view_module(project_id, 'offertenvergleich')
);
create policy ov_vergaben_write on ov_vergaben for all using (
  public.is_platform_admin() or public.is_project_admin(project_id)
  or public.can_edit_module(project_id, 'offertenvergleich')
) with check ( … gleiches Prädikat … );
```

**Storage:** Dateien unter `{project_id}/offertenvergleich/{vergabe_id}/…`
im bestehenden privaten Bucket `project-files`. Die heutigen Policies
prüfen das zweite Pfadsegment als **Kategorie**-Schlüssel – die Migration
ergänzt einen Modul-Zweig: zweites Segment `offertenvergleich` → Lesen
über `can_view_module`, Schreiben über `can_edit_module` (Projekt-Admins
und Plattform-Admins wie gehabt). Downloads laufen über die bestehende
Signed-URL-Route (1 h).

**Zusätzlich in der Codebasis (O-M1, keine Migration):** `lib/modules.ts`
um den Eintrag `offertenvergleich` erweitern (Label «Offertenvergleich»,
Beschreibung), damit Modul-Aktivierung, Rollen-Matrix, Hub-Karte und
Routing `/module/offertenvergleich` ohne Sonderfälle greifen.

---

## Offene Punkte zur Prüfung (vor O-M1)

1. **Parser-Strategie bestätigt?** Deterministisch (pdfjs-dist) für die
   Matrix, Anthropic-API nur für Erkenntnisse/Fazit (MVP) und
   Dokument-Parsing (O-M2).
2. **Summen-Abgleich als Ampel** (nicht blockierend) mit manuellem
   Kontrollsummen-Feld je Bieter als Fallback für Scans – einverstanden?
3. **PDF-Rendering:** `@react-pdf/renderer` als Ersatz für WeasyPrint
   (Chromium-Route als dokumentierter Fallback).
4. **Job-Muster:** `ov_jobs` + `waitUntil` + Polling, ohne externe Queue
   im MVP. Annahme: Vercel-Pro-Plan (maxDuration bis 300 s) – bitte
   bestätigen.
5. **Schema-Entwurf 0010** inkl. Constraint-Erweiterung und
   Storage-Policy-Zweig – nach Freigabe lege ich die Migrationsdatei an
   (zuerst Dev, Prod erst nach O-M1-Abnahme).
