'use client';

import { useState, type CSSProperties } from 'react';
import { ToastContainer, useToasts } from '@/components/ui/toast';
import { GOOGLE_FONTS } from '@/features/admin/fonts';
import { uploadBrandingFile } from '@/features/admin/upload';
import { DEFAULT_COLORS } from '@/features/theming/theme';
import { createClient } from '@/lib/supabase/client';
import { publicBrandingUrl } from '@/lib/storage';
import { texts } from '@/lib/texts';
import type {
  BrandingColors,
  LandingContent,
  ProjectBranding,
} from '@/lib/types';

interface BrandingFormProps {
  projectId: string;
  projectName: string;
  landing: LandingContent;
  branding: ProjectBranding | null;
}

const COLOR_KEYS: (keyof BrandingColors)[] = [
  'primary',
  'primaryDark',
  'accent',
  'accentDark',
  'bg',
  'line',
  'ink',
];

/** Branding: Baumanagement, Logo, Farbpalette, Schriften, Live-Vorschau. */
export function BrandingForm({
  projectId,
  projectName,
  landing,
  branding,
}: BrandingFormProps) {
  const [managementName, setManagementName] = useState(
    branding?.management_name ?? '',
  );
  const [managementSuffix, setManagementSuffix] = useState(
    branding?.management_suffix ?? '',
  );
  const [colors, setColors] = useState<BrandingColors>({
    ...DEFAULT_COLORS,
    ...(branding?.colors ?? {}),
  });
  const [fontDisplay, setFontDisplay] = useState(
    branding?.font_display ?? 'Antonio',
  );
  const [fontBody, setFontBody] = useState(branding?.font_body ?? 'Montserrat');
  const [logoPath, setLogoPath] = useState(
    branding?.management_logo_path ?? null,
  );
  const [heroPath] = useState(branding?.hero_path ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toasts, showToast } = useToasts();

  const inputClass =
    'border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent';

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from('project_branding').upsert(
      {
        project_id: projectId,
        management_name: managementName || null,
        management_suffix: managementSuffix || null,
        management_logo_path: logoPath,
        font_display: fontDisplay,
        font_body: fontBody,
        colors,
      },
      { onConflict: 'project_id' },
    );
    setSaving(false);
    showToast(
      error ? texts.hub.saveErrorToast : texts.hub.savedToast,
      error ? 'error' : 'ok',
    );
  }

  async function handleLogoUpload(file: File) {
    setUploading(true);
    try {
      const path = await uploadBrandingFile(projectId, file, 'logo');
      setLogoPath(path);
      const supabase = createClient();
      const { error } = await supabase
        .from('project_branding')
        .upsert(
          { project_id: projectId, management_logo_path: path },
          { onConflict: 'project_id' },
        );
      if (error) throw error;
      showToast(texts.hub.savedToast);
    } catch {
      showToast(texts.hub.saveErrorToast, 'error');
    } finally {
      setUploading(false);
    }
  }

  const previewFontsUrl = `https://fonts.googleapis.com/css2?${[
    ...new Set([fontDisplay, fontBody]),
  ]
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;600;700`)
    .join('&')}&display=swap`;

  const previewVars = {
    '--pv-primary': colors.primary,
    '--pv-primary-dark': colors.primaryDark,
    '--pv-accent': colors.accent,
    '--pv-bg': colors.bg,
    '--pv-line': colors.line,
    '--pv-ink': colors.ink,
    '--pv-font-display': `'${fontDisplay}', sans-serif`,
    '--pv-font-body': `'${fontBody}', sans-serif`,
  } as CSSProperties;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-5 border border-line bg-white p-6">
        {/* Baumanagement */}
        <fieldset className="border border-line p-3">
          <legend className="px-1 text-xs font-medium text-primary-dark">
            {texts.admin.branding.management}
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-primary">
                {texts.admin.branding.managementName}
              </span>
              <input
                value={managementName}
                onChange={(e) => setManagementName(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-primary">
                {texts.admin.branding.managementSuffix}
              </span>
              <input
                value={managementSuffix}
                onChange={(e) => setManagementSuffix(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>
          <div className="mt-3 flex items-center gap-3">
            {logoPath && (
              // eslint-disable-next-line @next/next/no-img-element -- Storage-URL
              <img
                src={publicBrandingUrl(logoPath)}
                alt=""
                className="h-10 border border-line"
              />
            )}
            <label className="cursor-pointer border border-dashed border-line px-3 py-2 text-xs text-primary hover:border-accent hover:text-accent">
              {uploading
                ? texts.admin.daten.uploading
                : texts.admin.branding.logoUpload}
              <input
                type="file"
                accept="image/*,.svg"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleLogoUpload(file);
                }}
              />
            </label>
          </div>
        </fieldset>

        {/* Farben */}
        <fieldset className="border border-line p-3">
          <legend className="px-1 text-xs font-medium text-primary-dark">
            {texts.admin.branding.colors}
          </legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {COLOR_KEYS.map((key) => (
              <label key={key} className="flex flex-col gap-1">
                <span className="text-xs text-primary">
                  {texts.admin.branding.colorLabels[key]}
                </span>
                <span className="flex items-center gap-2">
                  <input
                    type="color"
                    value={colors[key]}
                    onChange={(e) =>
                      setColors((c) => ({ ...c, [key]: e.target.value }))
                    }
                    className="h-8 w-10 cursor-pointer border border-line bg-white p-0.5"
                  />
                  <code className="text-xs text-primary-dark">
                    {colors[key]}
                  </code>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Schriften */}
        <fieldset className="border border-line p-3">
          <legend className="px-1 text-xs font-medium text-primary-dark">
            {texts.admin.branding.fonts}
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-primary">
                {texts.admin.branding.fontDisplay}
              </span>
              <select
                value={fontDisplay}
                onChange={(e) => setFontDisplay(e.target.value)}
                className={inputClass}
              >
                {GOOGLE_FONTS.map((font) => (
                  <option key={font} value={font}>
                    {font}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-primary">
                {texts.admin.branding.fontBody}
              </span>
              <select
                value={fontBody}
                onChange={(e) => setFontBody(e.target.value)}
                className={inputClass}
              >
                {GOOGLE_FONTS.map((font) => (
                  <option key={font} value={font}>
                    {font}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="self-start bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-60"
        >
          {texts.common.save}
        </button>
      </div>

      {/* Live-Vorschau */}
      <div className="h-fit border border-line bg-white p-4">
        <h2 className="display-title mb-3 text-sm text-ink">
          {texts.admin.branding.preview}
        </h2>
        <link rel="stylesheet" href={previewFontsUrl} />
        <div
          style={{
            ...previewVars,
            backgroundColor: 'var(--pv-bg)',
            color: 'var(--pv-ink)',
            fontFamily: 'var(--pv-font-body)',
          }}
          className="border p-4"
        >
          <div
            className="flex items-end justify-between border-b pb-3"
            style={{ borderColor: 'var(--pv-line)' }}
          >
            <div>
              <p
                className="mb-1 text-[9px] uppercase tracking-[0.2em]"
                style={{
                  color: 'var(--pv-primary)',
                  fontFamily: 'var(--pv-font-display)',
                }}
              >
                {landing.subtitle}
              </p>
              <p
                className="text-base uppercase"
                style={{
                  fontFamily: 'var(--pv-font-display)',
                  letterSpacing: '0.02em',
                }}
              >
                {projectName}
              </p>
            </div>
            {logoPath ? (
              // eslint-disable-next-line @next/next/no-img-element -- Storage-URL
              <img src={publicBrandingUrl(logoPath)} alt="" className="h-6" />
            ) : (
              <p
                className="text-[10px] uppercase"
                style={{
                  color: 'var(--pv-primary-dark)',
                  fontFamily: 'var(--pv-font-display)',
                }}
              >
                {managementName}
              </p>
            )}
          </div>
          {heroPath ? (
            // eslint-disable-next-line @next/next/no-img-element -- Storage-URL
            <img
              src={publicBrandingUrl(heroPath)}
              alt=""
              className="mt-3 h-20 w-full border object-cover"
              style={{ borderColor: 'var(--pv-line)' }}
            />
          ) : (
            <div
              className="mt-3 h-20 w-full border"
              style={{
                borderColor: 'var(--pv-line)',
                backgroundColor: 'var(--pv-line)',
              }}
            />
          )}
          <div className="mt-3 grid grid-cols-2 gap-px" style={{ backgroundColor: 'var(--pv-line)' }}>
            {(landing.infoCells ?? []).slice(0, 4).map((cell) => (
              <div key={cell.label} className="bg-white p-2">
                <p
                  className="text-[8px] uppercase"
                  style={{
                    color: 'var(--pv-primary)',
                    fontFamily: 'var(--pv-font-display)',
                  }}
                >
                  {cell.label}
                </p>
                <p className="truncate text-[10px]">{cell.value}</p>
              </div>
            ))}
          </div>
          <div
            className="mt-3 px-3 py-1.5 text-center text-[10px] font-medium text-white"
            style={{ backgroundColor: 'var(--pv-accent)' }}
          >
            {texts.landing.loginButton}
          </div>
        </div>
      </div>

      <ToastContainer toasts={toasts} />
    </div>
  );
}
