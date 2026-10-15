import { handleEstimatePost } from "@/server/routes/estimate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return handleEstimatePost(req);
}
