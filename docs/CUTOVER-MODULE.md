# Cutover Module Wattwil – Baukostenkontrolle & Leistungsverzeichnis

Umstellung der beiden Live-HTML-Tools (`tools.*`) auf die Plattform-Module
(P2-M4). Die Vorbereitung ist auf Dev vollständig durchgespielt (Import
beider Snapshots vom 16.07.2026, zwei Läufe, Abgleich grün); dieser Ablauf
gilt für den Cutover-Tag gegen Produktion.

**Rollenverteilung:** Schritte mit **[Jan]** laufen manuell (Server,
SQL-Editor, Admin-UI); Schritte mit **[Skript]** sind die npm-Kommandos.
Der Prod-Lauf startet erst nach explizitem Go.

---

## Ablauf am Cutover-Tag

### (a) [Jan] Frische Snapshots + Bearbeitungsstopp

- [ ] Aktuelle Fassungen der beiden HTML-Dateien vom Server holen und nach
      `scripts/data/` legen (Dateinamen mit Zeitstempel, wie bisher):
      - `baukostenkontrolle-mcd-wattwil_<zeitstempel>.html`
      - `verkehr-leistungsverzeichnis-mcd-wattwil_<zeitstempel>.html`
- [ ] **Ab jetzt Bearbeitungsstopp im Alt-Tool** (jede spätere Änderung
      dort ginge beim Import verloren).
- [ ] Falls sich die Dateinamen ändern: `SOURCE_FILE` in
      `scripts/import-bkk-wattwil.ts` und `scripts/import-lv-wattwil.ts`
      anpassen (Konstante zuoberst).

Wichtig: Die Snapshots müssen den **eingebetteten Zustand** enthalten
(`<script id="embeddedState">` mit aktuellem `savedAt`) – also die vom
Tool gespeicherte Fassung verwenden, nicht eine leere Vorlage.

### (b) [Jan] Migrationen 0006–0009 im Prod-SQL-Editor

In genau dieser Reihenfolge (Supabase SQL-Editor, Produktions-Projekt):

- [ ] `supabase/migrations/0006_module_framework.sql`
- [ ] `supabase/migrations/0007_bkk_schema.sql`
- [ ] `supabase/migrations/0008_bkk_baselines.sql`
- [ ] `supabase/migrations/0009_lv_schema.sql`

### (c) [Skript] Import mit TARGET=prod

Explizite Kennzeichnung nötig – ohne `TARGET=prod` läuft alles gegen Dev
(`scripts/env.ts` prüft zusätzlich die Projekt-Refs):

```powershell
$env:TARGET='prod'; npm run import:bkk-wattwil
$env:TARGET='prod'; npm run import:lv-wattwil
```

Beide Importe sind idempotent (deterministische IDs bzw. Schlüssel über
BKP/`source_id`) – ein zweiter Lauf aktualisiert statt zu duplizieren und
dient als Gegenprobe.

### (d) Abgleichstabellen prüfen

Jedes Skript druckt seine Abgleichstabelle und beendet sich mit **Exit 1
bei jeder Abweichung**:

- BKK: Positionszahl je Gruppe, Vertrags-/Zahlungszahl, Totale aller
  Spalten auf den Rappen (Totalisierungsregel wie das Alt-Tool).
- LV: Einheitenzahl, Zellenzahl je Typ (Datum/Marker/Freitext),
  KPI-Zählungen.

- [ ] Beide Tabellen vollständig ✓ – die «Kontrollwerte fürs Modul» am
      Ende der Ausgabe notieren (Referenz für Schritt f).

### (e) [Jan] Konfiguration nach Migration (Checkliste unten)

Siehe Abschnitt «Konfiguration nach Migration» – Module aktivieren,
Rollen-Freigaben, `round5_totals`.

### (f) [Jan] Sichtkontrolle pro Rolle

Siehe Punkt 4 der Konfigurations-Checkliste; die BKK-KPIs und LV-Zähler
müssen den notierten Kontrollwerten aus Schritt (d) entsprechen.

