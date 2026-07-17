# Go-Live Wattwil – Ablaufplan

Umzug von `bauinnovation-mcdonalds-wattwil.ch` (bestehender Webserver mit
Basic-Auth) auf die Projektplattform (Vercel + Supabase). Die Schritte in
dieser Reihenfolge ausführen; die DNS-Umstellung der Hauptdomain kommt zuletzt.

**Stand der Vorbereitung:** Datenimport (M4) und Datei-Migration (M5) sind
ausgeführt – alle 81 Projektdateien liegen im privaten Storage-Bucket, die
zwei Live-Tools (Baukostenkontrolle, Leistungsverzeichnis) verweisen auf
`https://tools.bauinnovation-mcdonalds-wattwil.ch/…`.

---

## 0. Vorbereitung (jederzeit möglich)

- [ ] **TTL senken**: Beim Registrar die TTL der DNS-Einträge von
      `bauinnovation-mcdonalds-wattwil.ch` auf 300 s stellen (macht die
      spätere Umstellung und einen allfälligen Rollback schnell).
- [ ] **Bestehende DNS-Werte notieren** (A/CNAME von `@` und `www`) –
      das ist der Rollback-Stand.

## 1. Vercel-Projekt aufsetzen und unter vercel.app testen

- [ ] Repository zu GitHub pushen und in Vercel importieren
      (Framework-Preset «Next.js», keine `vercel.json` nötig – Zero-Config).
- [ ] **Umgebungsvariablen** in Vercel setzen (Production und Preview):

  | Variable | Wert |
  |---|---|
  | `NEXT_PUBLIC_SUPABASE_URL` | wie `.env.local` |
  | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | wie `.env.local` |
  | `SUPABASE_SERVICE_ROLE_KEY` | wie `.env.local` (Server-only: Invites, Benutzerliste) |
  | `ADMIN_DOMAIN` | `admin.projektplattform.ch` |

  `LEGACY_BASIC_AUTH` wird **nicht** in Vercel gesetzt (nur lokales Skript).
- [ ] Deployment testen unter der vercel.app-Adresse:
  - `https://<projekt>.vercel.app/?tenant=mcd-wattwil` → Landingpage Wattwil.
    Der Parameter ist nur beim Einstieg nötig: Die Middleware merkt sich den
    Tenant in einem Cookie (`tenant-slug`), Login/Hub/Logout funktionieren
    danach ohne Parameter. Tenant-Wechsel mit neuem `?tenant=`; echte
    Projekt-Domains haben immer Vorrang.
  - Login Bauleitung → Hub, Stichproben-Download (signierte URL).
  - Admin-Test: `ADMIN_DOMAIN` vorübergehend auf `<projekt>.vercel.app`
    stellen, Adminbereich prüfen, danach zurück auf
    `admin.projektplattform.ch`.

## 2. tools.-Subdomain beim Hoster einrichten

Die beiden Spezialtools bleiben vorerst als Live-HTML auf dem bisherigen
Hosting (Phase 2 macht sie zu Plattform-Modulen).

- [ ] Beim bisherigen Hoster die Subdomain
      `tools.bauinnovation-mcdonalds-wattwil.ch` anlegen und auf das
      bestehende Webverzeichnis zeigen (dort liegen
      `baukostenkontrolle-mcd-wattwil.html` und
      `verkehr-leistungsverzeichnis-mcd-wattwil.html` samt `save.php`/Uploads).
- [ ] Basic-Auth-Schutz auf der Subdomain beibehalten.
- [ ] **Wichtig:** Die Subdomain zeigt auf den **alten Server** und ist von
      der DNS-Umstellung der Hauptdomain nicht betroffen.
- [ ] Test: beide Tools unter `https://tools.bauinnovation-mcdonalds-wattwil.ch/…`
      aufrufen (mit Basic-Auth-Login) – die Links im Hub zeigen bereits dorthin.

## 3. Supabase-Auth produktiv konfigurieren

Supabase-Dashboard → Authentication:

- [ ] **Site URL**: `https://bauinnovation-mcdonalds-wattwil.ch`
- [ ] **Redirect-Allowlist** (Authentication → URL Configuration):
  - `https://bauinnovation-mcdonalds-wattwil.ch/**`
  - `https://admin.projektplattform.ch/**`
  - `https://<projekt>.vercel.app/**` (für Tests)
  - `http://*.localhost:3000/**` (lokale Entwicklung)
- [ ] **Eigenen SMTP-Versand einrichten** (Authentication → SMTP): der
      eingebaute Supabase-Testversand ist stark limitiert und nicht für
      Produktion gedacht. Absender z.B. `plattform@bauinnovation.ch`.
