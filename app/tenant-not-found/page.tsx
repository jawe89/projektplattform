import { texts } from '@/lib/texts';

/** Neutrale Hinweisseite für unbekannte Domains (Rewrite aus der Middleware). */
export default function TenantNotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="display-title text-3xl text-ink">
        {texts.tenantNotFound.title}
      </h1>
      <div className="h-px w-16 bg-accent" />
      <p className="text-sm leading-relaxed text-primary">
        {texts.tenantNotFound.body}
      </p>
      <p className="border-t border-line pt-4 text-xs text-primary-dark">
        {texts.common.platformName}
      </p>
    </main>
  );
}
