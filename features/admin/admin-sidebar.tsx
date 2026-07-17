'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { texts } from '@/lib/texts';

export interface SidebarProject {
  id: string;
  name: string;
}

const SECTIONS = [
  { key: 'daten', label: texts.admin.tabs.daten },
  { key: 'branding', label: texts.admin.tabs.branding },
  { key: 'kategorien', label: texts.admin.tabs.kategorien },
  { key: 'module', label: texts.admin.tabs.module },
  { key: 'rollen', label: texts.admin.tabs.rollen },
  { key: 'benutzer', label: texts.admin.tabs.benutzer },
] as const;

/**
 * Navigation des Adminbereichs (Design-Referenz): Desktop als weisse
 * Sidebar mit Projektliste und Sektionsnavigation unter dem aktiven
 * Projekt (Akzent-Balken), mobil als Breadcrumb + horizontal scrollbare
 * Sektions-Chips. Ersetzt die frühere Tab-Leiste; die Routen sind
 * unverändert (/projects/[id]/[sektion]).
 */
export function AdminSidebar({ projects }: { projects: SidebarProject[] }) {
  const pathname = usePathname() ?? '';
  const match = pathname.match(/\/projects\/([^/]+)(?:\/([^/]+))?/);
  const activeProjectId = match && match[1] !== 'new' ? match[1] : null;
  const activeSection = match?.[2] ?? null;
  const activeProject =
    projects.find((p) => p.id === activeProjectId) ?? null;
  const activeSectionLabel =
    SECTIONS.find((s) => s.key === activeSection)?.label ?? null;

  return (
    <>
      {/* Desktop-Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-line bg-white py-6 lg:block">
        <p className="display-title px-6 pb-2.5 text-[11px] font-medium tracking-[0.2em] text-primary">
          {texts.admin.projects}
        </p>
        {projects.map((project) => {
          const isActive = project.id === activeProjectId;
          return (
            <div key={project.id}>
              <Link
                href={`/projects/${project.id}/daten`}
                className={`block truncate py-2.5 text-[13px] transition-colors ${
                  isActive
                    ? 'border-l-[3px] border-accent bg-bg px-6 pl-[21px] font-semibold text-ink'
                    : 'px-6 text-primary hover:text-ink'
                }`}
              >
                {project.name}
              </Link>
              {isActive && (
                <div className="my-1.5 mb-3.5 flex flex-col">
                  {SECTIONS.map((section) => {
                    const sectionActive = section.key === activeSection;
                    return (
                      <Link
                        key={section.key}
                        href={`/projects/${project.id}/${section.key}`}
                        className={`py-2 pr-6 pl-10 text-[12.5px] transition-colors ${
                          sectionActive
                            ? 'bg-bg font-semibold text-ink'
                            : 'text-primary hover:text-ink'
                        }`}
                      >
                        {section.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        <Link
          href="/projects/new"
          className="display-title mx-6 mt-4 block border border-dashed border-line py-2 text-center text-[11px] font-medium tracking-[0.14em] text-primary transition-colors hover:border-primary hover:text-primary-dark"
        >
          {texts.admin.newProject}
        </Link>
      </aside>

      {/* Mobile: Breadcrumb + Sektions-Chips (nur innerhalb eines Projekts) */}
      {activeProject && (
        <div className="border-b border-line bg-white lg:hidden">
          <p className="flex items-center gap-2 px-5 pt-3.5 text-[11px] text-primary">
            <Link href="/" className="max-w-[55%] truncate hover:text-ink">
              {activeProject.name}
            </Link>
            <span>›</span>
            <span className="font-semibold text-ink">
              {activeSectionLabel}
            </span>
          </p>
          <nav className="flex gap-1.5 overflow-x-auto px-5 py-2.5">
            {SECTIONS.map((section) => {
              const sectionActive = section.key === activeSection;
              return (
                <Link
                  key={section.key}
                  href={`/projects/${activeProject.id}/${section.key}`}
                  className={`shrink-0 border px-3 py-1.5 text-[11px] transition-colors ${
                    sectionActive
                      ? 'border-ink bg-ink font-semibold text-white'
                      : 'border-line bg-white text-primary-dark'
                  }`}
                >
                  {section.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </>
  );
}
