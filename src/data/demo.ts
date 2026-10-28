import type { ScanFile } from '../utils/scanner'

export interface DemoFile extends ScanFile {
  language: string
  /** Minutes since the file was last touched, for the demo activity feed. */
  touchedMinutesAgo: number
}

/**
 * Fixture files for the dashboard. Every credential below is fake and exists
 * only to exercise the local scanner.
 */
export const demoFiles: DemoFile[] = [
  {
    path: '.env.local',
    language: 'ENV',
    touchedMinutesAgo: 1,
    content: `# Local-only values. Never commit this file.
OPENAI_API_KEY=sk-proj-D3moKeyN0tR3al_9xQ2mP7vL4kT8wZ1
GITHUB_TOKEN=ghp_R4nd0mT0kenF0rD3vSh13ldT3st1ngPurp0s3s
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
`,
  },
  {
    path: 'src/lib/openai.ts',
    language: 'TS',
    touchedMinutesAgo: 3,
    content: `import OpenAI from 'openai'

// TODO: move this to an environment variable before shipping
export const client = new OpenAI({
  apiKey: 'sk-proj-D3moKeyN0tR3al_9xQ2mP7vL4kT8wZ1',
})

export async function summariseDiff(diff: string) {
  const response = await client.responses.create({
    model: 'gpt-4.1',
    input: \`Summarise this diff:\\n\${diff}\`,
  })
  return response.output_text
}
`,
  },
  {
    path: 'src/api/github.ts',
    language: 'TS',
    touchedMinutesAgo: 6,
    content: `const GITHUB_API = 'https://api.github.com'

export async function listPullRequests(repo: string) {
  const response = await fetch(\`\${GITHUB_API}/repos/\${repo}/pulls\`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ghp_9fK2mQ7xL4vN8pR3tW6yB1cD5hJ0sA2eF7gH',
    },
  })

  if (!response.ok) throw new Error(\`GitHub returned \${response.status}\`)
  return response.json()
}
`,
  },
  {
    path: 'scripts/deploy.sh',
    language: 'SH',
    touchedMinutesAgo: 12,
    content: `#!/usr/bin/env bash
set -euo pipefail

# TODO: load these from the CI secret store
export AWS_ACCESS_KEY_ID="AKIAIOSFODNN7EXAMPLE"
export AWS_SECRET_ACCESS_KEY="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
export SLACK_WEBHOOK="xoxb-2847193056-8471293056-AbCdEfGhIjKlMnOpQrStUvWx"

aws s3 sync ./dist "s3://developer-shield-prod" --delete
curl -X POST "$SLACK_WEBHOOK" -d '{"text":"Deploy complete"}'
`,
  },
  {
    path: 'src/lib/auth.ts',
    language: 'TS',
    touchedMinutesAgo: 18,
    content: `export const sessionToken =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZXYtc2hpZWxkIiwiaWF0IjoxNzAwMDAwMDAwfQ.5mQ7xL4vN8pR3tW6yB1cD5hJ0sA2eF7gH9kM2nP4qR'

export function isExpired(token: string): boolean {
  const payload = JSON.parse(atob(token.split('.')[1] ?? ''))
  return typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()
}
`,
  },
  {
    path: 'src/config/billing.ts',
    language: 'TS',
    touchedMinutesAgo: 26,
    content: `export const stripe = {
  publishableKey: 'pk_test_51NxAbCdEfGhIjKlMnOpQrStUv',
  secretKey: 'sk_live_51NxAbCdEfGhIjKlMnOpQrStUv',
  webhookTolerance: 300,
}
`,
  },
  {
    path: 'src/config/legacy.ts',
    language: 'TS',
    touchedMinutesAgo: 29,
    content: `// Legacy integration kept for backwards compatibility
export const legacyConfig = {
  api_key: 'Sh13ld-Pr0d-2026!x',
  timeout: 30_000,
}
`,
  },
  {
    path: 'src/components/AnalyticsPanel.tsx',
    language: 'TSX',
    touchedMinutesAgo: 34,
    content: `interface AnalyticsPanelProps {
  views: number
  installs: number
}

export function AnalyticsPanel({ views, installs }: AnalyticsPanelProps) {
  const conversion = views === 0 ? 0 : (installs / views) * 100
  return (
    <section>
      <h2>Usage</h2>
      <p>{views.toLocaleString()} views</p>
      <p>{conversion.toFixed(1)}% installed</p>
    </section>
  )
}
`,
  },
  {
    path: 'src/lib/format.ts',
    language: 'TS',
    touchedMinutesAgo: 41,
    content: `export function formatBytes(bytes: number): string {
  if (bytes < 1024) return \`\${bytes} B\`
  if (bytes < 1024 ** 2) return \`\${(bytes / 1024).toFixed(1)} KB\`
  return \`\${(bytes / 1024 ** 2).toFixed(1)} MB\`
}

export function pluralise(count: number, word: string): string {
  return \`\${count} \${word}\${count === 1 ? '' : 's'}\`
}
`,
  },
]

export const demoSanitizerSnippet = `const payload = {
  model: 'gpt-4.1',
  apiKey: 'sk-proj-D3moKeyN0tR3al_9xQ2mP7vL4kT8wZ1',
  repoToken: 'ghp_9fK2mQ7xL4vN8pR3tW6yB1cD5hJ0sA2eF7gH',
}

await fetch('https://api.openai.com/v1/responses', {
  method: 'POST',
  headers: { Authorization: \`Bearer \${payload.apiKey}\` },
  body: JSON.stringify({ input: 'Summarise this PR' }),
})
`
