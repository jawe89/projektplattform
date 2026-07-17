import { notFound } from 'next/navigation';
import { LandingPage } from '@/features/landing/landing-page';
import { createClient } from '@/lib/supabase/server';
import { getTenantData } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

/** Öffentliche Landingpage des Projekts (SSR mit Branding). */
export default async function TenantHome({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const tenant = await getTenantData(projectId);
  if (!tenant) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <LandingPage tenant={tenant} isLoggedIn={Boolean(user)} />;
}
