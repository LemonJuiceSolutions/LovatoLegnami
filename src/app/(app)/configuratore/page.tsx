import { can, requirePageUser } from "@/server/auth"
import { openRequest } from "@/server/quotes/open-request"
import type { ConfiguratoreRequest } from "@/components/configuratore/configuratore"
import { ConfiguratoreClient } from "./configuratore-client"

// `?richiesta=<id>` legge la richiesta dal database a ogni apertura.
export const dynamic = "force-dynamic"

/**
 * `/configuratore` (spec `configuratore-ui`): senza parametri il comportamento di sempre;
 * con `?richiesta=<id>` (10.4) la richiesta è letta sul server (permesso `richieste:leggi`)
 * e passata al client con intestazione e configurazione da caricare nello store.
 */
export default async function ConfiguratorePage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const id = typeof searchParams.richiesta === "string" ? searchParams.richiesta.trim() : ""
  if (!id) return <ConfiguratoreClient />

  const user = await requirePageUser("richieste:leggi", `/configuratore?richiesta=${encodeURIComponent(id)}`)
  const result = await openRequest(id)
  const request: ConfiguratoreRequest = result.ok
    ? { kind: "ok", request: result.request }
    : { kind: "missing", message: result.message }
  return <ConfiguratoreClient request={request} canSaveFinal={can(user, "richieste:gestisci")} />
}
