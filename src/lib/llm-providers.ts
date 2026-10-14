import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SSECallback = (
  event: string,
  data: Record<string, unknown>
) => void;

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ProviderConfig {
  provider: "anthropic" | "openai";
  apiKey: string;
  model: string;
}

// ---------------------------------------------------------------------------
// Anthropic Provider
// ---------------------------------------------------------------------------

export async function streamAnthropicChat(
  config: { apiKey: string; model: string },
  messages: ChatMessage[],
  systemPrompt: string,
  tools: any[],
  executeToolFn: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<string>,
  sendSSE: SSECallback
): Promise<void> {
  try {
    const anthropic = new Anthropic({ apiKey: config.apiKey });

    const anthropicMessages: any[] = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    while (true) {
      const stream = anthropic.messages.stream({
        model: config.model,
        system: systemPrompt,
        messages: anthropicMessages,
        tools,
        max_tokens: 8192,
      });

      stream.on("text", (text) => {
        sendSSE("text_delta", { text });
      });

      const response = await stream.finalMessage();
      const stopReason = response.stop_reason;
      const fullContent = response.content;

      if (stopReason === "tool_use") {
        const toolUseBlocks = fullContent.filter(
          (b) => b.type === "tool_use"
        ) as Array<{ type: "tool_use"; id: string; name: string; input: Record<string, unknown> }>;
        const toolResults: any[] = [];

        let confirmationPending = false
        for (const toolUse of toolUseBlocks) {
          sendSSE("tool_start", { id: toolUse.id, name: toolUse.name });
          try {
            const result = await executeToolFn(
              toolUse.name,
              toolUse.input as Record<string, unknown>
            );
            if (result.includes('AWAITING_USER_CONFIRMATION')) {
              confirmationPending = true
              continue
            }
            sendSSE("tool_result", {
              id: toolUse.id,
              name: toolUse.name,
              result: result.substring(0, 500),
            });
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: result,
            });
          } catch (e: any) {
            sendSSE("tool_error", {
              id: toolUse.id,
              name: toolUse.name,
              error: e.message,
            });
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: `Error: ${e.message}`,
              is_error: true,
            });
          }
        }

        if (confirmationPending) break

        anthropicMessages.push({ role: "assistant", content: fullContent });
        anthropicMessages.push({ role: "user", content: toolResults });
        continue;
      }

      break;
    }
  } catch (e: any) {
    sendSSE("error", { message: e.message ?? "Anthropic API call failed" });
  }
}

// ---------------------------------------------------------------------------
// OpenAI Provider
// ---------------------------------------------------------------------------

