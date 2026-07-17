'use client';

import { useState } from 'react';
import { ToastContainer, useToasts } from '@/components/ui/toast';
import { MODULES } from '@/lib/modules';
import { createClient } from '@/lib/supabase/client';
import { texts } from '@/lib/texts';

/** Module pro Projekt aktivieren/deaktivieren (P2-M1). */
export function ModuleEinstellungen({
  projectId,
  enabledKeys,
}: {
  projectId: string;
  enabledKeys: string[];
}) {
  const [enabled, setEnabled] = useState<Set<string>>(new Set(enabledKeys));
  const [saving, setSaving] = useState(false);
  const { toasts, showToast } = useToasts();

  function toggle(key: string) {
    setEnabled((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();
    const rows = MODULES.map((module) => ({
      project_id: projectId,
      module_key: module.key,
      enabled: enabled.has(module.key),
    }));
    const { error } = await supabase
      .from('project_modules')
      .upsert(rows, { onConflict: 'project_id,module_key' });
    setSaving(false);
    showToast(
      error ? texts.hub.saveErrorToast : texts.hub.savedToast,
      error ? 'error' : 'ok',
    );
  }

  return (
    <div className="max-w-2xl">
      <p className="mb-4 text-sm text-primary-dark">
        {texts.admin.module.intro}
      </p>
      <div className="flex flex-col gap-3">
        {MODULES.map((module) => (
          <label
            key={module.key}
            className="flex cursor-pointer items-center justify-between gap-4 border border-line bg-white p-4"
          >
            <span>
              <span className="block text-sm font-medium text-ink">
                {module.label}
              </span>
              <span className="block text-xs text-primary">
                {module.description}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2 text-xs text-primary-dark">
              <input
                type="checkbox"
                checked={enabled.has(module.key)}
                onChange={() => toggle(module.key)}
              />
              {texts.admin.module.enabled}
            </span>
          </label>
        ))}
      </div>
      <p className="mt-3 text-xs text-primary">{texts.admin.module.hint}</p>
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="mt-4 bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-60"
      >
        {texts.common.save}
      </button>
      <ToastContainer toasts={toasts} />
    </div>
  );
}
