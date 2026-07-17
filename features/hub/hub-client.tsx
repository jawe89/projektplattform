'use client';

import { useEffect, useMemo, useState } from 'react';
import { ToastContainer, useToasts } from '@/components/ui/toast';
import { LogoutButton } from '@/features/auth/logout-button';
import { DocumentModal, type ModalResult } from '@/features/hub/document-modal';
import { createClient } from '@/lib/supabase/client';
import { texts } from '@/lib/texts';
import type { Category, DocumentEntry } from '@/lib/types';

export interface HubDoc {
  id: string;
  category_id: string;
  parent_id: string | null;
  data: Record<string, string>;
  file_path: string | null;
  external_url: string | null;
}

interface HubClientProps {
  projectId: string;
  projectName: string;
  managementName: string | null;
  managementLogoUrl: string | null;
  /** Hero-Bild aus dem Branding (öffentliche URL) oder null */
  heroUrl: string | null;
  categories: Category[];
  initialDocuments: DocumentEntry[];
  /** category_id → darf hochladen/bearbeiten */
  canUploadByCategory: Record<string, boolean>;
}

interface ModalState {
  category: Category;
  doc?: HubDoc;
  parentId: string | null;
}

/**
 * Kartentexte schema-getrieben ableiten (Schema-Test Kapitel 7):
 * Badge = Feld mit badge:true, Titel = erstes Textfeld, Untertitel =
 * alle weiteren Textfelder (« · »-verbunden). Neue Schema-Felder erscheinen
 * damit ohne Codeänderung auf der Karte.
 */
function cardParts(doc: HubDoc, category: Category) {
  const fields = category.field_schema.fields ?? [];
  const badgeField = fields.find((f) => f.badge);
  const [titleField, ...restFields] = fields.filter((f) => !f.badge);
  return {
    badge: badgeField ? (doc.data[badgeField.key] ?? '') : '',
    title: titleField ? (doc.data[titleField.key] ?? '') : '',
    sub: restFields
      .map((f) => doc.data[f.key])
      .filter(Boolean)
      .join(' · '),
  };
}

/**
 * Dokumenten-Hub (M2): Kategorien-Abschnitte gemäss Rollen-Matrix,
 * Kartendarstellung (big/list), Unterpositionen, Modal, Drag-Sortierung,
 * Sticky Toolbar mit Speicherstatus, Toasts unten rechts.
 *
 * Bedienkonzept wie die bestehenden Tools: Änderungen wirken sofort lokal
 * (Status «● Ungespeicherte Änderungen»), «Speichern» persistiert alles.
 */
