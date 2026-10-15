import { ZodError } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/server/auth";
import { RepositoryError } from "@/server/repositories/errors";

/**
 * Esito delle server action (P10): mai eccezioni verso il client (in produzione Next
 * le sostituirebbe con un messaggio generico), ma uno stato HTTP e un messaggio in
 * italiano. Gli errori inattesi sono rilanciati (log del server, errore generico).
 */
export type ActionResult<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly status: 400 | 401 | 403 | 404 | 409; readonly message: string };

const REPO_STATUS = { "non-valido": 400, "non-trovato": 404, conflitto: 409, modificato: 409 } as const;

export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof UnauthorizedError) return { ok: false, status: 401, message: e.message };
    if (e instanceof ForbiddenError) return { ok: false, status: 403, message: e.message };
    if (e instanceof RepositoryError) return { ok: false, status: REPO_STATUS[e.code], message: e.message };
    if (e instanceof ZodError) return { ok: false, status: 400, message: e.issues.map((i) => `${i.path.join(".") || "valore"}: ${i.message}`).join("; ") };
    throw e;
  }
}
