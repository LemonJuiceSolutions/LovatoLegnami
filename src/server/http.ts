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