export function HubClient({
  projectId,
  projectName,
  managementName,
  managementLogoUrl,
  heroUrl,
  categories,
  initialDocuments,
  canUploadByCategory,
}: HubClientProps) {
  const [docs, setDocs] = useState<HubDoc[]>(() =>
    initialDocuments.map((d) => ({
      id: d.id,
      category_id: d.category_id,
      parent_id: d.parent_id,
      data: d.data,
      file_path: d.file_path,
      external_url: d.external_url,
    })),
  );
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const { toasts, showToast } = useToasts();

  const isEditor = useMemo(
    () => categories.some((c) => canUploadByCategory[c.id]),
    [categories, canUploadByCategory],
  );

  // Warnung bei ungespeicherten Änderungen
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = texts.hub.leaveWarning;
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  /**
   * Dokumente einer Gruppe (Kategorie + Parent). Bei sort_mode «field» wird
   * automatisch nach dem konfigurierten Feld sortiert – natürliche Sortierung,
   * damit z.B. BKP «211.4» zwischen «211» und «212» einsortiert wird.
   * Gilt sinngemäss auch für Unterpositionen (gleiche Kategorie).
   */
  function docsOf(category: Category, parentId: string | null): HubDoc[] {
    const group = docs.filter(
      (d) => d.category_id === category.id && d.parent_id === parentId,
    );
    if ((category.sort_mode ?? 'manual') !== 'field' || !category.sort_field) {
      return group;
    }
    const field = category.sort_field;
    const direction = category.sort_direction === 'desc' ? -1 : 1;
    return [...group].sort((a, b) => {
      const va = (a.data[field] ?? '').trim();
      const vb = (b.data[field] ?? '').trim();
      if (!va && !vb) return 0;
      if (!va) return 1; // leere Werte ans Ende
      if (!vb) return -1;
      return (
        va.localeCompare(vb, 'de-CH', { numeric: true, sensitivity: 'base' }) *
        direction
      );
    });
  }

  function isManuallySortable(category: Category): boolean {
    return (category.sort_mode ?? 'manual') === 'manual';
  }

  function applyModal(result: ModalResult) {
    if (!modal) return;
    if (modal.doc) {
      setDocs((current) =>
        current.map((d) =>
          d.id === modal.doc!.id ? { ...d, ...result } : d,
        ),
      );
      showToast(texts.hub.updatedToast);
    } else {
      setDocs((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          category_id: modal.category.id,
          parent_id: modal.parentId,
          ...result,
        },
      ]);
      if (modal.parentId) {
        setExpanded((s) => new Set(s).add(modal.parentId!));
      }
      showToast(texts.hub.addedToast);
    }
    setModal(null);
    setDirty(true);
  }

  function removeDoc(doc: HubDoc) {
    if (!window.confirm(texts.hub.confirmDelete)) return;
    const idsToRemove = new Set([
      doc.id,
      ...docs.filter((d) => d.parent_id === doc.id).map((d) => d.id),
    ]);
    setDocs((current) => current.filter((d) => !idsToRemove.has(d.id)));
    setDeletedIds((current) => [...current, ...idsToRemove]);
    setDirty(true);
    showToast(texts.hub.deletedToast);
  }

  /** Drag-Sortierung innerhalb derselben Gruppe (Kategorie + Parent) */
  function reorder(target: HubDoc) {
    if (!dragId || dragId === target.id) return;
    const source = docs.find((d) => d.id === dragId);
    if (
      !source ||
      source.category_id !== target.category_id ||
      source.parent_id !== target.parent_id
    ) {
      return;
    }
    setDocs((current) => {
      const rest = current.filter((d) => d.id !== source.id);
      const targetIndex = rest.findIndex((d) => d.id === target.id);
      return [
        ...rest.slice(0, targetIndex),
        source,
        ...rest.slice(targetIndex),
      ];
    });
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();

    // Sortierung = aktuelle Reihenfolge je Gruppe (Kategorie + Parent)
    const groupCounters = new Map<string, number>();
    const rows = docs.map((d) => {
      const groupKey = `${d.category_id}:${d.parent_id ?? ''}`;
      const sort = groupCounters.get(groupKey) ?? 0;
      groupCounters.set(groupKey, sort + 1);
      return {
        id: d.id,
        project_id: projectId,
        category_id: d.category_id,
        parent_id: d.parent_id,
        data: d.data,
        file_path: d.file_path,
        external_url: d.external_url,
        sort,
      };
    });

    let failed = false;
    if (rows.length > 0) {
      const { error } = await supabase.from('documents').upsert(rows);
      if (error) failed = true;
    }
    if (!failed && deletedIds.length > 0) {
      const { error } = await supabase
        .from('documents')
        .delete()
        .in('id', deletedIds);
      if (error) failed = true;
    }

    setSaving(false);
    if (failed) {
      showToast(texts.hub.saveErrorToast, 'error');
    } else {
      setDeletedIds([]);
      setDirty(false);
      showToast(texts.hub.savedToast);
    }
  }

  function hrefOf(doc: HubDoc): string | null {
    if (doc.external_url) return doc.external_url;
    if (doc.file_path) return `/api/download/${doc.id}`;
    return null;
  }

  function toggleExpanded(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // -------------------------------------------------------------------------

  /**
   * Dokumenttitel: klickbar, wenn eine Datei/URL hinterlegt ist (gleiche
   * Aktion wie der Download-Pfeil, gleiche Signed-URL-Logik) – mit
   * Hover-Rückmeldung. Bearbeitungs-Buttons bleiben separat.
   */
  function titleNode(doc: HubDoc, title: string, className: string) {
    const href = hrefOf(doc);
    if (!href) return <span className={className}>{title}</span>;
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        title={texts.hub.open}
        className={`${className} underline-offset-2 hover:text-accent hover:underline`}
      >
        {title}
      </a>
    );
  }

  function editorControls(doc: HubDoc, category: Category) {
    if (!canUploadByCategory[category.id]) return null;
    return (
      <span className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          title={texts.common.edit}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setModal({ category, doc, parentId: doc.parent_id });
          }}
          className="border border-line bg-white px-2 py-1 text-xs text-primary-dark hover:border-primary"
        >
          ✎
        </button>
        <button
          type="button"
          title={texts.common.delete}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            removeDoc(doc);
          }}
          className="border border-line bg-white px-2 py-1 text-xs text-primary-dark hover:border-error hover:text-error"
        >
          ✕
        </button>
      </span>
    );
  }

  function dragProps(doc: HubDoc, category: Category) {
    // Drag-Sortierung nur bei manueller Sortierung (sonst automatisch nach Feld)
    if (!canUploadByCategory[category.id] || !isManuallySortable(category)) {
      return {};
    }
    return {
      draggable: true,
      title: texts.hub.dragHint,
      onDragStart: () => setDragId(doc.id),
      onDragEnd: () => setDragId(null),
      onDragOver: (e: React.DragEvent) => e.preventDefault(),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        reorder(doc);
      },
    };
  }

  function childList(parent: HubDoc, category: Category) {
    const children = docsOf(category, parent.id);
    const isOpen = expanded.has(parent.id);
    if (!category.field_schema.allowChildren) return null;
    return (
      <div className="border-t border-line">
        <button
          type="button"
          onClick={() => toggleExpanded(parent.id)}
          className="flex w-full items-center justify-between px-4 py-2 text-xs text-primary-dark hover:text-ink"
        >
          <span>
            {texts.hub.childrenLabel} ({children.length})
          </span>
          <span
            className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}
          >
            ›
          </span>
        </button>
        {isOpen && (
          <ul>
            {children.map((child) => {
              const parts = cardParts(child, category);
              return (
              <li
                key={child.id}
                {...dragProps(child, category)}
                className="flex items-center gap-3 border-t border-line px-4 py-2"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-line bg-bg text-[10px] font-semibold text-primary-dark">
                  {parts.badge}
                </span>
                <span className="min-w-0 flex-1">
                  {titleNode(child, parts.title, 'block truncate text-sm text-ink')}
                  {parts.sub && (
                    <span className="block truncate text-xs text-primary">
                      {parts.sub}
                    </span>
                  )}
                </span>
                {editorControls(child, category)}
                {hrefOf(child) && (
                  <a
                    href={hrefOf(child)!}
                    target="_blank"
                    rel="noreferrer"
                    title={texts.hub.download}
                    className="shrink-0 border border-line bg-white px-2 py-1 text-xs text-accent hover:border-accent"
                  >
                    ↓
                  </a>
                )}
              </li>
              );
            })}
            {canUploadByCategory[category.id] && (
              <li className="border-t border-line px-4 py-2">
                <button
                  type="button"
                  onClick={() =>
                    setModal({ category, parentId: parent.id })
                  }
                  className="w-full border border-dashed border-line px-3 py-1.5 text-xs text-primary hover:border-accent hover:text-accent"
                >
                  {texts.hub.addChild}
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    );
  }

  function bigCard(doc: HubDoc, category: Category) {
    const href = hrefOf(doc);
    const parts = cardParts(doc, category);
    return (
      <article
        key={doc.id}
        {...dragProps(doc, category)}
        className="flex flex-col border border-line bg-white"
      >
        <div className="flex flex-1 flex-col gap-2 p-5">
          <div className="flex items-start justify-between gap-2">
            <span className="display-title inline-block border border-accent px-2 py-0.5 text-[10px] text-accent">
              {parts.badge}
            </span>
            {editorControls(doc, category)}
          </div>
          <h3 className="text-sm font-semibold">
            {titleNode(doc, parts.title, 'text-ink')}
          </h3>
          {parts.sub && (
            <p className="text-xs leading-relaxed text-primary">
              {parts.sub}
            </p>
          )}
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="mt-auto pt-2 text-xs font-medium text-accent hover:text-accent-dark"
            >
              {texts.hub.open} →
            </a>
          )}
        </div>
        {childList(doc, category)}
      </article>
    );
  }

  function listCard(doc: HubDoc, category: Category) {
    const href = hrefOf(doc);
    const parts = cardParts(doc, category);
    return (
      <li
        key={doc.id}
        {...dragProps(doc, category)}
        className="flex items-center gap-3 border border-line bg-white px-4 py-3"
      >
        <span className="display-title flex h-10 w-10 shrink-0 items-center justify-center border border-line bg-bg text-xs text-primary-dark">
          {parts.badge}
        </span>
        <span className="min-w-0 flex-1">
          {titleNode(doc, parts.title, 'block truncate text-sm font-medium text-ink')}
          {parts.sub && (
            <span className="block truncate text-xs text-primary">
              {parts.sub}
            </span>
          )}
        </span>
        {editorControls(doc, category)}
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            title={texts.hub.download}
            className="shrink-0 border border-line bg-white px-2.5 py-1.5 text-sm text-accent hover:border-accent"
          >
            ↓
          </a>
        )}
      </li>
    );
  }

  // -------------------------------------------------------------------------

  return (
    <div className="min-h-screen">
      {/* Sticky Toolbar */}
      <header className="sticky top-0 z-30 border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {managementLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- externe Storage-URL
              <img
                src={managementLogoUrl}
                alt={managementName ?? ''}
                className="h-8 w-auto shrink-0"
              />
            ) : (
              <span className="display-title text-sm text-primary-dark">
                {managementName}
              </span>
            )}
            <span className="hidden truncate text-xs text-primary sm:block">
              {projectName}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {isEditor && (
              <>
                <span
                  className={`text-xs font-medium ${
                    dirty ? 'text-warn' : 'text-accent'
                  }`}
                >
                  {dirty ? texts.common.unsaved : texts.common.saved}
                </span>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!dirty || saving}
                  className="bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
                >
                  {texts.common.save}
                </button>
              </>
            )}
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* Hero-Bild aus dem Branding (entfällt ersatzlos ohne Bild).
          Gleiche Ausschnittlogik wie die Landingpage (16:9 mobil, 21:9 ab sm),
          nur kompakter gedeckelt – Banner-Charakter statt schmalem Streifen. */}
      {heroUrl && (
        <div className="mx-auto max-w-5xl px-6 pt-6">
          <figure className="border border-line bg-white p-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- externe Storage-URL */}
            <img
              src={heroUrl}
              alt={projectName}
              className="aspect-[16/9] w-full object-cover sm:aspect-[21/9] sm:max-h-72"
            />
          </figure>
        </div>
      )}

      {/* Sprungnavigation */}
      <nav className="mt-6 border-y border-line bg-white">
        <div className="mx-auto flex max-w-5xl gap-4 overflow-x-auto px-6 py-2">
          {categories.map((category) => (
            <a
              key={category.id}
              href={`#${category.key}`}
              className="display-title shrink-0 text-xs text-primary hover:text-accent"
            >
              {category.label}
            </a>
          ))}
        </div>
      </nav>

      {/* Kategorien-Abschnitte */}
      <main className="mx-auto max-w-5xl px-6 pt-8 pb-16">
        <h1 className="display-title mb-8 text-2xl text-ink">{projectName}</h1>

        {categories.map((category) => {
          const topDocs = docsOf(category, null);
          const canUpload = canUploadByCategory[category.id];
          return (
            <section
              key={category.id}
              id={category.key}
              className="mb-12 scroll-mt-24"
            >
              <div className="mb-4 flex items-baseline justify-between border-b border-line pb-2">
                <h2 className="display-title text-lg text-ink">
                  {category.label}
                </h2>
                <span className="text-xs text-primary">
                  {topDocs.length} {category.label}
                </span>
              </div>

              {topDocs.length === 0 && !canUpload && (
                <p className="text-sm text-primary">
                  {texts.hub.emptyCategory}
                </p>
              )}

              {category.layout === 'big' ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {topDocs.map((doc) => bigCard(doc, category))}
                  {canUpload && (
                    <button
                      type="button"
                      onClick={() => setModal({ category, parentId: null })}
                      className="flex min-h-28 items-center justify-center border border-dashed border-line bg-transparent p-5 text-sm text-primary hover:border-accent hover:text-accent"
                    >
                      {category.add_label ?? texts.hub.addFallback}
                    </button>
                  )}
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {topDocs.map((doc) => listCard(doc, category))}
                  {canUpload && (
                    <li>
                      <button
                        type="button"
                        onClick={() => setModal({ category, parentId: null })}
                        className="w-full border border-dashed border-line px-4 py-3 text-sm text-primary hover:border-accent hover:text-accent"
                      >
                        {category.add_label ?? texts.hub.addFallback}
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </section>
          );
        })}
      </main>

      {modal && (
        <DocumentModal
          projectId={projectId}
          category={modal.category}
          initial={
            modal.doc
              ? {
                  data: modal.doc.data,
                  file_path: modal.doc.file_path,
                  external_url: modal.doc.external_url,
                }
              : undefined
          }
          onApply={applyModal}
          onClose={() => setModal(null)}
        />
      )}

      <ToastContainer toasts={toasts} />
    </div>
  );
}
