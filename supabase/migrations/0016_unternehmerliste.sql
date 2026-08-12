-- =============================================================================
-- 0016 – Modul «Unternehmerliste»
--
-- Kontaktverzeichnis je Projekt: BKP-Einträge (BKP-Nr. + Arbeitsgattung) mit
-- den beteiligten Unternehmern (Firma, Adresse, Ort, zuständige Person, Mail,
-- Telefon). Zusätzlich – projektweit – die zuständigen Personen der
-- Bauherrschaft (mehrere).
--
-- Aktivierung/Freigabe über das Modul-Framework (0006): pro Projekt
-- (project_modules), pro Rolle (role_module_access). RLS analog BKK/LV:
-- Lesen mit can_view_module, Schreiben mit can_edit_module (Admins immer).
-- =============================================================================

-- Modul-Schlüssel in den Check-Constraints ergänzen
alter table project_modules drop constraint project_modules_key_check;
alter table project_modules add constraint project_modules_key_check
  check (module_key in (
    'baukostenkontrolle', 'leistungsverzeichnis', 'offertenvergleich',
    'unternehmerliste'
  ));

alter table role_module_access drop constraint role_module_access_key_check;
alter table role_module_access add constraint role_module_access_key_check
  check (module_key in (
    'baukostenkontrolle', 'leistungsverzeichnis', 'offertenvergleich',
    'unternehmerliste'
  ));

-- Zuständige Personen der Bauherrschaft (projektweit, mehrere)
create table ul_bauherr_contacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null default '',
  funktion text not null default '',
  mail text not null default '',
  telefon text not null default '',
  sort int not null default 0,
  created_at timestamptz default now()
);

-- BKP-Einträge (BKP-Nr. + Arbeitsgattung)
create table ul_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  bkp text not null default '',
  arbeitsgattung text not null default '',
  sort int not null default 0,
  created_at timestamptz default now()
);

-- Unternehmer je BKP-Eintrag
create table ul_contractors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  entry_id uuid not null references ul_entries(id) on delete cascade,
  firma text not null default '',
  adresse text not null default '',
  ort text not null default '',
  kontakt_person text not null default '',
  mail text not null default '',
  telefon text not null default '',
  sort int not null default 0,
  created_at timestamptz default now()
);

create index ul_bauherr_contacts_project_idx on ul_bauherr_contacts (project_id);
create index ul_entries_project_idx on ul_entries (project_id);
create index ul_contractors_project_idx on ul_contractors (project_id);
create index ul_contractors_entry_idx on ul_contractors (entry_id);

-- ---------------------------------------------------------------------------
-- RLS: Lesen mit can_view_module, Schreiben mit can_edit_module (Admins immer)
-- ---------------------------------------------------------------------------
alter table ul_bauherr_contacts enable row level security;
alter table ul_entries enable row level security;
alter table ul_contractors enable row level security;

create policy ul_bauherr_select_viewers
  on ul_bauherr_contacts for select
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_view_module(project_id, 'unternehmerliste')
  );

create policy ul_bauherr_write_editors
  on ul_bauherr_contacts for all
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'unternehmerliste')
  )
  with check (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'unternehmerliste')
  );

create policy ul_entries_select_viewers
  on ul_entries for select
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_view_module(project_id, 'unternehmerliste')
  );

create policy ul_entries_write_editors
  on ul_entries for all
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'unternehmerliste')
  )
  with check (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'unternehmerliste')
  );

create policy ul_contractors_select_viewers
  on ul_contractors for select
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_view_module(project_id, 'unternehmerliste')
  );

create policy ul_contractors_write_editors
  on ul_contractors for all
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'unternehmerliste')
  )
  with check (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'unternehmerliste')
  );
