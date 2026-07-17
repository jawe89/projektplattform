-- =============================================================================
-- 0004 – Baumanagement pro Projekt konfigurierbar (Änderungsauftrag vor M2)
--
-- Das Baumanagement ist eine Projekteigenschaft (Name, Zusatz, Firmenlogo)
-- und wird pro Projekt in project_branding gepflegt statt hart codiert.
-- logo_path war faktisch das Logo der Baumanagement-Firma → eindeutige
-- Umbenennung in management_logo_path.
-- =============================================================================

alter table project_branding
  rename column logo_path to management_logo_path;

alter table project_branding
  add column management_name text,
  add column management_suffix text;

comment on column project_branding.management_logo_path is
  'Logo der Baumanagement-Firma (Bucket «branding», Pfad {project_id}/…)';
comment on column project_branding.management_name is
  'Name der Baumanagement-Firma, z.B. «Bau Innovation GmbH»';
comment on column project_branding.management_suffix is
  'Optionaler Zusatz unter dem Namen, z.B. «Baumanagement»';

-- Backfill: alle bestehenden Projekte wurden bisher von der Bau Innovation
-- GmbH betreut (bislang hart codierter Wert).
update project_branding
set management_name = 'Bau Innovation GmbH',
    management_suffix = 'Baumanagement'
where management_name is null;
