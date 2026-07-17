-- =============================================================================
-- 0002 – Row Level Security (RLS-Grundsätze aus Kapitel 3 der SPEZIFIKATION.md)
--
-- Grundsätze:
--  * projects, project_branding: Landingpage-Basisdaten öffentlich lesbar (anon).
--  * categories (nur can_view), documents: lesbar für project_members + platform_admins.
--  * Schreiben auf documents: platform_admins, is_project_admin, Rollen mit can_upload.
--  * Schreiben auf Konfigurationstabellen: nur platform_admins und is_project_admin
--    (Letztere nur im eigenen Projekt, keine Domain-/Projektanlage).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen (security definer, damit Policies nicht rekursiv über
-- project_members laufen)
-- ---------------------------------------------------------------------------

create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from platform_admins where user_id = auth.uid()
  );
$$;

create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from project_members
    where user_id = auth.uid() and project_id = p_project_id
  );
$$;

create or replace function public.is_project_admin(p_project_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_platform_admin() or exists (
    select 1 from project_members
    where user_id = auth.uid()
      and project_id = p_project_id
      and is_project_admin
  );
$$;

-- Sichtbarkeit der Kategorie für die Rolle des eingeloggten Users
create or replace function public.can_view_category(p_category_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from project_members pm
    join role_category_access rca on rca.role_id = pm.role_id
    where pm.user_id = auth.uid()
      and rca.category_id = p_category_id
      and rca.can_view
  );
$$;

-- Upload-Recht der Rolle des eingeloggten Users auf der Kategorie
create or replace function public.can_upload_category(p_category_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from project_members pm
    join role_category_access rca on rca.role_id = pm.role_id
    where pm.user_id = auth.uid()
      and rca.category_id = p_category_id
      and rca.can_upload
  );
$$;

grant execute on function
  public.is_platform_admin(),
  public.is_project_member(uuid),
  public.is_project_admin(uuid),
  public.can_view_category(uuid),
  public.can_upload_category(uuid)
to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS aktivieren
-- ---------------------------------------------------------------------------
alter table projects              enable row level security;
alter table project_branding      enable row level security;
alter table categories            enable row level security;
alter table documents             enable row level security;
alter table roles                 enable row level security;
alter table role_category_access  enable row level security;
alter table project_members       enable row level security;
alter table platform_admins       enable row level security;

-- ---------------------------------------------------------------------------
-- projects
-- Landingpage-Basisdaten (name, landing) sind öffentlich lesbar (anon) –
-- die Tabelle enthält keine schützenswerten Daten, daher Lesezugriff für alle.
-- ---------------------------------------------------------------------------
create policy projects_select_public
  on projects for select
  to anon, authenticated
  using (true);

create policy projects_insert_platform_admin
  on projects for insert
  to authenticated
  with check (public.is_platform_admin());

create policy projects_update_admins
  on projects for update
  to authenticated
  using (public.is_project_admin(id))
  with check (public.is_project_admin(id));

create policy projects_delete_platform_admin
  on projects for delete
  to authenticated
  using (public.is_platform_admin());

-- Projekt-Admins dürfen ihr Projekt pflegen, aber weder Domain noch Slug
-- ändern (Domain-/Projektanlage bleibt Sache der platform_admins).
create or replace function public.guard_project_restricted_columns()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if (new.domain is distinct from old.domain or new.slug is distinct from old.slug)
     and not public.is_platform_admin() then
    raise exception 'Nur Plattform-Admins dürfen Domain oder Slug ändern.';
  end if;
  return new;
end;
$$;

create trigger projects_guard_restricted_columns
  before update on projects
  for each row execute function public.guard_project_restricted_columns();

-- ---------------------------------------------------------------------------
-- project_branding (öffentlich lesbar für die Landingpage)
-- ---------------------------------------------------------------------------
create policy branding_select_public
  on project_branding for select
  to anon, authenticated
  using (true);

create policy branding_write_admins
  on project_branding for all
  to authenticated
  using (public.is_project_admin(project_id))
  with check (public.is_project_admin(project_id));

-- ---------------------------------------------------------------------------
-- categories: Mitglieder sehen nur can_view-Kategorien; Admins alles.
-- ---------------------------------------------------------------------------
create policy categories_select_members
  on categories for select
  to authenticated
  using (
    public.is_project_admin(project_id)
    or (public.is_project_member(project_id) and public.can_view_category(id))
  );

create policy categories_write_admins
  on categories for all
  to authenticated
  using (public.is_project_admin(project_id))
  with check (public.is_project_admin(project_id));

-- ---------------------------------------------------------------------------
-- documents: lesbar analog categories; schreiben für Admins und
-- Rollen mit can_upload auf der Kategorie.
-- ---------------------------------------------------------------------------
create policy documents_select_members
  on documents for select
  to authenticated
  using (
    public.is_project_admin(project_id)
    or (public.is_project_member(project_id) and public.can_view_category(category_id))
  );

create policy documents_insert_uploaders
  on documents for insert
  to authenticated
  with check (
    public.is_project_admin(project_id)
    or (public.is_project_member(project_id) and public.can_upload_category(category_id))
  );

create policy documents_update_uploaders
  on documents for update
  to authenticated
  using (
    public.is_project_admin(project_id)
    or (public.is_project_member(project_id) and public.can_upload_category(category_id))
  )
  with check (
    public.is_project_admin(project_id)
    or (public.is_project_member(project_id) and public.can_upload_category(category_id))
  );

create policy documents_delete_uploaders
  on documents for delete
  to authenticated
  using (
    public.is_project_admin(project_id)
    or (public.is_project_member(project_id) and public.can_upload_category(category_id))
  );

-- Konsistenz: category muss zum selben Projekt gehören wie das Dokument.
create or replace function public.guard_document_category_project()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from categories c
    where c.id = new.category_id and c.project_id = new.project_id
  ) then
    raise exception 'Kategorie gehört nicht zum Projekt des Dokuments.';
  end if;
  if new.parent_id is not null and not exists (
    select 1 from documents d
    where d.id = new.parent_id and d.project_id = new.project_id
  ) then
    raise exception 'Unterposition muss zum selben Projekt gehören.';
  end if;
  return new;
