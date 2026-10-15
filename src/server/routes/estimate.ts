import { BodyTooLargeError, clientIp, errorResponse, internalError, jsonResponse, readBodyLimited, zodIssues } from "@/server/http";
import { EstimateRequestSchema, MAX_ESTIMATE_BODY_BYTES } from "@/server/public-dto";
import { CatalogUnavailableError, getPublicCatalog } from "@/server/quotes/catalog";
import { computeEstimate, EstimateInputError } from "@/server/quotes/estimate";
import { checkRateLimit, RATE_LIMIT_MESSAGE } from "@/server/rate-limit";

/**
 * `POST /api/preventivo/stima` e `GET /api/preventivo/regole` (P9). Nessun dato interno
 * in uscita: la risposta è `EstimateResponseSchema` (vista cliente + note), gli errori
 * sono messaggi in italiano con il percorso del campo, mai stack o dettagli del server.
 */

export async function handleEstimatePost(req: Request): Promise<Response> {
  try {
    const limit = checkRateLimit("estimate", clientIp(req));
    if (!limit.allowed) return errorResponse(429, RATE_LIMIT_MESSAGE, { headers: { "retry-after": String(limit.retryAfterSec) } });
    if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return errorResponse(415, "formato non supportato: inviare JSON");

    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await readBodyLimited(req, MAX_ESTIMATE_BODY_BYTES)));
    } catch (e) {
      if (e instanceof BodyTooLargeError) return errorResponse(413, "richiesta troppo grande");
      return errorResponse(400, "JSON non valido");
    }
    const parsed = EstimateRequestSchema.safeParse(body);
    if (!parsed.success) return errorResponse(400, "richiesta non valida", { issues: zodIssues(parsed.error.issues) });

    const catalog = await getPublicCatalog();
    try {
      return jsonResponse(computeEstimate(parsed.data, catalog).response);
    } catch (e) {
      if (e instanceof EstimateInputError)
        return errorResponse(e.status, e.status === 422 ? "configurazione non realizzabile" : "configurazione non valida", { issues: e.issues });
      throw e;
    }
  } catch (e) {
    if (e instanceof CatalogUnavailableError) return errorResponse(503, "il preventivo online non è disponibile al momento: contattaci");
    return internalError(e, "stima");
  }
}

/** Regole costruttive attive per il wizard (non sensibili: limiti di luci e sezioni). */
export async function handleRulesGet(): Promise<Response> {
  try {
    const catalog = await getPublicCatalog();
    return jsonResponse({ version: catalog.ruleSetVersion, ruleSet: catalog.ruleSet }, 200, { "cache-control": "public, max-age=60" });
  } catch (e) {
    if (e instanceof CatalogUnavailableError) return errorResponse(503, "regole non disponibili al momento");
    return internalError(e, "regole");
  }
}
