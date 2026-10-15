import { clientIp, errorResponse, internalError } from "@/server/http";
import { leadPdf } from "@/server/quotes/lead-pdf";
import { checkRateLimit, RATE_LIMIT_MESSAGE } from "@/server/rate-limit";
import { tokenState } from "@/server/repositories/tokens";

/**
 * `GET /api/preventivo/[token]/pdf`: PDF del preventivo per il cliente. Token sconosciuto
 * ⇒ 404, scaduto ⇒ 410 con l'invito a contattare l'ufficio; il token dà accesso solo alla
 * propria richiesta. Rate limit come la stima (generare un PDF costa CPU).
 */
export async function handleCustomerPdfGet(req: Request, token: string): Promise<Response> {
  try {
    const limit = checkRateLimit("pdf", clientIp(req));
    if (!limit.allowed) return errorResponse(429, RATE_LIMIT_MESSAGE, { headers: { "retry-after": String(limit.retryAfterSec) } });
    const state = await tokenState(token);
    if (state.state === "scaduto") return errorResponse(410, "Il collegamento è scaduto: contatta l'ufficio per ricevere di nuovo il preventivo.");
    if (state.state !== "valido") return errorResponse(404, "preventivo non trovato");
    const result = await leadPdf(state.leadId);
    if (!result) return errorResponse(404, "preventivo non trovato");
    return new Response(Buffer.from(result.pdf), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-length": String(result.pdf.byteLength),
        "content-disposition": `attachment; filename="preventivo-${result.code}.pdf"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
      },
    });
  } catch (e) {
    return internalError(e, "pdf cliente");
  }
}
