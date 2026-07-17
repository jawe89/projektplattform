import { texts } from '@/lib/texts';

/**
 * Neutrale Startseite: erscheint nur bei direktem Aufruf ohne Tenant
 * (z.B. nacktes localhost). Unbekannte Domains landen auf /tenant-not-found.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="display-title text-3xl text-ink">
        {texts.common.platformName}
      </h1>
      <div className="h-px w-16 bg-accent" />
      <p className="text-sm leading-relaxed text-primary">
        {texts.tenantNotFound.body}
      </p>
      <p className="border-t border-line pt-4 text-xs text-primary">
        {texts.tenantNotFound.devHint}
      </p>
    </main>
  );
}
