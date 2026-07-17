-- =============================================================================
-- 0008 – Modul Baukostenkontrolle: KV-Baselines als Historie (P2-M2, Lesart B)
--
-- Das KV-orig.-Datum ist keine fixe Moduleinstellung: Bei grossen
-- Projektänderungen wird ein revidierter KV zur neuen Referenz, der alte
-- bleibt nachvollziehbar. Die KV-Werte je Position werden baseline-bezogen
-- (bkk_position_baseline_values); die Spalte kv_orig_rp aus 0007 entfällt
-- (Dev-only, kein Bestand – sauberer Umbau statt Parallelstruktur).
-- kv_mut_rp bleibt die davon unabhängige Mutationsebene.
-- Die Moduleinstellung kv_orig_datum entfällt zugunsten des Baseline-Datums.
--
-- Import (P2-M4): Der Alt-Tool-Bestand wird als erste Baseline «KV orig.»
-- mit Datum 23.01.2026 angelegt, is_active = true.
-- =============================================================================

create table bkk_baselines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  bezeichnung text not null,            -- «KV orig.», «KV rev. 1», …
  datum date not null,
  is_active boolean not null default false,
  created_at timestamptz default now()
);

-- Genau eine aktive Baseline pro Projekt
create unique index bkk_baselines_active_idx
  on bkk_baselines (project_id)
  where is_active;

-- KV-Wert je Position und Baseline. Positionen ohne Zeile in einer Baseline
-- («nicht in dieser Baseline», z.B. später angelegte) zählen dort mit 0.
create table bkk_position_baseline_values (
  baseline_id uuid not null references bkk_baselines(id) on delete cascade,
  position_id uuid not null references bkk_positions(id) on delete cascade,
  kv_rp bigint not null default 0,
  primary key (baseline_id, position_id)
);

create index bkk_pbv_position_idx on bkk_position_baseline_values (position_id);

-- Umbau bkk_positions: kv_orig_rp entfällt (Werte leben in den Baselines).
-- Budgets von Positionen ausserhalb einer Baseline laufen über kv_mut_rp.
alter table bkk_positions drop column kv_orig_rp;

-- ---------------------------------------------------------------------------
-- RLS analog 0007: Lesen mit Modul-Sichtbarkeit, Schreiben mit
-- Modul-Bearbeitung (Projekt-/Plattform-Admins immer)
-- ---------------------------------------------------------------------------

alter table bkk_baselines enable row level security;
alter table bkk_position_baseline_values enable row level security;

create policy bkk_baselines_select_viewers
  on bkk_baselines for select
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_view_module(project_id, 'baukostenkontrolle')
  );

create policy bkk_baselines_write_editors
  on bkk_baselines for all
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'baukostenkontrolle')
  )
  with check (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'baukostenkontrolle')
  );

-- Werte-Zeilen tragen kein project_id – die Policies laufen über die Baseline
create policy bkk_pbv_select_viewers
  on bkk_position_baseline_values for select
  to authenticated
  using (
    exists (
      select 1 from bkk_baselines b
      where b.id = baseline_id
        and (
          public.is_project_admin(b.project_id)
          or public.can_view_module(b.project_id, 'baukostenkontrolle')
        )
    )
  );

create policy bkk_pbv_write_editors
  on bkk_position_baseline_values for all
  to authenticated
  using (
    exists (
      select 1 from bkk_baselines b
      where b.id = baseline_id
        and (
          public.is_project_admin(b.project_id)
          or public.can_edit_module(b.project_id, 'baukostenkontrolle')
        )
    )
  )
  with check (
    exists (
      select 1 from bkk_baselines b
      where b.id = baseline_id
        and (
          public.is_project_admin(b.project_id)
          or public.can_edit_module(b.project_id, 'baukostenkontrolle')
        )
    )
  );
