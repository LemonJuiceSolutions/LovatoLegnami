import { handleRulesGet } from "@/server/routes/estimate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return handleRulesGet();
}
