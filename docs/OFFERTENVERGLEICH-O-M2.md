# Modul «Offertenvergleich» – O-M2: Vollständigkeitsprüfung

Umsetzung von Konzept-Phase 2 (Prüfmodul 1, Schritt 4a): Upload und Parsing
der Original-Ausschreibung, automatischer Abgleich fehlender/abweichender
Positionen, Erkennung von Produktwechseln, interaktive Bewertungsschleife.
Schema: Migration `0011_offertenvergleich_vollstaendigkeit.sql`.

## Architektur

1. **KI-Extraktion** (`features/offertenvergleich/extract.ts`):
   Ausschreibungen und Offerten werden über die Anthropic-API gelesen
   (`claude-opus-4-8`, PDF nativ inkl. Vision auf Scans, Streaming,
   JSON-Schema-Output). Grosse Dokumente werden via `pdf-lib` in Fenster à
   15 Seiten zerlegt; jeder Chunk ist ein eigener Aufruf, das Resultat
   landet in `ov_dok_positionen`, der Fortschritt in
   `ov_dokumente.parse_fortschritt` (Wiederaufnahme).
2. **Prompt-Regeln** (entscheidend, in der Probe verifiziert): NPK immer
   drei Dreiergruppen Kapitel.Gruppe.Position; massgeblich ist die Nummer
   an der Mengen-/Preiszeile; **fünfstellige Spezifikationscodes (z.B.
   `12101` = Position 121, Merkmal 01) nennen die Position in den ersten
   drei Ziffern** – ohne diese Regel liefert das NPK-Bau-Druckbild
   (Weber/Vetter) Grundnummern statt der ausgepreisten Varianten.
3. **Deterministischer Abgleich** (`lib/ov-match.ts`, unit-getestet):
   fehlend / zusätzlich / Mengenabweichung / Einheiten-Wechsel (verdrängt
   die Mengenmeldung) / Produktwechsel (Token-Teilmengen tolerieren
   Schreibvarianten desselben Fabrikats). Einheiten-Normalisierung
   (m² = m2, St = Stk, …).
4. **Referenzliste**: die Ausschreibung, falls hochgeladen; sonst die
   Positionen des Positionenvergleichs (`ov_positionen`). Produktvorgaben
   («… oder gleichwertig») sind nur mit Ausschreibung prüfbar – der
   BauPlus-Export enthält keine Produkttexte.
5. **Job-Muster** wie O-M1 (`ov_jobs`, typ `vollstaendigkeit`, waitUntil,
   Polling): Stufen `extraktion` → `abgleich` → `fertig`. Reicht das
   Zeitbudget nicht (maxDuration 300 s), endet der Job mit stufe
   `fortsetzung` und der Client startet automatisch den Folge-Job
   (max. 20 Runden); zusätzlicher Heartbeat-Intervall alle 45 s, weil
   einzelne Scan-Chunks länger als der 2-min-Watchdog dauern können.
6. **Bewertungsschleife**: `ov_abweichungen.bewertung`
   (offen → kritisch / tolerierbar / ignoriert) + Notiz, im UI als Pills.
   Re-Prüfungen mergen über (dokument_id, typ, npk) – Bewertungen und
   Notizen bleiben erhalten. «Ignoriert» fliegt aus dem Bericht.
7. **Selbstprüfung Preis-Stichprobe**: extrahierte Positionsbeträge werden
   gegen die deterministische Matrix (`ov_angebote`) gehalten (±1 Rp);
   Resultat als Ampel am Dokument. Extraktions-Preise dienen NUR dieser
   Kontrolle, nie der Auswertung.
8. **Bericht**: neue Sektion «Vollständigkeitsprüfung» (nach den
   Bieter-Karten, «falls Abweichungen» gemäss Konzept-Berichtsaufbau) mit
   Typ-Tag, NPK, Delta (LV → Offerte), Bewertung und Notizen.

## Probe gegen die echten Offerten (BKP 211)

Abgleich der Extraktion gegen die deterministische Matrix
(Stichproben-Chunks, `tmp-ov-extract-probe.ts`, gelöscht nach O-M2):

| Offerte | Format | NPK | Mengen | Beträge |
|---|---|---|---|---|
| E. Weber | reiner Scan (Vision) | 36/36 | 36/36 | 36/36 (±1 Rp) |
| Vetter | Scan mit fehlerhaftem OCR | 62/62 | 62/62 | 60/60 |
| Oberhänsli | digital | 12/12 | 12/12 | – (LV-Teil unbepreist) |

Befund Oberhänsli: Die Offerte trägt Preise fast nur im Zusammenzug
(S. 1–2, Zwischentotal 2'323'354.85 = Kontrollsumme); der LV-Körper ist
weitgehend unbepreist. Für die Vollständigkeitsprüfung unerheblich
(NPK/Menge/Einheit zählen), die Preis-Stichprobe bleibt dort einfach klein.

## Bedienung

1. Offerten (und optional die Ausschreibung) in der Vergabe hochladen,
   Offerten-Dokumente dem Bieter zuordnen (Auswahl am Dokument; Bieter
   existieren nach der ersten Analyse).
2. «Vollständigkeit prüfen» – Stufen live, grosse Dokumente in Etappen.
3. Abweichungen bewerten (kritisch / tolerierbar / ignorieren) und
   Notizen erfassen; beides überlebt Re-Prüfungen.
4. PDF-Bericht erstellen – die Sektion erscheint, sobald nicht-ignorierte
   Abweichungen vorliegen.

## Grenzen / Ausblick (O-M3)

- Produktwechsel-Prüfung «erwartet vs. angeboten» braucht die
  Original-Ausschreibung; im Beispielsatz Wattwil liegt keine vor
  (Fallback Positionenvergleich validiert).
- Cross-BKP-Doppelverrechnung, Was-wäre-wenn und Export-Varianten bleiben
  O-M3 (Konzept Phase 3).
