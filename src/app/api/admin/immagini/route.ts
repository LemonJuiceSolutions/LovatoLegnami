import { handleSiteImageUpload } from "@/server/routes/site-image-upload"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function POST(req: Request) {
  return handleSiteImageUpload(req)
}
