import { handleSiteImageGet } from "@/server/routes/site-images"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function GET(_req: Request, { params }: { params: { id: string } }) {
  return handleSiteImageGet(params.id)
}
