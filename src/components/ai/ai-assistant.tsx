"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { Bot, Loader2, Mic, MicOff, RotateCcw, Send, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { AiMessage } from "@/lib/ai-types"

const SETTINGS_KEY = "ceriana-ai-settings"
const HISTORY_KEY = "ceriana-ai-history"

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function getAiSettings(): { provider: string; model: string; apiKey: string; groqApiKey: string } {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        provider: parsed.provider || "ollama",
        model: parsed.model || "qwen3:32b",
        apiKey: parsed.apiKey || "",
        groqApiKey: parsed.groqApiKey || "",
      }
    }
  } catch { /* ignore */ }
  return { provider: "ollama", model: "qwen3:32b", apiKey: "", groqApiKey: "" }
}

export function AiAssistant() {
  const pathname = usePathname()
  const [open, setOpen] = React.useState(false)
  const [messages, setMessages] = React.useState<AiMessage[]>([])
  const [input, setInput] = React.useState("")
  const [isStreaming, setIsStreaming] = React.useState(false)
  const [sessionId, setSessionId] = React.useState<string | null>(null)
  const [aiSettings, setAiSettings] = React.useState(() =>
    typeof window === "undefined"
      ? { provider: "ollama", model: "qwen3:32b", apiKey: "", groqApiKey: "" }
      : getAiSettings()
  )
  const [isListening, setIsListening] = React.useState(false)
  const recorderRef = React.useRef<MediaRecorder | null>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Restore history
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY)
      if (raw) setMessages(JSON.parse(raw))
    } catch { /* ignore */ }
  }, [])

  // Persist history
  React.useEffect(() => {
    if (isStreaming) return
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-50)))
    } catch { /* ignore */ }
  }, [messages, isStreaming])

  // Pick up settings saved from /ai
  React.useEffect(() => {
    const handler = () => setAiSettings(getAiSettings())
    window.addEventListener("ceriana-ai-settings-changed", handler)
    return () => window.removeEventListener("ceriana-ai-settings-changed", handler)
  }, [])

  // Tell layout to make room for the panel
  React.useEffect(() => {
    window.dispatchEvent(new CustomEvent("ceriana-ai-panel-toggle", { detail: { open } }))
  }, [open])

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  const handleSend = async () => {
    const prompt = input.trim()
    if (!prompt || isStreaming) return

    const history = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))

    const assistantId = generateId()
    setMessages((prev) => [
      ...prev,
      { id: generateId(), role: "user", content: prompt, timestamp: Date.now() },
      { id: assistantId, role: "assistant", content: "", timestamp: Date.now() },
    ])
    setInput("")
    setIsStreaming(true)

    const appendToAssistant = (text: string, replace = false) =>
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: replace ? text : m.content + text } : m))
      )

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          provider: aiSettings.provider,
          model: aiSettings.model,
          apiKey: (aiSettings.provider !== "claude-cli" && aiSettings.provider !== "ollama") ? aiSettings.apiKey : undefined,
          context: `Pagina corrente: ${pathname}`,
          sessionId,
          history,
        }),
      })

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let sseBuffer = ""

      while (reader) {
        const { done, value } = await reader.read()
        if (done) break

        sseBuffer += decoder.decode(value, { stream: true })
        const events = sseBuffer.split("\n\n")
        sseBuffer = events.pop() || ""

        for (const eventStr of events) {
          if (!eventStr.trim()) continue
          let eventType = ""
          let eventData = ""
          for (const line of eventStr.split("\n")) {
            if (line.startsWith("event: ")) eventType = line.slice(7)
            if (line.startsWith("data: ")) eventData = line.slice(6)
          }
          if (!eventType || !eventData) continue
          try {
            const data = JSON.parse(eventData)
            if (eventType === "text_delta") {
              appendToAssistant(data.text || "")
            } else if (eventType === "text") {
              appendToAssistant(data.text || "", true)
            } else if (eventType === "init" || eventType === "result") {
              if (data.sessionId) setSessionId(data.sessionId)
            } else if (eventType === "error") {
              appendToAssistant(`\n❌ ${data.message}`)
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      appendToAssistant(`❌ ${err instanceof Error ? err.message : "Errore sconosciuto"}`)
    } finally {
      setIsStreaming(false)
      inputRef.current?.focus()
    }
  }

  // ── Voice input (Groq Whisper via /api/ai/transcribe) ──

  const toggleListening = async () => {
    if (isListening) {
      recorderRef.current?.stop()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => chunks.push(e.data)
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setIsListening(false)
        const form = new FormData()
        form.append("audio", new Blob(chunks, { type: recorder.mimeType }), "audio.webm")
        if (aiSettings.groqApiKey) form.append("groqApiKey", aiSettings.groqApiKey)
        const res = await fetch("/api/ai/transcribe", { method: "POST", body: form })
        const data = await res.json()
        if (data.text) setInput((prev) => (prev ? prev + " " : "") + data.text)
        else if (data.error) setMessages((prev) => [...prev, { id: generateId(), role: "system", content: `❌ ${data.error}`, timestamp: Date.now() }])
      }
      recorderRef.current = recorder
      recorder.start()
      setIsListening(true)
    } catch {
      setMessages((prev) => [...prev, { id: generateId(), role: "system", content: "❌ Microfono non disponibile", timestamp: Date.now() }])
    }
  }

  const handleReset = () => {
    setMessages([])
    setSessionId(null)
  }

  // ── Floating button (when closed) ─────────────

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full bg-gradient-to-br from-violet-600 to-indigo-700 text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center"
        title="Apri Assistente AI"
      >
        <Sparkles className="h-5 w-5" />
      </button>
    )
  }

  // ── Panel (when open) ─────────────────────────

  return (
    <div className="fixed right-0 top-0 bottom-0 z-50 w-[400px] max-w-full bg-white border-l shadow-2xl flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-violet-600 to-indigo-700 text-white shrink-0">
        <Bot className="h-5 w-5" />
        <span className="font-semibold text-sm flex-1">AI Assistant</span>
        <button onClick={handleReset} className="hover:bg-white/20 rounded p-1" title="Nuova conversazione">
          <RotateCcw className="h-4 w-4" />
        </button>
        <button onClick={() => setOpen(false)} className="hover:bg-white/20 rounded p-1" title="Chiudi">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Context badge */}
      <div className="px-4 py-1.5 bg-violet-50 border-b text-[10px] text-violet-700 flex items-center gap-2 shrink-0">
        <Sparkles className="h-3 w-3 shrink-0" />
        <span className="truncate flex-1">{aiSettings.provider}</span>
        <span className="shrink-0 px-1.5 py-0.5 rounded bg-violet-200/60 text-violet-800 font-mono text-[9px]">
          {aiSettings.model.replace("claude-", "").replace(/-\d{8}$/, "").replace("gpt-", "")}
        </span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-xs space-y-2">
            <Bot className="h-10 w-10 mx-auto text-violet-300" />
            <p className="font-medium">Ciao! Sono il tuo assistente AI.</p>
            <p>Chiedimi qualsiasi cosa.</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id}>
            {msg.role === "user" && (
              <div className="flex justify-end">
                <div className="bg-violet-600 text-white rounded-xl rounded-br-sm px-3 py-2 text-xs max-w-[85%] break-words">
                  <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                </div>
              </div>
            )}

            {msg.role === "assistant" && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-xl rounded-bl-sm px-3 py-2 text-xs max-w-[90%] break-words">
                  <div className="whitespace-pre-wrap">{msg.content || (isStreaming ? "..." : "")}</div>
                  {isStreaming && messages[messages.length - 1]?.id === msg.id && (
                    <span className="inline-block w-1.5 h-3 bg-violet-500 ml-0.5 animate-pulse rounded-sm" />
                  )}
                </div>
              </div>
            )}

            {msg.role === "system" && (
              <div className="flex justify-center">
                <div className="rounded-lg px-3 py-1.5 text-[10px] max-w-full break-words whitespace-pre-wrap bg-red-50 text-red-700">
                  {msg.content}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t p-3 bg-gray-50">
        <div className="flex gap-1.5">
          <button
            onClick={toggleListening}
            disabled={isStreaming}
            className={`h-9 w-9 shrink-0 flex items-center justify-center rounded-md border transition-colors disabled:opacity-50 ${
              isListening
                ? "bg-red-500 border-red-500 text-white animate-pulse"
                : "bg-white hover:bg-gray-100 text-muted-foreground hover:text-violet-600"
            }`}
            title={isListening ? "Ferma registrazione" : "Dettatura vocale"}
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>

          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder={isListening ? "Parla ora..." : "Chiedi qualcosa..."}
            className="text-xs h-9 flex-1"
            disabled={isStreaming}
          />
          <Button
            size="sm"
            className="h-9 px-3 bg-violet-600 hover:bg-violet-700"
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
          >
            {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
