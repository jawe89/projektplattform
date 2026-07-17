'use client';

import { useState } from 'react';
import { ToastContainer, useToasts } from '@/components/ui/toast';
import { createClient } from '@/lib/supabase/client';
import { texts } from '@/lib/texts';
import type {
  Category,
  CategoryLayout,
  CategorySortDirection,
  CategorySortMode,
  FieldDef,
} from '@/lib/types';

interface EditableCategory {
  id: string;
  key: string;
  isNew: boolean;
  label: string;
  add_label: string;
  layout: CategoryLayout;
  allowChildren: boolean;
  fields: FieldDef[];
  sortMode: CategorySortMode;
  sortField: string;
  sortDirection: CategorySortDirection;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toEditable(category: Category): EditableCategory {
  return {
    id: category.id,
    key: category.key,
    isNew: false,
    label: category.label,
    add_label: category.add_label ?? '',
    layout: category.layout,
    allowChildren: category.field_schema.allowChildren ?? false,
    fields: category.field_schema.fields ?? [],
    sortMode: category.sort_mode ?? 'manual',
    sortField: category.sort_field ?? '',
    sortDirection: category.sort_direction ?? 'asc',
  };
}

/**
 * Kategorien-Verwaltung inkl. Feld-Schema-Editor: anlegen, umbenennen,
 * sortieren, Layout, Unterpositionen; Felder hinzufügen/umbenennen/
 * sortieren/löschen, Pflichtfeld, Platzhalter, Badge-Feld.
 */
export function KategorienEditor({
  projectId,
  categories,
}: {
  projectId: string;
  categories: Category[];
}) {
  const [items, setItems] = useState<EditableCategory[]>(
    categories.map(toEditable),
  );
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const { toasts, showToast } = useToasts();

  const inputClass =
    'border border-line bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-accent';

  function update(index: number, patch: Partial<EditableCategory>) {
    setItems((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  function updateField(
    categoryIndex: number,
    fieldIndex: number,
    patch: Partial<FieldDef>,
  ) {
    setItems((current) =>
      current.map((item, i) => {
        if (i !== categoryIndex) return item;
        let fields = item.fields.map((field, fi) =>
          fi === fieldIndex ? { ...field, ...patch } : field,
        );
        // Badge verhält sich wie ein Radio: höchstens ein Badge-Feld
        if (patch.badge) {
          fields = fields.map((field, fi) =>
            fi === fieldIndex ? field : { ...field, badge: false },
          );
        }
        return { ...item, fields };
      }),
    );
  }

  function move<T>(list: T[], from: number, to: number): T[] {
    if (to < 0 || to >= list.length) return list;
    const copy = [...list];
    const [entry] = copy.splice(from, 1);
    copy.splice(to, 0, entry);
    return copy;
  }

  function removeCategory(index: number) {
    const item = items[index];
    if (!item.isNew && !window.confirm(texts.admin.kategorien.confirmDeleteCategory)) {
      return;
    }
    if (!item.isNew) setDeletedIds((ids) => [...ids, item.id]);
    setItems((current) => current.filter((_, i) => i !== index));
  }

  function uniqueFieldKey(fields: FieldDef[], label: string): string {
    const base = slugify(label) || 'feld';
    let key = base;
    let n = 2;
    while (fields.some((f) => f.key === key)) key = `${base}-${n++}`;
    return key;
  }

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();

    // Schlüssel für neue Kategorien aus der Bezeichnung ableiten (eindeutig)
    const usedKeys = new Set(items.filter((i) => !i.isNew).map((i) => i.key));
    const rows = items.map((item, index) => {
      let key = item.key;
      if (item.isNew) {
        const base = slugify(item.label) || 'kategorie';
        key = base;
        let n = 2;
        while (usedKeys.has(key)) key = `${base}-${n++}`;
        usedKeys.add(key);
      }
      // Feldsortierung: ohne gültiges Feld auf «manuell» zurückfallen
      const sortField =
        item.sortMode === 'field'
          ? item.sortField || item.fields[0]?.key || ''
          : '';
      const sortMode = sortField ? item.sortMode : 'manual';
      return {
        id: item.id,
        project_id: projectId,
        key,
        label: item.label,
        add_label: item.add_label || null,
        layout: item.layout,
        sort: index,
        field_schema: {
          fields: item.fields.map((field) => ({
            key: field.key,
            label: field.label,
            ...(field.placeholder ? { placeholder: field.placeholder } : {}),
            ...(field.required ? { required: true } : {}),
            ...(field.badge ? { badge: true } : {}),
          })),
          allowChildren: item.allowChildren,
        },
        sort_mode: sortMode,
        sort_field: sortMode === 'field' ? sortField : null,
        sort_direction: item.sortDirection,
      };
    });

    let failed = false;
    if (rows.length > 0) {
      const { error } = await supabase.from('categories').upsert(rows);
      if (error) failed = true;
    }
    if (!failed && deletedIds.length > 0) {
      const { error } = await supabase
        .from('categories')
        .delete()
        .in('id', deletedIds);
      if (error) failed = true;
    }

    setSaving(false);
    if (failed) {
      showToast(texts.hub.saveErrorToast, 'error');
    } else {
      setDeletedIds([]);
      setItems((current) => current.map((item) => ({ ...item, isNew: false })));
      showToast(texts.hub.savedToast);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {items.map((category, index) => (
        <div key={category.id} className="border border-line bg-white p-4">
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-primary">
                {texts.admin.kategorien.label}
              </span>
              <input
                value={category.label}
                onChange={(e) => update(index, { label: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-primary">
                {texts.admin.kategorien.addLabel}
              </span>
              <input
                value={category.add_label}
                onChange={(e) => update(index, { add_label: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-primary">
                {texts.admin.kategorien.layout}
              </span>
              <select
                value={category.layout}
                onChange={(e) =>
                  update(index, { layout: e.target.value as CategoryLayout })
                }
                className={inputClass}
              >
                <option value="big">{texts.admin.kategorien.layoutBig}</option>
                <option value="list">
                  {texts.admin.kategorien.layoutList}
                </option>
              </select>
            </label>
            <label className="flex items-center gap-2 pb-1.5 text-xs text-primary-dark">
              <input
                type="checkbox"
                checked={category.allowChildren}
                onChange={(e) =>
                  update(index, { allowChildren: e.target.checked })
                }
              />
              {texts.admin.kategorien.allowChildren}
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-primary">
                {texts.admin.kategorien.sortMode}
              </span>
              <select
                value={category.sortMode}
                onChange={(e) =>
                  update(index, {
                    sortMode: e.target.value as CategorySortMode,
                    sortField:
                      e.target.value === 'field' && !category.sortField
                        ? (category.fields[0]?.key ?? '')
                        : category.sortField,
                  })
                }
                className={inputClass}
              >
                <option value="manual">
                  {texts.admin.kategorien.sortManual}
                </option>
                <option value="field">
                  {texts.admin.kategorien.sortByField}
                </option>
              </select>
            </label>
            {category.sortMode === 'field' && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-primary">
                    {texts.admin.kategorien.sortField}
                  </span>
                  <select
                    value={category.sortField}
                    onChange={(e) => update(index, { sortField: e.target.value })}
                    className={inputClass}
                  >
                    {category.fields.map((field) => (
                      <option key={field.key} value={field.key}>
                        {field.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-primary">
                    {texts.admin.kategorien.sortDirection}
                  </span>
                  <select
                    value={category.sortDirection}
                    onChange={(e) =>
                      update(index, {
                        sortDirection: e.target.value as CategorySortDirection,
                      })
                    }
                    className={inputClass}
                  >
                    <option value="asc">{texts.admin.kategorien.sortAsc}</option>
                    <option value="desc">{texts.admin.kategorien.sortDesc}</option>
                  </select>
                </label>
              </>
            )}
            <span className="pb-2 text-xs text-primary">
              {texts.admin.kategorien.keyLabel}:{' '}
              <code>{category.isNew ? '(aus Bezeichnung)' : category.key}</code>
            </span>
            <span className="ml-auto flex gap-1">
              <button
                type="button"
                title={texts.admin.kategorien.moveUp}
                onClick={() => setItems((c) => move(c, index, index - 1))}
                className="border border-line bg-white px-2 py-1 text-xs text-primary-dark hover:border-primary"
              >
                ↑
              </button>
              <button
                type="button"
                title={texts.admin.kategorien.moveDown}
                onClick={() => setItems((c) => move(c, index, index + 1))}
                className="border border-line bg-white px-2 py-1 text-xs text-primary-dark hover:border-primary"
              >
                ↓
              </button>
              <button
                type="button"
                title={texts.common.delete}
                onClick={() => removeCategory(index)}
                className="border border-line bg-white px-2 py-1 text-xs text-primary-dark hover:border-error hover:text-error"
              >
                ✕
              </button>
            </span>
          </div>

          {/* Feld-Schema */}
          <fieldset className="border border-line p-3">
            <legend className="px-1 text-xs font-medium text-primary-dark">
              {texts.admin.kategorien.fields}
            </legend>
            <div className="flex flex-col gap-2">
              {category.fields.map((field, fieldIndex) => (
                <div key={field.key} className="flex flex-wrap items-center gap-2">
                  <input
                    value={field.label}
                    placeholder={texts.admin.kategorien.fieldLabel}
                    onChange={(e) =>
                      updateField(index, fieldIndex, { label: e.target.value })
                    }
                    className={`${inputClass} w-44`}
                  />
                  <input
                    value={field.placeholder ?? ''}
                    placeholder={texts.admin.kategorien.fieldPlaceholder}
                    onChange={(e) =>
                      updateField(index, fieldIndex, {
                        placeholder: e.target.value,
                      })
                    }
                    className={`${inputClass} w-40`}
                  />
                  <label className="flex items-center gap-1 text-xs text-primary-dark">
                    <input
                      type="checkbox"
                      checked={field.required ?? false}
                      onChange={(e) =>
                        updateField(index, fieldIndex, {
                          required: e.target.checked,
                        })
                      }
                    />
                    {texts.admin.kategorien.fieldRequired}
                  </label>
                  <label className="flex items-center gap-1 text-xs text-primary-dark">
                    <input
                      type="checkbox"
                      checked={field.badge ?? false}
                      onChange={(e) =>
                        updateField(index, fieldIndex, {
                          badge: e.target.checked,
                        })
                      }
                    />
                    {texts.admin.kategorien.fieldBadge}
                  </label>
                  <code className="text-xs text-primary">{field.key}</code>
                  <span className="ml-auto flex gap-1">
                    <button
                      type="button"
                      title={texts.admin.kategorien.moveUp}
                      onClick={() =>
                        update(index, {
                          fields: move(category.fields, fieldIndex, fieldIndex - 1),
                        })
                      }
                      className="border border-line bg-white px-2 py-0.5 text-xs text-primary-dark hover:border-primary"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      title={texts.admin.kategorien.moveDown}
                      onClick={() =>
                        update(index, {
                          fields: move(category.fields, fieldIndex, fieldIndex + 1),
                        })
                      }
                      className="border border-line bg-white px-2 py-0.5 text-xs text-primary-dark hover:border-primary"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      title={texts.common.delete}
                      onClick={() => {
                        if (window.confirm(texts.admin.kategorien.confirmDeleteField)) {
                          update(index, {
                            fields: category.fields.filter(
                              (_, fi) => fi !== fieldIndex,
                            ),
                          });
                        }
                      }}
                      className="border border-line bg-white px-2 py-0.5 text-xs text-primary-dark hover:border-error hover:text-error"
                    >
                      ✕
                    </button>
                  </span>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  const label = `Feld ${category.fields.length + 1}`;
                  update(index, {
                    fields: [
                      ...category.fields,
                      { key: uniqueFieldKey(category.fields, label), label },
                    ],
                  });
                }}
                className="self-start border border-dashed border-line px-3 py-1 text-xs text-primary hover:border-accent hover:text-accent"
              >
                {texts.admin.kategorien.addField}
              </button>
            </div>
          </fieldset>
        </div>
      ))}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() =>
            setItems((current) => [
              ...current,
              {
                id: crypto.randomUUID(),
                key: '',
                isNew: true,
                label: texts.admin.kategorien.newLabel,
                add_label: '',
                layout: 'list',
                allowChildren: false,
                fields: [
                  { key: 'icon', label: 'Kürzel', badge: true, required: true },
                  { key: 'title', label: 'Titel', required: true },
                ],
                sortMode: 'manual',
                sortField: '',
                sortDirection: 'asc',
              },
            ])
          }
          className="border border-dashed border-line px-4 py-2 text-sm text-primary hover:border-accent hover:text-accent"
        >
          {texts.admin.kategorien.add}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-60"
        >
          {texts.common.save}
        </button>
      </div>

      <ToastContainer toasts={toasts} />
    </div>
  );
}
