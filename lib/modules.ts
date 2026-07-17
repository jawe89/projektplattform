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
