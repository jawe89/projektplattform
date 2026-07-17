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
  const [heroCaptionLeft, setHeroCaptionLeft] = useState(
    project.landing.heroCaptionLeft ?? '',
  );
  const [heroCaptionRight, setHeroCaptionRight] = useState(
    project.landing.heroCaptionRight ?? '',
  );
  const [loginSubtext, setLoginSubtext] = useState(
    project.landing.loginSubtext ?? '',
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
          heroCaptionLeft: heroCaptionLeft.trim(),
          heroCaptionRight: heroCaptionRight.trim(),
          loginSubtext: loginSubtext.trim(),
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
            <span className="display-title text-[10px] font-medium tracking-[0.12em] text-primary-dark">
              {texts.admin.nameLabel}
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="display-title text-[10px] font-medium tracking-[0.12em] text-primary-dark">
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
          <span className="display-title text-[10px] font-medium tracking-[0.12em] text-primary-dark">
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
          <span className="display-title text-[10px] font-medium tracking-[0.12em] text-primary-dark">
            {texts.admin.daten.subtitle}
          </span>
          <input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="display-title text-[10px] font-medium tracking-[0.12em] text-primary-dark">
            {texts.admin.daten.description}
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className={inputClass}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="display-title text-[10px] font-medium tracking-[0.12em] text-primary-dark">
              {texts.admin.daten.heroCaptionLeft}
            </span>
            <input
              value={heroCaptionLeft}
              onChange={(e) => setHeroCaptionLeft(e.target.value)}
              className={inputClass}
            />
            <span className="text-xs text-primary">
              {texts.admin.daten.optionalHint}
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="display-title text-[10px] font-medium tracking-[0.12em] text-primary-dark">
              {texts.admin.daten.heroCaptionRight}
            </span>
            <input
              value={heroCaptionRight}
              onChange={(e) => setHeroCaptionRight(e.target.value)}
              className={inputClass}
            />
            <span className="text-xs text-primary">
              {texts.admin.daten.optionalHint}
            </span>
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="display-title text-[10px] font-medium tracking-[0.12em] text-primary-dark">
            {texts.admin.daten.loginSubtext}
          </span>
          <input
            value={loginSubtext}
            onChange={(e) => setLoginSubtext(e.target.value)}
            className={inputClass}
          />
          <span className="text-xs text-primary">
            {texts.admin.daten.optionalHint}
          </span>
        </label>

        <fieldset className="border border-line p-3">
          <legend className="display-title px-1 text-[10px] font-medium tracking-[0.16em] text-primary-dark">
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
              className="display-title self-start border border-dashed border-line px-3.5 py-1.5 text-[11px] font-medium tracking-[0.12em] text-primary transition-colors hover:border-primary hover:text-primary-dark"
            >
              {texts.admin.daten.addInfoCell}
            </button>
          </div>
        </fieldset>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="display-title self-start bg-accent px-5 py-2.5 text-[12px] font-medium tracking-[0.14em] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {texts.common.save}
        </button>
      </div>

      {/* Hero-Bild */}
      <div className="h-fit border border-line bg-white p-6">
        <h2 className="display-title mb-3 border-b border-line pb-2 text-[11px] font-medium tracking-[0.18em] text-primary-dark">
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
        <label className="display-title block cursor-pointer border border-dashed border-line px-3 py-3 text-center text-[11px] font-medium tracking-[0.12em] text-primary transition-colors hover:border-primary hover:text-primary-dark">
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
