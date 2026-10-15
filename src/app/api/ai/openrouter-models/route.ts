import { NextResponse } from 'next/server'
import { denyUnlessAllowed } from "@/server/auth"

export const dynamic = 'force-dynamic'

let cachedModels: any[] | null = null
let cacheTime = 0
const CACHE_TTL = 1000 * 60 * 30 // 30 minutes

export async function GET() {
  // Area interna: utente attivo riletto dal database (il middleware reindirizza soltanto).
  const denied = await denyUnlessAllowed("configuratore:usa")
  if (denied) return denied

  // Return cached if fresh
  if (cachedModels && Date.now() - cacheTime < CACHE_TTL) {
    return NextResponse.json({ data: cachedModels })
  }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'Accept': 'application/json' },
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `Open Router API returned ${res.status}` },
        { status: res.status }
      )
    }

    const data = await res.json()
    cachedModels = data.data || []
    cacheTime = Date.now()

    return NextResponse.json({ data: cachedModels })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Fetch failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
