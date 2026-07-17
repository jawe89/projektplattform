'use client';

import { createClient } from '@/lib/supabase/client';

/**
 * Datei-Upload in den privaten Bucket «project-files» mit Fortschrittsanzeige.
 * Pfadkonvention: {project_id}/{category_key}/{eindeutiger-name}
 * (eindeutige Dateinamen: Storage-Objekte werden vom CDN gecacht, gleichnamiges
 * Überschreiben würde bis zu 1 h alte Inhalte liefern – siehe CLAUDE.md).
 *
 * supabase-js bietet keinen Upload-Progress, daher XHR direkt gegen die
 * Storage-REST-API – mit dem Access-Token des Users, RLS greift unverändert.
 */

function sanitizeFileName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // Akzente entfernen
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(-80);
}

export function buildStoragePath(
  projectId: string,
  categoryKey: string,
  fileName: string,
): string {
  const unique = crypto.randomUUID().slice(0, 8);
  return `${projectId}/${categoryKey}/${unique}-${sanitizeFileName(fileName)}`;
}

export async function uploadProjectFile(
  path: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Keine Session.');

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/project-files/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
    xhr.setRequestHeader(
      'Content-Type',
      file.type || 'application/octet-stream',
    );
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload fehlgeschlagen (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Upload fehlgeschlagen (Netzwerk)'));
    xhr.send(file);
  });
}
