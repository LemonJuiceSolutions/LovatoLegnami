import { NextRequest } from "next/server";

/**
 * Origine pubblica della richiesta per le route di Auth.js dietro un proxy (Caddy, P12).
 *
 * Con `output: "standalone"` Next 14 costruisce `req.url` dall'indirizzo di ascolto
 * (`HOSTNAME`/`PORT`, es. `http://0.0.0.0:3000`), non dall'host richiesto: Auth.js
 * userebbe quell'origine per i collegamenti, la `callbackUrl` e i redirect. Se l'host è
 * fidato (`AUTH_TRUST_HOST`) e non c'è un `AUTH_URL` fisso, l'URL si ricostruisce da
 * `X-Forwarded-Host`/`Host` e `X-Forwarded-Proto` (impostati da Caddy): così l'accesso
 * funziona su tutti gli host serviti dallo stesso container. Altrimenti la richiesta resta
 * com'è (su Vercel `req.url` è già quello pubblico).
 */

const HOST_RE = /^[A-Za-z0-9.-]+(:\d{1,5})?$/;
const first = (v: string | null): string | undefined => v?.split(",")[0]?.trim() || undefined;
const isTrue = (v: string | undefined) => v === "true" || v === "1";

export function withForwardedOrigin(req: NextRequest, env: Readonly<Record<string, string | undefined>> = process.env): NextRequest {
  if (!isTrue(env.AUTH_TRUST_HOST?.trim()) || env.AUTH_URL?.trim() || env.NEXTAUTH_URL?.trim()) return req;
  const host = first(req.headers.get("x-forwarded-host")) ?? first(req.headers.get("host"));
  if (!host || !HOST_RE.test(host)) return req;
  const forwardedProto = first(req.headers.get("x-forwarded-proto"));
  const proto = forwardedProto === "https" || forwardedProto === "http" ? forwardedProto : req.nextUrl.protocol.replace(/:$/, "");
  const origin = `${proto}://${host}`;
  if (origin === req.nextUrl.origin) return req;
  const { href, origin: current } = req.nextUrl;
  return new NextRequest(origin + href.slice(current.length), req);
}
