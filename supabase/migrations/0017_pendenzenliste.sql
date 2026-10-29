-- =============================================================================
-- 0017 – Modul «Pendenzenliste»
--
-- Pendenzen je Projekt. Die zwei Kategorien «Offen» / «Erledigt» werden NICHT
-- gespeichert, sondern aus «erledigt_datum» abgeleitet: ist das Feld gesetzt,
-- gilt die Pendenz als erledigt – damit springt sie automatisch in «Erledigt».
--
-- Aktivierung/Freigabe über das Modul-Framework (0006): pro Projekt
-- (project_modules), pro Rolle (role_module_access). RLS analog BKK/LV/UL.
-- =============================================================================

alter table project_modules drop constraint project_modules_key_check;
alter table project_modules add constraint project_modules_key_check
  check (module_key in (
    'baukostenkontrolle', 'leistungsverzeichnis', 'offertenvergleich',
    'unternehmerliste', 'pendenzenliste'
  ));

alter table role_module_access drop constraint role_module_access_key_check;
alter table role_module_access add constraint role_module_access_key_check
  check (module_key in (
    'baukostenkontrolle', 'leistungsverzeichnis', 'offertenvergleich',
    'unternehmerliste', 'pendenzenliste'
  ));

create table pl_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  aufnahme_datum date,          -- Aufnahme Pendenz
  beschrieb text not null default '',
  verantwortlich text not null default '',
  faellig_datum date,           -- Zu erledigen bis
  erledigt_datum date,          -- Erledigt am (gesetzt = Kategorie «Erledigt»)
  sort int not null default 0,
  created_at timestamptz default now()
);

create index pl_items_project_idx on pl_items (project_id);

-- ---------------------------------------------------------------------------
-- RLS: Lesen mit can_view_module, Schreiben mit can_edit_module (Admins immer)
-- ---------------------------------------------------------------------------
alter table pl_items enable row level security;

create policy pl_items_select_viewers
  on pl_items for select
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_view_module(project_id, 'pendenzenliste')
  );

create policy pl_items_write_editors
  on pl_items for all
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'pendenzenliste')
  )
  with check (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'pendenzenliste')
  );
