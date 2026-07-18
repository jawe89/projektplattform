-- =============================================================================
-- 0010 – Modul Offertenvergleich: Schema (O-M1)
--
-- Freigegebener Entwurf aus docs/OFFERTENVERGLEICH-O-M0.md (Abschnitt d).
-- Konventionen wie BKK/LV: Präfix ov_, project_id auf jeder Tabelle
-- denormalisiert (einfache RLS), Beträge als Ganzzahl-Rappen (bigint,
-- Suffix _rp), Mengen numeric(14,3). Berechnete Werte (Median-Deltas,
-- Ranking, Kostenblock-Summen) werden NICHT gespeichert – Logik in
-- lib/ov-calc.ts; das Analyse-Resultat (inkl. KI-Erkenntnisse/Fazit)
-- liegt als Snapshot in ov_auswertungen.inhalt.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Modul-Key-Constraint erweitern (0006)
-- ---------------------------------------------------------------------------

alter table project_modules drop constraint project_modules_key_check;
alter table project_modules add constraint project_modules_key_check
  check (module_key in ('baukostenkontrolle', 'leistungsverzeichnis', 'offertenvergleich'));

alter table role_module_access drop constraint role_module_access_key_check;
alter table role_module_access add constraint role_module_access_key_check
  check (module_key in ('baukostenkontrolle', 'leistungsverzeichnis', 'offertenvergleich'));

-- ---------------------------------------------------------------------------
-- 2) Tabellen
-- ---------------------------------------------------------------------------

-- Vergabe-Prozesse (Konzept Screen 1: Liste pro Projekt, sortiert nach BKP)
create table ov_vergaben (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  bkp text not null,                      -- '211', '211.4'
  titel text not null,                    -- 'Baumeisterarbeiten + Baugrube'
  lv_nummer text,                         -- '21100'
  stand date,                             -- Datum des Positionenvergleichs
  status text not null default 'offen'
    check (status in ('offen', 'in_pruefung', 'abgeschlossen')),
  notiz text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, bkp)
);

-- Bieter pro Vergabe (aus dem BauPlus-Spaltenkopf extrahiert, editierbar).
-- kontrollsumme_rp = Offerten-Endbetrag (Brutto vor Rabatt/Skonto/MwSt) für
-- den Summen-Abgleich; automatisch extrahiert oder manuell erfasst.
create table ov_bieter (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  vergabe_id uuid not null references ov_vergaben(id) on delete cascade,
  name text not null,
  ort text,
  telefon text,
  kontrollsumme_rp bigint,
  sort int not null default 0
);

-- Hochgeladene PDFs (Metadaten; Dateien im Bucket project-files unter
-- {project_id}/offertenvergleich/{vergabe_id}/…)
create table ov_dokumente (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  vergabe_id uuid not null references ov_vergaben(id) on delete cascade,
  art text not null
    check (art in ('positionenvergleich', 'ausschreibung', 'offerte', 'beilage')),
  bieter_id uuid references ov_bieter(id) on delete set null,  -- bei Offerten
  file_path text not null,
  original_name text not null,
  seiten int,
  parse_status text not null default 'neu'
    check (parse_status in ('neu', 'geparst', 'fehler')),
  parse_fehler text,
  created_at timestamptz not null default now()
);

-- NPK-Positionen (O-M1: aus dem Positionenvergleich; O-M2: aus der
-- Ausschreibung als Referenzliste). wichtig = Auswahl für den Bericht
-- («wichtige Positionen», interaktiv verfeinerbar).
create table ov_positionen (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  vergabe_id uuid not null references ov_vergaben(id) on delete cascade,
  npk text not null,                      -- '211.711.222' (Kapitel.Gruppe.Pos)
  bezeichnung text not null,
  menge numeric(14,3),
  einheit text,
  kostenblock text,                       -- 'Entsorgung', 'Baustelleneinrichtung', …
  wichtig boolean not null default false,
  sort int not null default 0,
  unique (vergabe_id, npk)
);

-- Preise pro Position und Bieter (betrag_rp null = «inkl.»)
create table ov_angebote (
  project_id uuid not null references projects(id) on delete cascade,
  position_id uuid not null references ov_positionen(id) on delete cascade,
  bieter_id uuid not null references ov_bieter(id) on delete cascade,
  betrag_rp bigint,
  is_inkl boolean not null default false,
  flags jsonb not null default '[]',      -- ['negativ','einheitspreis_1','ausreisser',…]
  primary key (position_id, bieter_id)
);

-- Auswertungen: Analyse-Snapshot (Statistik, Hot Spots, Erkenntnisse, Fazit,
-- Bewertungen, Selbstprüfungen) + archivierter PDF-Report
create table ov_auswertungen (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  vergabe_id uuid not null references ov_vergaben(id) on delete cascade,
  inhalt jsonb not null,
  report_file_path text,
  created_at timestamptz not null default now()
);

-- Job-Status für lange Analysen (Polling; docs/OFFERTENVERGLEICH-O-M0.md (c))
create table ov_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  vergabe_id uuid not null references ov_vergaben(id) on delete cascade,
  typ text not null check (typ in ('analyse', 'report', 'vollstaendigkeit')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'error')),
  stufe text,                             -- 'parsing' | 'statistik' | 'ki' | 'fertig'
  fehler text,
  auswertung_id uuid references ov_auswertungen(id) on delete set null,
  heartbeat_at timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index ov_vergaben_project_idx on ov_vergaben (project_id);
