import { describe, it, expect, afterEach, vi } from "vitest"
import {
  isProtected,
  assertWritable,
  ProtectedFileError,
  PROTECTED_PATHS,
  scanPii,
} from "./guard.js"

// ── isProtected ───────────────────────────────────────────────────────────────

describe("isProtected", () => {
  it("returns true for every path in PROTECTED_PATHS", () => {
    for (const p of PROTECTED_PATHS) {
      expect(isProtected(p), `expected ${p} to be protected`).toBe(true)
    }
  })

  it("returns true for protected paths with a leading slash", () => {
    expect(isProtected("/memory/stack.md")).toBe(true)
    expect(isProtected("/memory/conventions.md")).toBe(true)
    expect(isProtected("/memory/decisions.md")).toBe(true)
    expect(isProtected("/memory/onboarding.md")).toBe(true)
  })

  it("returns true for protected paths with multiple leading slashes", () => {
    expect(isProtected("//memory/stack.md")).toBe(true)
  })

  it("returns false for user-defined memory files", () => {
    expect(isProtected("memory/auto-saved.md")).toBe(false)
    expect(isProtected("memory/custom.md")).toBe(false)
    expect(isProtected("memory/sprint-notes.md")).toBe(false)
  })

  it("returns false for paths that partially match a protected name", () => {
    // "stack.md" alone — not the full path
    expect(isProtected("stack.md")).toBe(false)
    // different directory
    expect(isProtected("other/memory/stack.md")).toBe(false)
  })

  it("returns false for empty string", () => {
    expect(isProtected("")).toBe(false)
  })
})

// ── assertWritable ────────────────────────────────────────────────────────────

describe("assertWritable", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("throws ProtectedFileError when writing to a protected path with allowOverride=false", () => {
    expect(() => assertWritable("memory/stack.md", false)).toThrow(ProtectedFileError)
  })

  it("throws for every protected path by default", () => {
    for (const p of PROTECTED_PATHS) {
      expect(() => assertWritable(p, false), `${p} should be blocked`).toThrow(ProtectedFileError)
    }
  })

  it("does not throw when allowOverride=true, even for protected paths", () => {
    for (const p of PROTECTED_PATHS) {
      expect(() => assertWritable(p, true), `${p} should be unblocked`).not.toThrow()
    }
  })

  it("does not throw for non-protected paths regardless of allowOverride", () => {
    expect(() => assertWritable("memory/custom.md", false)).not.toThrow()
    expect(() => assertWritable("memory/custom.md", true)).not.toThrow()
    expect(() => assertWritable("memory/auto-saved.md", false)).not.toThrow()
  })
})

// ── ProtectedFileError ────────────────────────────────────────────────────────

describe("ProtectedFileError", () => {
  it("has name 'ProtectedFileError'", () => {
    const err = new ProtectedFileError("memory/stack.md")
    expect(err.name).toBe("ProtectedFileError")
  })

  it("exposes the filePath that was rejected", () => {
    const err = new ProtectedFileError("memory/decisions.md")
    expect(err.filePath).toBe("memory/decisions.md")
  })

  it("message mentions the file path and the override env var", () => {
    const err = new ProtectedFileError("memory/conventions.md")
    expect(err.message).toContain("memory/conventions.md")
    expect(err.message).toContain("EDGEMEM_ALLOW_CORE_MUTATION")
  })

  it("is an instance of Error", () => {
    expect(new ProtectedFileError("x")).toBeInstanceOf(Error)
  })
})

// ── scanPii ───────────────────────────────────────────────────────────────────

describe("scanPii — clean input", () => {
  it("returns content unchanged when no PII is present", () => {
    const input = "Use Drizzle ORM. Run migrations with pnpm db:migrate."
    const { clean, redacted } = scanPii(input)
    expect(clean).toBe(input)
    expect(redacted).toHaveLength(0)
  })

  it("returns empty redacted array for empty input", () => {
    const { clean, redacted } = scanPii("")
    expect(clean).toBe("")
    expect(redacted).toHaveLength(0)
  })
})

describe("scanPii — credential patterns", () => {
  it("redacts Stripe live secret keys", () => {
    // Constructed dynamically so static secret scanners don't flag this file
    const key = ["sk", "live", "a".repeat(24)].join("_")
    const { clean, redacted } = scanPii(`API key: ${key}`)
    expect(clean).not.toMatch(/sk_live_/)
    expect(clean).toContain("[REDACTED:stripe-live-key]")
    expect(redacted).toContain("stripe-live-key")
  })

  it("redacts Stripe test secret keys", () => {
    const key = ["sk", "test", "b".repeat(24)].join("_")
    const { clean, redacted } = scanPii(key)
    expect(clean).not.toMatch(/sk_test_/)
    expect(redacted).toContain("stripe-test-key")
  })

  it("redacts Google Cloud / Firebase API keys", () => {
    const key = "AIzaSy" + "A".repeat(33)
    const { clean, redacted } = scanPii(`GOOGLE_API_KEY=${key}`)
    expect(clean).not.toContain("AIzaSy")
    expect(redacted).toContain("google-api-key")
  })

  it("redacts AWS access key IDs", () => {
    const key = "AKIA" + "I".repeat(16)
    const { clean, redacted } = scanPii(`export AWS_ACCESS_KEY_ID=${key}`)
    expect(clean).not.toContain("AKIA")
    expect(redacted).toContain("aws-access-key")
  })

  it("redacts GitHub personal access tokens", () => {
    const key = "ghp_" + "A".repeat(36)
    const { clean, redacted } = scanPii(`GITHUB_TOKEN=${key}`)
    expect(clean).not.toContain("ghp_")
    expect(redacted).toContain("github-pat")
  })

  it("redacts Slack bot tokens", () => {
    const key = `xoxb-1234567890-1234567890-${"A".repeat(24)}`
    const { clean, redacted } = scanPii(key)
    expect(redacted).toContain("slack-bot-token")
    expect(clean).not.toContain("xoxb-")
  })

  it("redacts password key=value literals (case-insensitive)", () => {
    const { clean, redacted } = scanPii("Password: hunter2")
    expect(clean).not.toContain("hunter2")
    expect(redacted).toContain("password-literal")
  })

  it("redacts secret= literals", () => {
    const { clean, redacted } = scanPii("secret=abc123xyz")
    expect(redacted).toContain("secret-literal")
  })

  it("redacts Bearer tokens in headers", () => {
    const { clean, redacted } = scanPii("Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9")
    expect(redacted).toContain("bearer-token")
    expect(clean).not.toContain("eyJhbGciOi")
  })
})

describe("scanPii — multi-pattern", () => {
  it("redacts multiple PII types in one payload", () => {
    const stripeKey = ["sk", "live", "c".repeat(24)].join("_")
    const awsKey = "AKIA" + "J".repeat(16)
    const input = `stripe=${stripeKey}\naws=${awsKey}\npassword: hunter2`
    const { clean, redacted } = scanPii(input)

    expect(redacted.length).toBeGreaterThanOrEqual(3)
    expect(clean).not.toMatch(/sk_live_/)
    expect(clean).not.toContain("AKIA")
    expect(clean).not.toContain("hunter2")
  })

  it("preserves surrounding non-PII text", () => {
    const key = ["sk", "live", "d".repeat(24)].join("_")
    const { clean } = scanPii(`Payment provider: Stripe\nAPI key: ${key}\nUse v3 API.`)
    expect(clean).toContain("Payment provider: Stripe")
    expect(clean).toContain("Use v3 API.")
  })
})