export async function streamOpenAIChat(
  config: { apiKey: string; model: string; baseURL?: string },
  messages: ChatMessage[],
  systemPrompt: string,
  tools: any[],
  executeToolFn: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<string>,
  sendSSE: SSECallback
): Promise<void> {
  try {
    const openai = new OpenAI({ apiKey: config.apiKey, ...(config.baseURL ? { baseURL: config.baseURL } : {}) });

    const openaiMessages: any[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    while (true) {
      const stream = await openai.chat.completions.create({
        model: config.model,
        messages: openaiMessages,
        tools,
        tool_choice: "auto",
        stream: true,
      });

      let fullContent = "";
      let toolCalls: Array<{
        id: string;
        function: { name: string; arguments: string };
      }> = [];
      let finishReason = "";

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta as any;

        if (delta?.content) {
          fullContent += delta.content;
          sendSSE("text_delta", { text: delta.content });
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.index !== undefined) {
              if (!toolCalls[tc.index]) {
                toolCalls[tc.index] = {
                  id: tc.id || "",
                  function: { name: "", arguments: "" },
                };
              }
              if (tc.id) toolCalls[tc.index].id = tc.id;
              if (tc.function?.name)
                toolCalls[tc.index].function.name += tc.function.name;
              if (tc.function?.arguments)
                toolCalls[tc.index].function.arguments +=
                  tc.function.arguments;
            }
          }
        }

        if (chunk.choices[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason;
        }
      }

      if (toolCalls.length > 0 && (finishReason === "tool_calls" || finishReason === "stop")) {
        openaiMessages.push({
          role: "assistant",
          content: fullContent || null,
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
        });

        let confirmationPending = false
        for (const tc of toolCalls) {
          const args = JSON.parse(tc.function.arguments);
          sendSSE("tool_start", { id: tc.id, name: tc.function.name });
          try {
            const result = await executeToolFn(tc.function.name, args);
            if (result.includes('AWAITING_USER_CONFIRMATION')) {
              confirmationPending = true
              continue
            }
            sendSSE("tool_result", {
              id: tc.id,
              name: tc.function.name,
              result: result.substring(0, 500),
            });
            openaiMessages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: result,
            });
          } catch (e: any) {
            sendSSE("tool_error", {
              id: tc.id,
              name: tc.function.name,
              error: e.message,
            });
            openaiMessages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: `Error: ${e.message}`,
            });
          }
        }
        if (confirmationPending) break
        continue;
      }

      // Model returned text without tool calls — check if it's pretending to execute tools
      const writeKeywords = /\b(delete|create|update|remove|add|elimina|crea|aggiorna|rimuov|aggiungi)\b/i
      if (toolCalls.length === 0 && fullContent.length > 0 && writeKeywords.test(fullContent)) {
        sendSSE("text_delta", {
          text: "\n\n⚠️ **Attenzione:** questo modello non supporta le function calls (tool use). Le operazioni descritte sopra NON sono state eseguite. Per eseguire operazioni reali, usa un modello compatibile con function calling (es. Claude, GPT-4)."
        })
      }

      break;
    }
  } catch (e: any) {
    sendSSE("error", { message: e.message ?? "OpenAI API call failed" });
  }
}

// ---------------------------------------------------------------------------
// Open Router Provider (OpenAI-compatible with custom baseURL)
// ---------------------------------------------------------------------------

export async function streamOpenRouterChat(
  config: { apiKey: string; model: string },
  messages: ChatMessage[],
  systemPrompt: string,
  tools: any[],
  executeToolFn: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<string>,
  sendSSE: SSECallback
): Promise<void> {
  try {
    const openrouter = new OpenAI({
      apiKey: config.apiKey,
      baseURL: "https://openrouter.ai/api/v1",
    });

    const messages_array: any[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    while (true) {
      const stream = await openrouter.chat.completions.create({
        model: config.model,
        messages: messages_array,
        tools,
        tool_choice: "auto",
        stream: true,
      });

      let fullContent = "";
      let toolCalls: Array<{
        id: string;
        function: { name: string; arguments: string };
      }> = [];
      let finishReason = "";

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta as any;

        if (delta?.content) {
          fullContent += delta.content;
          sendSSE("text_delta", { text: delta.content });
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.index !== undefined) {
              if (!toolCalls[tc.index]) {
                toolCalls[tc.index] = {
                  id: tc.id || "",
                  function: { name: "", arguments: "" },
                };
              }
              if (tc.id) toolCalls[tc.index].id = tc.id;
              if (tc.function?.name)
                toolCalls[tc.index].function.name += tc.function.name;
              if (tc.function?.arguments)
                toolCalls[tc.index].function.arguments +=
                  tc.function.arguments;
            }
          }
        }

        if (chunk.choices[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason;
        }
      }

      if (toolCalls.length > 0 && (finishReason === "tool_calls" || finishReason === "stop")) {
        messages_array.push({
          role: "assistant",
          content: fullContent || null,
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
        });

        let confirmationPending = false
        for (const tc of toolCalls) {
          const args = JSON.parse(tc.function.arguments);
          sendSSE("tool_start", { id: tc.id, name: tc.function.name });
          try {
            const result = await executeToolFn(tc.function.name, args);
            // If the tool returned a confirmation-pending result, continue to send all confirmations
            if (result.includes('AWAITING_USER_CONFIRMATION')) {
              console.log(`[OpenRouter] Confirmation pending for: ${tc.function.name}`)
              confirmationPending = true
              continue
            }
            sendSSE("tool_result", {
              id: tc.id,
              name: tc.function.name,
              result: result.substring(0, 500),
            });
            messages_array.push({
              role: "tool",
              tool_call_id: tc.id,
              content: result,
            });
          } catch (e: any) {
            sendSSE("tool_error", {
              id: tc.id,
              name: tc.function.name,
              error: e.message,
            });
            messages_array.push({
              role: "tool",
              tool_call_id: tc.id,
              content: `Error: ${e.message}`,
            });
          }
        }
        if (confirmationPending) break
        continue;
      }

      // Model returned text without tool calls — check if it's pretending to execute tools
      const writeKeywords = /\b(delete|create|update|remove|add|elimina|crea|aggiorna|rimuov|aggiungi)\b/i
      if (toolCalls.length === 0 && fullContent.length > 0 && writeKeywords.test(fullContent)) {
        // Model doesn't support function calling — warn user
        sendSSE("text_delta", {
          text: "\n\n⚠️ **Attenzione:** questo modello non supporta le function calls (tool use). Le operazioni descritte sopra NON sono state eseguite. Per eseguire operazioni reali (create, update, delete), usa un modello compatibile con function calling (es. Claude, GPT-4, Qwen con tool support)."
        })
      }

      break;
    }
  } catch (e: any) {
    sendSSE("error", { message: e.message ?? "Open Router API call failed" });
  }
}

