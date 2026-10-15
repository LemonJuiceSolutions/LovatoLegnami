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

const INTERNAL_BASE = "http://interno.invalid";
/** Barre rovesciate e caratteri di controllo: i browser li normalizzano in modi diversi. */
const UNSAFE_CHARS = /[\u0000-\u001f\u007f\\]/;

/** Percorso assoluto dello stesso sito: inizia con una sola `/` (non `//host`, né `/\host`). */
const isRootRelative = (p: string) => p.startsWith("/") && !p.startsWith("//") && !UNSAFE_CHARS.test(p);

/**
 * Percorso relativo dello stesso sito in forma **normalizzata**, o `null` se non è
 * sicuro. I controlli valgono sull'ingresso, sulla sua decodifica (`%2F%2F`, `%5C`) e
 * sull'uscita di `URL`: `/.//evil.example` o `/..//evil.example` diventano
 * `//evil.example`, che un browser legge come URL di un altro sito.
 */
export function sameSitePath(input: string | null | undefined): string | null {
  if (typeof input !== "string" || input.length === 0 || input.length > 2048) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(input);
  } catch {
    return null;
  }
  if (!isRootRelative(input) || !isRootRelative(decoded)) return null;
  let u: URL;
  try {
    u = new URL(input, INTERNAL_BASE);
  } catch {
    return null;
  }
  if (u.origin !== INTERNAL_BASE) return null;
  const out = `${u.pathname}${u.search}${u.hash}`;
  let outDecoded: string;
  try {
    outDecoded = decodeURIComponent(u.pathname);
  } catch {
    return null;
  }
  return isRootRelative(out) && isRootRelative(outDecoded) ? out : null;
}

/**
 * Destinazione dopo l'accesso: percorso dello stesso sito (`sameSitePath`) e dentro
 * un'area interna (`PROTECTED_PAGE_PREFIXES`), altrimenti `fallback`. Evita i redirect
 * aperti e le destinazioni arbitrarie.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  const path = sameSitePath(next);
  if (!path) return fallback;
  const pathname = path.replace(/[?#].*$/, "");
  return isProtectedPage(pathname) ? path : fallback;
}

/**
 * Callback `redirect` di Auth.js: URL assoluti solo della stessa origine, relativi solo
 * se `sameSitePath` li accetta; altrimenti la base del sito. Copre anche le pagine di
 * Auth.js (`/api/auth/verify-request`, `/accesso?error=…`), quindi senza elenco di aree.
 */
export function safeAuthRedirect(url: string, baseUrl: string): string {
  if (url.startsWith("/")) {
    const path = sameSitePath(url);
    return path ? `${baseUrl}${path}` : baseUrl;
  }
  try {
    const target = new URL(url);
    if (target.origin !== new URL(baseUrl).origin) return baseUrl;
    const path = sameSitePath(`${target.pathname}${target.search}${target.hash}`);
    return path ? `${target.origin}${path}` : baseUrl;
  } catch {
    return baseUrl;
  }
}

export const signInUrl = (nextPath: string): string => `/accesso?${new URLSearchParams({ next: safeNextPath(nextPath) })}`;

/** Intestazione con il percorso richiesto, per i layout server (destinazione `next` se l'utente va riautenticato). */
export const PATH_HEADER = "x-lovato-path";

export function guard(req: NextRequest, isLoggedIn: boolean): NextResponse {
  const { pathname, search } = req.nextUrl;
  if (isLoggedIn) {
    const headers = new Headers(req.headers);
    headers.set(PATH_HEADER, `${pathname}${search}`);
    return NextResponse.next({ request: { headers } });
  }
  if (isProtectedApi(pathname))
    return NextResponse.json({ error: "accesso richiesto" }, { status: 401, headers: { "cache-control": "no-store" } });
  if (isProtectedPage(pathname)) return NextResponse.redirect(new URL(signInUrl(`${pathname}${search}`), req.nextUrl.origin));
  return NextResponse.next();
}
