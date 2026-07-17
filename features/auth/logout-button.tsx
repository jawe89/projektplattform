/**
 * Abmelden als nativer Form-POST auf den Signout-Route-Handler (303-Redirect).
 * Bewusst ohne Client-JavaScript: keine Race mit der Verarbeitung von
 * Action-Responses (siehe CLAUDE.md-Stolperfalle). Funktioniert auf Tenant-
 * und Admin-Domain (die Middleware schreibt /auth/signout passend um).
 */
import { texts } from '@/lib/texts';

export function LogoutButton() {
  return (
    <form action="/auth/signout" method="post">
      <button
        type="submit"
        className="display-title border border-line bg-transparent px-3.5 py-2 text-[11px] font-medium tracking-[0.12em] text-primary-dark transition-colors hover:border-primary-dark sm:px-5 sm:text-[13px] sm:tracking-[0.14em]"
      >
        {texts.hub.logout}
      </button>
    </form>
  );
}
