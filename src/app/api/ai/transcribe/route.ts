import { NextRequest, NextResponse } from "next/server"
import { denyUnlessAllowed } from "@/server/auth"

// POST /api/ai/transcribe
// Body: multipart/form-data with "audio" (Blob) and optional "groqApiKey" (string)
// Forwards the audio to Groq's Whisper endpoint and returns the transcript.
export async function POST(req: NextRequest) {
  // Area interna: utente attivo riletto dal database (il middleware reindirizza soltanto).
  const denied = await denyUnlessAllowed("configuratore:usa")
  if (denied) return denied

  try {
    const form = await req.formData()
    const audio = form.get("audio")
    const apiKey = (form.get("groqApiKey") as string | null) || process.env.GROQ_API_KEY

    if (!audio || !(audio instanceof Blob)) {
      return NextResponse.json(
        { error: "Campo 'audio' mancante o non valido" },
        { status: 400 },
      )
    }

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Groq API key non configurata. Aprila in /ai → Trascrizione vocale (Groq Whisper).",
        },
        { status: 400 },
      )
    }

    const language = (form.get("language") as string | null) || "it"

    // Build the Groq request. Groq exposes an OpenAI-compatible endpoint.
    const upstreamForm = new FormData()
    upstreamForm.append("file", audio, (audio as any).name || "audio.webm")
    upstreamForm.append("model", "whisper-large-v3-turbo")
    upstreamForm.append("language", language)
    upstreamForm.append("response_format", "json")

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstreamForm,
    })

    if (!res.ok) {
      const bodyText = await res.text()
      return NextResponse.json(
        { error: `Groq ${res.status}: ${bodyText.slice(0, 300)}` },
        { status: res.status },
      )
    }

    const data = (await res.json()) as { text?: string }
    return NextResponse.json({ text: data.text || "" })
  } catch (e: any) {
    console.error("transcribe error:", e)
    return NextResponse.json(
      { error: e?.message || "Errore trascrizione" },
      { status: 500 },
    )
  }
}
