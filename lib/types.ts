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
  /** Hero-Bildunterschrift links/rechts (Design-Runde); leer = entfällt */
  heroCaptionLeft?: string;
  heroCaptionRight?: string;
  /** Untertext der Login-Karte; leer = entfällt */
  loginSubtext?: string;
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

// Modul Baukostenkontrolle (supabase/migrations/0007_bkk_schema.sql)

export interface BkkGroup {
  id: string;
  project_id: string;
  /** BKP-Hauptgruppe: '0', '1', '2', … */
  digit: string;
  name: string;
  sort: number;
}

export interface BkkPosition {
  id: string;
  project_id: string;
  group_id: string;
  bkp: string;
  name: string;
  /** Mutiertes KV in Rappen; null = wie aktive Baseline */
  kv_mut_rp: number | null;
  is_custom: boolean;
  hidden: boolean;
  notiz: string | null;
  sort: number;
}

/** KV-Baseline («KV orig.», «KV rev. 1», …) – genau eine aktive pro Projekt */
export interface BkkBaseline {
  id: string;
  project_id: string;
  bezeichnung: string;
  /** ISO-Datum (YYYY-MM-DD) */
  datum: string;
  is_active: boolean;
}

/** KV-Wert je Position und Baseline; fehlende Zeile = «nicht in dieser Baseline» */
export interface BkkPositionBaselineValue {
  baseline_id: string;
  position_id: string;
  kv_rp: number;
}

// Modul Verkehr-Leistungsverzeichnis (supabase/migrations/0009_lv_schema.sql)

export interface LvUnit {
  id: string;
  project_id: string;
  bkp: string;
  /** Arbeitsgattung */
  name: string;
  is_custom: boolean;
  hidden: boolean;
  /** Werkvertrags-Dokument im Hub (optional) */
  werkvertrag_document_id: string | null;
  sort: number;
}

/** Workflow-Stand: nur ausgefüllte Schritte als Zeile (Datum und/oder Freitext) */
export interface LvUnitStep {
  unit_id: string;
  step_key: string;
  /** ISO-Datum (YYYY-MM-DD) oder null */
  datum: string | null;
  freitext: string | null;
}

/** Offerte je Einheit (neues Feature; Import lässt die Tabelle leer) */
export interface LvOffer {
  id: string;
  project_id: string;
  unit_id: string;
  unternehmer: string;
  betrag_rp: number | null;
  datum: string | null;
  document_id: string | null;
}

// Modul Offertenvergleich (supabase/migrations/0010_offertenvergleich.sql)

export type OvVergabeStatus = 'offen' | 'in_pruefung' | 'abgeschlossen';

/** Woher die Preismatrix stammt; null = automatisch (Vergleich, sonst Offerten) */
export type OvPreisquelle = 'positionenvergleich' | 'offerten';

export interface OvVergabe {
  id: string;
  project_id: string;
  bkp: string;
  titel: string;
  lv_nummer: string | null;
  /** ISO-Datum (YYYY-MM-DD) oder null – Stand des Positionenvergleichs */
  stand: string | null;
  status: OvVergabeStatus;
  notiz: string | null;
  created_at: string;
  updated_at: string;
}

export interface OvBieterRow {
  id: string;
  project_id: string;
  vergabe_id: string;
  name: string;
  ort: string | null;
  telefon: string | null;
  /** Offerten-Endbetrag (brutto) in Rappen für den Summen-Abgleich */
  kontrollsumme_rp: number | null;
  sort: number;
}

export type OvDokumentArt =
  | 'positionenvergleich'
  | 'ausschreibung'
  | 'offerte'
  | 'beilage';

export interface OvDokument {
  id: string;
  project_id: string;
  vergabe_id: string;
  art: OvDokumentArt;
  bieter_id: string | null;
  file_path: string;
  original_name: string;
  seiten: number | null;
  parse_status: 'neu' | 'geparst' | 'fehler';
  parse_fehler: string | null;
  /** Extraktions-Fortschritt der Vollständigkeitsprüfung (O-M2) */
  parse_fortschritt: OvParseFortschritt;
  created_at: string;
}

/** Seitenfenster-Fortschritt der KI-Extraktion (Wiederaufnahme) */
export interface OvParseFortschritt {
  chunksTotal?: number;
  chunksDone?: number[];
  seitenProChunk?: number;
  /** Hinweise des Modells (unleserliche Seiten u.ä.) */
  hinweise?: string[];
  /** Preis-Stichprobe gegen die Positionenvergleich-Matrix (Selbstprüfung) */
  stichprobe?: { verglichen: number; abweichend: number };
}

