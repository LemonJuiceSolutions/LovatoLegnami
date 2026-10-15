import { handleActiveDatasetsGet } from "@/server/routes/active-datasets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return handleActiveDatasetsGet();
}
