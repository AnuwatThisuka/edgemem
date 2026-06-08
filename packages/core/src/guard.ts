export const PROTECTED_PATHS: readonly string[] = [
  "memory/stack.md",
  "memory/conventions.md",
  "memory/decisions.md",
  "memory/onboarding.md",
]

export class ProtectedFileError extends Error {
  readonly filePath: string

  constructor(filePath: string) {
    super(
      `'${filePath}' is a protected core memory file. ` +
        `Set EDGEMEM_ALLOW_CORE_MUTATION=true to override.`
    )
    this.name = "ProtectedFileError"
    this.filePath = filePath
  }
}

export function isProtected(filePath: string): boolean {
  const normalized = filePath.replace(/^\/+/, "")
  return (PROTECTED_PATHS as string[]).includes(normalized)
}

export function assertWritable(filePath: string, allowOverride = false): void {
  if (isProtected(filePath) && !allowOverride) {
    throw new ProtectedFileError(filePath)
  }
}

// ── PII Scanner ────────────────────────────────────────────────────────────

export interface PiiScanResult {
  clean: string
  redacted: string[]
}

interface PiiPattern {
  pattern: RegExp
  label: string
}

const PII_PATTERNS: PiiPattern[] = [
  { pattern: /sk_live_[a-zA-Z0-9]{24,}/g, label: "stripe-live-key" },
  { pattern: /sk_test_[a-zA-Z0-9]{24,}/g, label: "stripe-test-key" },
  { pattern: /AIzaSy[a-zA-Z0-9\-_]{33}/g, label: "google-api-key" },
  { pattern: /ghp_[a-zA-Z0-9]{36}/g, label: "github-pat" },
  { pattern: /gho_[a-zA-Z0-9]{36}/g, label: "github-oauth-token" },
  { pattern: /ghs_[a-zA-Z0-9]{36}/g, label: "github-server-token" },
  { pattern: /AKIA[0-9A-Z]{16}/g, label: "aws-access-key" },
  { pattern: /xoxb-\d{10,13}-\d{10,13}-[a-zA-Z0-9]{24}/g, label: "slack-bot-token" },
  { pattern: /Bearer\s+[a-zA-Z0-9\-._~+/]{20,}/g, label: "bearer-token" },
  { pattern: /password\s*[:=]\s*\S+/gi, label: "password-literal" },
  { pattern: /secret\s*[:=]\s*\S+/gi, label: "secret-literal" },
]

export function scanPii(content: string): PiiScanResult {
  const redacted: string[] = []
  let clean = content

  for (const { pattern, label } of PII_PATTERNS) {
    const matches = clean.match(new RegExp(pattern.source, pattern.flags))
    if (matches) {
      redacted.push(...matches.map(() => label))
      clean = clean.replace(new RegExp(pattern.source, pattern.flags), `[REDACTED:${label}]`)
    }
  }

  return { clean, redacted }
}
