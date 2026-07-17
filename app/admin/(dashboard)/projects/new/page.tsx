import { ProjectForm } from '@/features/admin/project-form';
import { requirePlatformAdmin } from '@/features/admin/require-admin';
import { AdminSectionHeader } from '@/features/admin/section-header';
import { texts } from '@/lib/texts';

export const dynamic = 'force-dynamic';

export default async function NewProjectPage() {
  const { supabase } = await requirePlatformAdmin();

  const { data: templates } = await supabase
    .from('projects')
    .select('id, name')
    .order('name');

  return (
    <div>
      <AdminSectionHeader
        title={texts.admin.newProject.replace(/^\+\s*/, '')}
      />
      <div className="border border-line bg-white p-6">
        <ProjectForm templates={templates ?? []} />
      </div>
    </div>
  );
}
