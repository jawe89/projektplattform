import { texts } from '@/lib/texts';

/**
 * Modul-Registry (P2-M1): feste Plattform-Module, pro Projekt aktivierbar
 * (project_modules) und pro Rolle freigegeben (role_module_access).
 * Die Schlüssel entsprechen den Check-Constraints der Migration 0006.
 */
export const MODULE_KEYS = ['baukostenkontrolle', 'leistungsverzeichnis'] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export interface ModuleInfo {
  key: ModuleKey;
  label: string;
  description: string;
}

export const MODULES: ModuleInfo[] = MODULE_KEYS.map((key) => ({
  key,
  label: texts.modules[key].label,
  description: texts.modules[key].description,
}));

export function isModuleKey(value: string): value is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(value);
}

/**
 * Schweizer BKP-Hauptgruppen – Standard-Datensatz, der beim Aktivieren des
 * BKK-Moduls in einem Projekt ohne Gruppen angelegt wird (frische Projekte
 * sind damit sofort arbeitsfähig). Importe bringen eigene Gruppen mit und
 * gleichen über die Ziffer ab (gleiche Ziffer = gleiche Gruppe).
 */
export const BKK_DEFAULT_GROUPS = [
  { digit: '0', name: 'Grundstück' },
  { digit: '1', name: 'Vorbereitungsarbeiten' },
  { digit: '2', name: 'Gebäude' },
  { digit: '3', name: 'Betriebseinrichtungen' },
  { digit: '4', name: 'Umgebung' },
  { digit: '5', name: 'Baunebenkosten' },
  { digit: '9', name: 'Ausstattung' },
] as const;