end;
$$;

create trigger documents_guard_category_project
  before insert or update on documents
  for each row execute function public.guard_document_category_project();

-- ---------------------------------------------------------------------------
-- roles: Mitglieder dürfen die Rollen ihres Projekts lesen (z.B. eigene
-- Rollenbezeichnung); schreiben nur Admins.
-- ---------------------------------------------------------------------------
create policy roles_select_members
  on roles for select
  to authenticated
  using (public.is_project_admin(project_id) or public.is_project_member(project_id));

create policy roles_write_admins
  on roles for all
  to authenticated
  using (public.is_project_admin(project_id))
  with check (public.is_project_admin(project_id));

-- ---------------------------------------------------------------------------
-- role_category_access: lesbar für Projektmitglieder (das UI braucht die
-- Matrix zur Filterung); schreiben nur Admins.
-- ---------------------------------------------------------------------------
create policy rca_select_members
  on role_category_access for select
  to authenticated
  using (
    exists (
      select 1 from roles r
      where r.id = role_id
        and (public.is_project_admin(r.project_id) or public.is_project_member(r.project_id))
    )
  );

create policy rca_write_admins
  on role_category_access for all
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

-- ---------------------------------------------------------------------------
-- project_members: eigener Eintrag lesbar; Admins verwalten ihr Projekt.
-- ---------------------------------------------------------------------------
create policy members_select_own_or_admin
  on project_members for select
  to authenticated
  using (user_id = auth.uid() or public.is_project_admin(project_id));

create policy members_write_admins
  on project_members for all
  to authenticated
  using (public.is_project_admin(project_id))
  with check (public.is_project_admin(project_id));

-- Rollen-Konsistenz: zugewiesene Rolle muss zum selben Projekt gehören.
create or replace function public.guard_member_role_project()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from roles r
    where r.id = new.role_id and r.project_id = new.project_id
  ) then
    raise exception 'Rolle gehört nicht zum Projekt des Mitglieds.';
  end if;
  return new;
end;
$$;

create trigger project_members_guard_role_project
  before insert or update on project_members
  for each row execute function public.guard_member_role_project();

-- ---------------------------------------------------------------------------
-- platform_admins: eigener Eintrag lesbar (für «bin ich Plattform-Admin?»),
-- Verwaltung nur über Service-Role (kein Insert/Update/Delete via API).
-- ---------------------------------------------------------------------------
create policy platform_admins_select_own
  on platform_admins for select
  to authenticated
  using (user_id = auth.uid());
