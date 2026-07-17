-- =============================================================================
-- 0007 – Modul Baukostenkontrolle: Schema (P2-M2)
--
-- Freigegebener Entwurf aus docs/P2-DATENMODELL.md (Abschnitt 1.3 + 4).
-- Beträge als Ganzzahl-Rappen (bigint, Suffix _rp), exakt gespeichert –
-- die 5-Rappen-Rundung ist reine Anzeige-/Totalisierungsregel
-- (project_modules.settings.round5_totals; Default Wattwil: aktiv).
-- Weitere Moduleinstellung: kv_orig_datum (ISO-Datum des Originalbudgets).
--
-- Berechnete Werte (Zwischentotale, Δ%, Status) werden NICHT gespeichert –
-- Logik in lib/bkk-calc.ts (abgesichert durch tests/bkk-calc.test.ts).
-- =============================================================================

-- BKP-Hauptgruppen (pro Projekt konfigurierbar, ersetzt die group-Zeilen
-- des Alt-Tool-Katalogs)
create table bkk_groups (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  digit text not null check (digit ~ '^[0-9]$'),  -- '0', '1', '2', …
  name text not null,                             -- «Grundstück», «Vorbereitung», …
  sort int not null default 0,
  unique (project_id, digit)
);

-- Positionen (Katalog + benutzerdefiniert, in einer Tabelle).
-- group_id wird beim Anlegen/Import mit der Gruppe der ersten BKP-Ziffer
-- vorbelegt und ist danach pro Position übersteuerbar (kein Laufzeit-Ableiten).
create table bkk_positions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  group_id uuid not null references bkk_groups(id),
  bkp text not null,                        -- '211', '211.9', '297.3a'
  name text not null,
  kv_orig_rp bigint not null default 0,     -- Originalbudget (Rappen, historisch fix)
  kv_mut_rp bigint,                         -- mutiertes KV; null = wie Original
  is_custom boolean not null default false, -- zählt nicht ins KV-orig.-Total
  hidden boolean not null default false,    -- ausgeblendet (zählt nur ins KV orig.)
  notiz text,                               -- Freitext (Nachträge, Rückbehalte, …)
  sort int not null default 0,
  unique (project_id, bkp)
);

-- Verträge und Zahlungen (gleiche Struktur → eine Tabelle mit Typ)
create table bkk_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  position_id uuid not null references bkk_positions(id) on delete cascade,
  entry_type text not null check (entry_type in ('vertrag', 'zahlung')),
  betrag_rp bigint not null,                -- exakt gespeichert, keine Rundung
  datum date,
  unternehmer text,
  notiz text,                               -- Freitext (z.B. Rückbehalt-Begründung)
  source_id text,                           -- Alt-Tool-ID (idempotenter Import)
  created_at timestamptz default now()
);

create index bkk_positions_project_idx on bkk_positions (project_id);
create index bkk_positions_group_idx on bkk_positions (group_id);
create index bkk_entries_project_idx on bkk_entries (project_id);
create index bkk_entries_position_idx on bkk_entries (position_id);

-- Idempotenter Import: eine Alt-Tool-ID darf pro Projekt nur einmal vorkommen
create unique index bkk_entries_source_idx
  on bkk_entries (project_id, source_id)
  where source_id is not null;

-- ---------------------------------------------------------------------------
-- RLS – Lesen mit Modul-Sichtbarkeit, Schreiben mit Modul-Bearbeitung
-- (Projekt-/Plattform-Admins immer; Helfer aus 0002/0006)
-- ---------------------------------------------------------------------------

alter table bkk_groups enable row level security;
alter table bkk_positions enable row level security;
alter table bkk_entries enable row level security;

create policy bkk_groups_select_viewers
  on bkk_groups for select
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_view_module(project_id, 'baukostenkontrolle')
  );

create policy bkk_groups_write_editors
  on bkk_groups for all
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'baukostenkontrolle')
  )
  with check (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'baukostenkontrolle')
  );

create policy bkk_positions_select_viewers
  on bkk_positions for select
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_view_module(project_id, 'baukostenkontrolle')
  );

create policy bkk_positions_write_editors
  on bkk_positions for all
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'baukostenkontrolle')
  )
  with check (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'baukostenkontrolle')
  );

create policy bkk_entries_select_viewers
  on bkk_entries for select
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_view_module(project_id, 'baukostenkontrolle')
  );

create policy bkk_entries_write_editors
  on bkk_entries for all
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'baukostenkontrolle')
  )
  with check (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'baukostenkontrolle')
  );
