import Anthropic from '@anthropic-ai/sdk'

// Singleton para no crear instancias nuevas en cada request
const globalForAnthropic = globalThis as unknown as { anthropic: Anthropic | undefined }

export const anthropic = globalForAnthropic.anthropic ?? new Anthropic({
  apiKey: process.env['ANTHROPIC_API_KEY'],
})

if (process.env['NODE_ENV'] !== 'production') {
  globalForAnthropic.anthropic = anthropic
}

export const BOT_MODEL = 'claude-sonnet-4-5'
