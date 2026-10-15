import { withUser } from "@/server/auth";
import { internalError, jsonResponse } from "@/server/http";
import { getActive, type DatasetVersion } from "@/server/repositories/datasets";
import type { ActiveDatasetDto, ActiveDatasetsResponse } from "@/stores/catalog";

/**
 * `GET /api/admin/dataset/attivi` (10.1): listino e regole costruttive della versione
 * attiva oggi, per il configuratore interno. Richiede `configuratore:usa` (il listino
 * completo, margini compresi, è un dato interno: mai esposto dalle API pubbliche).
 * Un dataset senza versione attiva è `null`: il client ricade sui dati di default.
 */

const dto = (v: DatasetVersion | null): ActiveDatasetDto | null => (v ? { id: v.id, version: v.version, effectiveFrom: v.effectiveFrom, data: v.data } : null);

export async function activeDatasets(date: Date | string = new Date()): Promise<ActiveDatasetsResponse> {
  const [listino, regole] = await Promise.all([getActive("listino", date), getActive("regole", date)]);
  return { listino: dto(listino), regole: dto(regole) };
}

export const handleActiveDatasetsGet = withUser("configuratore:usa", async () => {
  try {
    return jsonResponse(await activeDatasets());
  } catch (e) {
    return internalError(e, "dataset attivi");
  }
});
