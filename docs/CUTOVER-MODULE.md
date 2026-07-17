# Cutover Module Wattwil – Baukostenkontrolle & Leistungsverzeichnis

Umstellung der beiden Live-HTML-Tools (`tools.*`) auf die Plattform-Module
(P2-M4). **Der vollständige Ablauf** (Bearbeitungsstopp, frische
HTML-Snapshots, Migrationen 0006–0009 auf Produktion, idempotenter Import
mit Abgleichstabelle auf den Rappen, Umstellung der Hub-Links, Rollback)
**wird mit P2-M4 ergänzt** – dieses Dokument startet mit der
Konfigurations-Checkliste, die nach dem Import zwingend nötig ist.

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
