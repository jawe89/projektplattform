-- =============================================================================
-- 0003 – Storage (Kapitel 3 der SPEZIFIKATION.md)
--
--  * Bucket «project-files» (privat): Pfadkonvention {project_id}/{category_key}/{dateiname}
--    Policies analog documents; Auslieferung ausschliesslich über signierte URLs (1 h).
--  * Bucket «branding» (öffentlich lesbar): Logo/Hero, Pfad {project_id}/{dateiname}.
-- =============================================================================

insert into storage.buckets (id, name, public)
values
  ('project-files', 'project-files', false),
  ('branding', 'branding', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen: Pfad {project_id}/{category_key}/… auflösen
-- ---------------------------------------------------------------------------

create or replace function public.storage_path_project_id(p_name text)
returns uuid
language plpgsql immutable
as $$
begin
  return ((storage.foldername(p_name))[1])::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.storage_path_category_id(p_name text)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select c.id
  from categories c
  where c.project_id = public.storage_path_project_id(p_name)
    and c.key = (storage.foldername(p_name))[2];
$$;

grant execute on function
  public.storage_path_project_id(text),
  public.storage_path_category_id(text)
to anon, authenticated;

-- ---------------------------------------------------------------------------
-- project-files: Lesen analog documents-select, Schreiben analog documents-write
-- ---------------------------------------------------------------------------

create policy "project-files select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'project-files'
    and (
      public.is_project_admin(public.storage_path_project_id(name))
      or (
        public.is_project_member(public.storage_path_project_id(name))
        and public.can_view_category(public.storage_path_category_id(name))
      )
    )
  );

create policy "project-files insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'project-files'
    and (
      public.is_project_admin(public.storage_path_project_id(name))
      or (
        public.is_project_member(public.storage_path_project_id(name))
        and public.can_upload_category(public.storage_path_category_id(name))
      )
    )
  );

create policy "project-files update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'project-files'
    and (
      public.is_project_admin(public.storage_path_project_id(name))
      or (
        public.is_project_member(public.storage_path_project_id(name))
        and public.can_upload_category(public.storage_path_category_id(name))
      )
    )
  );

create policy "project-files delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'project-files'
    and (
      public.is_project_admin(public.storage_path_project_id(name))
      or (
        public.is_project_member(public.storage_path_project_id(name))
        and public.can_upload_category(public.storage_path_category_id(name))
      )
    )
  );

-- ---------------------------------------------------------------------------
-- branding: öffentlich lesbar; schreiben nur Projekt-/Plattform-Admins.
-- Pfadkonvention {project_id}/{dateiname}
-- ---------------------------------------------------------------------------

create policy "branding select public"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'branding');

create policy "branding insert admins"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'branding'
    and public.is_project_admin(public.storage_path_project_id(name))
  );

create policy "branding update admins"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'branding'
    and public.is_project_admin(public.storage_path_project_id(name))
  );

create policy "branding delete admins"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'branding'
    and public.is_project_admin(public.storage_path_project_id(name))
  );
