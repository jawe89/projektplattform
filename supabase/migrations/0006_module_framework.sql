-- =============================================================================
-- 0006 – Modul-Framework (P2-M1)
--
-- Module (Baukostenkontrolle, Leistungsverzeichnis) sind pro Projekt
-- aktivierbar; die Sichtbarkeit/Bearbeitung wird pro Rolle freigegeben –
-- analog zur Kategorien-Matrix (role_category_access).
-- =============================================================================

create table project_modules (
  project_id uuid not null references projects(id) on delete cascade,
  module_key text not null,
  enabled boolean not null default false,
  settings jsonb not null default '{}',   -- z.B. KV-orig.-Datum (P2-M2)
  primary key (project_id, module_key),
  constraint project_modules_key_check
    check (module_key in ('baukostenkontrolle', 'leistungsverzeichnis'))
);

create table role_module_access (
  role_id uuid not null references roles(id) on delete cascade,
  module_key text not null,
  can_view boolean not null default true,
  can_edit boolean not null default false,
  primary key (role_id, module_key),
  constraint role_module_access_key_check
    check (module_key in ('baukostenkontrolle', 'leistungsverzeichnis'))
);

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen (security definer, analog can_view_category/can_upload_category)
-- ---------------------------------------------------------------------------

create or replace function public.can_view_module(p_project_id uuid, p_module_key text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from project_members pm
    join role_module_access rma on rma.role_id = pm.role_id
    where pm.user_id = auth.uid()
      and pm.project_id = p_project_id
      and rma.module_key = p_module_key
      and rma.can_view
  );
$$;

create or replace function public.can_edit_module(p_project_id uuid, p_module_key text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from project_members pm
    join role_module_access rma on rma.role_id = pm.role_id
    where pm.user_id = auth.uid()
      and pm.project_id = p_project_id
      and rma.module_key = p_module_key
      and rma.can_edit
  );
$$;

grant execute on function
  public.can_view_module(uuid, text),
  public.can_edit_module(uuid, text)
to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table project_modules enable row level security;
alter table role_module_access enable row level security;

-- project_modules: Mitglieder sehen die Modul-Aktivierung ihres Projekts
-- (das UI filtert die Rollen-Sichtbarkeit zusätzlich); schreiben nur Admins.
create policy project_modules_select_members
  on project_modules for select
  to authenticated
  using (public.is_project_admin(project_id) or public.is_project_member(project_id));

create policy project_modules_write_admins
  on project_modules for all
  to authenticated
  using (public.is_project_admin(project_id))
  with check (public.is_project_admin(project_id));

-- role_module_access: lesbar für Projektmitglieder (Rollen-Filterung im UI);
-- schreiben nur Admins – analog role_category_access.
create policy rma_select_members
  on role_module_access for select
  to authenticated
  using (
    exists (
      select 1 from roles r
      where r.id = role_id
        and (public.is_project_admin(r.project_id) or public.is_project_member(r.project_id))
    )
  );

create policy rma_write_admins
  on role_module_access for all
  to authenticated
  using (
    exists (
      select 1 from roles r
      where r.id = role_id and public.is_project_admin(r.project_id)
    )
  )
  with check (
    exists (
      select 1 from roles r
      where r.id = role_id and public.is_project_admin(r.project_id)
    )
  );
