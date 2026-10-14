"use client"

import * as React from "react"
import {
  Bot, CheckCircle, XCircle, Loader2, Sparkles, Cpu, Terminal,
  RefreshCw, Settings2, Zap, MessageSquare, TestTube, Save, Key, Eye, EyeOff,
  Search, ArrowUpDown, Filter, DollarSign, Hash, Wrench,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// ── Types ──────────────────────────────────────
interface CliStatus {
  connected: boolean
  version?: string
  path?: string
  error?: string
}

interface AiModel {
  id: string
  label: string
  description: string
  tier: "fast" | "balanced" | "powerful"
}

interface OpenRouterModel {
  id: string
  name: string
  description: string
  context_length: number
  pricing: {
    prompt: string
    completion: string
  }
  supported_parameters: string[]
  architecture: {
    modality: string
    input_modalities: string[]
    output_modalities: string[]
  }
}

type ORSortKey = "name" | "price_asc" | "price_desc" | "context" | "newest"
type ORFilterProvider = "all" | string

interface AiSettings {
  provider: "anthropic" | "openai" | "claude-cli" | "openrouter" | "ollama"
  model: string
  apiKey: string
  groqApiKey?: string
}

const PROVIDERS = [
  { id: "anthropic", label: "Anthropic API", description: "Claude models via API diretta" },
  { id: "openai", label: "OpenAI API", description: "GPT models via API" },
  { id: "openrouter", label: "Open Router API", description: "100+ modelli via API unificata" },
  { id: "ollama", label: "Ollama (Local)", description: "Modelli locali, offline, senza API key" },
  { id: "claude-cli", label: "Claude CLI", description: "Claude Code CLI locale (legacy)" },
] as const

const MODELS_BY_PROVIDER: Record<string, AiModel[]> = {
  anthropic: [
    { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", description: "Bilanciato, veloce e intelligente", tier: "balanced" },
    { id: "claude-opus-5-5", label: "Claude Opus 5.5", description: "Massima potenza, ragionamento avanzato", tier: "powerful" },
    { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", description: "Velocissimo, task semplici", tier: "fast" },
  ],
  openai: [
    { id: "gpt-4o", label: "GPT-4o", description: "Multimodale, veloce", tier: "balanced" },
    { id: "gpt-4o-mini", label: "GPT-4o Mini", description: "Economico e veloce", tier: "fast" },
    { id: "gpt-4-turbo", label: "GPT-4 Turbo", description: "Potente, context ampio", tier: "powerful" },
  ],
  ollama: [
    { id: "qwen3:8b", label: "Qwen 3 8B", description: "Veloce, 5GB, buon compromesso", tier: "fast" },
    { id: "qwen3:14b", label: "Qwen 3 14B", description: "Bilanciato, 9GB", tier: "balanced" },
    { id: "qwen3:32b", label: "Qwen 3 32B", description: "Potente, 20GB", tier: "powerful" },
    { id: "gemma4:31b", label: "Gemma 4 31B", description: "Google, 20GB, potente ma lento", tier: "powerful" },
    { id: "gemma:latest", label: "Gemma 2B", description: "Leggero, 5GB, veloce", tier: "fast" },
  ],
  "claude-cli": [
    { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", description: "Bilanciato via CLI", tier: "balanced" },
    { id: "claude-opus-5-5", label: "Claude Opus 5.5", description: "Potente via CLI", tier: "powerful" },
    { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", description: "Veloce via CLI", tier: "fast" },
  ],
}

// ── Helpers ────────────────────────────────────
function formatPrice(perToken: string): string {
  const n = parseFloat(perToken)
  if (isNaN(n) || n === 0) return "Free"
  const perM = n * 1_000_000
  if (perM < 0.01) return "<$0.01/M"
  if (perM < 1) return `$${perM.toFixed(2)}/M`
  return `$${perM.toFixed(1)}/M`
}

function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`
  return `${tokens}`
}

function extractProvider(modelId: string): string {
  return modelId.split("/")[0] || modelId
}

const STORAGE_KEY = "ceriana-ai-settings"

function loadSettings(): AiSettings {
  if (typeof window === "undefined") return { provider: "ollama", model: "qwen3:32b", apiKey: "", groqApiKey: "" }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        provider: parsed.provider || "ollama",
        model: parsed.model || (parsed.provider ? MODELS_BY_PROVIDER[parsed.provider]?.[0]?.id : "qwen3:32b") || "qwen3:32b",
        apiKey: parsed.apiKey || "",
        groqApiKey: parsed.groqApiKey || "",
      }
    }
  } catch { /* ignore */ }
  return { provider: "ollama", model: "qwen3:32b", apiKey: "", groqApiKey: "" }
}

function saveSettings(settings: AiSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    // Dispatch event so AiAssistant components pick it up
    window.dispatchEvent(new CustomEvent("ceriana-ai-settings-changed", { detail: settings }))
  } catch { /* ignore */ }
}

// ── Page ───────────────────────────────────────
export default function AiPage() {
  const [cliStatus, setCliStatus] = React.useState<CliStatus | null>(null)
  const [ollamaStatus, setOllamaStatus] = React.useState<{ connected: boolean; error?: string } | null>(null)
  const [testingCli, setTestingCli] = React.useState(false)
  const [testingOllama, setTestingOllama] = React.useState(false)
  const [claudePath, setClaudePath] = React.useState("")
  const [testPrompt, setTestPrompt] = React.useState("")
  const [testResult, setTestResult] = React.useState("")
  const [testStreaming, setTestStreaming] = React.useState(false)
  const [selectedProvider, setSelectedProvider] = React.useState<string>("ollama")
  const [selectedModel, setSelectedModel] = React.useState("qwen3:32b")
  const [apiKey, setApiKey] = React.useState("")
  const [showApiKey, setShowApiKey] = React.useState(false)
  const [groqApiKey, setGroqApiKey] = React.useState("")
  const [showGroqApiKey, setShowGroqApiKey] = React.useState(false)
  const [saved, setSaved] = React.useState(false)

  // Open Router dynamic models
  const [orModels, setOrModels] = React.useState<OpenRouterModel[]>([])
  const [orLoading, setOrLoading] = React.useState(false)
  const [orError, setOrError] = React.useState("")
  const [orSearch, setOrSearch] = React.useState("")
  const [orSort, setOrSort] = React.useState<ORSortKey>("name")
  const [orFilterProvider, setOrFilterProvider] = React.useState<ORFilterProvider>("all")
  const [orFilterFree, setOrFilterFree] = React.useState(false)
  const [orFilterTools, setOrFilterTools] = React.useState(false)

  // Load settings on mount
  React.useEffect(() => {
    const s = loadSettings()
    setSelectedProvider(s.provider)
    setSelectedModel(s.model)
    setApiKey(s.apiKey)
    setGroqApiKey(s.groqApiKey || "")
  }, [])

  // Fetch Open Router models when provider is openrouter
  React.useEffect(() => {
    if (selectedProvider !== "openrouter" || orModels.length > 0) return
    setOrLoading(true)
    setOrError("")
    fetch("/api/ai/openrouter-models")
      .then((r) => r.json())
      .then((data) => {
        const models: OpenRouterModel[] = (data.data || []).map((m: any) => ({
          id: m.id,
          name: m.name || m.id,
          description: m.description || "",
          context_length: m.context_length || 0,
          pricing: {
            prompt: m.pricing?.prompt || "0",
            completion: m.pricing?.completion || "0",
          },
          supported_parameters: m.supported_parameters || [],
          architecture: {
            modality: m.architecture?.modality || "text",
            input_modalities: m.architecture?.input_modalities || ["text"],
            output_modalities: m.architecture?.output_modalities || ["text"],
          },
        }))
        setOrModels(models)
      })
      .catch((e) => setOrError(e.message || "Errore nel caricamento modelli"))
      .finally(() => setOrLoading(false))
  }, [selectedProvider, orModels.length])

  // Compute filtered/sorted Open Router models
  const filteredOrModels = React.useMemo(() => {
    let list = [...orModels]

    // Text search
    if (orSearch.trim()) {
      const q = orSearch.toLowerCase()
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q)
      )
    }

    // Provider filter
    if (orFilterProvider !== "all") {
      list = list.filter((m) => extractProvider(m.id) === orFilterProvider)
    }

    // Free filter
    if (orFilterFree) {
      list = list.filter(
        (m) => parseFloat(m.pricing.prompt) === 0 && parseFloat(m.pricing.completion) === 0
      )
    }

    // Tools filter
    if (orFilterTools) {
      list = list.filter((m) => m.supported_parameters.includes("tools"))
    }

    // Sort
    switch (orSort) {
      case "name":
        list.sort((a, b) => a.name.localeCompare(b.name))
        break
      case "price_asc":
        list.sort((a, b) => parseFloat(a.pricing.prompt) - parseFloat(b.pricing.prompt))
        break
      case "price_desc":
        list.sort((a, b) => parseFloat(b.pricing.prompt) - parseFloat(a.pricing.prompt))
        break
      case "context":
        list.sort((a, b) => b.context_length - a.context_length)
        break
    }

    return list
  }, [orModels, orSearch, orSort, orFilterProvider, orFilterFree, orFilterTools])

  // Unique providers from Open Router models
  const orProviderList = React.useMemo(() => {
    const set = new Set(orModels.map((m) => extractProvider(m.id)))
    return Array.from(set).sort()
  }, [orModels])

  // When provider changes, auto-select first model of that provider
  const handleProviderChange = (newProvider: string) => {
    setSelectedProvider(newProvider)
    if (newProvider === "openrouter") {
      // Keep current model if already an OR model, otherwise clear
      if (!selectedModel.includes("/")) {
        setSelectedModel("")
      }
      return
    }
    const models = MODELS_BY_PROVIDER[newProvider]
    if (models && models.length > 0) {
      setSelectedModel(models[0].id)
    }
  }

  const handleSave = () => {
    saveSettings({ provider: selectedProvider as AiSettings["provider"], model: selectedModel, apiKey, groqApiKey })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  // ── Test CLI connection ────────────────────
  const testConnection = React.useCallback(async () => {
    setTestingCli(true)
    setCliStatus(null)
    try {
      const res = await fetch("/api/ai/test")
      const data: CliStatus = await res.json()
      setCliStatus(data)
      if (data.path) setClaudePath(data.path)
    } catch {
      setCliStatus({ connected: false, error: "Impossibile raggiungere il server" })
    } finally {
      setTestingCli(false)
    }
  }, [])

  // ── Test Ollama connection ──────────────────
  const testOllamaConnection = React.useCallback(async () => {
    setTestingOllama(true)
    setOllamaStatus(null)
    try {
      const ollamaBaseURL = (typeof window !== "undefined" && (window as any).OLLAMA_BASE_URL) || "http://localhost:11434"
      const res = await fetch(`${ollamaBaseURL}/api/tags`, { mode: "no-cors" })
      setOllamaStatus({ connected: true })
    } catch {
      setOllamaStatus({ connected: false, error: "Ollama non è raggiungibile" })
    } finally {
      setTestingOllama(false)
    }
  }, [])

  // Test on mount
  React.useEffect(() => {
    testConnection()
    testOllamaConnection()
  }, [testConnection, testOllamaConnection])

  // ── Test prompt ────────────────────────────
  const handleTestPrompt = async () => {
    if (!testPrompt.trim() || testStreaming) return
    setTestResult("")
    setTestStreaming(true)

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: testPrompt,
          model: selectedModel,
          provider: selectedProvider,
          apiKey: (selectedProvider !== "claude-cli" && selectedProvider !== "ollama") ? apiKey : undefined,
        }),
      })

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let sseBuffer = ""
      let accumulated = ""

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
              accumulated += data.text || ""
              setTestResult(accumulated)
            } else if (eventType === "text") {
              accumulated = data.text || accumulated
              setTestResult(accumulated)
            } else if (eventType === "error") {
              accumulated += `\n❌ ${data.message}`
              setTestResult(accumulated)
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      setTestResult(`Errore: ${err instanceof Error ? err.message : "sconosciuto"}`)
    } finally {
      setTestStreaming(false)
    }
  }

  // Current models based on provider
  const currentModels = MODELS_BY_PROVIDER[selectedProvider] || []

  // ── Features list ──────────────────────────
  const features = [
    { page: "DASHBOARD", desc: "Risponde a domande e riassume i dati", active: true },
    { page: "CHAT", desc: "Assistente flottante disponibile in ogni pagina", active: true },
    { page: "VOCE", desc: "Dettatura via Groq Whisper", active: true },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">AI Assistant</h1>
          <p className="text-sm text-muted-foreground">
            Configurazione e test dell&apos;integrazione AI
          </p>
        </div>
      </div>

      {/* Voice transcription (Groq Whisper) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600" />
            Trascrizione vocale (Groq Whisper)
          </CardTitle>
          <CardDescription>
            Il pulsante microfono nell&apos;assistente AI invia l&apos;audio a
            Groq per convertirlo in testo (modello <code className="text-[10px]">whisper-large-v3-turbo</code>). Free tier ~25 req/min.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs mb-1 block">Groq API Key</Label>
            <div className="flex gap-2">
              <Input
                type={showGroqApiKey ? "text" : "password"}
                value={groqApiKey}
                onChange={(e) => setGroqApiKey(e.target.value)}
                placeholder="gsk_..."
                className="text-xs h-9 font-mono"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-9 px-2"
                onClick={() => setShowGroqApiKey(v => !v)}
              >
                {showGroqApiKey ? "👁" : "🔒"}
              </Button>
              <Button
                size="sm"
                className="h-9 bg-violet-600 hover:bg-violet-700"
                onClick={handleSave}
              >
                {saved ? <CheckCircle className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Recupera la chiave gratuitamente su{" "}
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-600 hover:underline"
              >
                console.groq.com/keys
              </a>
              {" "}(account Groq, registrazione gratuita).
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Provider Selection ──────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Provider LLM
            </CardTitle>
            <CardDescription>
              Scegli il provider e configura le credenziali di accesso
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Provider radio-style buttons */}
            <div className="space-y-2">
              <Label className="text-xs">Provider</Label>
              <div className="space-y-2">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleProviderChange(p.id)}
                    className={`w-full text-left flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${
                      selectedProvider === p.id
                        ? "border-violet-400 bg-violet-50"
                        : "border-transparent bg-muted/40 hover:bg-muted"
                    }`}
                  >
                    <div className={`h-2 w-2 rounded-full shrink-0 ${
                      p.id === "anthropic" ? "bg-violet-500" :
                      p.id === "openai" ? "bg-green-500" :
                      "bg-amber-500"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">{p.label}</p>
                      <p className="text-[10px] text-muted-foreground">{p.description}</p>
                    </div>
                    {selectedProvider === p.id && (
                      <CheckCircle className="h-3.5 w-3.5 text-violet-600 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* API Key input - shown only for anthropic/openai/openrouter */}
            {selectedProvider !== "claude-cli" && selectedProvider !== "ollama" && (
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1.5">
                  <Key className="h-3 w-3" />
                  API Key
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showApiKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={selectedProvider === "openai" ? "sk-..." : selectedProvider === "openrouter" ? "sk-or-..." : "sk-ant-..."}
                      className="text-xs h-8 pr-8"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showApiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  La API key è salvata solo nel browser, mai inviata al server.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Model Selection ──────────────────── */}
        {selectedProvider === "openrouter" ? (
          /* ── Open Router Model Browser ───────── */
          <Card className="lg:col-span-1 lg:row-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Cpu className="h-4 w-4" />
                Modelli Open Router
                {orModels.length > 0 && (
                  <Badge variant="secondary" className="text-[9px] ml-auto">{orModels.length} modelli</Badge>
                )}
              </CardTitle>
              <CardDescription>
                Cerca tra {orModels.length || "100+"}  modelli. Filtra per costo, provider, funzionalità.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Selected model indicator + Save */}
              {selectedModel && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-violet-50 border border-violet-200">
                  <CheckCircle className="h-3.5 w-3.5 text-violet-600 shrink-0" />
                  <span className="text-xs font-medium text-violet-800 truncate flex-1">{selectedModel}</span>
                  <Button
                    size="sm"
                    className="h-7 px-2 bg-violet-600 hover:bg-violet-700 text-[10px]"
                    onClick={handleSave}
                  >
                    {saved ? <CheckCircle className="h-3 w-3" /> : <Save className="h-3 w-3" />}
                  </Button>
                </div>
              )}

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={orSearch}
                  onChange={(e) => setOrSearch(e.target.value)}
                  placeholder="Cerca modelli (es. claude, gpt, llama, gemini...)"
                  className="text-xs h-8 pl-8"
                />
              </div>

              {/* Filters row */}
              <div className="flex flex-wrap gap-2">
                {/* Provider filter */}
                <Select value={orFilterProvider} onValueChange={(v) => setOrFilterProvider(v)}>
                  <SelectTrigger className="text-[10px] h-7 w-[140px]">
                    <Filter className="h-3 w-3 mr-1" />
                    <SelectValue placeholder="Provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-[10px]">Tutti i provider</SelectItem>
                    {orProviderList.map((p) => (
                      <SelectItem key={p} value={p} className="text-[10px]">{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Sort */}
                <Select value={orSort} onValueChange={(v) => setOrSort(v as ORSortKey)}>
                  <SelectTrigger className="text-[10px] h-7 w-[130px]">
                    <ArrowUpDown className="h-3 w-3 mr-1" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name" className="text-[10px]">Nome A-Z</SelectItem>
                    <SelectItem value="price_asc" className="text-[10px]">Prezzo crescente</SelectItem>
                    <SelectItem value="price_desc" className="text-[10px]">Prezzo decrescente</SelectItem>
                    <SelectItem value="context" className="text-[10px]">Context ampio</SelectItem>
                  </SelectContent>
                </Select>

                {/* Toggle filters */}
                <button
                  onClick={() => setOrFilterFree(!orFilterFree)}
                  className={`h-7 px-2 text-[10px] rounded-md border transition-colors flex items-center gap-1 ${
                    orFilterFree ? "bg-green-50 border-green-300 text-green-700" : "bg-muted/40 border-transparent text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <DollarSign className="h-3 w-3" /> Free
                </button>
                <button
                  onClick={() => setOrFilterTools(!orFilterTools)}
                  className={`h-7 px-2 text-[10px] rounded-md border transition-colors flex items-center gap-1 ${
                    orFilterTools ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-muted/40 border-transparent text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Wrench className="h-3 w-3" /> Tools
                </button>
              </div>

              {/* Results count */}
              <p className="text-[10px] text-muted-foreground">
                {orLoading ? "Caricamento..." : `${filteredOrModels.length} modelli trovati`}
              </p>

              {/* Error */}
              {orError && (
                <p className="text-[10px] text-red-500">{orError}</p>
              )}

              {/* Model list (scrollable) */}
              {orLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
                  {filteredOrModels.map((m) => {
                    const promptPrice = formatPrice(m.pricing.prompt)
                    const completionPrice = formatPrice(m.pricing.completion)
                    const isFree = parseFloat(m.pricing.prompt) === 0 && parseFloat(m.pricing.completion) === 0
                    const hasTools = m.supported_parameters.includes("tools")
                    const hasVision = m.architecture.input_modalities.includes("image")
                    const provider = extractProvider(m.id)

                    return (
                      <button
                        key={m.id}
                        onClick={() => setSelectedModel(m.id)}
                        className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                          selectedModel === m.id
                            ? "border-violet-400 bg-violet-50"
                            : "border-transparent bg-muted/40 hover:bg-muted"
                        }`}
                      >
                        {/* Row 1: name + provider */}
                        <div className="flex items-center gap-2">
                          <p className="text-[11px] font-medium truncate flex-1">{m.name}</p>
                          {selectedModel === m.id && (
                            <CheckCircle className="h-3 w-3 text-violet-600 shrink-0" />
                          )}
                        </div>

                        {/* Row 2: badges */}
                        <div className="flex flex-wrap gap-1 mt-1">
                          <Badge variant="outline" className="text-[8px] py-0 h-4 font-normal">{provider}</Badge>
                          <Badge variant="outline" className="text-[8px] py-0 h-4 font-normal">
                            <Hash className="h-2.5 w-2.5 mr-0.5" />{formatContext(m.context_length)}
                          </Badge>
                          {isFree ? (
                            <Badge className="text-[8px] py-0 h-4 bg-green-100 text-green-700 border-green-200 hover:bg-green-100">Free</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[8px] py-0 h-4 font-normal">
                              <DollarSign className="h-2.5 w-2.5 mr-0.5" />In: {promptPrice}
                            </Badge>
                          )}
                          {!isFree && (
                            <Badge variant="outline" className="text-[8px] py-0 h-4 font-normal">
                              Out: {completionPrice}
                            </Badge>
                          )}
                          {hasTools && (
                            <Badge className="text-[8px] py-0 h-4 bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100">
                              <Wrench className="h-2.5 w-2.5 mr-0.5" />Tools
                            </Badge>
                          )}
                          {hasVision && (
                            <Badge className="text-[8px] py-0 h-4 bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-100">Vision</Badge>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          /* ── Standard Model Selection ─────────── */
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Cpu className="h-4 w-4" />
                Modello AI
              </CardTitle>
              <CardDescription>
                Scegli il modello da usare in tutta l&apos;applicazione
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs">Modello attivo</Label>
                <div className="flex gap-2">
                  <Select value={selectedModel} onValueChange={setSelectedModel}>
                    <SelectTrigger className="text-xs h-9 flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currentModels.map((m) => (
                        <SelectItem key={m.id} value={m.id} className="text-xs">
                          <span className="font-medium">{m.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    className="h-9 bg-violet-600 hover:bg-violet-700"
                    onClick={handleSave}
                  >
                    {saved ? <CheckCircle className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>

              {/* Model cards */}
              <div className="space-y-2">
                {currentModels.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedModel(m.id)}
                    className={`w-full text-left flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${
                      selectedModel === m.id
                        ? "border-violet-400 bg-violet-50"
                        : "border-transparent bg-muted/40 hover:bg-muted"
                    }`}
                  >
                    <div className={`h-2 w-2 rounded-full shrink-0 ${
                      m.tier === "fast" ? "bg-green-500" :
                      m.tier === "balanced" ? "bg-blue-500" :
                      "bg-amber-500"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">{m.label}</p>
                      <p className="text-[10px] text-muted-foreground">{m.description}</p>
                    </div>
                    <Badge variant="outline" className="text-[9px] shrink-0">
                      {m.tier === "fast" ? "⚡ Fast" : m.tier === "balanced" ? "⚖ Balanced" : "🧠 Power"}
                    </Badge>
                    {selectedModel === m.id && (
                      <CheckCircle className="h-3.5 w-3.5 text-violet-600 shrink-0" />
                    )}
                  </button>
                ))}
              </div>

              <p className="text-[10px] text-muted-foreground">
                Il modello selezionato viene usato dall&apos;agente AI in tutte le pagine.
                Modelli più potenti sono più lenti e costosi.
              </p>
            </CardContent>
          </Card>
        )}

        {/* ── Test Chat ──────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TestTube className="h-4 w-4" />
              Test Prompt
            </CardTitle>
            <CardDescription>
              Invia un messaggio di test per verificare il funzionamento
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={testPrompt}
                onChange={(e) => setTestPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTestPrompt()
                }}
                placeholder='Es: "Rispondi con ciao in italiano"'
                className="text-xs h-8 flex-1"
                disabled={testStreaming}
              />
              <Button
                size="sm"
                className="h-8 bg-violet-600 hover:bg-violet-700"
                onClick={handleTestPrompt}
                disabled={testStreaming || !testPrompt.trim()}
              >
                {testStreaming ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Zap className="h-3 w-3" />
                )}
              </Button>
            </div>

            {/* Result area */}
            <div className="min-h-[120px] max-h-[200px] overflow-y-auto rounded-lg bg-muted/50 p-3 text-xs whitespace-pre-wrap font-mono">
              {testStreaming && !testResult && (
                <span className="text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  In attesa della risposta...
                </span>
              )}
              {testResult || (
                <span className="text-muted-foreground">
                  Il risultato apparirà qui...
                </span>
              )}
              {testStreaming && testResult && (
                <span className="inline-block w-1.5 h-3 bg-violet-500 ml-0.5 animate-pulse rounded-sm" />
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── CLI Connection Status (only for claude-cli provider) ── */}
        {selectedProvider === "claude-cli" && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                Connessione Claude CLI
              </CardTitle>
              <CardDescription>
                Verifica che Claude Code CLI sia installato e raggiungibile
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Status indicator */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                {testingCli ? (
                  <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                ) : cliStatus?.connected ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {testingCli
                      ? "Test in corso..."
                      : cliStatus?.connected
                      ? "Connesso"
                      : "Non connesso"}
                  </p>
                  {cliStatus?.version && (
                    <p className="text-xs text-muted-foreground truncate">
                      Versione: {cliStatus.version}
                    </p>
                  )}
                  {cliStatus?.error && (
                    <p className="text-xs text-red-500 truncate">{cliStatus.error}</p>
                  )}
                </div>
                <Badge variant={cliStatus?.connected ? "default" : "destructive"} className="shrink-0">
                  {cliStatus?.connected ? "OK" : "ERRORE"}
                </Badge>
              </div>

              {/* Path configuration */}
              <div className="space-y-2">
                <Label className="text-xs">Percorso CLI (CLAUDE_PATH)</Label>
                <div className="flex gap-2">
                  <Input
                    value={claudePath}
                    onChange={(e) => setClaudePath(e.target.value)}
                    placeholder="claude (default)"
                    className="text-xs h-8 flex-1"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={testConnection}
                    disabled={testingCli}
                  >
                    {testingCli ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Imposta la variabile d&apos;ambiente <code className="bg-muted px-1 rounded">CLAUDE_PATH</code> nel file <code className="bg-muted px-1 rounded">.env.local</code> per personalizzare.
                </p>
              </div>

              {/* Install instructions */}
              {cliStatus && !cliStatus.connected && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs space-y-1.5">
                  <p className="font-medium text-amber-800">Come installare Claude Code CLI:</p>
                  <code className="block bg-amber-100 px-2 py-1 rounded text-[10px]">
                    npm install -g @anthropic-ai/claude-code
                  </code>
                  <p className="text-amber-700">
                    Oppure sarà usato automaticamente via <code>npx</code> al primo utilizzo.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Ollama Connection Status (only for ollama provider) ── */}
        {selectedProvider === "ollama" && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Cpu className="h-4 w-4" />
                Connessione Ollama
              </CardTitle>
              <CardDescription>
                Verifica che Ollama sia in esecuzione con il modello GEMMA 4
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Status indicator */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                {testingOllama ? (
                  <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                ) : ollamaStatus?.connected ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {testingOllama
                      ? "Test in corso..."
                      : ollamaStatus?.connected
                      ? "Connesso"
                      : "Non connesso"}
                  </p>
                  {ollamaStatus?.error && (
                    <p className="text-xs text-red-500 truncate">{ollamaStatus.error}</p>
                  )}
                </div>
                <Badge variant={ollamaStatus?.connected ? "default" : "destructive"} className="shrink-0">
                  {ollamaStatus?.connected ? "OK" : "OFFLINE"}
                </Badge>
              </div>

              {/* Instructions */}
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs space-y-1.5">
                <p className="font-medium text-blue-800">Come avviare Ollama con GEMMA 4:</p>
                <code className="block bg-blue-100 px-2 py-1 rounded text-[10px]">
                  ollama pull gemma4:31b
                </code>
                <code className="block bg-blue-100 px-2 py-1 rounded text-[10px]">
                  ollama serve
                </code>
                <p className="text-blue-700">
                  Oppure usa Docker Compose per avviare l&apos;intera stack automaticamente.
                </p>
              </div>

              {/* Refresh button */}
              <Button
                size="sm"
                variant="outline"
                className="w-full h-8"
                onClick={testOllamaConnection}
                disabled={testingOllama}
              >
                {testingOllama ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin mr-2" />
                    Test in corso...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3 w-3 mr-2" />
                    Riprova connessione
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Agent Features ─────────────────── */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="h-4 w-4" />
              Agente AI nelle pagine
            </CardTitle>
            <CardDescription>
              L&apos;assistente AI è disponibile in ogni pagina come pannello laterale.
              Analizza il contesto della pagina e propone azioni concrete.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {features.map((f) => (
                <div
                  key={f.page}
                  className="flex items-start gap-2.5 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="h-7 w-7 rounded-md bg-violet-100 flex items-center justify-center shrink-0 mt-0.5">
                    <MessageSquare className="h-3.5 w-3.5 text-violet-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{f.page}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{f.desc}</p>
                  </div>
                  <Badge
                    variant={f.active ? "default" : "secondary"}
                    className="text-[9px] shrink-0 ml-auto"
                  >
                    {f.active ? "ON" : "OFF"}
                  </Badge>
                </div>
              ))}
            </div>

            {/* How it works */}
            <div className="mt-4 p-3 rounded-lg bg-violet-50 border border-violet-200 text-xs space-y-2">
              <p className="font-semibold text-violet-900 flex items-center gap-1.5">
                <Settings2 className="h-3.5 w-3.5" /> Come funziona
              </p>
              <ul className="space-y-1 text-violet-800 text-[11px]">
                <li className="flex items-start gap-1.5">
                  <Cpu className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>Premi il pulsante <Sparkles className="h-3 w-3 inline text-violet-600" /> in basso a destra in qualsiasi pagina</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Cpu className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>L&apos;agente legge il contesto della pagina (dati, selezioni, errori)</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Cpu className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>Ti propone azioni concrete che puoi confermare o rifiutare</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Cpu className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>Usa il provider selezionato per analisi avanzate e generazione codice</span>
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
