# Demo-Projekt «Bürohaus Demo Frauenfeld» – Vorführkulisse

Das Demo-Projekt (Slug `demo-buerohaus`) dient als Vorführkulisse für
Interessenten: erkennbar fiktiv (Muster Bau AG, Beispiel Elektro AG, …,
keine realen Anbieter), aber fachlich realistisch mit Schweizer
Konventionen (BKP-Nummern, CHF-Beträge, TT.MM.JJJJ).

## Showcase-Zustand herstellen / wiederherstellen

```
npm run seed:demo-showcase              # Dev (.env.local)
$env:TARGET='prod'; npm run seed:demo-showcase   # Produktion (nach Go)
```

Das Skript `scripts/seed-demo-showcase.ts` ist idempotent (feste,
deterministische IDs) und **stellt den Showcase-Zustand jederzeit
wieder her**: Es setzt Landingpage, Dokumente, Module/Freigaben, BKK und
LV auf den definierten Stand zurück – während einer Vorführung angelegte
oder veränderte Inhalte im Demo-Projekt werden dabei entfernt bzw.
überschrieben. Selbstprüfungen im Skript stellen sicher, dass alle fünf
BKK-Status-Fälle und alle vier LV-Stände vorkommen.

Inhalt:

- **Hub:** 24 Dokumente über alle fünf Kategorien (inkl. zwei
  Unterpositionen unter der Ausschreibung 211), je mit Platzhalter-PDF
  im Storage (signierte Downloads funktionieren echt).
- **BKK:** Baseline «KV orig.» (02.03.2026), 15 Positionen über die
  Gruppen 1/2/4/5/9, KV total CHF 6'810'000.00, Mutationen auf 211/230/272,
  Verträge/Zahlungen mit allen fünf Status-Fällen.
- **LV:** 15 Vergabeeinheiten mit gemischten Ständen (abgeschlossen,
  in Arbeit, offen, «nach Aufwand»), ✓-/⊘-Markern, einem Freitext
  («avisiert KW 34») und zwei Werkvertrags-Verknüpfungen in den Hub.
- **Module/Freigaben:** BKK + LV aktiv; Bauherr Sehen, Bauleitung
  Bearbeiten.

## Demo-Besucherkonto

| | |
|---|---|
| E-Mail | `info@wema-design.ch` |
| Passwort | `DemoBuerohaus2026!` |
| Rolle | Bauherr (Sehen – alle Kategorien und beide Module, keine Bearbeitung) |

Das Skript setzt das Passwort bei jedem Lauf auf diesen Wert zurück.
(`npm run cleanup:testusers` betrifft nur example.com-Konten – dieses
Konto bleibt bestehen.)

## Vorführ-Ablauf

Einstieg über die Landingpage (`demo-buerohaus.localhost:3000` bzw. die
Produktions-URL): Projektinfos, Hero mit Bildunterschriften, Login mit
dem Demo-Konto. Im Dokumenten-Hub zeigen die fünf Kategorien-Abschnitte,
die Suche und die Unterpositionen der Ausschreibung 211 die
Dokumentverwaltung. Über die dunklen Modul-Karten geht es in die
Baukostenkontrolle (KPI-Ampeln, Status-Pillen, Zwischentotale) und ins
Leistungsverzeichnis (Workflow-Matrix mit gemischten Ständen).
