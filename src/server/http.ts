/**
 * Utilità HTTP delle API pubbliche: risposte JSON `no-store` con messaggi in italiano e
 * **mai** dettagli interni (stack, SQL, percorsi), IP del client per il rate limit.
 */

export interface FieldIssue {
  readonly path: string;
  readonly message: string;
}

const NO_STORE = { "cache-control": "no-store", "x-content-type-options": "nosniff" } as const;

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

export function errorResponse(status: number, error: string, extra: { issues?: readonly FieldIssue[]; headers?: Record<string, string> } = {}): Response {
  return jsonResponse({ error, ...(extra.issues ? { issues: extra.issues } : {}) }, status, extra.headers);
}

/**
 * Errore inatteso: registrato sul server (senza dati della richiesta), al client solo un
 * messaggio generico. Nessuno stack o messaggio interno esce dall'API.
 */
export function internalError(e: unknown, where: string): Response {
  console.error(`[api] ${where}: errore inatteso`, e instanceof Error ? `${e.name}: ${e.message}` : e);
  return errorResponse(500, "si è verificato un errore: riprova tra qualche minuto");
}

/**
 * IP del client per il rate limit (best effort): su Vercel `x-forwarded-for` è impostato dal
 * proxy della piattaforma (il primo valore è il client); altrove `x-real-ip`, poi una chiave
 * comune. Non è un dato di autenticazione.
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || req.headers.get("x-real-ip")?.trim() || "sconosciuto";
  return ip.slice(0, 64);
}

export class BodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super("richiesta troppo grande");
    this.name = "BodyTooLargeError";
  }
}

/**
 * Legge il corpo come testo fermandosi a `maxBytes` (controlla `content-length` e poi i
 * byte effettivamente letti: l'intestazione può mancare o mentire). Lancia `BodyTooLargeError`.
 */
export async function readBodyLimited(req: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLargeError(maxBytes);
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLargeError(maxBytes);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** Issue zod → `{ path, message }` con percorsi `a.b[0].c`. */
export function zodIssues(issues: readonly { path: readonly (string | number)[]; message: string }[], prefix = ""): FieldIssue[] {
  return issues.map((i) => {
    const path = i.path.reduce<string>((acc, p) => (typeof p === "number" ? `${acc}[${p}]` : acc ? `${acc}.${p}` : p), prefix);
    return { path: path || "(radice)", message: i.message };
  });
}
