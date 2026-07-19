-- =============================================================================
-- 0012 – Modul Offertenvergleich: zweite Preisquelle (Offerten-Extraktion)
--
-- Produktiv-Befund BKP 281.6: Bei ausserhalb von BauPlus (hand-/PDF-)
-- ausgefüllten Offerten kann der Positionenvergleich preislos sein. Dann
-- wird die Preismatrix alternativ aus der KI-Extraktion der Offerten
-- gebaut (O-M2-Weg: pdf-lib + Anthropic-Vision, auch auf Scans/Handschrift).
--
-- handschriftlich: pro extrahierter Position, ob der Wert handschriftlich
-- gelesen wurde (Kennzeichnung «bitte prüfen» in UI und Bericht). Die
-- gewählte Preisquelle liegt im Auswertungs-Snapshot (ov_auswertungen.inhalt),
-- daher keine Spalte auf ov_vergaben nötig.
--
-- WICHTIG (Deploy-Reihenfolge): Diese Migration liest die bestehende
-- Vollständigkeitsprüfung mit (sie schreibt handschriftlich in
-- ov_dok_positionen) – zuerst Dev, dann Prod VOR dem Code-Deploy einspielen.
-- =============================================================================

alter table ov_dok_positionen
  add column handschriftlich boolean not null default false;
