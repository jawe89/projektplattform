// Datenbank-Typen gemäss Schema (supabase/migrations/0001_schema.sql)

export type ProjectStatus = 'active' | 'archived';

export interface InfoCell {
  label: string;
  value: string;
}

export interface LandingContent {
  subtitle?: string;
  description?: string;
  infoCells?: InfoCell[];
}

export interface Project {
  id: string;
  slug: string;
  name: string;
  project_no: string | null;
  domain: string | null;
  status: ProjectStatus;
  landing: LandingContent;
  created_at: string;
}

export interface BrandingColors {
  primary: string;
  primaryDark: string;
  accent: string;
  accentDark: string;
  bg: string;
  line: string;
  ink: string;
}

export interface ProjectBranding {
  project_id: string;
  /** Logo der Baumanagement-Firma (Bucket «branding») */
  management_logo_path: string | null;
  hero_path: string | null;
  /** Name der Baumanagement-Firma */
  management_name: string | null;
  /** Optionaler Zusatz, z.B. «Baumanagement» */
  management_suffix: string | null;
  font_display: string;
  font_body: string;
  colors: BrandingColors;
}

export type CategoryLayout = 'big' | 'list';

export interface FieldDef {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  badge?: boolean;
}

export interface FieldSchema {
  fields: FieldDef[];
  allowChildren: boolean;
}

export type CategorySortMode = 'manual' | 'field';
export type CategorySortDirection = 'asc' | 'desc';

export interface Category {
  id: string;
  project_id: string;
  key: string;
  label: string;
  add_label: string | null;
  layout: CategoryLayout;
  sort: number;
  field_schema: FieldSchema;
  /** Optional bis Migration 0005 ausgeführt ist; fehlend = «manual». */
  sort_mode?: CategorySortMode;
  sort_field?: string | null;
  sort_direction?: CategorySortDirection;
}

export interface DocumentEntry {
  id: string;
  project_id: string;
  category_id: string;
  parent_id: string | null;
  data: Record<string, string>;
  file_path: string | null;
  external_url: string | null;
  sort: number;
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: string;
  project_id: string;
  name: string;
}

export interface RoleCategoryAccess {
  role_id: string;
  category_id: string;
  can_view: boolean;
  can_upload: boolean;
}

export interface ProjectMember {
  user_id: string;
  project_id: string;
  role_id: string;
  is_project_admin: boolean;
}

export interface ProjectModule {
  project_id: string;
  module_key: string;
  enabled: boolean;
  settings: Record<string, unknown>;
}

export interface RoleModuleAccess {
  role_id: string;
  module_key: string;
  can_view: boolean;
  can_edit: boolean;
}
