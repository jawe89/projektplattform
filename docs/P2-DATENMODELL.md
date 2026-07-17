# Phase 2 – Datenstruktur-Bericht und Schema-Entwürfe

Analyse der eingebetteten Daten und der Berechnungslogik der beiden
HTML-Tools (Stand der Abzüge: 16.07.2026). **Freigegeben am 17.07.2026**
mit den Entscheiden aus Abschnitt 4 – die Schemas unten sind der
verbindliche Stand für die Migrationen (BKK: `0007`, LV: folgt mit P2-M3).

---

## 1. Baukostenkontrolle (`baukostenkontrolle-mcd-wattwil_….html`)

### 1.1 Datenstruktur

Das Tool trennt **Basiskatalog** (hart codiert im JS) und **Zustand**
(`<script id="embeddedState" type="application/json">`):

**Basiskatalog `KV_DATA`** – flache Liste mit Gruppenzeilen:

```js
{ type:'group', bkp:'0', name:'Grundstück' }          // Gruppe (1 Ziffer)
{ bkp:'026', name:'Landkauf', kv:1400000 }            // Position, kv = Originalbudget in CHF
```

Hierarchie: genau **zwei Ebenen** – Gruppe (BKP-Hauptgruppe 0/1/2/4/5/9,
mit eigenem Namen) → Positionen (`211`, `211.9`, `297.3a`). Die Zuordnung
erfolgt über die erste Ziffer der BKP-Nr.

**Zustand (embeddedState)**:

```json
{
  "rows": {
    "211": {
      "kvMut": 1500000,
      "vertraege": [{ "id": "emr1…", "betrag": 1438000, "datum": "04.06.2026", "unt": "Vetter AG" }],
      "zahlungen": [{ "id": "emq0…", "betrag": 443000,  "datum": "12.03.2026", "unt": "Häring + Co. AG" }]
    }
  },
  "customPositions": [{ "bkp": "273.0", "name": "Innentüren aus Holz", "kv": 65000 }],
  "hiddenBkps": [],
  "savedAt": 1784227290194
}
```

Bestand Wattwil: 74 Positionen mit Zustand, 7 Custom-Positionen,
13 Verträge, 17 Zahlungen. Beträge sind CHF-Zahlen (Float), Eingaben
werden auf 5 Rappen gerundet (`round5Rp`).

### 1.2 Berechnungslogik (aus dem JS extrahiert)

- **KV mutiert effektiv**: `kvMut ?? kv` (Überschreibung, sonst Original).
- **Verträge/Zahlungen**: Summe der Einträge je Position.
- **Status-Pille** (Farblogik): keine Daten → «offen»; `sumVertrag >
  kvMut·1.001` → rot «> KV»; `sumZahlung ≥ sumVertrag·0.999` → grün
  «bezahlt»; `sumZahlung > 0` → gelb «teilbezahlt»; `sumVertrag > 0` →
  grün «vertrag».
- **Totale** (`totals`): KV orig. zählt **immer alle** Katalog-Positionen
  (auch ausgeblendete – Originalbudget ist historisch fix); KV mutiert /
  Verträge / Zahlungen zählen nur sichtbare. Custom-Positionen zählen
  **nicht** ins KV orig., aber in alles andere.
- **KPIs**: KV orig., KV mutiert (mit Δ% und Ampel: <0 grün «Einsparung»,
  0–5 % gelb, >5 % rot), Verträge, Zahlungen, offen (= Verträge −
  Zahlungen).
- **Vier Spaltbereiche der Tabelle**: KV (orig. + mutiert + Δ%) ·
  Verträge (Betrag, % v. KV mut.) · Zahlungen (Betrag, % v. KV mut.,
  % v. Vertrag) · Status; je Position aufklappbares Detail mit den
  Einzel-Verträgen/-Zahlungen (Datum, Unternehmer, Betrag).

### 1.3 Schema-Entwurf (Modul `baukostenkontrolle`)

Beträge als **Ganzzahl-Rappen** (`bigint`, Suffix `_rp`) – Import:
`Math.round(chf * 100)`.

