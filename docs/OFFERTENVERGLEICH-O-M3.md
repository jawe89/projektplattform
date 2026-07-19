# Modul «Offertenvergleich» – O-M3: zweite Preisquelle (Offerten)

Produktiv-Befund BKP 281.6: Bei ausserhalb von BauPlus (hand- oder
PDF-)ausgefüllten Offerten kann der Positionenvergleich **preislos** sein
(oder – wie beim ersten 281.6-Fund – die Preise tragen einen blanken
LV-Kurzform-Präfix `- -`, siehe Parser-Fix). Diese Runde macht das Modul
belastbar, wenn die Preise nicht aus dem BauPlus-Vergleich kommen.

Schema: Migration `0012_offertenvergleich_preisquelle.sql`
(`ov_dok_positionen.handschriftlich`).

## Vier Bausteine

1. **Frühwarnung statt Nullanalyse** (`lib/ov-parse.ts` → `hatPreise`,
   `analyse.ts`): Erkennt der Parser 0 Preiszeilen mit Beträgen, bricht die
   Analyse aus dem Positionenvergleich VOR der KI ab (Job-`stufe`
   `keine_preise`) – keine teure Nullanalyse. Das UI zeigt einen
   Warnhinweis mit Direkt-Button zur Offerten-Analyse.

2. **Zweite Preisquelle** (`features/offertenvergleich/extract-offerten.ts`,
   `lib/ov-offerten-matrix.ts`): Die Preismatrix wird alternativ aus der
   KI-Extraktion der Offerten gebaut (derselbe Weg wie O-M2: pdf-lib +
   Anthropic-Vision, auch Scans). Bieter kommen aus dem Vergleichskopf,
   Positionen und Preise aus den Offerten (je Offerte einem Bieter
   zugeordnet). Quelle wählbar über zwei Buttons; die effektive Quelle
   liegt im Auswertungs-Snapshot (`inhalt.preisquelle`) und wird in UI und
   Bericht ausgewiesen («Preise aus: …») – wesentlich für die Belastbarkeit.

3. **Handschrift** (`extract.ts`-Prompt + Schema `handschriftlich`): Der
   Extraktions-Prompt liest handschriftliche Einheitspreise/Mengen und
   erkennt handschriftliche Korrekturen/Streichungen/Ergänzungen im LV.
   Handschriftlich gelesene Werte werden NIE stillschweigend wie
   Digitaldaten behandelt: Markierung «✎» in der UI-Hot-Spot-Tabelle und
   «\* handschriftlich erfasst – bitte prüfen» im Bericht, plus Zähler-Pille
   in der Auswertung. Absicherung bleibt die **Kontrollsummen-Ampel**
   (extrahierte Positionssumme je Bieter gegen den Offerten-Endbetrag).

4. **Umgekehrter Ablauf** (`ov-client.tsx`): Bei der Offerten-Quelle kehrt
   sich die Reihenfolge um (erst Offerten hochladen + Bietern zuordnen,
   dann Analyse). Ein Ablauf-Hinweis über den beiden Buttons deckt beide
   Fälle ab; die Offerten-Extraktion läuft chunk-weise mit Fortsetzung
   (wie O-M2) unter maxDuration.

## Verifikation (echte 281.6-Offerten, lokale Extraktions-Probe)

Extrahierte Positionssumme je Bieter gegen die Offerten-Endbeträge:

| Bieter | Format | Positionen | handschriftlich | Summe | Kontrollsumme | Diff |
|---|---|---|---|---|---|---|
| Philippin | Scan, handschriftlich | 24 | 23 | 83'539.50 | 83'540 | 0.50 |
| Baschti | handschriftlich | 24 | 23 | 89'440.00 | 89'440 | 0.00 |
| El-ba | digital | 24 | 0 | 92'178.00 | 92'178 | 0.00 |

Handschriftliche Korrekturen und Streichungen wurden erkannt (Philippin
645.141.101 Schichtdicke 5→6 mm; 645.321.802 «400x400» durchgestrichen).
Die 0.50 bei Philippin (eine handschriftlich abgelesene Ziffer) liegt
innerhalb der Ampel-Toleranz.

Der vollständige DB-E2E durchs Modul (Vergabe 281.6 auf Dev, «Analyse aus
Offerten») bestätigt: Totale exakt 83'539.50 / 89'440.00 / 92'178.00,
Kontrollsummen-Ampel (Philippin «Diff -0.50», Baschti/El-ba
«deckungsgleich»), 46 handschriftlich markierte Werte (UI «✎», Bericht
«\*»), Quelle-Label in UI und Bericht, Bericht als saubere
Seite-an-Seite-Tabelle.

### NPK-Angleichung über Offerten (wichtig)

Unabhängig extrahierte Offerten vergeben teils unterschiedliche
NPK-Nummern für dieselbe Position – im 281.6-Fall liess **El-ba** die
Kapitelnummer weg («152.101» statt «645.152.101»), während Philippin und
Baschti die volle Nummer trugen. Ohne Angleichung fluchten die Preise
nebeneinander nicht (nur 6 von 41 Positionen von allen drei Bietern
bepreist). `baueOffertenMatrix` bildet daher einen 2-Gruppen-NPK auf die
**eindeutige** 3-Gruppen-Entsprechung der anderen Offerten ab (Ende
gleich, Kapitel eindeutig). Ergebnis: 24 Positionen, 20 von allen drei
Bietern bepreist, alle unter Kapitel 645; Totale unverändert. Bleibt die
Zuordnung mehrdeutig, wird nicht abgebildet (unit-getestet).

Zum Vergleich: Der **Positionenvergleich** (Parser-Fix `- -`) liefert
81'039.50 / 86'940 / 89'678 – je Fr. 2'500 tiefer, weil BauPlus die
Regie-Annahme (Pos. 181.801 «Kostenschätzung Fr. 2500») nicht in die
Bieterspalten stellt; die Offerten enthalten sie. Beide Quellen sind
dadurch nachvollziehbar.

## Deploy-Reihenfolge (wichtig)

Die refaktorierte Extraktion schreibt `handschriftlich` in
`ov_dok_positionen` – das nutzt auch die **bestehende**
Vollständigkeitsprüfung. Migration `0012` daher **zuerst Dev, dann Prod
VOR dem Code-Deploy** einspielen. Die Analyse aus dem Positionenvergleich
(211/271) berührt keine neue Spalte und bleibt auch ohne 0012 lauffähig.
