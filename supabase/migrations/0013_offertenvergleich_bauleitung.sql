-- =============================================================================
-- 0013 – Modul Offertenvergleich: Bemerkungen und Vergabevorschlag
--
-- Einschätzung der Bauleitung pro Vergabe (getrennt von der objektiven
-- Auswertung): mehrzeilige Bemerkungen, ein vorgeschlagener Bieter (optional)
-- mit Begründung. Liegt auf ov_vergaben, überlebt daher Re-Analysen (wie
-- Kontrollsummen und die «wichtig»-Auswahl). Kein Hot-Path bestehender
-- Routen betroffen; zuerst Dev, dann Prod.
-- =============================================================================

alter table ov_vergaben
  add column bemerkungen text,
  add column vorschlag_bieter_id uuid references ov_bieter(id) on delete set null,
  add column vorschlag_begruendung text;