```sql
-- BKP-Hauptgruppen (pro Projekt konfigurierbar, ersetzt die group-Zeilen)
create table bkk_groups (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  digit text not null,                 -- '0', '1', '2', …
  name text not null,                  -- «Grundstück», «Vorbereitung», …
  sort int not null default 0,
  unique (project_id, digit)
);

-- Positionen (Katalog + benutzerdefiniert, in einer Tabelle)
create table bkk_positions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  group_id uuid not null references bkk_groups(id), -- beim Anlegen/Import mit
                                       -- der ersten BKP-Ziffer vorbelegt,
                                       -- danach pro Position übersteuerbar
  bkp text not null,                   -- '211', '211.9', '297.3a'
  name text not null,
  kv_mut_rp bigint,                    -- mutiertes KV; null = wie aktive Baseline
  is_custom boolean not null default false,
  hidden boolean not null default false,    -- ausgeblendet (zählt nur ins Baseline-Total)
  notiz text,                          -- Freitext (Nachträge, Rückbehalte, …)
  sort int not null default 0,
  unique (project_id, bkp)
);

-- KV-Baselines als Historie (0008, Entscheid 6 – Lesart B): Bei grossen
-- Projektänderungen wird ein revidierter KV zur neuen Referenz, der alte
-- bleibt nachvollziehbar. Genau eine aktive Baseline pro Projekt.
create table bkk_baselines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  bezeichnung text not null,           -- «KV orig.», «KV rev. 1», …
  datum date not null,
  is_active boolean not null default false,
  created_at timestamptz default now()
);
create unique index bkk_baselines_active_idx
  on bkk_baselines (project_id) where is_active;

-- KV-Wert je Position und Baseline (ersetzt die frühere Spalte kv_orig_rp).
-- Positionen ohne Zeile («nicht in dieser Baseline», z.B. später angelegte)
-- zählen dort mit 0; ihr Budget läuft über kv_mut_rp.
create table bkk_position_baseline_values (
  baseline_id uuid not null references bkk_baselines(id) on delete cascade,
  position_id uuid not null references bkk_positions(id) on delete cascade,
  kv_rp bigint not null default 0,
  primary key (baseline_id, position_id)
);

-- Verträge und Zahlungen (gleiche Struktur → eine Tabelle mit Typ)
create table bkk_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  position_id uuid not null references bkk_positions(id) on delete cascade,
  entry_type text not null check (entry_type in ('vertrag', 'zahlung')),
  betrag_rp bigint not null,           -- exakt gespeichert, keine Rundung
  datum date,
  unternehmer text,
  notiz text,                          -- Freitext (z.B. Rückbehalt-Begründung)
  source_id text,                      -- Alt-Tool-ID (idempotenter Import)
  created_at timestamptz default now()
);
```

Kein Speichern berechneter Werte – Zwischentotale, Gesamttotal, Δ%, Status
werden wie im Alt-Tool live berechnet; die Logik aus 1.2 ist 1:1 nach
`lib/bkk-calc.ts` portiert (reine Funktionen, abgesichert durch
`tests/bkk-calc.test.ts`, siehe `npm run test:unit`).

**Moduleinstellungen** (`project_modules.settings`, jsonb):

- `round5_totals` (boolean) – 5-Rappen-Rundung als **Anzeige-/
  Totalisierungsregel**: Beträge werden exakt in Rappen gespeichert; bei
  aktiver Regel wird jeder Betrag für Anzeige und Summierung auf 5 Rappen
  gerundet (Totale = Summe der gerundeten Beträge – identisch zum
  Alt-Tool, das bereits bei der Eingabe rundete). Default Wattwil: aktiv.
- Die frühere Einstellung `kv_orig_datum` entfällt zugunsten des
  Baseline-Datums (`bkk_baselines.datum`).

**Baselines – Verhalten (P2-M2 v1):**

- Die Spalte «KV orig.» zeigt die **aktive** Baseline (Spaltenkopf mit
  Bezeichnung + Datum); «KV orig. zählt historisch fix alle Positionen»
  gilt **pro Baseline**. Positionen ohne Wert in einer Baseline zählen
  dort 0 und sind als «nicht in dieser Baseline» gekennzeichnet.
- Verwaltung im Modul (nur Bearbeiten-Rolle): Liste, neue Baseline mit
  Werte-Übernahme wahlweise aus der bisherigen Baseline oder aus KV
  mutiert (typischer Fall: revidierter KV = bisheriger Stand inkl.
  Mutationen wird neue Referenz), Umschalten der aktiven Baseline mit
  Warnhinweis. Alte Baselines sind read-only aufrufbar (`?baseline=`).
