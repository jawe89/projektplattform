-- =============================================================================
-- 0015 – Dokumentgenaue Rollen-Freigabe (Sehen/Öffnen)
--
-- Ergänzt die kategorieweite Sichtbarkeit (role_category_access) um eine
-- Feinsteuerung PRO DOKUMENT: z.B. dürfen in «Übersichtsdokumenten» alle den
-- Terminplan öffnen, aber nur ausgewählte Rollen das Projektmerkblatt.
--
-- Modell (subtraktiv, nie additiv über die Kategorie hinaus):
--  * Hat ein Dokument KEINE Zeile hier  → es erbt die Kategorie-Sichtbarkeit
--    (alle Rollen mit can_view sehen es) – bestehende Dokumente unverändert.
--  * Hat ein Dokument mindestens eine Zeile → «eingeschränkt»: nur die
--    aufgeführten Rollen (zusätzlich zur Kategorie-Sichtbarkeit) sehen es.
--  * Projekt-/Plattform-Admins sehen immer alles (wie bisher).
--  * Upload/Bearbeiten bleibt kategorieweit (role_category_access) – hier geht
--    es ausschliesslich ums Sehen/Öffnen.
-- =============================================================================

create table document_role_access (
  document_id uuid not null references documents(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  primary key (document_id, role_id)
);

-- Konsistenz: Rolle und Dokument müssen zum selben Projekt gehören.
create or replace function public.guard_document_role_access_project()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from documents d
    join roles r on r.id = new.role_id
    where d.id = new.document_id
      and d.project_id = r.project_id
  ) then
    raise exception 'Rolle und Dokument gehören nicht zum selben Projekt.';
  end if;
  return new;
end;
$$;

create trigger document_role_access_guard_project
  before insert or update on document_role_access
  for each row execute function public.guard_document_role_access_project();

-- Sichtbarkeit eines Dokuments für die Rolle des eingeloggten Users:
-- keine dokumentspezifische Einschränkung ODER die eigene Rolle ist freigegeben.
create or replace function public.can_view_document(p_document_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    not exists (
      select 1 from document_role_access dra
      where dra.document_id = p_document_id
    )
    or exists (
      select 1
      from project_members pm
      join document_role_access dra on dra.role_id = pm.role_id
      where pm.user_id = auth.uid()
        and dra.document_id = p_document_id
    );
$$;

grant execute on function public.can_view_document(uuid) to anon, authenticated;

-- documents-Lesepolicy um die dokumentgenaue Prüfung verschärfen.
drop policy documents_select_members on documents;
create policy documents_select_members
  on documents for select
  to authenticated
  using (
    public.is_project_admin(project_id)
    or (
      public.is_project_member(project_id)
      and public.can_view_category(category_id)
      and public.can_view_document(id)
    )
  );

-- ---------------------------------------------------------------------------
-- RLS auf document_role_access: lesbar für Projektmitglieder/Admins,
-- schreiben nur Projekt-Admins (jeweils des Projekts des Dokuments).
-- ---------------------------------------------------------------------------
alter table document_role_access enable row level security;

create policy dra_select_members
  on document_role_access for select
  to authenticated
  using (
    exists (
      select 1 from documents d
      where d.id = document_id
        and (public.is_project_admin(d.project_id) or public.is_project_member(d.project_id))
    )
  );

create policy dra_write_admins
  on document_role_access for all
  to authenticated
  using (
    exists (
      select 1 from documents d
      where d.id = document_id and public.is_project_admin(d.project_id)
    )
  )
  with check (
    exists (
      select 1 from documents d
      where d.id = document_id and public.is_project_admin(d.project_id)
    )
  );
