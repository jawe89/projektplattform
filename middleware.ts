import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Tenant-Erkennung gemäss Kapitel 4 der SPEZIFIKATION.md:
 *   host = request.headers.host (www. entfernen)
 *   host == ADMIN_DOMAIN            → Rewrite auf /admin/*
 *   sonst: Projekt-Lookup über projects.domain (Edge-tauglich gecacht)
 *          → Header x-project-id setzen, Rewrite auf /p/[projectId]/*
 *   unbekannte Domain               → neutrale Hinweisseite
 *
 * Lokale Entwicklung: Tenant zusätzlich über ?tenant=slug oder slug.localhost:3000.
 */

const LOOKUP_TTL_MS = 60_000;

interface CacheEntry {
  projectId: string | null;
  expires: number;
}

// Modul-Scope-Cache: überlebt Requests innerhalb derselben Edge-Isolate.
const lookupCache = new Map<string, CacheEntry>();

async function lookupProjectId(
  column: 'domain' | 'slug',
  value: string,
): Promise<string | null> {
  const cacheKey = `${column}:${value}`;
  const cached = lookupCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.projectId;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;

  let projectId: string | null = null;
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/projects?select=id&${column}=eq.${encodeURIComponent(value)}&status=eq.active&limit=1`,
      { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } },
    );
    if (res.ok) {
      const rows = (await res.json()) as { id: string }[];
      projectId = rows[0]?.id ?? null;
    }
  } catch {
    // Supabase nicht erreichbar → wie unbekannte Domain behandeln (kein Cache).
    return null;
  }

  lookupCache.set(cacheKey, { projectId, expires: Date.now() + LOOKUP_TTL_MS });
  return projectId;
}

/**
 * Supabase-Session auffrischen (empfohlenes SSR-Muster): abgelaufene
 * Access-Tokens werden erneuert und die Cookies auf der Response gesetzt.
 * Läuft nur, wenn überhaupt ein Auth-Cookie vorhanden ist.
 */
async function refreshSession(request: NextRequest, response: NextResponse) {
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => /^sb-.+-auth-token/.test(c.name));
  if (!hasAuthCookie) return;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return;

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  await supabase.auth.getUser();
}

function rewriteTo(request: NextRequest, basePath: string, projectId?: string) {
  const url = request.nextUrl.clone();
  url.pathname = `${basePath}${url.pathname === '/' ? '' : url.pathname}`;

  if (projectId) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-project-id', projectId);
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  }
  return NextResponse.rewrite(url);
}

/** Rewrite + Session-Refresh in einem Schritt. */
async function rewriteWithSession(
  request: NextRequest,
  basePath: string,
  projectId?: string,
) {
  const response = rewriteTo(request, basePath, projectId);
  await refreshSession(request, response);
  return response;
}

export async function middleware(request: NextRequest) {
  const adminDomain = (process.env.ADMIN_DOMAIN ?? 'admin.projektplattform.ch').toLowerCase();
  const rawHost = request.headers.get('host') ?? '';
  const host = rawHost.replace(/^www\./, '').split(':')[0].toLowerCase();

  // Adminbereich über eigene Domain (lokal: admin.localhost:3000)
  if (host === adminDomain || host === 'admin.localhost') {
    return rewriteWithSession(request, '/admin');
  }

  // Lokale Entwicklung: ?tenant=slug oder slug.localhost:3000
  const tenantParam = request.nextUrl.searchParams.get('tenant');
  if (tenantParam) {
    const projectId = await lookupProjectId('slug', tenantParam);
    if (projectId) return rewriteWithSession(request, `/p/${projectId}`, projectId);
    return rewriteTo(request, '/tenant-not-found');
  }

  if (host.endsWith('.localhost')) {
    const slug = host.slice(0, -'.localhost'.length);
    const projectId = await lookupProjectId('slug', slug);
    if (projectId) return rewriteWithSession(request, `/p/${projectId}`, projectId);
    return rewriteTo(request, '/tenant-not-found');
  }

  // Nacktes localhost: neutrale Hinweisseite bzw. direkte Pfade (Dev-Komfort)
  if (host === 'localhost' || host === '127.0.0.1') {
    const response = NextResponse.next();
    await refreshSession(request, response);
    return response;
  }

  // Produktion: Projekt-Lookup über die Domain
  const projectId = await lookupProjectId('domain', host);
  if (projectId) return rewriteWithSession(request, `/p/${projectId}`, projectId);

  // Unbekannte Domain → neutrale Hinweisseite
  return rewriteTo(request, '/tenant-not-found');
}

export const config = {
  // Statische Assets und Next-Interna auslassen
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.[\\w]+$).*)'],
};
