import { handleUploadGet } from "@/server/routes/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request, { params }: { params: { id: string } }) {
  return handleUploadGet(req, params.id);
}
