'use client';

import { createClient } from '@/lib/supabase/client';

/**
 * Upload in den öffentlichen Branding-Bucket mit eindeutigem Dateinamen
 * (CDN cached 1 h – gleichnamiges Überschreiben würde alte Inhalte liefern,
 * siehe CLAUDE.md).
 */
export async function uploadBrandingFile(
  projectId: string,
  file: File,
  prefix: 'logo' | 'hero',
): Promise<string> {
  const supabase = createClient();
  const extension = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const path = `${projectId}/${prefix}-${Date.now()}.${extension}`;
  const { error } = await supabase.storage
    .from('branding')
    .upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return path;
}
