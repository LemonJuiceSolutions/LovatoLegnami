import { handleAdminLeadPdf } from "@/server/routes/admin-lead-pdf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

export function GET(_req: Request, { params }: { params: { id: string } }) {
  return handleAdminLeadPdf(params.id)
}
