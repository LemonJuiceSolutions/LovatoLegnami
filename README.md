# Base

Base app Next.js 14 + Tailwind + shadcn/ui. Tema, componenti UI e setup AI ereditati da ESPEIRIA (VRE).

## Avvio

```bash
npm install
npm run dev
```

Apri http://localhost:3000 → `/dashboard`.

## AI

- Impostazioni in `/ai`: provider (Anthropic, OpenAI, OpenRouter, Ollama, Claude CLI), modello, API key, Groq per la voce.
  Salvate nel `localStorage` del browser (`base-ai-settings`).
- Assistente flottante (pulsante in basso a destra) in ogni pagina: `src/components/ai/ai-assistant.tsx`.
- Chat SSE: `src/app/api/ai/chat/route.ts` → provider in `src/lib/llm-providers.ts`.
- System prompt: `src/lib/ai-prompts.ts`.
- Variabili opzionali: vedi `.env.example`.
