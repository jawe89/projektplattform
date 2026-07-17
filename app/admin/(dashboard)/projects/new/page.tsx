import { ProjectForm } from '@/features/admin/project-form';
import { requirePlatformAdmin } from '@/features/admin/require-admin';
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
      <h1 className="display-title mb-6 text-2xl text-ink">
        {texts.admin.newProject.replace(/^\+\s*/, '')}
      </h1>
      <div className="border border-line bg-white p-6">
        <ProjectForm templates={templates ?? []} />
      </div>
    </div>
  );
}
