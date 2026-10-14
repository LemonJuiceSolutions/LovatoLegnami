import { NextRequest } from 'next/server'
import { spawn, execSync } from 'child_process'
import { streamOllamaChat, streamSimpleOpenAIChat, streamSimpleAnthropicChat } from '@/lib/llm-providers'
import type { ChatMessage, SSECallback } from '@/lib/llm-providers'
import { UNIVERSAL_SYSTEM_PROMPT } from '@/lib/ai-prompts'

/** Resolve working CLI command */
const IS_WIN = process.platform === 'win32'

function getClaudeCommand(): { cmd: string; baseArgs: string[] } {
  const configured = process.env.CLAUDE_PATH || 'claude'
  try {
    execSync(`${configured} --version`, { timeout: 5000, encoding: 'utf-8', ...(IS_WIN ? { shell: 'cmd.exe' } : {}) })
    return { cmd: configured, baseArgs: [] }
  } catch {
    return { cmd: 'npx', baseArgs: ['-y', '@anthropic-ai/claude-code'] }
  }
}

const SAFE_SESSION_ID = /^[0-9a-f-]{36}$/i
const SAFE_MODEL = /^[a-zA-Z0-9._:-]+$/

interface ChatRequestBody {
  prompt: string
  provider?: 'ollama' | 'claude-cli' | 'anthropic' | 'openai' | 'openrouter'
  model?: string
  apiKey?: string
  context?: string
  sessionId?: string | null
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
}

