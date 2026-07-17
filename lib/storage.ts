/** Öffentliche URL für Dateien im (öffentlichen) Branding-Bucket. */
export function publicBrandingUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/branding/${path}`;
}