- **Import (P2-M4)**: Der Alt-Tool-Bestand wird als erste Baseline
  «KV orig.» mit Datum 23.01.2026 angelegt, `is_active = true`;
  Custom-Positionen erhalten dort keinen Wert (Budget via `kv_mut_rp`).
- **Ausbaupunkt (nicht v1)**: Baseline-Vergleich (zwei nebeneinander).

**Gruppen**: Beim Aktivieren des BKK-Moduls in einem Projekt ohne Gruppen
werden die Schweizer BKP-Hauptgruppen als Standard angelegt (0 Grundstück,
1 Vorbereitungsarbeiten, 2 Gebäude, 3 Betriebseinrichtungen, 4 Umgebung,
5 Baunebenkosten, 9 Ausstattung – `BKK_DEFAULT_GROUPS` in `lib/modules.ts`);
schlanke Gruppenpflege im Modul (anlegen, umbenennen; löschen nur ohne
Positionen). **Der Import (P2-M4) gleicht über die Ziffer ab** – gleiche
Ziffer = gleiche Gruppe (Name aus dem Alt-Tool gewinnt), fehlende Gruppen
legt er an.

---

## 2. Verkehr-Leistungsverzeichnis (`verkehr-leistungsverzeichnis-mcd-wattwil_….html`)

### 2.1 Datenstruktur

**Basiskatalog `KV_POSITIONS`**: flache Liste der Vergabeeinheiten
(`{ bkp, name }`, ~67 Stück, keine Hierarchie, keine Beträge).

**Workflow `STEPS`** – 9 feste Schritte:

1. `lv_erstellt` · 2. `lv_versendet` · 3. `off_erhalten` ·
4. `av_erstellt` («Angebotsvergleich erstellt») · 5. `av_bh` («AV an BH») ·
6. `wv_erstellt` · 7. `wv_unt` («WV an Unternehmer») · 8. `wv_bh` ·
9. `wv_zurueck` («WV unterschrieben zurück»)

**Zustand (embeddedState)**:

```json
{
  "rows": { "214": { "lv_erstellt": "✓ erledigt", "wv_erstellt": "24.02.2026", … } },
  "customPositions": [],
  "hiddenBkps": ["211.9", "297.3a", …]
}
```

Zellwerte je Schritt: Datum `TT.MM.JJJJ` **oder** `«✓ erledigt»` (ohne
Datum) **oder** `«⊘ nach Aufwand»` (NA-Marker). Sind alle 4 WV-Schritte
NA, gilt die Einheit als «nach Aufwand» (kein Werkvertrag). Der
Fortschritt einer Einheit = letzter ausgefüllter Schritt.

**Wichtiger Befund:** Das Alt-Tool kennt **keine Offerten-Beträge**
(0 Treffer für «betrag» im ganzen Tool) – Beträge leben in der
Baukostenkontrolle (Verträge) bzw. als Offerten-PDFs in der
Projektübersicht. Die in der Spezifikation genannten «Offerten je Einheit
mit Beträgen» sind also ein **neues Feature**: Das Schema sieht sie vor,
die Migration importiert nur die Workflow-Stände (Offerten-Erfassung
beginnt nach dem Cutover im Modul).

### 2.2 Schema-Entwurf (Modul `leistungsverzeichnis`)

```sql
-- Vergabeeinheiten
create table lv_units (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  bkp text not null,
  name text not null,
  is_custom boolean not null default false,
  hidden boolean not null default false,
  -- Verknüpfung zur Werkvertrags-Dokumentation im Hub (optional)
  werkvertrag_document_id uuid references documents(id) on delete set null,
  sort int not null default 0,
  unique (project_id, bkp)
);

-- Workflow-Stand je Einheit und Schritt (nur ausgefüllte Schritte als Zeile).
-- Pro Schritt ein Datumsfeld PLUS separates Freitextfeld (Entscheid 3):
-- Der Import parst strikte TT.MM.JJJJ-Werte ins Datumsfeld; alles andere
-- («✓ erledigt», «⊘ nach Aufwand», KW-Angaben, Freitext) landet unverändert
-- im Freitextfeld – kein Wert geht verloren, kein Import-Abbruch.
create table lv_unit_steps (
  unit_id uuid not null references lv_units(id) on delete cascade,
  step_key text not null check (step_key in (
    'lv_erstellt','lv_versendet','off_erhalten','av_erstellt','av_bh',
    'wv_erstellt','wv_unt','wv_bh','wv_zurueck')),
  datum date,                          -- strikt geparste TT.MM.JJJJ-Werte
  freitext text,                       -- alles Übrige, unverändert übernommen
  primary key (unit_id, step_key),
  check (datum is not null or freitext is not null)
);
```

