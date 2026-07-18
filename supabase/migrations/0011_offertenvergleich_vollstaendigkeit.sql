-- =============================================================================
-- 0011 – Modul Offertenvergleich: Vollständigkeitsprüfung (O-M2)
--
-- Konzept Prüfmodul 1 (Schritt 4a): Aus Ausschreibung/Offerten extrahierte
-- Positionslisten (Anthropic-API, chunk-weise mit Wiederaufnahme) und die
-- daraus berechneten Abweichungen (fehlend, zusätzlich, Menge, Einheit,
-- Produktwechsel) mit interaktiver Bewertungsschleife
-- (offen → kritisch / tolerierbar / ignoriert).
--
-- Konventionen wie 0010: Präfix ov_, project_id denormalisiert, Beträge in
-- Rappen (bigint, _rp), Mengen numeric(14,3), RLS über can_view_module /
-- can_edit_module mit Modul-Key 'offertenvergleich'.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Extraktions-Fortschritt pro Dokument (Wiederaufnahme über Seitenfenster)
-- ---------------------------------------------------------------------------

alter table ov_dokumente
  add column parse_fortschritt jsonb not null default '{}';
  -- { "chunksTotal": 7, "chunksDone": [0,1,2], "seitenProChunk": 20 }

-- ---------------------------------------------------------------------------
-- 2) Extrahierte Positionen je Dokument (Ausschreibung oder Offerte)
-- ---------------------------------------------------------------------------

create table ov_dok_positionen (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  vergabe_id uuid not null references ov_vergaben(id) on delete cascade,
  dokument_id uuid not null references ov_dokumente(id) on delete cascade,
  npk text not null,                      -- normalisiert '211.711.222'
  bezeichnung text,
  menge numeric(14,3),
  einheit text,
  betrag_rp bigint,                       -- Einheitspreis, falls lesbar
  produkt text,                           -- genanntes Produkt/Fabrikat
  bemerkung text,                         -- 'Alternativposition', 'oder gleichwertig', …
  chunk int not null default 0,           -- Seitenfenster-Index der Extraktion
  unique (dokument_id, npk)
);

-- ---------------------------------------------------------------------------
-- 3) Abweichungen (Abgleich Referenzliste ↔ Offerte) mit Bewertungsschleife.
-- Schlüssel dokument_id+typ+npk macht Re-Prüfungen idempotent; die manuelle
-- Bewertung und Notiz überleben eine erneute Prüfung.
-- ---------------------------------------------------------------------------

create table ov_abweichungen (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  vergabe_id uuid not null references ov_vergaben(id) on delete cascade,
  dokument_id uuid not null references ov_dokumente(id) on delete cascade,
  bieter_id uuid references ov_bieter(id) on delete set null,
  typ text not null
    check (typ in ('fehlend', 'zusaetzlich', 'menge', 'einheit', 'produkt')),
  npk text not null,
  titel text not null,                    -- Positionsbezeichnung
  details jsonb not null default '{}',    -- { "erwartet": …, "gefunden": … }
  bewertung text not null default 'offen'
    check (bewertung in ('offen', 'kritisch', 'tolerierbar', 'ignoriert')),
  notiz text,
  created_at timestamptz not null default now(),
  unique (dokument_id, typ, npk)
);

create index ov_dok_positionen_project_idx on ov_dok_positionen (project_id);
create index ov_dok_positionen_vergabe_idx on ov_dok_positionen (vergabe_id);
create index ov_dok_positionen_dokument_idx on ov_dok_positionen (dokument_id);
create index ov_abweichungen_project_idx on ov_abweichungen (project_id);
create index ov_abweichungen_vergabe_idx on ov_abweichungen (vergabe_id);
create index ov_abweichungen_dokument_idx on ov_abweichungen (dokument_id);

-- ---------------------------------------------------------------------------
-- 4) RLS (Muster identisch 0010)
-- ---------------------------------------------------------------------------

alter table ov_dok_positionen enable row level security;
alter table ov_abweichungen enable row level security;

create policy ov_dok_positionen_select_viewers
  on ov_dok_positionen for select
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_view_module(project_id, 'offertenvergleich')
  );

create policy ov_dok_positionen_write_editors
  on ov_dok_positionen for all
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'offertenvergleich')
  )
  with check (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'offertenvergleich')
  );

create policy ov_abweichungen_select_viewers
  on ov_abweichungen for select
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_view_module(project_id, 'offertenvergleich')
  );

create policy ov_abweichungen_write_editors
  on ov_abweichungen for all
  to authenticated
  using (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'offertenvergleich')
  )
  with check (
    public.is_project_admin(project_id)
    or public.can_edit_module(project_id, 'offertenvergleich')
  );
