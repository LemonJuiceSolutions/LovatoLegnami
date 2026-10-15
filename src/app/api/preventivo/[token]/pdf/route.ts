import { handleCustomerPdfGet } from "@/server/routes/customer-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export function GET(req: Request, { params }: { params: { token: string } }) {
  return handleCustomerPdfGet(req, params.token);
}