Die «nach Aufwand»-Erkennung (alle 4 WV-Schritte mit NA-Marker) arbeitet
auf dem Freitext-Marker `⊘ nach Aufwand`; das Modul-UI setzt die
Standard-Marker per Schnellaktion, Freitext bleibt daneben frei möglich.

```sql

-- Offerten je Einheit (neues Feature – Migration lässt die Tabelle leer)
create table lv_offers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  unit_id uuid not null references lv_units(id) on delete cascade,
  unternehmer text not null,
  betrag_rp bigint,                    -- Rappen; null = Betrag noch offen
  datum date,
  document_id uuid references documents(id) on delete set null, -- Offerten-PDF im Hub
  created_at timestamptz default now()
);
```

Die 9 Schritte bleiben fest im Code (Reihenfolge/Labels wie `STEPS`) –
konfigurierbare Workflows wären Ausbau, nicht Funktionsparität.

---

## 3. Gemeinsames (Vorgriff auf P2-M1)

- `project_modules (project_id, module_key, enabled, settings jsonb)` –
  `module_key` ∈ `('baukostenkontrolle', 'leistungsverzeichnis')`;
  `settings` z.B. für das KV-orig.-Datum.
- `role_module_access (role_id, module_key, can_view, can_edit)` analog
  zur Kategorien-Matrix.
- RLS analog `documents`: Lesen für Projektmitglieder mit `can_view` auf
  dem Modul, Schreiben mit `can_edit` bzw. Projekt-/Plattform-Admin;
  alle Modultabellen tragen `project_id` für die Policies.
- Import-Referenzen: deterministische UUIDs aus den Alt-IDs
  (`emr1lfbn2yzpdw`, …) wie beim M4-Import, plus `source_id` als Spalte.

## 4. Entscheide (Freigabe 17.07.2026)

1. **LV-Offerten**: `lv_offers` wird angelegt (Offertbeträge je
   Vergabeeinheit als künftiges Feature); der Import befüllt sie nicht.
2. **BKK-Gruppierung**: `group_id` pro Position – beim Anlegen und beim
   Import mit der ersten BKP-Ziffer vorbelegt, danach pro Position
   übersteuerbar. Keine reine Laufzeit-Ableitung.
3. **LV-Datumsfelder**: Pro Workflow-Schritt ein Datumsfeld (`TT.MM.JJJJ`)
   plus separates Freitextfeld. Der Import parst strikte
   `TT.MM.JJJJ`-Werte ins Datumsfeld; alles andere («✓ erledigt»,
   «⊘ nach Aufwand», KW-Angaben, Freitext) landet unverändert im
   Freitextfeld – kein Wert darf verloren gehen oder den Import abbrechen.
4. **Rundung**: Beträge exakt in Ganzzahl-Rappen speichern, keine Rundung
   beim Speichern. Die 5-Rappen-Rundung ist reine Anzeige-/
   Totalisierungsregel, pro Projekt konfigurierbar
   (`project_modules.settings.round5_totals`; Default Wattwil: aktiv).
   Der Import übernimmt die Alt-Tool-Werte unverändert; die
   Abgleichstabelle vergleicht gegen die Alt-Tool-Totale unter derselben
   Totalisierungsregel.
5. **Notizfelder** (Ergänzung): Freitext-Notiz pro BKK-Position und pro
   Vertrag/Zahlung (`notiz text`, optional) – für Nachtragsbegründungen,
   Rückbehalte und Ähnliches, was bisher in Nebenlisten landete.
6. **KV-Baselines als Historie** (Ergänzung 17.07.2026, Lesart B): Das
   KV-orig.-Datum ist keine fixe Moduleinstellung – revidierte KVs werden
   als Baselines geführt (`bkk_baselines` +
   `bkk_position_baseline_values`, Migration 0008; `kv_orig_rp` aus 0007
   entfällt). Details und v1-Umfang siehe Abschnitt 1.3.
