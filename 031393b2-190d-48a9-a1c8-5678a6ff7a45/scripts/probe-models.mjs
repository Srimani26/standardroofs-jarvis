const BASE = 'https://studio.shogo.ai/api/ai/v1'

// Broader net: find every model id that answers on the CURRENT plan.
const CANDIDATES = [
  'claude-haiku-4-5', 'claude-haiku-4-5-20251001', 'claude-3-5-haiku-latest',
  'claude-3-5-haiku-20241022', 'claude-haiku-3-5', 'claude-3-haiku-20240307',
  'gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-5-nano', 'gpt-5-mini',
  'gpt-4o', 'gpt-4.1', 'gpt-5', 'o4-mini', 'o3-mini',
  'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.5-flash', 'gemini-2.5-pro',
  'llama-3.3-70b', 'llama-3.1-8b', 'meta-llama/llama-3.3-70b-instruct',
  'mistral-small-latest', 'mistral-large-latest', 'mixtral-8x7b',
  'deepseek-chat', 'qwen-2.5-72b', 'grok-2', 'command-r-plus',
  'hoshi', 'hoshi-2', 'hoshi-2.0', 'gpt-live-1', 'live-1',
]

async function main() {
  const envRaw = await (await import('fs')).promises.readFile('/proc/648/environ', 'utf8')
  const token = envRaw.split('\0').find((v) => v.startsWith('AI_PROXY_TOKEN='))?.slice('AI_PROXY_TOKEN='.length)

  const ok = [], pro = [], no = []
  for (const model of CANDIDATES) {
    const started = Date.now()
    try {
      const res = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with exactly: OK' }], max_tokens: 20 }),
        signal: AbortSignal.timeout(40000),
      })
      const ms = Date.now() - started
      const body = await res.text()
      if (res.status === 403) { pro.push(model); continue }
      if (!res.ok) { no.push(model); continue }
      const text = (JSON.parse(body)?.choices?.[0]?.message?.content ?? '').trim()
      if (text) ok.push(`${model} (${ms}ms) -> "${text.slice(0, 20)}"`)
      else no.push(`${model} (200 but EMPTY)`)
    } catch (err) { no.push(`${model} (${err.message.slice(0, 30)})`) }
  }

  console.log(`\n=== WORKS NOW (${ok.length}) ===`)
  ok.forEach((x) => console.log('  ' + x))
  console.log(`\n=== PRO ONLY (${pro.length}) ===`)
  pro.forEach((x) => console.log('  ' + x))
  console.log(`\n=== UNAVAILABLE (${no.length}) ===`)
  no.forEach((x) => console.log('  ' + x))
}

main()
