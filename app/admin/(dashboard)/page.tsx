import Link from 'next/link';
import { requirePlatformAdmin } from '@/features/admin/require-admin';
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
      <div className="mb-6 flex items-center justify-between">
        <h1 className="display-title text-2xl text-ink">
          {texts.admin.projects}
        </h1>
        <Link
          href="/projects/new"
          className="bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark"
        >
          {texts.admin.newProject}
        </Link>
      </div>

      <div className="border border-line bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="display-title px-4 py-3 text-xs font-normal text-primary">
                {texts.admin.nameLabel}
              </th>
              <th className="display-title px-4 py-3 text-xs font-normal text-primary">
                {texts.admin.projectNoLabel}
              </th>
              <th className="display-title px-4 py-3 text-xs font-normal text-primary">
                {texts.admin.slugLabel}
              </th>
              <th className="display-title px-4 py-3 text-xs font-normal text-primary">
                {texts.admin.domainLabel}
              </th>
              <th className="display-title px-4 py-3 text-xs font-normal text-primary">
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
                    className={
                      project.status === 'active'
                        ? 'text-accent'
                        : 'text-primary'
                    }
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