### (g) [Jan] Hub-Links umstellen

Die zwei Einträge in der Kategorie **Übersichtsdokumente**, die heute auf
`tools.*` zeigen (Baukostenkontrolle, Verkehr-Leistungsverzeichnis), im
Hub bearbeiten (✎): externe URL ersetzen durch

- [ ] `/module/baukostenkontrolle`
- [ ] `/module/leistungsverzeichnis`

(relative Pfade genügen – sie bleiben auf der Projekt-Domain).

### (h) Rollback

Das Alt-Tool bleibt unter `tools.*` unverändert erreichbar – es wird
weder abgeschaltet noch überschrieben. Rollback = Schritt (g) rückgängig
machen (Hub-Links wieder auf die `tools.*`-URLs stellen) und die Module
bei Bedarf im Admin deaktivieren. Die importierten Daten können stehen
bleiben; ein späterer Neuanlauf wiederholt (a)–(g) mit frischen
Snapshots – die Importe aktualisieren idempotent.

---

## Konfiguration nach Migration (Checkliste)

**Der Import allein macht die Module nicht sichtbar.** Er schreibt nur
Daten (`bkk_*`, `lv_*`); Aktivierung, Rollen-Freigaben und
Modul-Einstellungen sind Konfiguration und müssen nach dem Import im
Wattwil-Prod-Projekt gesetzt werden:

### 1. Module aktivieren

Admin-Bereich → Projekt «McDonald's Neubau Wattwil» → Tab **Module**:

- [ ] **Baukostenkontrolle** aktivieren
- [ ] **Verkehr Leistungsverzeichnis** aktivieren
- [ ] Speichern

Hinweis: Beim Aktivieren ohne bestehende Gruppen legt die Plattform die
Schweizer BKP-Standardgruppen an. Reihenfolge ist unkritisch – der Import
gleicht Gruppen über die Ziffer ab (gleiche Ziffer = gleiche Gruppe, Name
aus dem Alt-Tool gewinnt) und bringt fehlende selbst mit.

### 2. Rollen-Freigaben setzen

Tab **Rollen** → Spaltengruppen der beiden Module (Sehen/Bearbeiten).
Ohne Freigabe sehen nur Projekt-Admins das Modul. Vorschlag:

| Rolle       | Baukostenkontrolle | Leistungsverzeichnis |
| ----------- | ------------------ | -------------------- |
| Bauleitung  | Sehen + Bearbeiten | Sehen + Bearbeiten   |
| Bauherr     | Sehen              | Sehen                |
| Unternehmer | keine Freigabe     | keine Freigabe       |
| Architekt   | keine Freigabe (bei Bedarf anpassen) | keine Freigabe (bei Bedarf anpassen) |

- [ ] Freigaben gemäss Tabelle (oder abweichendem Entscheid) gesetzt und
      gespeichert

### 3. Modul-Einstellung `round5_totals` aktiv

Die 5-Rappen-Anzeige-/Totalisierungsregel ist für Wattwil **aktiv**
(Entscheid 4). Im Code ist «aktiv» der Default (nur ein explizites
`false` schaltet sie ab); zur Sicherheit explizit setzen – aktuell ohne
Admin-UI, per SQL-Editor:

```sql
update project_modules
set settings = settings || '{"round5_totals": true}'
where project_id = (select id from projects where slug = 'mcd-wattwil')
  and module_key = 'baukostenkontrolle';
```

- [ ] `round5_totals = true` gesetzt bzw. verifiziert

### 4. Sichtkontrolle pro Rolle

- [ ] Bauleitung: beide Module im Hub sichtbar, Bearbeitung möglich
      (Speichern-Button, Modals), BKK-Totale stimmen mit der
      Abgleichstabelle überein
- [ ] Bauherr: beide Module sichtbar, **keine** Bearbeitungselemente
- [ ] Unternehmer: keine Modul-Karten/-Links im Hub, Direktzugriff auf
      `/module/...` liefert 404
