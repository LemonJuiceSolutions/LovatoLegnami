import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { execSync } from 'child_process'

const CLAUDE_PATH = process.env.CLAUDE_PATH || 'claude'

export async function GET() {
  try {
    // Try direct path first, then npx as fallback
    let result: string
    try {
      result = execSync(`${CLAUDE_PATH} --version`, { timeout: 10000, encoding: 'utf-8', shell: process.platform === 'win32' ? 'cmd.exe' : undefined })
    } catch {
      result = execSync('npx -y @anthropic-ai/claude-code --version', { timeout: 30000, encoding: 'utf-8', shell: process.platform === 'win32' ? 'cmd.exe' : undefined })
    }
    return NextResponse.json({
      connected: true,
      version: result.trim(),
      path: CLAUDE_PATH,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({
      connected: false,
      error: msg,
      path: CLAUDE_PATH,
    })
  }
}
