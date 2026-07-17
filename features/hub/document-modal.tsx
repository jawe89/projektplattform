'use client';

import { useState } from 'react';
import { buildStoragePath, uploadProjectFile } from '@/features/hub/upload';
import { texts } from '@/lib/texts';
import type { Category } from '@/lib/types';

export interface ModalResult {
  data: Record<string, string>;
  file_path: string | null;
  external_url: string | null;
}

interface DocumentModalProps {
  projectId: string;
  category: Category;
  /** Bestehender Eintrag (Bearbeiten) oder undefined (Neu) */
  initial?: ModalResult;
  onApply: (result: ModalResult) => void;
  onClose: () => void;
}

/**
 * Modal «Neuer Eintrag / Eintrag bearbeiten»: Felder werden dynamisch aus
 * `category.field_schema` generiert; Datei-Upload in den project-files-Bucket
 * mit Fortschrittsanzeige oder alternativ externe URL.
 */
export function DocumentModal({
  projectId,
  category,
  initial,
  onApply,
  onClose,
}: DocumentModalProps) {
  const fields = category.field_schema.fields ?? [];
  const [values, setValues] = useState<Record<string, string>>(
    () => ({ ...(initial?.data ?? {}) }),
  );
  const [file, setFile] = useState<File | null>(null);
  const [externalUrl, setExternalUrl] = useState(initial?.external_url ?? '');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentFileName = initial?.file_path?.split('/').pop() ?? null;
  const busy = progress !== null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    for (const field of fields) {
      if (field.required && !(values[field.key] ?? '').trim()) {
        setError(texts.modal.requiredMissing);
        return;
      }
    }

    let filePath = initial?.file_path ?? null;
    let url = externalUrl.trim() || null;

    try {
      if (file) {
        setProgress(0);
        const path = buildStoragePath(projectId, category.key, file.name);
        await uploadProjectFile(path, file, setProgress);
        filePath = path;
        url = null; // neue Datei hat Vorrang vor URL
      } else if (url) {
        filePath = null; // explizite URL ersetzt eine allfällige Datei
      }
    } catch {
      setProgress(null);
      setError(texts.modal.uploadError);
      return;
    }

    setProgress(null);
    onApply({
      data: Object.fromEntries(
        fields.map((f) => [f.key, (values[f.key] ?? '').trim()]),
      ),
      file_path: filePath,
      external_url: url,
    });
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-md border border-line bg-white">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="display-title text-sm text-ink">
            {initial
              ? texts.modal.titleEdit
              : (category.add_label ?? texts.modal.titleNew).replace(/^\+\s*/, '')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={texts.modal.cancel}
            className="text-primary hover:text-ink"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-4">
          {fields.map((field) => (
            <label key={field.key} className="flex flex-col gap-1">
              <span className="text-xs font-medium text-primary-dark">
                {field.label}
                {field.required && ' *'}
              </span>
              <input
                type="text"
                value={values[field.key] ?? ''}
                placeholder={field.placeholder}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [field.key]: e.target.value }))
                }
                className="border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              />
            </label>
          ))}

          {/* Datei / URL */}
          <fieldset className="border border-line p-3">
            <legend className="px-1 text-xs font-medium text-primary-dark">
              {texts.modal.fileSection}
            </legend>

            <label className="flex cursor-pointer flex-col gap-1 border border-dashed border-line px-3 py-3 text-center hover:border-accent">
              <span className="text-sm text-primary-dark">
                {file
                  ? file.name
                  : currentFileName
                    ? `${texts.modal.currentFile}: ${currentFileName}`
                    : texts.modal.chooseFile}
              </span>
              <span className="text-xs text-primary">{texts.modal.fileHint}</span>
              <input
                type="file"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>

            {progress !== null && (
              <div className="mt-2">
                <div className="h-1.5 w-full bg-line">
                  <div
                    className="h-1.5 bg-accent transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-primary">
                  {texts.modal.uploading} {progress}%
                </p>
              </div>
            )}

            <label className="mt-3 flex flex-col gap-1">
              <span className="text-xs font-medium text-primary-dark">
                {texts.modal.orExternalUrl}
              </span>
              <input
                type="url"
                value={externalUrl}
                placeholder={texts.modal.urlPlaceholder}
                onChange={(e) => setExternalUrl(e.target.value)}
                className="border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              />
            </label>
          </fieldset>

          {error && (
            <p role="alert" className="text-xs text-error">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="border border-line bg-white px-4 py-2 text-sm text-primary-dark hover:border-primary disabled:opacity-60"
            >
              {texts.modal.cancel}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-60"
            >
              {texts.modal.apply}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