// ---------------------------------------------------------------------------
// Ollama Provider (OpenAI-compatible, local inference, simple chat)
// ---------------------------------------------------------------------------

export async function streamOllamaChat(
  config: { model: string; baseURL: string },
  messages: ChatMessage[],
  systemPrompt: string,
  sendSSE: SSECallback,
): Promise<void> {
  try {
    const ollama = new OpenAI({
      apiKey: "ollama",
      baseURL: config.baseURL,
    });

    const messages_array: any[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const stream = await ollama.chat.completions.create({
      model: config.model,
      messages: messages_array,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta as any;
      if (delta?.content) {
        sendSSE("text_delta", { text: delta.content });
      }
    }
  } catch (e: any) {
    sendSSE("error", { message: e.message ?? "Ollama API call failed" });
  }
}

// ---------------------------------------------------------------------------
// Simple OpenAI-compatible chat (works for OpenAI, OpenRouter, Ollama)
// No tools, no function calling — just streaming text.
// ---------------------------------------------------------------------------

export async function streamSimpleOpenAIChat(
  config: { apiKey: string; model: string; baseURL?: string },
  messages: ChatMessage[],
  systemPrompt: string,
  sendSSE: SSECallback,
): Promise<void> {
  try {
    const client = new OpenAI({
      apiKey: config.apiKey,
      ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    });

    const messages_array: any[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const stream = await client.chat.completions.create({
      model: config.model,
      messages: messages_array,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta as any;
      if (delta?.content) {
        sendSSE("text_delta", { text: delta.content });
      }
    }
  } catch (e: any) {
    sendSSE("error", { message: e.message ?? "OpenAI chat failed" });
  }
}

// ---------------------------------------------------------------------------
// Simple Anthropic chat — no tools, just streaming text.
// ---------------------------------------------------------------------------

export async function streamSimpleAnthropicChat(
  config: { apiKey: string; model: string },
  messages: ChatMessage[],
  systemPrompt: string,
  sendSSE: SSECallback,
): Promise<void> {
  try {
    const anthropic = new Anthropic({ apiKey: config.apiKey });

    const anthropicMessages: any[] = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const stream = anthropic.messages.stream({
      model: config.model,
      system: systemPrompt,
      messages: anthropicMessages,
      max_tokens: 8192,
    });

    stream.on("text", (text) => {
      sendSSE("text_delta", { text });
    });

    await stream.finalMessage();
  } catch (e: any) {
    sendSSE("error", { message: e.message ?? "Anthropic chat failed" });
  }
}
