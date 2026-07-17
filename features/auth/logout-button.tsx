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
        className="border border-line bg-white px-4 py-2 text-sm text-primary-dark transition-colors hover:border-primary"
      >
        {texts.hub.logout}
      </button>
    </form>
  );
}