- [ ] **E-Mail-Vorlagen** («Reset Password», «Invite user») auf den
      token_hash-Link umstellen (robusteste Variante, Route `/auth/confirm`) –
      fertige Snippets zum Einfügen: [SUPABASE-MAILVORLAGEN.md](SUPABASE-MAILVORLAGEN.md)
- [ ] Test: Passwort-Reset für einen Testbenutzer anfordern und Mail-Empfang
      prüfen.

## 3b. Echten Plattform-Admin anlegen, Testbenutzer entfernen

- [ ] `npm run create:admin -- --email <deine-adresse> --invite`
      (Invite-Mail über den eben konfigurierten SMTP) oder mit
      `--password '…'` direkt ein starkes Passwort setzen.
- [ ] **Login mit dem neuen Konto auf der Admin-Adresse testen.**
- [ ] Erst danach: `npm run cleanup:testusers` – löscht alle
      example.com-Testbenutzer (inkl. admin.plattform@example.com).
      Das Skript verweigert die Ausführung, solange kein anderer
      Plattform-Admin existiert (Aussperr-Schutz).
- [ ] Ab jetzt gilt: `npm run seed` läuft nur noch mit `SEED_ALLOW_PROD=1`
      (Produktivschutz) – im Normalfall nie mehr ausführen.

## 4. Domains in Vercel hinzufügen

- [ ] `admin.projektplattform.ch` → beim Registrar von `projektplattform.ch`:
      CNAME `admin` → `cname.vercel-dns.com`; Domain in Vercel hinzufügen.
- [ ] `bauinnovation-mcdonalds-wattwil.ch` und
      `www.bauinnovation-mcdonalds-wattwil.ch` in Vercel **hinzufügen**
      (DNS zeigt noch auf den alten Server – Vercel wartet auf die Einträge;
      das ist gewollt, so ist die Umstellung später nur noch ein DNS-Wechsel).

## 5. DNS-Umstellung der Hauptdomain (Go-Live)

Zeitpunkt: ausserhalb der Bürozeiten, alle vorherigen Schritte grün.

- [ ] Beim Registrar umstellen:
  - A-Record `@` → `76.76.21.21`
  - CNAME `www` → `cname.vercel-dns.com`
  - **Der Eintrag für `tools` bleibt unverändert auf dem alten Server.**
- [ ] Warten bis Vercel die Domain als «Valid» zeigt und das TLS-Zertifikat
      ausgestellt ist (bei TTL 300 wenige Minuten).
- [ ] **Abnahmetests auf der echten Domain:**
  - Landingpage mit Branding, Login Bauleitung → Hub mit vollem Datenbestand.
  - Stichproben-Download PDF (signierte URL, 1 h gültig).
  - Baukostenkontrolle/Leistungsverzeichnis öffnen (tools.-Subdomain).
  - Login Unternehmer: nur Pläne + Ausschreibungen.
  - Passwort-Reset-Mail end-to-end.
  - `https://admin.projektplattform.ch`: Projektliste, JSON-Export Wattwil
    herunterladen und ablegen (Backup des Migrationsstands).

## 6. Nachlauf

- [ ] Alte Projektübersicht-HTML auf dem Hoster belassen (Backup), aber
      Bearbeitung einstellen (Datenstand lebt jetzt in der Plattform).
- [ ] TTL wieder erhöhen (z.B. 3600), sobald alles stabil läuft.
- [ ] JSON-Export als wiederkehrendes Backup nutzen (Admin → Projekt →
      «JSON-Export»).

---

## Rollback-Plan

Falls nach der DNS-Umstellung etwas Grundlegendes nicht funktioniert:

1. **DNS zurückstellen** auf die in Schritt 0 notierten Werte
   (A/CNAME von `@` und `www` auf den alten Server). Bei TTL 300 greift das
   innert Minuten – die alte Projektübersicht ist unverändert vorhanden und
   sofort wieder produktiv.
2. Die `tools.`-Subdomain und die Plattform (vercel.app-Adresse) bleiben davon
   unberührt und funktionieren weiter.
3. Kein Datenverlust: Die migrierten Dateien bleiben im Supabase-Storage, der
   Datenbestand in Postgres; die alte HTML-Datei enthält weiterhin den Stand
   vom Export-Datum (16.07.2026).
4. Ursache analysieren, beheben, Umstellung wiederholen.

**Wichtig:** Ab dem Go-Live werden neue Dokumente nur noch in der Plattform
gepflegt. Nach einem Rollback müssten zwischenzeitliche Änderungen manuell in
die alte HTML übertragen werden – deshalb die Abnahmetests direkt nach der
Umstellung durchführen.