/** Aus Ausschreibung/Offerte extrahierte Position (O-M2) */
export interface OvDokPositionRow {
  id: string;
  project_id: string;
  vergabe_id: string;
  dokument_id: string;
  npk: string;
  bezeichnung: string | null;
  menge: number | null;
  einheit: string | null;
  betrag_rp: number | null;
  produkt: string | null;
  bemerkung: string | null;
  /** true = Wert handschriftlich gelesen (Kennzeichnung «bitte prüfen») */
  handschriftlich: boolean;
  chunk: number;
}

export type OvAbweichungTyp =
  | 'fehlend'
  | 'zusaetzlich'
  | 'menge'
  | 'einheit'
  | 'produkt';

export type OvAbweichungBewertung =
  | 'offen'
  | 'kritisch'
  | 'tolerierbar'
  | 'ignoriert';

/** Abweichung aus der Vollständigkeitsprüfung mit Bewertungsschleife */
export interface OvAbweichungRow {
  id: string;
  project_id: string;
  vergabe_id: string;
  dokument_id: string;
  bieter_id: string | null;
  typ: OvAbweichungTyp;
  npk: string;
  titel: string;
  details: { erwartet?: string; gefunden?: string };
  bewertung: OvAbweichungBewertung;
  notiz: string | null;
  created_at: string;
}

export interface OvPositionRow {
  id: string;
  project_id: string;
  vergabe_id: string;
  npk: string;
  bezeichnung: string;
  menge: number | null;
  einheit: string | null;
  kostenblock: string | null;
  /** Auswahl für den Bericht («wichtige Positionen», interaktiv) */
  wichtig: boolean;
  sort: number;
}

export interface OvAngebotRow {
  project_id: string;
  position_id: string;
  bieter_id: string;
  betrag_rp: number | null;
  is_inkl: boolean;
  flags: string[];
}

/** KI-Erkenntnis (Anthropic-API) – Tags fix für die Farbzuordnung */
export type OvErkenntnisTag =
  | 'kritisch'
  | 'hot_spot'
  | 'plausibilitaet'
  | 'staerke'
  | 'hinweis';

export interface OvErkenntnis {
  titel: string;
  tag: OvErkenntnisTag;
  text: string;
  bullets: string[];
}

export interface OvFazit {
  ranking: { name: string; charakter: string; tendenz: string }[];
  bereinigung: { name: string; text: string }[];
  empfehlung: string;
}

/** Analyse-Snapshot in ov_auswertungen.inhalt (jsonb) */
export interface OvAuswertungInhalt {
  meta: {
    projektzeile: string;
    projectNo: string;
    bkp: string;
    titel: string;
    lvNummer: string;
    datum: string | null;
  };
  bieter: { name: string; ort: string; telefon: string }[];
  /** Woher die Preismatrix stammt (Belastbarkeit des Berichts) */
  preisquelle: OvPreisquelle;
  /** Anzahl handschriftlich gelesener Werte in der Matrix (Offerten-Quelle) */
  handschriftlichCount?: number;
  /** Ergebnis von computeAnalyse (lib/ov-calc.ts) */
  analyse: import('./ov-calc').OvAnalyse;
  selbstpruefung: {
    positionCount: number;
    unparsedCount: number;
    warnings: string[];
    /** true = KI-Stufe übersprungen (ANTHROPIC_API_KEY fehlt) */
    kiUebersprungen: boolean;
    /** CHF-Zahlen aus KI-Texten ohne Beleg in der Matrix (Zahlendisziplin) */
    kiZahlenOhneBeleg: string[];
  };
  erkenntnisse: OvErkenntnis[];
  fazit: OvFazit | null;
}

export interface OvAuswertungRow {
  id: string;
  project_id: string;
  vergabe_id: string;
  inhalt: OvAuswertungInhalt;
  report_file_path: string | null;
  created_at: string;
}

export type OvJobTyp = 'analyse' | 'report' | 'vollstaendigkeit';
export type OvJobStatus = 'queued' | 'running' | 'done' | 'error';

export interface OvJobRow {
  id: string;
  project_id: string;
  vergabe_id: string;
  typ: OvJobTyp;
  status: OvJobStatus;
  stufe: string | null;
  fehler: string | null;
  auswertung_id: string | null;
  heartbeat_at: string | null;
  created_at: string;
  finished_at: string | null;
}

export type BkkEntryType = 'vertrag' | 'zahlung';

export interface BkkEntry {
  id: string;
  project_id: string;
  position_id: string;
  entry_type: BkkEntryType;
  /** Betrag in Rappen (exakt gespeichert, keine Rundung) */
  betrag_rp: number;
  /** ISO-Datum (YYYY-MM-DD) oder null */
  datum: string | null;
  unternehmer: string | null;
  notiz: string | null;
  source_id: string | null;
}
