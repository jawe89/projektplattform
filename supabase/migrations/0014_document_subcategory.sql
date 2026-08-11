-- 0014: Unterkategorien für Dokumente (z.B. Pläne nach «Grundrisse»,
-- «Schnitte», «Fassaden» gruppieren). Die Gruppen entstehen on-the-fly aus
-- den im Hub vergebenen Namen – keine separate Taxonomie-Tabelle nötig.
--
-- Opt-in pro Kategorie über field_schema.allowSubcategories (jsonb, kein
-- Schemawechsel). Die Zuordnung je Dokument liegt in dieser Spalte; null bzw.
-- leer = «Ohne Unterkategorie».

alter table documents
  add column if not exists subcategory text;

-- RLS unverändert: Schreiben/Lesen auf documents ist bereits durch die
-- bestehenden Policies (can_upload / can_view) geregelt; eine zusätzliche
-- Textspalte erfordert keine neue Policy.
