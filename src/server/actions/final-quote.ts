"use server";

import { requireUser } from "@/server/auth";
import { saveFinalQuote as save, type FinalQuoteInput, type FinalQuoteResult } from "@/server/quotes/final-quote";
import { runAction, type ActionResult } from "./result";

/**
 * "Salva preventivo definitivo" dal configuratore (10.4): richiede `richieste:gestisci`
 * (admin e commerciale), verificato sul server prima di ogni lettura.
 */
export async function saveFinalQuote(input: FinalQuoteInput): Promise<ActionResult<FinalQuoteResult>> {
  return runAction(async () => {
    const user = await requireUser("richieste:gestisci");
    return save(input, user.id);
  });
}
