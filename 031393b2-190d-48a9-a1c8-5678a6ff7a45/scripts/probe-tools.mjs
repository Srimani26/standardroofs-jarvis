const BASE = 'https://studio.shogo.ai/api/ai/v1'

const MODELS = [
  ['Hoshi 2.0 (uuid)', '4fa677d1-e4a6-4ea1-88b5-e57101e810cd'],
  ['Claude Haiku 4.5', 'claude-haiku-4-5'],
  ['GPT-4.1 Mini', 'gpt-4.1-mini'],
  ['GPT-4o Mini', 'gpt-4o-mini'],
  ['GPT-4.1 Nano', 'gpt-4.1-nano'],
  ['Claude Haiku Oct', 'claude-haiku-4-5-20251001'],
]

async function main() {
  const envRaw = await (await import('fs')).promises.readFile('/proc/648/environ', 'utf8')
  const token = envRaw.split('\0').find((v) => v.startsWith('AI_PROXY_TOKEN='))?.slice('AI_PROXY_TOKEN='.length)

  for (const [name, id] of MODELS) {
    try {
      const res = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: id,
          messages: [{ role: 'user', content: 'What is the weather in Erode? Use the tool.' }],
          max_tokens: 200,
          tools: [
            {
              type: 'function',
              function: {
                name: 'get_weather',
                description: 'Get live weather for a city',
                parameters: {
                  type: 'object',
                  properties: { city: { type: 'string', description: 'City name' } },
                  required: ['city'],
                },
              },
            },
          ],
        }),
        signal: AbortSignal.timeout(45000),
      })
      const body = await res.text()
      if (!res.ok) {
        console.log(`${name.padEnd(22)} FAIL ${res.status} ${body.slice(0, 100)}`)
        continue
      }
      const msg = JSON.parse(body)?.choices?.[0]?.message
      const calls = msg?.tool_calls
      if (calls?.length) {
        console.log(`${name.padEnd(22)} TOOLS OK  -> ${calls[0].function?.name}(${calls[0].function?.arguments})`)
      } else {
        console.log(`${name.padEnd(22)} no tool_calls (text: ${JSON.stringify((msg?.content || '').slice(0, 50))})`)
      }
    } catch (err) {
      console.log(`${name.padEnd(22)} ERR ${err.message}`)
    }
  }
}

main()
