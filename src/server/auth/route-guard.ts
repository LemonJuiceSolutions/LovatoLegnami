import { NextResponse, type NextRequest } from "next/server";

/**
 * Decisione del middleware (edge, P6), separata per i test: le pagine interne senza
 * sessione vanno all'accesso con la destinazione in `next`, le API interne rispondono
 * 401 senza dati; tutto il resto passa. Il controllo dei permessi e dello stato
 * dell'utente non è qui ma in `requireUser` (server).
 */

/** Aree interne (pagine). Il `matcher` di `src/middleware.ts` elenca gli stessi prefissi. */
export const PROTECTED_PAGE_PREFIXES = ["/dashboard", "/configuratore", "/ai", "/admin"] as const;
/** API interne. */
export const PROTECTED_API_PREFIXES = ["/api/admin", "/api/ai"] as const;

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

export const isProtectedPage = (pathname: string) => PROTECTED_PAGE_PREFIXES.some((p) => under(pathname, p));
export const isProtectedApi = (pathname: string) => PROTECTED_API_PREFIXES.some((p) => under(pathname, p));

/**
 * Destinazione dopo l'accesso: solo percorsi interni relativi (`/…`, non `//…` né
 * `/\…`), altrimenti `/dashboard`. Evita redirect aperti verso altri siti.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  try {
    const u = new URL(next, "http://interno.invalid");
    if (u.origin !== "http://interno.invalid") return fallback;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return fallback;
  }
}

export const signInUrl = (nextPath: string): string => `/accesso?${new URLSearchParams({ next: safeNextPath(nextPath) })}`;

export function guard(req: NextRequest, isLoggedIn: boolean): NextResponse {
  const { pathname, search } = req.nextUrl;
  if (isLoggedIn) return NextResponse.next();
  if (isProtectedApi(pathname))
    return NextResponse.json({ error: "accesso richiesto" }, { status: 401, headers: { "cache-control": "no-store" } });
  if (isProtectedPage(pathname)) return NextResponse.redirect(new URL(signInUrl(`${pathname}${search}`), req.nextUrl.origin));
  return NextResponse.next();
}
