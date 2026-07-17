'use client';

import { useActionState, useEffect } from 'react';
import {
  createProject,
  type CreateProjectState,
} from '@/features/admin/actions';
import { texts } from '@/lib/texts';

const initialState: CreateProjectState = {};

interface ProjectFormProps {
  templates: { id: string; name: string }[];
}

export function ProjectForm({ templates }: ProjectFormProps) {
  // Navigation nach dem Commit via useEffect – nie im Action-Aufruf
  // (siehe CLAUDE.md-Stolperfalle).
  const [state, formAction, pending] = useActionState(
    createProject,
    initialState,
  );

  useEffect(() => {
    if (state.redirectTo) window.location.assign(state.redirectTo);
  }, [state.redirectTo]);

  const inputClass =
    'border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent';

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-primary-dark">
          {texts.admin.nameLabel} *
        </span>
        <input type="text" name="name" required className={inputClass} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-primary-dark">
          {texts.admin.projectNoLabel}
        </span>
        <input type="text" name="projectNo" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-primary-dark">
          {texts.admin.slugLabel} *
        </span>
        <input
          type="text"
          name="slug"
          required
          pattern="[a-z0-9][a-z0-9-]*"
          className={inputClass}
        />
        <span className="text-xs text-primary">{texts.admin.slugHint}</span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-primary-dark">
          {texts.admin.domainLabel}
        </span>
        <input type="text" name="domain" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-primary-dark">
          {texts.admin.templateLabel}
        </span>
        <select name="templateId" defaultValue="" className={inputClass}>
          <option value="">{texts.admin.templateNone}</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
        <span className="text-xs text-primary">{texts.admin.templateHint}</span>
      </label>

      {state.error && (
        <p role="alert" className="text-xs text-error">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-60"
      >
        {pending ? texts.admin.creating : texts.admin.create}
      </button>
    </form>
  );
}
