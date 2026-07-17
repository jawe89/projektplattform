import type { CSSProperties } from 'react';
import type { BrandingColors, ProjectBranding } from '@/lib/types';

/**
 * Theming-Grundlage: Branding aus `project_branding` → CSS-Variablen.
 * Sämtliche Farben/Schriften laufen ausschliesslich über diese Variablen
 * (siehe CLAUDE.md); die Werte werden pro Tenant serverseitig gesetzt.
 */

export const DEFAULT_COLORS: BrandingColors = {
  primary: '#7c7c7c',
  primaryDark: '#5a5a5a',
  accent: '#70ad47',
  accentDark: '#5a9036',
  bg: '#f6f6f4',
  line: '#e5e5e5',
  ink: '#2b2b2b',
};

export const DEFAULT_FONT_DISPLAY = 'Antonio';
export const DEFAULT_FONT_BODY = 'Montserrat';

/** CSS-Variablen für ein Tenant-Branding (inline style des Tenant-Wrappers). */
export function brandingToCssVars(branding: ProjectBranding | null): CSSProperties {
  const colors = { ...DEFAULT_COLORS, ...(branding?.colors ?? {}) };
  const fontDisplay = branding?.font_display || DEFAULT_FONT_DISPLAY;
  const fontBody = branding?.font_body || DEFAULT_FONT_BODY;

  return {
    '--color-primary': colors.primary,
    '--color-primary-dark': colors.primaryDark,
    '--color-accent': colors.accent,
    '--color-accent-dark': colors.accentDark,
    '--color-bg': colors.bg,
    '--color-line': colors.line,
    '--color-ink': colors.ink,
    '--font-display': `'${fontDisplay}', sans-serif`,
    '--font-body': `'${fontBody}', sans-serif`,
  } as CSSProperties;
}

/** Google-Fonts-URL für die beiden Branding-Schriften. */
export function googleFontsUrl(branding: ProjectBranding | null): string {
  const fontDisplay = branding?.font_display || DEFAULT_FONT_DISPLAY;
  const fontBody = branding?.font_body || DEFAULT_FONT_BODY;
  const families = [...new Set([fontDisplay, fontBody])]
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;500;600;700`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}
