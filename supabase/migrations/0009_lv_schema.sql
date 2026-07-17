-- =============================================================================
-- 0009 – Modul Verkehr-Leistungsverzeichnis: Schema (P2-M3)
--
-- Freigegebener Entwurf aus docs/P2-DATENMODELL.md (Abschnitt 2.2 + 4):
--  * lv_units: Vergabeeinheiten (~67 aus dem Alt-Tool-Katalog + eigene)
--  * lv_unit_steps: Workflow-Stand je Einheit und Schritt – pro Schritt ein
--    Datumsfeld PLUS separates Freitextfeld (Entscheid 3): der Import parst
--    strikte TT.MM.JJJJ-Werte ins Datumsfeld, alles andere («✓ erledigt»,
--    «⊘ nach Aufwand», KW-Angaben, Freitext) landet unverändert im Freitext.
--  * lv_offers: Offerten je Einheit (Entscheid 1: Tabelle wird angelegt,
--    der Import befüllt sie nicht – neues Feature nach dem Cutover).
--
-- RLS analog BKK (0007/0008): Lesen mit can_view_module, Schreiben mit
-- can_edit_module (Projekt-/Plattform-Admins immer).
-- =============================================================================

-- Vergabeeinheiten
create table lv_units (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  bkp text not null,
  name text not null,                       -- Arbeitsgattung
  is_custom boolean not null default false,
  hidden boolean not null default false,
  -- Verknüpfung zur Werkvertrags-Dokumentation im Hub (optional)
  werkvertrag_document_id uuid references documents(id) on delete set null,
  sort int not null default 0,
  unique (project_id, bkp)
);

-- Workflow-Stand je Einheit und Schritt (nur ausgefüllte Schritte als Zeile)
create table lv_unit_steps (
  unit_id uuid not null references lv_units(id) on delete cascade,
  step_key text not null check (step_key in (
    'lv_erstellt','lv_versendet','off_erhalten','av_erstellt','av_bh',
    'wv_erstellt','wv_unt','wv_bh','wv_zurueck')),
  datum date,                               -- strikt geparste TT.MM.JJJJ-Werte
  freitext text,                            -- alles Übrige, unverändert übernommen
  primary key (unit_id, step_key),
  constraint lv_unit_steps_value_check
    check (datum is not null or freitext is not null)
);

-- Offerten je Einheit (neues Feature – Migration lässt die Tabelle leer)
create table lv_offers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  unit_id uuid not null references lv_units(id) on delete cascade,
  unternehmer text not null,
  betrag_rp bigint,                         -- Rappen; null = Betrag noch offen
  datum date,
  document_id uuid references documents(id) on delete set null, -- Offerten-PDF im Hub
  created_at timestamptz default now()
);

create index lv_units_project_idx on lv_units (project_id);
create index lv_offers_project_idx on lv_offers (project_id);
create index lv_offers_unit_idx on lv_offers (unit_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table lv_units enable row level security;
alter table lv_unit_steps enable row level security;
alter table lv_offers enable row level security;

create policy lv_units_select_viewers
  on lv_units for select
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_view_module(project_id, 'leistungsverzeichnis')
  );

create policy lv_units_write_editors
  on lv_units for all
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'leistungsverzeichnis')
  )
  with check (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'leistungsverzeichnis')
  );

-- Schritt-Zeilen tragen kein project_id – die Policies laufen über die Einheit
create policy lv_unit_steps_select_viewers
  on lv_unit_steps for select
  to authenticated
  using (
    exists (
      select 1 from lv_units u
      where u.id = unit_id
        and (
          public.is_project_admin(u.project_id)
          or public.can_view_module(u.project_id, 'leistungsverzeichnis')
        )
    )
  );

create policy lv_unit_steps_write_editors
  on lv_unit_steps for all
  to authenticated
  using (
    exists (
      select 1 from lv_units u
      where u.id = unit_id
        and (
          public.is_project_admin(u.project_id)
          or public.can_edit_module(u.project_id, 'leistungsverzeichnis')
        )
    )
  )
  with check (
    exists (
      select 1 from lv_units u
      where u.id = unit_id
        and (
          public.is_project_admin(u.project_id)
          or public.can_edit_module(u.project_id, 'leistungsverzeichnis')
        )
    )
  );

create policy lv_offers_select_viewers
  on lv_offers for select
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_view_module(project_id, 'leistungsverzeichnis')
  );

create policy lv_offers_write_editors
  on lv_offers for all
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'leistungsverzeichnis')
  )
  with check (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'leistungsverzeichnis')
  );
