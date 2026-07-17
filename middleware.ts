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

/** Sticky-Tenant-Cookie für den Query-Modus (?tenant= auf vercel.app/localhost). */
const TENANT_COOKIE = 'tenant-slug';
const TENANT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export async function middleware(request: NextRequest) {
  const adminDomain = (process.env.ADMIN_DOMAIN ?? 'admin.projektplattform.ch').toLowerCase();
  const rawHost = request.headers.get('host') ?? '';
  const host = rawHost.replace(/^www\./, '').split(':')[0].toLowerCase();

  // Adminbereich über eigene Domain (lokal: admin.localhost:3000)
  if (host === adminDomain || host === 'admin.localhost') {
    return rewriteWithSession(request, '/admin');
  }

  const tenantParam = request.nextUrl.searchParams.get('tenant');
  const tenantCookie = request.cookies.get(TENANT_COOKIE)?.value ?? null;
  const isNakedLocalhost = host === 'localhost' || host === '127.0.0.1';

  let projectId: string | null = null;
  let cookieSlugToSet: string | null = null;
  let cookieIsStale = false;

  // Priorität 1: echte Domain (gewinnt immer – keine Verwechslung in Produktion)
  if (host.endsWith('.localhost')) {
    projectId = await lookupProjectId('slug', host.slice(0, -'.localhost'.length));
  } else if (!isNakedLocalhost) {
    projectId = await lookupProjectId('domain', host);
  }

  // Priorität 2: ?tenant=slug (Query-Modus, z.B. vercel.app-Test) → Cookie setzen
  if (!projectId && tenantParam) {
    projectId = await lookupProjectId('slug', tenantParam);
    if (projectId && tenantParam !== tenantCookie) {
      cookieSlugToSet = tenantParam;
    }
  }

  // Priorität 3: Sticky-Cookie (interne Navigation ohne Query-Parameter)
  if (!projectId && !tenantParam && tenantCookie) {
    projectId = await lookupProjectId('slug', tenantCookie);
    if (!projectId) cookieIsStale = true;
  }

  if (projectId) {
    const response = await rewriteWithSession(request, `/p/${projectId}`, projectId);
    if (cookieSlugToSet) {
      response.cookies.set(TENANT_COOKIE, cookieSlugToSet, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: TENANT_COOKIE_MAX_AGE_SECONDS,
      });
    }
    return response;
  }

  // Kein Tenant auflösbar: nacktes localhost → neutrale Hinweisseite bzw.
  // direkte Pfade (Dev-Komfort); sonst neutrale Hinweisseite.
  const response = isNakedLocalhost
    ? NextResponse.next()
    : rewriteTo(request, '/tenant-not-found');
  if (isNakedLocalhost) await refreshSession(request, response);
  if (cookieIsStale) response.cookies.delete(TENANT_COOKIE);
  return response;
}

export const config = {
  // Statische Assets und Next-Interna auslassen
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.[\\w]+$).*)'],
};
