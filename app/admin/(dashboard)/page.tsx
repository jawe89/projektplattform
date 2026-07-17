import Link from 'next/link';
import { requirePlatformAdmin } from '@/features/admin/require-admin';
import { AdminSectionHeader } from '@/features/admin/section-header';
import { texts } from '@/lib/texts';
import type { Project } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Projektliste (alle Projekte, nur platform_admins). */
export default async function AdminProjectsPage() {
  const { supabase } = await requirePlatformAdmin();

  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .order('created_at')
    .returns<Project[]>();

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <AdminSectionHeader
          title={texts.admin.projects}
          description={texts.admin.sections.projects}
        />
        <Link
          href="/projects/new"
          className="display-title bg-accent px-5 py-2.5 text-[12px] font-medium tracking-[0.14em] text-white transition-opacity hover:opacity-90"
        >
          {texts.admin.newProject}
        </Link>
      </div>

      <div className="overflow-x-auto border border-line bg-white">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b border-line bg-bg text-left">
              <th className="display-title px-4 py-3 text-[11px] font-medium tracking-[0.16em] text-primary-dark">
                {texts.admin.nameLabel}
              </th>
              <th className="display-title px-4 py-3 text-[11px] font-medium tracking-[0.16em] text-primary-dark">
                {texts.admin.projectNoLabel}
              </th>
              <th className="display-title px-4 py-3 text-[11px] font-medium tracking-[0.16em] text-primary-dark">
                {texts.admin.slugLabel}
              </th>
              <th className="display-title px-4 py-3 text-[11px] font-medium tracking-[0.16em] text-primary-dark">
                {texts.admin.domainLabel}
              </th>
              <th className="display-title px-4 py-3 text-[11px] font-medium tracking-[0.16em] text-primary-dark">
                {texts.admin.statusLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {(projects ?? []).map((project) => (
              <tr key={project.id} className="border-b border-line last:border-b-0">
                <td className="px-4 py-3">
                  <Link
                    href={`/projects/${project.id}/daten`}
                    className="font-medium text-ink underline-offset-2 hover:text-accent hover:underline"
                  >
                    {project.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-primary-dark">
                  {project.project_no}
                </td>
                <td className="px-4 py-3 text-primary-dark">{project.slug}</td>
                <td className="px-4 py-3 text-primary-dark">
                  {project.domain}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-[0.04em] uppercase ${
                      project.status === 'active'
                        ? 'border-accent text-accent'
                        : 'border-primary text-primary'
                    }`}
                  >
                    {project.status === 'active'
                      ? texts.admin.statusActive
                      : texts.admin.statusArchived}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
