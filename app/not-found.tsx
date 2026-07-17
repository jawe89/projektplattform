import { texts } from '@/lib/texts';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="display-title text-3xl text-ink">
        {texts.tenantNotFound.title}
      </h1>
      <div className="h-px w-16 bg-accent" />
      <p className="text-sm leading-relaxed text-primary">
        {texts.tenantNotFound.body}
      </p>
    </main>
  );
}
