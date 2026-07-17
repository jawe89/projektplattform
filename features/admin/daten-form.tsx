'use client';

import { useState } from 'react';
import { ToastContainer, useToasts } from '@/components/ui/toast';
import { uploadBrandingFile } from '@/features/admin/upload';
import { createClient } from '@/lib/supabase/client';
import { publicBrandingUrl } from '@/lib/storage';
import { texts } from '@/lib/texts';
import type { InfoCell, Project } from '@/lib/types';

interface DatenFormProps {
  project: Project;
  heroPath: string | null;
}

/** Projektdaten: Name, Nr., Status, Landingpage-Inhalte, Hero-Bild. */
export function DatenForm({ project, heroPath }: DatenFormProps) {
  const [name, setName] = useState(project.name);
  const [projectNo, setProjectNo] = useState(project.project_no ?? '');
  const [status, setStatus] = useState(project.status);
  const [subtitle, setSubtitle] = useState(project.landing.subtitle ?? '');
  const [description, setDescription] = useState(
    project.landing.description ?? '',
  );
  const [infoCells, setInfoCells] = useState<InfoCell[]>(
    project.landing.infoCells ?? [],
  );
  const [hero, setHero] = useState(heroPath);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toasts, showToast } = useToasts();

  const inputClass =
    'border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent';

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('projects')
      .update({
        name,
        project_no: projectNo || null,
        status,
        landing: {
          subtitle,
          description,
          infoCells: infoCells.filter((c) => c.label || c.value),
        },
      })
      .eq('id', project.id);
    setSaving(false);
    showToast(
      error ? texts.hub.saveErrorToast : texts.hub.savedToast,
      error ? 'error' : 'ok',
    );
  }

  async function handleHeroUpload(file: File) {
    setUploading(true);
    try {
      const path = await uploadBrandingFile(project.id, file, 'hero');
      const supabase = createClient();
      const { error } = await supabase
        .from('project_branding')
        .update({ hero_path: path })
        .eq('project_id', project.id);
      if (error) throw error;
      setHero(path);
      showToast(texts.hub.savedToast);
    } catch {
      showToast(texts.hub.saveErrorToast, 'error');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-4 border border-line bg-white p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-primary-dark">
              {texts.admin.nameLabel}
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-primary-dark">
              {texts.admin.projectNoLabel}
            </span>
            <input
              value={projectNo}
              onChange={(e) => setProjectNo(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-primary-dark">
            {texts.admin.statusLabel}
          </span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Project['status'])}
            className={inputClass}
          >
            <option value="active">{texts.admin.statusActive}</option>
            <option value="archived">{texts.admin.statusArchived}</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-primary-dark">
            {texts.admin.daten.subtitle}
          </span>
          <input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-primary-dark">
            {texts.admin.daten.description}
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className={inputClass}
          />
        </label>

        <fieldset className="border border-line p-3">
          <legend className="px-1 text-xs font-medium text-primary-dark">
            {texts.admin.daten.infoCells}
          </legend>
          <div className="flex flex-col gap-2">
            {infoCells.map((cell, index) => (
              <div key={index} className="flex gap-2">
                <input
                  value={cell.label}
                  placeholder={texts.admin.daten.cellLabel}
                  onChange={(e) =>
                    setInfoCells((cells) =>
                      cells.map((c, i) =>
                        i === index ? { ...c, label: e.target.value } : c,
                      ),
                    )
                  }
                  className={`${inputClass} w-40`}
                />
                <textarea
                  value={cell.value}
                  placeholder={texts.admin.daten.cellValue}
                  rows={1}
                  onChange={(e) =>
                    setInfoCells((cells) =>
                      cells.map((c, i) =>
                        i === index ? { ...c, value: e.target.value } : c,
                      ),
                    )
                  }
                  className={`${inputClass} flex-1`}
                />
                <button
                  type="button"
                  title={texts.admin.daten.removeCell}
                  onClick={() =>
                    setInfoCells((cells) => cells.filter((_, i) => i !== index))
                  }
                  className="border border-line bg-white px-2 text-xs text-primary-dark hover:border-error hover:text-error"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setInfoCells((cells) => [...cells, { label: '', value: '' }])
              }
              className="self-start border border-dashed border-line px-3 py-1.5 text-xs text-primary hover:border-accent hover:text-accent"
            >
              {texts.admin.daten.addInfoCell}
            </button>
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

      {/* Hero-Bild */}
      <div className="h-fit border border-line bg-white p-6">
        <h2 className="display-title mb-3 text-sm text-ink">
          {texts.admin.daten.hero}
        </h2>
        {hero && (
          // eslint-disable-next-line @next/next/no-img-element -- Storage-URL
          <img
            src={publicBrandingUrl(hero)}
            alt=""
            className="mb-3 w-full border border-line object-cover"
          />
        )}
        <label className="block cursor-pointer border border-dashed border-line px-3 py-3 text-center text-sm text-primary hover:border-accent hover:text-accent">
          {uploading
            ? texts.admin.daten.uploading
            : texts.admin.daten.heroUpload}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleHeroUpload(file);
            }}
          />
        </label>
      </div>

      <ToastContainer toasts={toasts} />
    </div>
  );
}
