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

## E2E-Nachweis (Wattwil-Dev, BKP 211, alle drei echten Offerten)

Voller Lauf über das UI (26 Chunks, automatische Fortsetzungsrunden):

| Offerte | Format | Extrahiert | Preis-Stichprobe | Abweichungen |
|---|---|---|---|---|
| Vetter | Scan, fehlerhaftes OCR | 191/191 | 184/184 (±1 Rp) | 6 |
| E. Weber | reiner Scan (Vision) | 191/191 | 187/187 (±1 Rp) | 6 |
| Oberhänsli | digital | 191/191 | – (LV-Teil unbepreist) | 7 |

Die Abweichungen sind fachlich echt und konsistent über alle drei
Offerten: die drei Regie-Faktorpositionen, die der BauPlus-Vergleich
unter 111.100.00x führt, die Offerten aber unter ihren NPK-Nummern
111.231.002/111.411.002/111.411.003 (je ein fehlend/zusätzlich-Paar über
Gruppengrenzen – bewusst NICHT automatisch gepaart), plus bei Oberhänsli
ein Einheiten-Wechsel LE→gl (161.111.002).

Befund Oberhänsli: Die Offerte trägt Preise fast nur im Zusammenzug
(S. 1–2, Zwischentotal 2'323'354.85 = Kontrollsumme); der LV-Körper ist
weitgehend unbepreist. Für die Vollständigkeitsprüfung unerheblich
(NPK/Menge/Einheit zählen), die Preis-Stichprobe bleibt dort einfach klein.

Erkenntnisse aus dem E2E (im Code umgesetzt):

- **Kurztext-LV (NPK-Bau-Druck)**: Ohne explizite Negativ-Beispiele für
  die Merkmalcode-Regel («20103 → Position 201, NICHT 200») und die
  Ebenen-Klärung Abschnitt/Gruppe/Position las das Modell in einzelnen
  Kapiteln Grundnummern statt Varianten (Weber zunächst 132/191 mit 185
  Scheinabweichungen; nach Prompt-Schärfung 191/191 mit 6).
- **NPK-Matcher-Fallback** (`lib/ov-match.ts`): Grundnummer↔Variante-
  Paare (gleiche Kapitel+Gruppe, Position bis auf letzte Ziffer gleich,
  Menge+Einheit exakt, eindeutige 1:1-Zuordnung) gelten als dieselbe
  Position – fängt Druck-Varianten deterministisch ab.
- **Heartbeat während langer Chunks**: Supabase-Query-Builder sind lazy;
  ein `void builder` im setInterval feuert NIE (Watchdog-Fehlabbruch) –
  Queries immer `await`en oder `.then()` aufrufen.
- **Report-Fonts**: Kein `fontStyle: italic` (keine Italic-TTF
  eingebettet) und keine Pfeile «→/↔» (fehlen in Antonio/Montserrat,
  rendern als Ersatzzeichen).

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
