-- =============================================================================
-- 0001 – Schema (Kapitel 3 der SPEZIFIKATION.md)
-- =============================================================================

-- Projekte (Tenants)
create table projects (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,              -- z.B. 'mcd-wattwil'
  name text not null,                     -- «McDonald's Neubau Wattwil»
  project_no text,                        -- «MCD_239»
  domain text unique,                     -- «bauinnovation-mcdonalds-wattwil.ch»
  status text not null default 'active',  -- active | archived
  landing jsonb not null default '{}',    -- Info-Felder der Landingpage
  created_at timestamptz default now(),
  constraint projects_status_check check (status in ('active', 'archived'))
);

-- Branding pro Projekt
create table project_branding (
  project_id uuid primary key references projects(id) on delete cascade,
  logo_path text,
  hero_path text,
  font_display text not null default 'Antonio',
  font_body text not null default 'Montserrat',
  colors jsonb not null default '{
    "primary":"#7c7c7c","primaryDark":"#5a5a5a","accent":"#70ad47",
    "accentDark":"#5a9036","bg":"#f6f6f4","line":"#e5e5e5","ink":"#2b2b2b"
  }'
);

-- Kategorien pro Projekt, inkl. Feld-Schema
create table categories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  key text not null,                      -- 'plaene', 'offerten', …
  label text not null,                    -- «Pläne»
  add_label text,                         -- «+ Neuer Plan»
  layout text not null default 'list',    -- 'big' | 'list'
  sort int not null default 0,
  field_schema jsonb not null,
  unique (project_id, key),
  constraint categories_layout_check check (layout in ('big', 'list'))
);

-- Dokumente / Einträge
create table documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  parent_id uuid references documents(id) on delete cascade, -- Unterpositionen (Ausschreibungen)
  data jsonb not null,                    -- { "icon":"250", "title":"…", "sub":"…" }
  file_path text,                         -- Pfad im Storage-Bucket, ODER:
  external_url text,                      -- bestehende externe Links (Migration)
  sort int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Rollen pro Projekt
create table roles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,                     -- «Bauherr», «Unternehmer», …
  unique (project_id, name)
);

-- Sichtbarkeits-/Upload-Matrix Rolle × Kategorie
create table role_category_access (
  role_id uuid references roles(id) on delete cascade,
  category_id uuid references categories(id) on delete cascade,
  can_view boolean not null default true,
  can_upload boolean not null default false,
  primary key (role_id, category_id)
);

-- Projektmitglieder (Supabase-Auth-User ↔ Projekt ↔ Rolle)
create table project_members (
  user_id uuid references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  role_id uuid not null references roles(id),
  is_project_admin boolean not null default false,
  primary key (user_id, project_id)
);

-- Plattform-Admins (Vollzugriff, sehen Adminbereich über alle Projekte)
create table platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Indizes für die häufigsten Zugriffspfade
-- ---------------------------------------------------------------------------
create index categories_project_idx on categories (project_id, sort);
create index documents_project_idx on documents (project_id);
create index documents_category_idx on documents (category_id, sort);
create index documents_parent_idx on documents (parent_id);
create index project_members_project_idx on project_members (project_id);
create index role_category_access_category_idx on role_category_access (category_id);

-- ---------------------------------------------------------------------------
-- updated_at automatisch pflegen
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger documents_set_updated_at
  before update on documents
  for each row execute function set_updated_at();
