'use client';

import { useState } from 'react';
import { texts } from '@/lib/texts';

export type BaselineSource = 'active' | 'mut';

export interface BaselineModalResult {
  bezeichnung: string;
  /** ISO-Datum (YYYY-MM-DD) */
  datum: string;
  source: BaselineSource;
}

interface BaselineModalProps {
  onApply: (result: BaselineModalResult) => void;
  onClose: () => void;
}

/**
 * Modal «Neue Baseline»: Bezeichnung, Datum und Quelle der Werte –
 * wahlweise Übernahme aus der bisherigen (aktiven) Baseline oder aus
 * KV mutiert (der typische Fall: revidierter KV = bisheriger Stand inkl.
 * Mutationen wird neue Referenz).
 */
export function BaselineModal({ onApply, onClose }: BaselineModalProps) {
  const [bezeichnung, setBezeichnung] = useState('');
  const [datum, setDatum] = useState('');
  const [source, setSource] = useState<BaselineSource>('mut');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!bezeichnung.trim() || !datum) {
      setError(texts.modal.requiredMissing);
      return;
    }
    onApply({ bezeichnung: bezeichnung.trim(), datum, source });
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md border border-line bg-white">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="display-title text-sm text-ink">
            {texts.bkk.baselines.modalTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={texts.modal.cancel}
            className="text-primary hover:text-ink"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-primary-dark">
              {texts.bkk.baselines.fieldBezeichnung} *
            </span>
            <input
              type="text"
              value={bezeichnung}
              placeholder={texts.bkk.baselines.bezeichnungPlaceholder}
              onChange={(e) => setBezeichnung(e.target.value)}
              className="border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-primary-dark">
              {texts.bkk.baselines.fieldDatum} *
            </span>
            <input
              type="date"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              className="border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </label>

          <fieldset className="border border-line p-3">
            <legend className="px-1 text-xs font-medium text-primary-dark">
              {texts.bkk.baselines.sourceLabel}
            </legend>
            <label className="flex items-start gap-2 py-1 text-sm text-ink">
              <input
                type="radio"
                name="baseline-source"
                checked={source === 'mut'}
                onChange={() => setSource('mut')}
                className="mt-0.5"
              />
              <span>
                {texts.bkk.baselines.sourceMut}
                <span className="block text-xs text-primary">
                  {texts.bkk.baselines.sourceMutHint}
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 py-1 text-sm text-ink">
              <input
                type="radio"
                name="baseline-source"
                checked={source === 'active'}
                onChange={() => setSource('active')}
                className="mt-0.5"
              />
              <span>
                {texts.bkk.baselines.sourceActive}
                <span className="block text-xs text-primary">
                  {texts.bkk.baselines.sourceActiveHint}
                </span>
              </span>
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
              className="border border-line bg-white px-4 py-2 text-sm text-primary-dark hover:border-primary"
            >
              {texts.modal.cancel}
            </button>
            <button
              type="submit"
              className="bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark"
            >
              {texts.modal.apply}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
