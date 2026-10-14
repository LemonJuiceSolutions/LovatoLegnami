/** Types for AI Assistant integration */

export interface AiMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  confirmations?: AiToolConfirmation[]
  attachments?: { name: string; type: string; size: number }[]
}

/** A write-tool that is pending user confirmation */
export interface AiToolConfirmation {
  confirmationId: string
  toolName: string
  toolArgs: Record<string, unknown>
  humanLabel: string
  status: 'pending' | 'confirmed' | 'rejected'
}

export interface AiChatRequest {
  prompt: string
  sessionId?: string | null
  context?: string
}

export interface AiSSEEvent {
  type: 'text_delta' | 'text' | 'tool_start' | 'tool_use' | 'tool_result' | 'tool_confirm_required' | 'result' | 'init' | 'error' | 'done'
  data: Record<string, unknown>
}

export interface AiSessionInfo {
  sessionId: string | null
  model: string | null
  totalCost: number
}