create index ov_bieter_project_idx on ov_bieter (project_id);
create index ov_bieter_vergabe_idx on ov_bieter (vergabe_id);
create index ov_dokumente_project_idx on ov_dokumente (project_id);
create index ov_dokumente_vergabe_idx on ov_dokumente (vergabe_id);
create index ov_positionen_project_idx on ov_positionen (project_id);
create index ov_positionen_vergabe_idx on ov_positionen (vergabe_id);
create index ov_angebote_project_idx on ov_angebote (project_id);
create index ov_angebote_bieter_idx on ov_angebote (bieter_id);
create index ov_auswertungen_project_idx on ov_auswertungen (project_id);
create index ov_auswertungen_vergabe_idx on ov_auswertungen (vergabe_id);
create index ov_jobs_project_idx on ov_jobs (project_id);
create index ov_jobs_vergabe_idx on ov_jobs (vergabe_id);

-- ---------------------------------------------------------------------------
-- 3) RLS – Lesen mit Modul-Sichtbarkeit, Schreiben mit Modul-Bearbeitung
-- (Projekt-/Plattform-Admins immer; Helfer aus 0002/0006, Muster wie 0007)
-- ---------------------------------------------------------------------------

alter table ov_vergaben enable row level security;
alter table ov_bieter enable row level security;
alter table ov_dokumente enable row level security;
alter table ov_positionen enable row level security;
alter table ov_angebote enable row level security;
alter table ov_auswertungen enable row level security;
alter table ov_jobs enable row level security;

create policy ov_vergaben_select_viewers
  on ov_vergaben for select
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_view_module(project_id, 'offertenvergleich')
  );

create policy ov_vergaben_write_editors
  on ov_vergaben for all
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'offertenvergleich')
  )
  with check (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'offertenvergleich')
  );

create policy ov_bieter_select_viewers
  on ov_bieter for select
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_view_module(project_id, 'offertenvergleich')
  );

create policy ov_bieter_write_editors
  on ov_bieter for all
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'offertenvergleich')
  )
  with check (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'offertenvergleich')
  );

create policy ov_dokumente_select_viewers
  on ov_dokumente for select
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_view_module(project_id, 'offertenvergleich')
  );

create policy ov_dokumente_write_editors
  on ov_dokumente for all
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'offertenvergleich')
  )
  with check (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'offertenvergleich')
  );

create policy ov_positionen_select_viewers
  on ov_positionen for select
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_view_module(project_id, 'offertenvergleich')
  );

create policy ov_positionen_write_editors
  on ov_positionen for all
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'offertenvergleich')
  )
  with check (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'offertenvergleich')
  );

create policy ov_angebote_select_viewers
  on ov_angebote for select
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_view_module(project_id, 'offertenvergleich')
  );

create policy ov_angebote_write_editors
  on ov_angebote for all
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'offertenvergleich')
  )
  with check (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'offertenvergleich')
  );

create policy ov_auswertungen_select_viewers
  on ov_auswertungen for select
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_view_module(project_id, 'offertenvergleich')
  );

create policy ov_auswertungen_write_editors
  on ov_auswertungen for all
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'offertenvergleich')
  )
  with check (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'offertenvergleich')
  );

create policy ov_jobs_select_viewers
  on ov_jobs for select
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_view_module(project_id, 'offertenvergleich')
  );

create policy ov_jobs_write_editors
  on ov_jobs for all
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'offertenvergleich')
  )
  with check (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'offertenvergleich')
  );

-- ---------------------------------------------------------------------------
-- 4) Storage: Modul-Zweig für den Pfad {project_id}/offertenvergleich/…
-- Die 0003-Policies prüfen das zweite Pfadsegment als Kategorie-Schlüssel;
-- Policies sind OR-verknüpft – diese Zusatz-Policies öffnen den Modul-Pfad
-- über can_view_module/can_edit_module (Admins über is_project_admin).
-- ---------------------------------------------------------------------------

create policy "project-files select offertenvergleich"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'project-files'
    and (storage.foldername(name))[2] = 'offertenvergleich'
    and (
      public.is_project_admin(public.storage_path_project_id(name))
      or public.can_view_module(public.storage_path_project_id(name), 'offertenvergleich')
    )
  );

create policy "project-files insert offertenvergleich"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'project-files'
    and (storage.foldername(name))[2] = 'offertenvergleich'
    and (
      public.is_project_admin(public.storage_path_project_id(name))
      or public.can_edit_module(public.storage_path_project_id(name), 'offertenvergleich')
    )
  );

create policy "project-files update offertenvergleich"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'project-files'
    and (storage.foldername(name))[2] = 'offertenvergleich'
    and (
      public.is_project_admin(public.storage_path_project_id(name))
      or public.can_edit_module(public.storage_path_project_id(name), 'offertenvergleich')
    )
  );

create policy "project-files delete offertenvergleich"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'project-files'
    and (storage.foldername(name))[2] = 'offertenvergleich'
    and (
      public.is_project_admin(public.storage_path_project_id(name))
      or public.can_edit_module(public.storage_path_project_id(name), 'offertenvergleich')
    )
  );
