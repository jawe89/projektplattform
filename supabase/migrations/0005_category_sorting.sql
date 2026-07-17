-- =============================================================================
-- 0005 – Sortierung pro Kategorie konfigurierbar (Optimierung nach Go-Live)
--
-- «manual» (Standard): heutiges Verhalten, Drag-Sortierung über documents.sort.
-- «field»: automatische Sortierung nach einem Feld aus dem field_schema der
-- Kategorie (z.B. Offerten nach BKP-Nr.), Richtung auf-/absteigend.
-- Gilt sinngemäss auch für Unterpositionen (Kind-Dokumente) der Kategorie.
-- Bestehende Kategorien bleiben auf «manual» – keine Verhaltensänderung.
-- =============================================================================

alter table categories
  add column sort_mode text not null default 'manual',
  add column sort_field text,
  add column sort_direction text not null default 'asc';

alter table categories
  add constraint categories_sort_mode_check
    check (sort_mode in ('manual', 'field')),
  add constraint categories_sort_direction_check
    check (sort_direction in ('asc', 'desc'));

comment on column categories.sort_mode is
  '«manual» = Drag-Sortierung (documents.sort), «field» = automatisch nach Feld';
comment on column categories.sort_field is
  'Feld-Key aus field_schema, nach dem sortiert wird (nur bei sort_mode=field)';
comment on column categories.sort_direction is
  'Sortierrichtung bei sort_mode=field: asc | desc';
