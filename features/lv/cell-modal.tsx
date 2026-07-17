'use client';

import { useState } from 'react';
import {
  LV_DONE_MARKER,
  LV_NA_MARKER,
  type LvStepKey,
  LV_WV_STEP_KEYS,
  type LvStepValue,
} from '@/lib/lv-logic';
import { texts } from '@/lib/texts';

interface CellModalProps {
  unitLabel: string;
  stepKey: LvStepKey;
  /** Bestehender Zellwert oder undefined (leer) */
  initial?: LvStepValue;
  /** null = Zelle leeren */
  onApply: (value: LvStepValue | null) => void;
  onClose: () => void;
}

/**
 * Zellen-Editor des LV-Workflows: Datum ODER Freitext (auch beides möglich),
 * Schnellaktionen für die Standard-Marker «✓ erledigt» / «⊘ nach Aufwand»
 * (unverändert aus dem Alt-Tool) und «Leeren».
 */
export function CellModal({
  unitLabel,
  stepKey,
  initial,
  onApply,
  onClose,
}: CellModalProps) {
  const [datum, setDatum] = useState(initial?.datum ?? '');
  const [freitext, setFreitext] = useState(initial?.freitext ?? '');
  const stepLabel = texts.lv.steps[stepKey].label;
  const isWvStep = (LV_WV_STEP_KEYS as readonly string[]).includes(stepKey);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = freitext.trim();
    if (!datum && !trimmed) {
      onApply(null);
      return;
    }
    onApply({ datum: datum || null, freitext: trimmed || null });
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
            {texts.lv.cellModalTitle}
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
          <p className="text-sm text-primary-dark">
            <span className="font-medium text-ink">{unitLabel}</span>
            {' · '}
            {stepLabel}
          </p>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-primary-dark">
              {texts.lv.fieldDatum}
            </span>
            <input
              type="date"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              className="border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-primary-dark">
              {texts.lv.fieldFreitext}
            </span>
            <input
              type="text"
              value={freitext}
              placeholder={texts.lv.freitextPlaceholder}
              onChange={(e) => setFreitext(e.target.value)}
              className="border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onApply({ datum: null, freitext: LV_DONE_MARKER })}
              className="border border-bkk-mut-bord bg-white px-3 py-1.5 text-xs text-bkk-mut-ink hover:bg-bkk-mut-tint"
            >
              {texts.lv.markDone}
            </button>
            <button
              type="button"
              onClick={() => onApply({ datum: null, freitext: LV_NA_MARKER })}
              className="border border-warn bg-white px-3 py-1.5 text-xs text-warn hover:bg-bg"
            >
              {texts.lv.markNa}
            </button>
            {initial && (
              <button
                type="button"
                onClick={() => onApply(null)}
                className="border border-line bg-white px-3 py-1.5 text-xs text-primary-dark hover:border-error hover:text-error"
              >
                {texts.lv.clearCell}
              </button>
            )}
          </div>
          {isWvStep && (
            <p className="text-xs text-primary">{texts.lv.naHint}</p>
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
