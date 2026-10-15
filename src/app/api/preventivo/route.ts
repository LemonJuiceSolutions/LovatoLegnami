import { handleSubmitPost } from "@/server/routes/submit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Salvataggio, PDF e invio delle email nella stessa richiesta.
export const maxDuration = 30;

export function POST(req: Request) {
  return handleSubmitPost(req);
}
