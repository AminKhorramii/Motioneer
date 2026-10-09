#!/usr/bin/env node
/**
 * Motioneer's real MCP server with its tools made inert, for measuring routing.
 *
 * The routing eval asks a model what it would call, not for a film. So the connect-time card and
 * the tool list come from the real server, exactly as an agent receives them, and every tools/call
 * is written to ROUTING_LOG and answered with a stub instead of reaching the server. Nothing here
 * ships: the eval code stays out of the server it measures.
 */
import { spawn } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const log = process.env.ROUTING_LOG
const server = spawn(process.execPath, [path.join(ROOT, 'mcp', 'index.mjs')], { stdio: ['pipe', 'pipe', 'ignore'], env: { ...process.env, MOTIONEER_NO_OPEN: '1' } })
server.stdout.pipe(process.stdout)
let buffer = ''
process.stdin.on('data', (chunk) => {
  buffer += chunk
  const lines = buffer.split('\n')
  buffer = lines.pop() ?? ''
  for (const line of lines) {
    if (!line.trim()) continue
    let msg
    try { msg = JSON.parse(line) } catch { continue }
    if (msg.method === 'tools/call') {
      if (log) appendFileSync(log, JSON.stringify({ tool: msg.params?.name, args: msg.params?.arguments ?? {} }) + '\n')
      const text = 'Evaluation stub: the call was recorded and nothing was made. Stop here and tell the person what you called.'
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text }], structuredContent: { summary: text, next: [] } } }) + '\n')
    } else server.stdin.write(line + '\n')
  }
})
process.stdin.on('end', () => server.kill())