// ══════════════════════════════════════════════════════════════
//  POST handler
// ══════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequestBody = await request.json()
    const { prompt, provider = 'claude-cli', model, apiKey, context, sessionId, history } = body

    console.log(`[AI Chat POST] provider="${provider}", model="${model}", prompt="${(prompt || '').substring(0, 80)}"`)

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'prompt obbligatorio' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const serverSystemPrompt = UNIVERSAL_SYSTEM_PROMPT
      + (context ? '\n\n══ CONTESTO PAGINA ══\n' + context : '')

    if (provider === 'claude-cli') {
      // Values end up on the CLI command line (via cmd.exe on Windows): allow only safe characters
      if ((sessionId && !SAFE_SESSION_ID.test(sessionId)) || (model && !SAFE_MODEL.test(model))) {
        return new Response(JSON.stringify({ error: 'sessionId o model non validi' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return handleClaudeCliChat(prompt, sessionId, serverSystemPrompt, model)
    }

    // Validate API key for external providers
    if ((provider === 'anthropic' || provider === 'openai' || provider === 'openrouter') && !apiKey) {
      const encoder = new TextEncoder()
      const providerName = provider === 'openrouter' ? 'OpenRouter' : provider === 'anthropic' ? 'Anthropic' : 'OpenAI'
      const errStream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`event: text_delta\ndata: ${JSON.stringify({ text: `⚠️ **API Key mancante.** Vai nelle impostazioni AI e inserisci la tua API key ${providerName}.` })}\n\n`))
          controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`))
          controller.close()
        }
      })
      return new Response(errStream, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
      })
    }

    return handleSimpleChat(provider, prompt, model || '', apiKey || '', serverSystemPrompt, history)
  } catch (error) {
    console.error('POST /api/ai/chat error:', error)
    return new Response(JSON.stringify({ error: 'Errore interno' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// ══════════════════════════════════════════════════════════════
//  Simple chat — uguale per TUTTI i provider (no tool, no MCP)
// ══════════════════════════════════════════════════════════════

function handleSimpleChat(
  provider: 'anthropic' | 'openai' | 'openrouter' | 'ollama',
  prompt: string,
  model: string,
  apiKey: string,
  systemPrompt: string,
  history?: Array<{ role: string; content: string }>,
): Response {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const sendSSE: SSECallback = (event, data) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch { /* stream closed */ }
      }

      try {
        const messages: ChatMessage[] = []
        if (history) {
          for (const h of history) {
            messages.push({ role: h.role as 'user' | 'assistant', content: h.content })
          }
        }
        messages.push({ role: 'user', content: prompt })

        console.log(`[SimpleChat] provider=${provider}, model=${model}`)

        switch (provider) {
          case 'anthropic':
            await streamSimpleAnthropicChat({ apiKey, model }, messages, systemPrompt, sendSSE)
            break
          case 'openai':
            await streamSimpleOpenAIChat({ apiKey, model }, messages, systemPrompt, sendSSE)
            break
          case 'openrouter':
            await streamSimpleOpenAIChat(
              { apiKey, model, baseURL: 'https://openrouter.ai/api/v1' },
              messages, systemPrompt, sendSSE,
            )
            break
          case 'ollama': {
            const ollamaBaseURL = process.env.OLLAMA_API_BASE || 'http://localhost:11434'
            await streamOllamaChat(
              { model: model || 'qwen3:8b', baseURL: `${ollamaBaseURL}/v1` },
              messages, systemPrompt, sendSSE,
            )
            break
          }
        }

        sendSSE('done', {})
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Errore interno'
        sendSSE('error', { message })
        sendSSE('done', {})
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

// ══════════════════════════════════════════════════════════════
//  Claude CLI provider
// ══════════════════════════════════════════════════════════════

function handleClaudeCliChat(
  prompt: string,
  sessionId: string | null | undefined,
  systemPrompt: string,
  model: string | undefined
): Response {

  const { cmd, baseArgs } = getClaudeCommand()
  const args: string[] = [...baseArgs]
  if (sessionId) args.push(`--resume=${sessionId}`)
  if (model) args.push(`--model=${model}`)
  // --tools "": disable ALL built-in tools — agent responds with text only
  args.push('--tools', '')
  args.push('-p', '--output-format', 'stream-json', '--verbose')

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      const proc = spawn(cmd, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        ...(IS_WIN ? { shell: 'cmd.exe' } : {}),
      })

      // Embed system prompt + user prompt together via stdin
      // (Claude CLI's built-in system prompt can't be overridden, but with --tools ""
      //  the model has no tools to use and will follow these instructions)
      const fullInput = systemPrompt + '\n\n═══ RICHIESTA UTENTE ═══\n' + prompt
      proc.stdin.write(fullInput, 'utf-8')
      proc.stdin.end()

      let buffer = ''
      let hasReceivedContent = false
      let stderrBuffer = ''

      const sendSSE = (event: string, data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch { /* stream closed */ }
      }

      const handleAndTrack = (parsed: Record<string, unknown>) => {
        const type = parsed.type as string
        if (type === 'assistant' || type === 'result' || type === 'content_block_delta') {
          hasReceivedContent = true
        }
        handleCLIEvent(parsed, sendSSE)
      }

      proc.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.trim()) continue
          try { handleAndTrack(JSON.parse(line)) } catch { /* non-JSON */ }
        }
      })

      proc.stderr.on('data', (chunk: Buffer) => { stderrBuffer += chunk.toString() })

      proc.on('close', (code) => {
        if (buffer.trim()) {
          try { handleAndTrack(JSON.parse(buffer)) } catch { /* ignore */ }
        }
        if (code !== 0 && code !== null && !hasReceivedContent) {
          const detail = stderrBuffer.trim()
            ? `CLI exited with code ${code}: ${stderrBuffer.trim().slice(0, 500)}`
            : `CLI exited with code ${code}`
          sendSSE('error', { message: detail })
        }
        sendSSE('done', {})
        controller.close()
      })

      proc.on('error', (err) => {
        sendSSE('error', { message: `Failed to start CLI: ${err.message}` })
        sendSSE('done', {})
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

// ══════════════════════════════════════════════════════════════
//  Map Claude CLI NDJSON events to SSE
// ══════════════════════════════════════════════════════════════

function handleCLIEvent(
  parsed: Record<string, unknown>,
  sendSSE: (event: string, data: Record<string, unknown>) => void
) {
  const type = parsed.type as string

  if (type === 'system') {
    const subtype = (parsed as Record<string, unknown>).subtype as string
    if (subtype === 'init') {
      sendSSE('init', {
        sessionId: parsed.session_id || parsed.sessionId,
        model: parsed.model,
      })
    }
  } else if (type === 'assistant') {
    const message = parsed.message as Record<string, unknown> | undefined
    const content = (message?.content || parsed.content) as Array<Record<string, unknown>> | undefined
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'text') {
          sendSSE('text', { text: block.text })
        } else if (block.type === 'tool_use') {
          sendSSE('tool_use', { id: block.id, name: block.name, input: block.input })
        } else if (block.type === 'tool_result') {
          sendSSE('tool_result', { id: block.tool_use_id, result: block.content })
        }
      }
    }
  } else if (type === 'content_block_delta' || type === 'stream_event') {
    const delta = parsed.delta as Record<string, unknown> | undefined
    if (delta?.type === 'text_delta') {
      sendSSE('text_delta', { text: delta.text })
    }
    const contentBlock = parsed.content_block as Record<string, unknown> | undefined
    if (contentBlock?.type === 'tool_use') {
      sendSSE('tool_start', { id: contentBlock.id, name: contentBlock.name })
    }
  } else if (type === 'result') {
    sendSSE('result', {
      sessionId: parsed.session_id || parsed.sessionId,
      cost: parsed.cost_usd || parsed.cost,
      duration: parsed.duration_ms || parsed.duration,
      model: parsed.model,
    })
  } else if (type === 'error') {
    sendSSE('error', {
      message: (parsed.error as Record<string, unknown>)?.message || parsed.message || 'Unknown error',
    })
  }
}
