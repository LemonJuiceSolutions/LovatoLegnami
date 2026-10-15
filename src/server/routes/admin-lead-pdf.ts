import { withUser } from "@/server/auth";
import { errorResponse, internalError } from "@/server/http";
import { leadPdf } from "@/server/quotes/lead-pdf";

/** `GET /api/admin/richieste/[id]/pdf` (9.9): PDF della richiesta per l'ufficio (`richieste:leggi`). */
export const handleAdminLeadPdf = withUser("richieste:leggi", async (_user, id: string) => {
  try {
    if (!/^[A-Za-z0-9-]{1,100}$/.test(id)) return errorResponse(404, "richiesta non trovata");
    const out = await leadPdf(id);
    if (!out) return errorResponse(404, "richiesta non trovata");
    return new Response(Buffer.from(out.pdf), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="preventivo-${out.code}.pdf"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    return internalError(e, "admin-pdf");
  }
});
